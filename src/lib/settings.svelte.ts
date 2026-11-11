import { RU_VOICE, VOICE_PRESETS, type Foreign, type Gender, type Lang, type VoicePreset } from './langs';

export type Model = 'claude-haiku-5-5' | 'claude-sonnet-5-5';
export type AudioSessionMode = 'auto' | 'play-and-record' | 'playback';
/** both = RU ⇄ foreign; from-ru = only Russian speech is translated; to-ru = only the other person's speech. */
export type Direction = 'both' | 'from-ru' | 'to-ru';
/** auto = the phone hears the pause and translates; manual = one button: tap to listen, tap again to translate. */
export type TalkMode = 'auto' | 'manual';

export interface Settings {
  anthropicKey: string;
  elevenKey: string;
  foreign: Foreign;
  /** Voice that speaks the owner's words in the other language. */
  voiceGender: Gender;
  /** Library voices chosen by hand; empty = preset. */
  voiceCustom: Partial<Record<Lang, string>>;
  autoSpeak: boolean;
  rate: number; // playbackRate, pitch preserved
  vadSilence: number; // seconds of silence before a phrase is final
  model: Model;
  keyterms: string; // one per line
  customPrompt: string;
  polite: boolean; // Pan/Pani, usted, vykání
  esVariant: 'spain' | 'latam';
  layout: 'split' | 'single';
  audioSession: AudioSessionMode;
  debug: boolean;
  muteWhileSpeaking: boolean;
  direction: Direction;
  talkMode: TalkMode;
}

export const NIKOLAY = RU_VOICE.id;
export const GEORGE = 'JBFqnCBsd6RMkjVDRZzb'; // premade, available on every account

const DEFAULTS: Settings = {
  anthropicKey: '',
  elevenKey: '',
  foreign: 'pl',
  voiceGender: 'male',
  voiceCustom: {},
  autoSpeak: true,
  rate: 1.1,
  vadSilence: 0.8,
  model: 'claude-sonnet-5-5', // bench 2026-11-09: 20/20 directions, same first-token time as Haiku
  keyterms: '',
  customPrompt: '',
  polite: true,
  esVariant: 'spain',
  layout: 'split',
  audioSession: 'auto',
  debug: false,
  muteWhileSpeaking: false,
  direction: 'both',
  talkMode: 'auto',
};

const KEY = 'jt.settings.v1';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const s = JSON.parse(raw);
    return { ...structuredClone(DEFAULTS), ...s };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export const settings: Settings = $state(load());

$effect.root(() => {
  $effect(() => {
    localStorage.setItem(KEY, JSON.stringify(settings));
  });
});

// Demo keys are injected at build time from repository secrets (never committed). Anyone can read them
// from the page, so they must carry a spending limit. Own keys in settings take priority.
const DEMO = {
  anthropic: (import.meta.env.VITE_DEMO_ANTHROPIC_KEY as string | undefined) ?? '',
  eleven: (import.meta.env.VITE_DEMO_ELEVEN_KEY as string | undefined) ?? '',
};

export const keys = {
  get anthropic() { return settings.anthropicKey.trim() || DEMO.anthropic; },
  get eleven() { return settings.elevenKey.trim() || DEMO.eleven; },
  get hasDemo() { return !!DEMO.anthropic && !!DEMO.eleven; },
  get usingDemo() { return (!settings.anthropicKey.trim() && !!DEMO.anthropic) || (!settings.elevenKey.trim() && !!DEMO.eleven); },
};

export function presetVoice(lang: Lang, gender: Gender = settings.voiceGender): VoicePreset {
  if (lang === 'ru') return RU_VOICE;
  const key = lang === 'es' ? (settings.esVariant === 'latam' ? 'es-latam' : 'es-spain') : lang;
  return VOICE_PRESETS[key][gender];
}

export const voiceFor = (lang: Lang) => settings.voiceCustom[lang] || presetVoice(lang).id;

/** The only source language that gets translated, or null when both directions are on. */
export const oneWaySource = (): Lang | null =>
  settings.direction === 'from-ru' ? 'ru' : settings.direction === 'to-ru' ? settings.foreign : null;

export const keyterms = () =>
  settings.keyterms.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 100);
