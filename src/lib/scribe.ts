// Scribe v2 Realtime with one session per utterance.
// Scribe locks onto the first language of a session and silently translates later speech into it
// (elevenlabs-python#751; confirmed in spike/RESULTS.md). A fresh session per utterance avoids that:
// the next session is opened in advance, and the audio of the switch gap comes from a ring buffer.
// No `previous_text`: the last phrase is usually in the other language and pulls the new session
// towards it (e2e 2026-11-09: Polish came back in Cyrillic).

const WS = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';
const TOKEN_URL = 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe';
const TOKEN_TTL_MS = 12 * 60 * 1000; // tokens live 15 min
const RING_FRAMES = 20; // 20 × 50 ms = 1 s
const PREROLL_FRAMES = 12; // 600 ms before the detected speech onset
const NO_TEXT_RESET_MS = 5000; // started on noise and heard no words → fresh session
// A fresh session must not hear seconds of silence before speech: Scribe then picks a language from
// nothing and writes Polish in Ukrainian Cyrillic (spike 2026-11-09: 6 s of silence → "Дзень добрый",
// no silence → "Dzień dobry"). So audio starts flowing only at a local speech onset.

export interface ScribeHandlers {
  partial(text: string): void;
  committed(text: string, lang: string | null, at: number): void;
  error(message: string, fatal: boolean): void;
}

export interface ScribeOptions {
  vadSilence: number;
  keyterms: string[];
  /** Push-to-talk: audio flows only between begin() and finish(); the phrase ends on finish(). */
  manual: boolean;
}

const MANUAL_SOFT_COMMIT_FRAMES = 400; // 20 s of audio: commit at the next quiet frame, keep the buffer small
const MANUAL_FINISH_TIMEOUT_MS = 6000;

class Session {
  ws: WebSocket;
  ready: Promise<void>;
  isReady = false;
  closed = false;
  started = false; // audio flows only after a speech onset
  startedAt = 0;
  heardText = false;
  sentFrames = 0;
  commitsSent = 0;
  commitsReceived = 0;
  pending: Int16Array[] = [];
  onCommitted: ((text: string, lang: string | null) => void) | null = null;
  onPartial: ((text: string) => void) | null = null;
  onFail: ((msg: string, fatal: boolean) => void) | null = null;
  onUnexpectedClose: (() => void) | null = null;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.ws.onmessage = (m) => {
        let d: Record<string, unknown>;
        try { d = JSON.parse(m.data as string); } catch { return; }
        const type = d.message_type as string;
        if (type === 'session_started') { this.isReady = true; resolve(); return; }
        if (type === 'partial_transcript') {
          const t = (d.text as string) ?? '';
          if (t.trim()) this.heardText = true;
          this.onPartial?.(t);
          return;
        }
        // committed_transcript arrives first, without the language; count only the second event.
        if (type === 'committed_transcript_with_timestamps') {
          this.commitsReceived++;
          this.onCommitted?.(((d.text as string) ?? '').trim(), (d.language_code as string) ?? null);
          return;
        }
        if (type === 'auth_error') { this.onFail?.('Ключ ElevenLabs не подошёл. Проверьте его в настройках.', true); reject(new Error('auth')); return; }
        if (type === 'quota_exceeded') { this.onFail?.('На счёте ElevenLabs закончились кредиты.', true); reject(new Error('quota')); return; }
        if (type === 'unaccepted_terms') { this.onFail?.('Примите условия ElevenLabs в личном кабинете.', true); reject(new Error('terms')); return; }
        if (/error|exceeded|throttled|limited|overflow|exhausted|invalid/.test(type)) {
          this.onFail?.(`Распознавание: ${(d.error as string) ?? type}`, false);
        }
      };
      this.ws.onerror = () => reject(new Error('ws error'));
      this.ws.onclose = () => {
        const wasOpen = !this.closed;
        this.closed = true;
        if (!this.isReady) reject(new Error('closed before start'));
        else if (wasOpen) this.onUnexpectedClose?.();
      };
    });
    this.ready.catch(() => {});
  }

  send(frame: Int16Array) {
    if (this.closed || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: b64(frame), commit: false, sample_rate: 16000 }));
    this.sentFrames++;
  }

  commit() {
    if (this.closed || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: '', commit: true, sample_rate: 16000 }));
    this.commitsSent++;
  }

  close() {
    this.closed = true;
    try { this.ws.close(1000); } catch { /* already closed */ }
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function b64(frame: Int16Array): string {
  const bytes = new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export class ScribeRotator {
  private tokens: { t: Promise<string>; at: number }[] = [];
  private active: Session | null = null;
  private standby: Session | null = null;
  private ring: Int16Array[] = [];
  private running = false;
  private failures = 0;
  private floor = 300; // noise floor, RMS of int16
  private voicedRun = 0;
  // Push-to-talk state.
  private manual = false;
  private recording = false;
  private pieces: { text: string; lang: string | null }[] = [];
  private livePartial = '';
  private piecesWaiter: (() => void) | null = null;

  constructor(
    private apiKey: () => string,
    private options: () => ScribeOptions,
    private h: ScribeHandlers,
  ) {}

  async start() {
    this.running = true;
    this.failures = 0;
    this.manual = this.options().manual;
    this.recording = false;
    this.pieces = [];
    this.fillTokens();
    this.active = await this.open();
    this.standby = await this.open().catch(() => null);
  }

  stop() {
    this.running = false;
    this.active?.close();
    this.standby?.close();
    this.active = this.standby = null;
    this.tokens = [];
    this.ring = [];
    this.recording = false;
    this.pieces = [];
    this.piecesWaiter?.();
  }

  /** Push-to-talk: start a phrase. Only speech after the press goes to the recogniser. */
  begin() {
    if (!this.manual) return;
    this.ring = [];
    this.voicedRun = 0;
    this.pieces = [];
    this.livePartial = '';
    this.recording = true;
  }

  /** Push-to-talk: end the phrase and return everything recognised since begin(). */
  async finish(): Promise<{ text: string; lang: string | null }> {
    if (!this.manual || !this.recording) return { text: '', lang: null };
    this.recording = false;
    const s = this.active;
    if (s && s.started) {
      const ok = await Promise.race([s.ready.then(() => true, () => false), wait(MANUAL_FINISH_TIMEOUT_MS).then(() => false)]);
      if (ok && s === this.active) {
        for (const p of s.pending) s.send(p);
        s.pending = [];
        s.commit();
        await Promise.race([
          new Promise<void>((resolve) => {
            this.piecesWaiter = () => { if (s.commitsReceived >= s.commitsSent || s.closed || !this.running) { this.piecesWaiter = null; resolve(); } };
            this.piecesWaiter();
          }),
          wait(MANUAL_FINISH_TIMEOUT_MS),
        ]);
        this.piecesWaiter = null;
      }
    }
    const pieces = this.pieces;
    this.pieces = [];
    const text = pieces.map((p) => p.text).filter(Boolean).join(' ').trim();
    if (!text && this.livePartial) {
      // The final commit never came back: keep what the user saw on screen.
      const fallback = this.livePartial;
      this.livePartial = '';
      if (this.running) this.rotate();
      return { text: fallback, lang: null };
    }
    this.livePartial = '';
    if (this.running && s?.started) this.rotate();
    return { text, lang: pieces.findLast((p) => p.lang)?.lang ?? null };
  }

  /** Feed one 50 ms frame. `silent` replaces it with zeros (while our own voice plays). */
  push(frame: Int16Array, silent: boolean) {
    if (!this.running) return;
    const f = silent ? new Int16Array(frame.length) : frame;
    this.ring.push(f);
    if (this.ring.length > RING_FRAMES) this.ring.shift();
    const voiced = this.detect(f);
    if (this.manual && !this.recording) return;
    const s = this.active;
    if (!s) return;
    if (!s.started) {
      if (!voiced) return;
      s.started = true;
      s.startedAt = performance.now();
      s.pending.push(...this.ring.slice(-PREROLL_FRAMES));
    } else {
      s.pending.push(f);
    }
    if (s.isReady) {
      for (const p of s.pending) s.send(p);
      s.pending = [];
    } else if (s.pending.length > 200) {
      s.pending.splice(0, s.pending.length - 200); // 10 s cap while connecting
    }
    if (this.manual) {
      // A long monologue: commit at a pause so the server buffer stays small; pieces are joined on finish().
      if (s.isReady && this.voicedRun === 0 && s.sentFrames - s.commitsSent * MANUAL_SOFT_COMMIT_FRAMES >= MANUAL_SOFT_COMMIT_FRAMES) s.commit();
      return;
    }
    if (!s.heardText && performance.now() - s.startedAt > NO_TEXT_RESET_MS) this.rotate();
  }

  /** Speech onset: two frames in a row well above an adaptive noise floor. */
  private detect(f: Int16Array): boolean {
    let sum = 0;
    for (let i = 0; i < f.length; i++) sum += f[i] * f[i];
    const rms = Math.sqrt(sum / f.length);
    if (rms < this.floor) this.floor = Math.max(30, this.floor * 0.9 + rms * 0.1);
    else this.floor = Math.min(3000, this.floor * 1.002 + 0.5);
    this.voicedRun = rms > Math.max(this.floor * 3, 400) ? this.voicedRun + 1 : 0;
    return this.voicedRun >= 2;
  }

  private fillTokens() {
    const now = Date.now();
    this.tokens = this.tokens.filter((x) => now - x.at < TOKEN_TTL_MS);
    while (this.tokens.length < 2) {
      const t = fetch(TOKEN_URL, { method: 'POST', headers: { 'xi-api-key': this.apiKey() } }).then(async (r) => {
        if (r.status === 401) throw new Error('Ключ ElevenLabs не подошёл. Проверьте его в настройках.');
        if (!r.ok) throw new Error(`ElevenLabs: ошибка ${r.status} при выдаче токена.`);
        return ((await r.json()) as { token: string }).token;
      });
      t.catch(() => {});
      this.tokens.push({ t, at: now });
    }
  }

  private async takeToken(): Promise<string> {
    this.fillTokens();
    const { t } = this.tokens.shift()!;
    this.fillTokens();
    return t;
  }

  private url(token: string) {
    const o = this.options();
    const q = new URLSearchParams({
      model_id: 'scribe_v2_realtime',
      token,
      audio_format: 'pcm_16000',
      commit_strategy: o.manual ? 'manual' : 'vad',
      include_language_detection: 'true',
    });
    if (!o.manual) q.set('vad_silence_threshold_secs', String(Math.min(3, Math.max(0.3, o.vadSilence))));
    for (const k of o.keyterms) q.append('keyterms', k);
    return `${WS}?${q}`;
  }

  private async open(): Promise<Session> {
    let token: string;
    try {
      token = await this.takeToken();
    } catch (e) {
      this.h.error((e as Error).message, true);
      throw e;
    }
    const s = new Session(this.url(token));
    s.onPartial = (text) => {
      if (s !== this.active) return;
      if (!this.manual) { this.h.partial(text); return; }
      this.livePartial = [...this.pieces.map((p) => p.text), text].filter(Boolean).join(' ');
      this.h.partial(this.livePartial);
    };
    s.onCommitted = (text, lang) => { if (s === this.active) this.onCommit(text, lang); };
    s.onFail = (msg, fatal) => { this.h.error(msg, fatal); if (fatal) this.stop(); };
    s.onUnexpectedClose = () => this.onLost(s);
    try {
      await s.ready;
      this.failures = 0;
    } catch (e) {
      if (!this.running) throw e;
      if (++this.failures >= 3) { this.h.error('Нет связи с ElevenLabs. Проверьте интернет.', false); }
      await new Promise((r) => setTimeout(r, Math.min(4000, 300 * this.failures)));
      if (!this.running) throw e;
      return this.open();
    }
    return s;
  }

  private onCommit(text: string, lang: string | null) {
    if (this.manual) {
      if (text) this.pieces.push({ text, lang });
      this.livePartial = this.pieces.map((p) => p.text).join(' ');
      this.piecesWaiter?.();
      return;
    }
    const at = performance.now();
    if (!text) return; // VAD fired on silence; keep the session
    this.h.committed(text, lang, at);
    this.rotate();
  }

  private rotate() {
    const old = this.active;
    const next = this.standby;
    this.standby = null;
    // The next session starts on the next speech onset; if someone is already talking, the onset
    // fires on the next frame and the pre-roll from the ring covers the start of the words.
    this.voicedRun = 0;
    if (next && !next.closed) {
      this.active = next;
    } else {
      this.active = null;
      void this.open().then((s) => { if (this.running) this.active = s; else s.close(); }).catch(() => {});
    }
    old?.close();
    this.h.partial('');
    void this.open().then((s) => { if (this.running) this.standby = s; else s.close(); }).catch(() => {});
  }

  private onLost(s: Session) {
    if (!this.running) return;
    if (s === this.standby) {
      this.standby = null;
      void this.open().then((n) => { if (this.running) this.standby = n; else n.close(); }).catch(() => {});
    } else if (s === this.active) {
      this.rotate();
    }
  }
}
