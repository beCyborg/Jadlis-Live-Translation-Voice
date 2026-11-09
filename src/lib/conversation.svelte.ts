import { Mic } from './mic';
import { ScribeRotator } from './scribe';
import { Speaker } from './tts';
import { Translator, explainError, type HistoryLine } from './translate';
import { settings, keyterms, keys, voiceFor } from './settings.svelte';
import { CYRILLIC, wordCount, type Lang } from './langs';

/** Who spoke: `me` = the Russian-speaking owner, `them` = the other person. */
export type Side = 'me' | 'them';
export type Status = 'off' | 'starting' | 'listening' | 'translating' | 'speaking' | 'paused';

export interface Turn {
  id: number;
  side: Side;
  src: Lang;
  tgt: Lang;
  srcText: string;
  text: string;
  done: boolean;
  at: number; // Date.now()
}

export interface Timing {
  id: number;
  commitMs: number; // speech end → final phrase (estimated: VAD silence + server)
  firstTokenMs: number | null; // final phrase → first translated word
  firstAudioMs: number | null; // final phrase → first sound
  cacheRead: number | null;
  model: string;
}

const words = (s: string) => s.toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? [];

const HISTORY_KEY = 'jt.history.v1';
const FILLERS = /^(э+|эм+|мм+|хм+|ам+|а+|ну+|ah+|eh+|em+|hm+|mm+|uh+|um+|y+|e+|ehm+|yyy+|eee+)$/i;

function loadHistory(): Turn[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
}

export class Conversation {
  status: Status = $state('off');
  partial = $state({ text: '', side: 'me' as Side });
  turns: Turn[] = $state(loadHistory());
  error: string | null = $state(null);
  notice: string | null = $state(null);
  online = $state(typeof navigator === 'undefined' ? true : navigator.onLine);
  timings: Timing[] = $state([]);
  speakingTurn: number | null = $state(null);

  private mic = new Mic((f) => this.onFrame(f));
  private scribe = new ScribeRotator(
    () => keys.eleven,
    () => ({ vadSilence: settings.vadSilence, keyterms: keyterms() }),
    {
      partial: (text) => { this.partial = { text, side: CYRILLIC.test(text) ? 'me' : 'them' }; },
      committed: (text, lang, at) => this.onCommitted(text, lang, at),
      error: (msg, fatal) => { this.error = msg; if (fatal) void this.stop(); },
    },
  );
  private speaker = new Speaker(
    () => keys.eleven,
    (lang) => voiceFor(lang),
    () => settings.rate,
    {
      start: (id) => {
        this.speakingTurn = id;
        if (this.status !== 'paused') this.status = 'speaking';
        const t = this.timings.find((x) => x.id === id);
        const c = this.commitAt.get(id);
        if (t && c && t.firstAudioMs === null) t.firstAudioMs = Math.round(performance.now() - c);
      },
      idle: () => { this.speakingTurn = null; if (this.status === 'speaking') this.status = 'listening'; },
      error: (msg) => { this.notice = msg; },
    },
  );
  private translator = new Translator();
  private chain: Promise<void> = Promise.resolve();
  private nextId = (this.turns.at(-1)?.id ?? 0) + 1;
  private commitAt = new Map<number, number>();
  private wakeLock: WakeLockSentinel | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => { this.online = true; });
    window.addEventListener('offline', () => { this.online = false; });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.status !== 'off') {
        void this.mic.resume();
        void this.lockScreen();
      }
    });
  }

  get foreign() { return settings.foreign; }

  lastTurnBy(side: Side): Turn | undefined {
    for (let i = this.turns.length - 1; i >= 0; i--) if (this.turns[i].side === side) return this.turns[i];
    return undefined;
  }

  /** Must run inside the tap that starts the conversation (iOS audio and mic permissions). */
  async start() {
    if (this.status !== 'off' && this.status !== 'paused') return;
    this.error = null;
    this.notice = null;
    this.speaker.unlock();
    this.applyAudioSession();
    this.status = 'starting';
    try {
      await this.mic.start();
      await this.scribe.start();
      this.speaker.warm(settings.foreign);
      this.speaker.warm('ru');
      await this.lockScreen();
      this.status = 'listening';
    } catch (e) {
      this.mic.stop();
      this.scribe.stop();
      this.status = 'off';
      const err = e as Error;
      if (err.name === 'NotAllowedError') this.error = 'Нет доступа к микрофону. Разрешите его в настройках Safari для этого сайта.';
      else if (!this.error) this.error = err.message || 'Не получилось начать разговор.';
    }
  }

  async stop() {
    this.scribe.stop();
    this.mic.stop();
    this.speaker.stop();
    this.partial = { text: '', side: 'me' };
    this.status = 'off';
    await this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
  }

  /** Pause closes the recognition sessions, so a long pause costs nothing. */
  async togglePause() {
    if (this.status === 'paused') {
      this.status = 'starting';
      try {
        await this.mic.resume();
        await this.scribe.start();
        this.status = 'listening';
      } catch (e) {
        this.status = 'paused';
        this.error = (e as Error).message;
      }
    } else if (this.status !== 'off' && this.status !== 'starting') {
      this.scribe.stop();
      this.speaker.stop();
      this.partial = { text: '', side: 'me' };
      this.status = 'paused';
    }
  }

  /** Repeat the translation shown on `side`'s half (the other person's last words). */
  replay(side: Side) {
    const turn = this.lastTurnBy(side === 'me' ? 'them' : 'me');
    if (!turn || !turn.text) return;
    this.rememberSpoken(turn.text);
    if (!this.speaker.replay(turn.id)) this.speaker.enqueue(turn.id, turn.tgt, turn.text);
  }

  /** "I said that": the last utterance was spoken by the owner of `side`'s half — re-translate it. */
  claim(side: Side) {
    const turn = this.turns.at(-1);
    if (!turn) return;
    const src: Lang = side === 'me' ? 'ru' : settings.foreign;
    if (turn.src === src) return;
    this.speaker.stop();
    this.translateTurn(turn, null, performance.now(), src);
  }

  clearHistory() {
    this.turns = [];
    this.timings = [];
    localStorage.removeItem(HISTORY_KEY);
  }

  private onFrame(frame: Int16Array) {
    // The mic keeps listening while a translation plays, so nobody is cut off; echo of our own voice
    // is removed after recognition (isEcho). The old hard mute stays as an option for loud rooms.
    const silent = settings.muteWhileSpeaking && (this.speaker.busy || performance.now() - this.speaker.lastEndedAt < 300);
    this.scribe.push(frame, silent);
  }

  /** Texts we spoke recently, for echo detection. */
  private spoken: { at: number; words: Set<string> }[] = [];

  private rememberSpoken(text: string) {
    const now = performance.now();
    this.spoken = this.spoken.filter((s) => now - s.at < 20000);
    this.spoken.push({ at: now, words: new Set(words(text)) });
  }

  /** True when most words of a recognised phrase are words we just played through the speaker. */
  private isEcho(text: string) {
    const w = words(text);
    if (!w.length) return false;
    const now = performance.now();
    const recent = new Set<string>();
    for (const s of this.spoken) if (now - s.at < 20000) s.words.forEach((x) => recent.add(x));
    if (!recent.size) return false;
    const hits = w.filter((x) => recent.has(x)).length;
    return hits / w.length >= 0.6 && (w.length >= 2 || this.speaker.busy);
  }

  private onCommitted(raw: string, lang: string | null, at: number) {
    const text = raw.replace(/\[[^\]]*\]|\([^)]*\)/g, '').trim();
    const bare = text.replace(/[\s.,!?…¿¡"«»-]+/g, '');
    if (bare.length < 1 || FILLERS.test(bare)) return;
    if (this.isEcho(text)) return;
    const side: Side = CYRILLIC.test(text) ? 'me' : 'them';
    const turn: Turn = {
      id: this.nextId++,
      side,
      src: side === 'me' ? 'ru' : settings.foreign,
      tgt: side === 'me' ? settings.foreign : 'ru',
      srcText: text,
      text: '',
      done: false,
      at: Date.now(),
    };
    this.turns.push(turn);
    this.translateTurn(this.turns.at(-1)!, lang, at);
  }

  private translateTurn(turn: Turn, asrLang: string | null, at: number, forcedSource?: Lang) {
    const history: HistoryLine[] = this.turns
      .filter((t) => t.id !== turn.id && t.done)
      .slice(-6)
      .map((t) => ({ src: t.src, text: t.srcText, translation: t.text }));
    turn.text = '';
    turn.done = false;
    this.commitAt.set(turn.id, at);
    const timing: Timing = {
      id: turn.id,
      commitMs: Math.round(settings.vadSilence * 1000 + 200),
      firstTokenMs: null,
      firstAudioMs: null,
      cacheRead: null,
      model: settings.model,
    };
    this.timings = [...this.timings.filter((t) => t.id !== turn.id), timing].slice(-12);
    const timingRef = this.timings.at(-1)!;

    this.chain = this.chain.then(async () => {
      if (this.status === 'listening') this.status = 'translating';
      let previous = '';
      try {
        const res = await this.translator.translate(
          {
            apiKey: keys.anthropic,
            model: settings.model,
            foreign: settings.foreign,
            polite: settings.polite,
            esVariant: settings.esVariant,
            glossary: keyterms(),
            customPrompt: settings.customPrompt,
          },
          { asrText: turn.srcText, asrLang, history, forcedSource },
          {
            direction: (src) => {
              if (timingRef.firstTokenMs === null) timingRef.firstTokenMs = Math.round(performance.now() - at);
              if (!src) return;
              turn.src = src;
              turn.tgt = src === 'ru' ? settings.foreign : 'ru';
              turn.side = src === 'ru' ? 'me' : 'them';
            },
            text: (full) => { turn.text = full; },
            sentence: (s) => {
              this.rememberSpoken(s);
              if (settings.autoSpeak && this.status !== 'paused') this.speaker.enqueue(turn.id, turn.tgt, s, previous || undefined);
              previous = s;
            },
          },
        );
        timingRef.cacheRead = res.usage?.cache_read_input_tokens ?? null;
        if (res.src === null) {
          this.turns = this.turns.filter((t) => t.id !== turn.id);
        } else {
          turn.done = true;
          this.error = null;
        }
      } catch (e) {
        const msg = explainError(e);
        if (msg) this.error = msg;
        if (!turn.text) this.turns = this.turns.filter((t) => t.id !== turn.id);
      } finally {
        if (this.status === 'translating') this.status = this.speaker.busy ? 'speaking' : 'listening';
        this.persist();
      }
    });
  }

  private persist() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(this.turns.filter((t) => t.done).slice(-200))); } catch { /* full */ }
  }

  private async lockScreen() {
    try {
      if ('wakeLock' in navigator && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
      }
    } catch { /* not supported or denied: the screen may dim */ }
  }

  private applyAudioSession() {
    const s = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (!s) return;
    try { s.type = settings.audioSession === 'auto' ? 'auto' : settings.audioSession; } catch { /* unsupported value */ }
  }

  isShort(t: Turn | undefined) {
    return !!t && wordCount(t.text) <= 3 && t.text.length <= 24;
  }
}

export const conversation = new Conversation();
