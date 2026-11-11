// One Claude call per utterance: fix recognition errors, decide the direction, translate.
// Output format: "<src>→<tgt>⟩ <translation>" or "∅" for noise. Naming both ends makes the model
// commit to a direction before writing (Haiku mislabelled 5/20 with a source-only label). The label is visible from the first tokens,
// so speech can start on the first sentence.
import Anthropic from '@anthropic-ai/sdk';
import { LANGS, type Foreign, type Lang } from './langs';
import type { Model } from './settings.svelte';

export interface TranslateConfig {
  apiKey: string;
  model: Model;
  foreign: Foreign;
  polite: boolean;
  esVariant: 'spain' | 'latam';
  glossary: string[];
  customPrompt: string;
  /** One-way mode: only utterances in this language are translated; the rest are skipped. */
  oneWay?: Lang | null;
  /** Bench only: let Haiku think (adaptive) instead of disabling thinking. */
  haikuThinks?: boolean;
}

export interface HistoryLine { src: Lang; text: string; translation: string }

export interface TranslateRequest {
  asrText: string;
  asrLang: string | null;
  history: HistoryLine[];
  forcedSource?: Lang;
}

export interface TranslateCallbacks {
  /** Fires once, as soon as the label is parsed. `null` = skip (noise, fragment). */
  direction(src: Lang | null): void;
  /** Full translation so far. */
  text(full: string): void;
  /** A finished sentence, ready for speech. */
  sentence(s: string): void;
}

const CORE = `You are a live interpreter at a face-to-face conversation between two people who share one phone.
The phone hears both of them. A speech recogniser turns each utterance into text; you receive that text and must render it in the other person's language so that it can be shown on screen and spoken aloud immediately.

How to answer — strictly this format, nothing else:
- First the ISO code of the language the utterance was spoken in, the arrow →, the ISO code of the other language of the pair, the character ⟩, a space, and then the translation into that other language. The translation is always in the language after the arrow.
  Example: ru→pl⟩ Dzień dobry, gdzie jest najbliższa apteka?
  Example: pl→ru⟩ Аптека за углом, рядом с пекарней.
- One line only. Output exactly one translation and stop. Do not revise, correct or comment on it afterwards.
- If the input is noise, a filler sound (эм, ммм, eee, hmm), a lone cut-off fragment with no meaning, background talk clearly not addressed to the other person, or the device's own spoken output echoed back, answer with the single character ∅ and nothing else.
- Never add comments, quotes, notes, alternatives, romanisation or explanations. Never answer the speaker yourself; you only interpret.

Deciding the source language:
- The recogniser's language hint is often wrong for short utterances: "Tak", "Ano", "Sí", "Da", "No" are frequently mislabelled. Decide from the text itself, the script, and the conversation so far.
- Cyrillic text is almost always Russian. A Russian word written in Latin letters (e.g. "Horosho", "Da") is Russian. A Polish, Czech, Spanish or English word written in Cyrillic (e.g. "Так" after a Polish question, "Си" after a Spanish question, "Шур" or "Сюр" after an English question) belongs to that language when the context supports it.
- Short answers usually reply to the other person's last line. "Tak." after a Russian question to a Pole means Polish "yes"; "Так." after a Polish question is Polish "tak" misheard in Cyrillic.
- If the recogniser clearly garbled a word, translate what the speaker most likely meant (recognition fixes are part of your job), but do not invent content.

How to translate:
- Spoken, natural, short. Match the register of a real conversation in a shop, café, office, taxi or doctor's room. Keep the speaker's sentence boundaries so speech can start early.
- Names of people are transliterated, never swapped for a local equivalent: Сергей → Siergiej (pl), Serguéi (es), Sergej (cs), Sergey (en); Miguel → Мигель; Novák → Новак. Streets, brands and places keep their usual spelling.
- Keep numbers exact; write prices, times and dates the way a native speaker would write them in that language.
- Add nothing that was not said. A one-word reply stays a one-word reply: "Да." → "Tak." / "Sí." / "Ano.", not a longer phrase.
- Short replies ("да", "нет", "спасибо", "ok", "dobrze") are translated by meaning in context, not by dictionary — "Хорошо." can be "Dobrze.", "Zgoda." or "W porządku." depending on what was said before.
- Questions stay questions; politeness, hesitation and emphasis carry over.
- Never translate into the same language as the source. The pair is fixed; every utterance goes to the other side.`;

function pairPart(c: TranslateConfig): string {
  const f = c.foreign;
  const lines = [`The pair: Russian (ru) ⇄ ${LANGS[f].native} (${f}). The owner of the phone speaks Russian; the other person speaks ${LANGS[f].native}.`];
  if (f === 'pl') lines.push(c.polite
    ? 'Address the Polish speaker formally: Pan/Pani with third-person verbs (e.g. "Czy może Pan…", "Proszę Pani…"). Pick Pan or Pani from the context; default to Pan/Pani forms that sound natural ("Proszę…", "Czy mogę…") when the gender is unknown.'
    : 'Address the Polish speaker informally with "ty".');
  if (f === 'cs') lines.push(c.polite
    ? 'Address the Czech speaker formally (vykání: "vy", "Můžete…").'
    : 'Address the Czech speaker informally (tykání).');
  if (f === 'es') {
    lines.push(c.polite ? 'Address the Spanish speaker with "usted".' : 'Address the Spanish speaker with "tú".');
    lines.push(c.esVariant === 'spain'
      ? 'Use the Spanish of Spain (vosotros for plural you, "coger", "móvil", euros).'
      : 'Use neutral Latin American Spanish (ustedes for plural you, "celular", avoid "coger").');
  }
  if (f === 'en') lines.push(c.polite
    ? 'Speak to the English speaker politely and neutrally ("Could you…", "please", "sir/ma\'am" only when natural).'
    : 'Speak to the English speaker casually, like a friend.');
  lines.push('Russian side: the other person addresses the owner; render their words into natural spoken Russian, using "вы" unless they clearly speak informally.');
  if (c.oneWay) {
    const from = c.oneWay;
    const to: Lang = from === 'ru' ? f : 'ru';
    lines.push(`One-way mode is on: translate only utterances spoken in ${LANGS[from].native} (${from}→${to}). If the utterance is in ${LANGS[to].native}, answer with the single character ∅ — that side is not translated.`);
  }
  return lines.join('\n');
}

export function buildSystem(c: TranslateConfig): string {
  let s = `${CORE}\n\n${pairPart(c)}`;
  if (c.glossary.length) s += `\n\nGlossary — names and terms that may appear; keep their spelling exactly:\n${c.glossary.map((g) => `- ${g}`).join('\n')}`;
  if (c.customPrompt.trim()) s += `\n\nAdditional instructions from the owner:\n${c.customPrompt.trim()}`;
  return s;
}

function userMessage(r: TranslateRequest): string {
  const ctx = r.history.slice(-6).map((h) => `${h.src}: ${h.text}`).join('\n');
  let m = '';
  if (ctx) m += `<conversation_so_far>\n${ctx}\n</conversation_so_far>\n`;
  m += `<utterance recogniser_language_hint="${r.asrLang ?? 'unknown'}">${r.asrText}</utterance>`;
  if (r.forcedSource) m += `\n<forced_source>${r.forcedSource}</forced_source>\nThe owner says this utterance was spoken in ${LANGS[r.forcedSource].native}; use ${r.forcedSource} as the source and translate it into the other language.`;
  return m;
}

const SENTENCE_END = /([.!?…。]+["»”)]?)(\s+)/;
// The first chunk may end at a comma or dash once it has a few words, so speech starts sooner.
const CLAUSE_END = /([,;:—–]|\s-)(\s+)/;

export class Translator {
  private client: Anthropic | null = null;
  private clientKey = '';

  private getClient(key: string) {
    if (!this.client || this.clientKey !== key) {
      this.client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 });
      this.clientKey = key;
    }
    return this.client;
  }

  async translate(c: TranslateConfig, r: TranslateRequest, cb: TranslateCallbacks, signal?: AbortSignal) {
    const client = this.getClient(c.apiKey);
    // Haiku 5.5 thinks by default; "disabled" is allowed at effort high or below.
    // Sonnet 5.5 rejects "disabled" with a 400 — "between_tools" is its thinking-off mode.
    const thinking = c.model === 'claude-sonnet-5-5'
      ? ({ type: 'between_tools' } as const)
      : c.haikuThinks ? ({ type: 'adaptive' } as const) : ({ type: 'disabled' } as const);
    const stream = client.messages.stream(
      {
        model: c.model,
        max_tokens: 400,
        thinking,
        output_config: { effort: 'low' },
        system: [{ type: 'text', text: buildSystem(c), cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userMessage(r) }],
      },
      { signal },
    );

    let raw = '';
    let label: Lang | null | undefined;
    let body = '';
    let spokenUpTo = 0;
    const valid: Lang[] = ['ru', c.foreign];

    const flushSentences = (final: boolean) => {
      for (;;) {
        const rest = body.slice(spokenUpTo);
        let m = SENTENCE_END.exec(rest);
        if (!m && spokenUpTo === 0) {
          const c = CLAUSE_END.exec(rest);
          if (c && rest.slice(0, c.index).trim().split(/\s+/).length >= 3) m = c;
        }
        if (!m) break;
        const end = m.index + m[1].length;
        const sentence = rest.slice(0, end).trim();
        spokenUpTo += end + m[2].length;
        if (sentence) cb.sentence(sentence);
      }
      if (final) {
        const tail = body.slice(spokenUpTo).trim();
        spokenUpTo = body.length;
        if (tail) cb.sentence(tail);
      }
    };

    // One-way mode: an utterance in the other language is skipped like noise.
    const allowed = (src: Lang) => !c.oneWay || src === c.oneWay;

    for await (const ev of stream) {
      if (ev.type !== 'content_block_delta' || ev.delta.type !== 'text_delta') continue;
      raw += ev.delta.text;
      if (label === undefined) {
        const t = raw.trimStart();
        if (t.startsWith('∅')) { label = null; cb.direction(null); continue; }
        const m = /^([a-z]{2})\s*(?:→|->)\s*([a-z]{2})\s*⟩\s?/.exec(t);
        if (m) {
          const code = m[1] as Lang;
          label = valid.includes(code) ? code : valid.includes(m[2] as Lang) ? (m[2] === 'ru' ? c.foreign : 'ru') : r.forcedSource ?? 'ru';
          if (!allowed(label)) { label = null; cb.direction(null); stream.abort(); break; }
          cb.direction(label);
          body = t.slice(m[0].length);
        } else if (t.length > 8) {
          // Model ignored the format: treat everything as the translation, guess the source by script.
          label = r.forcedSource ?? (/[Ѐ-ӿ]/.test(r.asrText) ? 'ru' : c.foreign);
          if (!allowed(label)) { label = null; cb.direction(null); stream.abort(); break; }
          cb.direction(label);
          body = t;
        } else continue;
      } else if (label === null) {
        continue;
      } else {
        body += ev.delta.text;
      }
      const cut = body.search(/\n\s*\n|\n[a-z]{2}\s*(?:→|->)|\n?\s*(?:Wait|Correct output|Note:)/);
      if (cut >= 0) { body = body.slice(0, cut); stream.abort(); break; }
      cb.text(body.trim());
      flushSentences(false);
    }
    const final = await stream.finalMessage().catch(() => null);
    if (final?.stop_reason === 'refusal') throw new Error('Claude отказался переводить эту фразу.');
    if (label === undefined) { label = null; cb.direction(null); }
    if (label) { cb.text(body.trim()); flushSentences(true); }
    return { src: label, text: body.trim(), usage: final?.usage ?? null };
  }
}

export function explainError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'Ключ Anthropic не подошёл. Проверьте его в настройках.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'У ключа Anthropic нет доступа к этой модели.';
  if (e instanceof Anthropic.RateLimitError) return 'Anthropic просит подождать: слишком много запросов.';
  if (e instanceof Anthropic.BadRequestError) {
    const msg = e.message ?? '';
    if (/credit balance/i.test(msg)) return 'На счёте Anthropic закончились деньги.';
    return `Anthropic отклонил запрос: ${msg.slice(0, 160)}`;
  }
  if (e instanceof Anthropic.APIConnectionError) return 'Нет связи с Anthropic. Проверьте интернет.';
  if (e instanceof Anthropic.InternalServerError) return 'У Anthropic временный сбой. Попробуйте ещё раз.';
  if (e instanceof Error && e.name === 'AbortError') return '';
  return e instanceof Error ? e.message : String(e);
}
