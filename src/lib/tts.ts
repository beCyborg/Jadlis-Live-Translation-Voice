// ElevenLabs Eleven v4 Turbo over the HTTP stream endpoint, one request per sentence.
// Requests start as soon as a sentence is ready (prefetch); playback is sequential in one <audio>
// element so iOS keeps the playback permission granted by the first tap.
// v4 ignores `speed`, so tempo is playbackRate with pitch preserved.
import { GEORGE } from './settings.svelte';
import type { Lang } from './langs';

const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

interface Item {
  id: number;
  blob: Promise<Blob | null>;
}

export interface SpeakerEvents {
  start(id: number): void;
  idle(): void;
  error(msg: string): void;
}

export class Speaker {
  private el: HTMLAudioElement;
  private queue: Item[] = [];
  private playing = false;
  private gen = 0;
  private urls: string[] = [];
  /** Blobs of the last utterance per turn id, for "repeat". */
  private cache = new Map<number, Promise<Blob | null>[]>();
  lastEndedAt = 0;

  constructor(
    private key: () => string,
    private voice: (lang: Lang) => string,
    private rate: () => number,
    private ev: SpeakerEvents,
  ) {
    this.el = new Audio();
    this.el.preload = 'auto';
    this.el.setAttribute('playsinline', '');
  }

  get busy() {
    return this.playing || this.queue.length > 0;
  }

  /** Call inside a user gesture (iOS): lets later programmatic play() calls through. */
  unlock() {
    this.el.src = SILENT_WAV;
    void this.el.play().catch(() => {});
  }

  /** Warm the voice so the first real phrase starts faster. */
  warm(lang: Lang) {
    void this.fetchAudio(lang, 'Ok.', undefined).catch(() => {});
  }

  enqueue(turnId: number, lang: Lang, text: string, previous?: string) {
    const blob = this.fetchAudio(lang, text, previous);
    const list = this.cache.get(turnId) ?? [];
    list.push(blob);
    this.cache.set(turnId, list);
    if (this.cache.size > 20) this.cache.delete(this.cache.keys().next().value!);
    this.queue.push({ id: turnId, blob });
    void this.pump();
  }

  replay(turnId: number) {
    const list = this.cache.get(turnId);
    if (!list) return false;
    this.stop();
    for (const blob of list) this.queue.push({ id: turnId, blob });
    void this.pump();
    return true;
  }

  stop() {
    this.gen++;
    this.queue = [];
    this.el.pause();
    if (this.playing) this.lastEndedAt = performance.now();
    this.playing = false;
    this.ev.idle();
  }

  private async fetchAudio(lang: Lang, text: string, previous?: string, voiceOverride?: string): Promise<Blob | null> {
    const voice = voiceOverride ?? this.voice(lang);
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_22050_32`,
      {
        method: 'POST',
        headers: { 'xi-api-key': this.key(), 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: 'eleven_v4_turbo',
          language_code: lang,
          ...(previous ? { previous_text: previous } : {}),
        }),
      },
    );
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      if ((r.status === 404 || /voice/i.test(body)) && voice !== GEORGE) {
        this.ev.error('Выбранный голос недоступен этому ключу — говорю стандартным голосом.');
        return this.fetchAudio(lang, text, previous, GEORGE);
      }
      if (r.status === 401) this.ev.error('Ключ ElevenLabs не подошёл. Проверьте его в настройках.');
      else if (/quota|credits/i.test(body)) this.ev.error('На счёте ElevenLabs закончились кредиты.');
      else this.ev.error(`Озвучка: ошибка ${r.status}.`);
      return null;
    }
    return r.blob();
  }

  private async pump() {
    if (this.playing) return;
    const gen = this.gen;
    while (this.queue.length && gen === this.gen) {
      const item = this.queue.shift()!;
      this.playing = true;
      const blob = await item.blob.catch(() => null);
      if (gen !== this.gen) return;
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      this.urls.push(url);
      if (this.urls.length > 8) URL.revokeObjectURL(this.urls.shift()!);
      await new Promise<void>((resolve) => {
        const done = () => { this.el.onended = this.el.onerror = null; resolve(); };
        this.el.onended = done;
        this.el.onerror = done;
        this.el.src = url;
        this.el.preservesPitch = true;
        this.el.playbackRate = this.rate();
        this.el.onplaying = () => { this.el.playbackRate = this.rate(); this.ev.start(item.id); this.el.onplaying = null; };
        this.el.play().catch((e) => {
          if (e?.name === 'NotAllowedError') this.ev.error('Браузер не дал включить звук. Коснитесь экрана и повторите.');
          done();
        });
      });
    }
    if (gen === this.gen) {
      this.playing = false;
      this.lastEndedAt = performance.now();
      this.ev.idle();
    }
  }
}
