export type Lang = 'ru' | 'pl' | 'es' | 'cs';
export type Foreign = Exclude<Lang, 'ru'>;

export const LANGS: Record<Lang, { name: string; native: string; flag: string }> = {
  ru: { name: 'Русский', native: 'Русский', flag: '🇷🇺' },
  pl: { name: 'Польский', native: 'Polski', flag: '🇵🇱' },
  es: { name: 'Испанский', native: 'Español', flag: '🇪🇸' },
  cs: { name: 'Чешский', native: 'Čeština', flag: '🇨🇿' },
};

export const PRESETS: Foreign[] = ['pl', 'es', 'cs'];

// Small labels on the other person's half, in their language.
export const UI_FOREIGN: Record<Foreign, { listening: string; speakNow: string; mine: string }> = {
  pl: { listening: 'Słucham', speakNow: 'Proszę mówić po polsku', mine: 'To ja powiedziałem' },
  es: { listening: 'Escuchando', speakNow: 'Hable en español, por favor', mine: 'Lo dije yo' },
  cs: { listening: 'Poslouchám', speakNow: 'Mluvte prosím česky', mine: 'To jsem řekl já' },
};

export const CYRILLIC = /[Ѐ-ӿ]/;
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export type Gender = 'male' | 'female';
export interface VoicePreset { id: string; name: string }

// Picked 2026-11-09 from the ElevenLabs voice library: native accent, conversational, most used in a year.
// Each was synthesised with eleven_v4_turbo and transcribed back with scribe_v2: text and language matched.
export const VOICE_PRESETS: Record<'pl' | 'cs' | 'es-spain' | 'es-latam', Record<Gender, VoicePreset>> = {
  pl: { male: { id: 'H5xTcsAIeS5RAykjz57a', name: 'Alex' }, female: { id: 'N0GCuK2B0qwWozQNTS8F', name: 'Magdalena' } },
  cs: { male: { id: 'uYFJyGaibp4N2VwYQshk', name: 'Adam' }, female: { id: 'bF7C2fCv7Zf30iT84wZ1', name: 'Jana' } },
  'es-spain': { male: { id: 'Nh2zY9kknu6z4pZy6FhD', name: 'David Martín' }, female: { id: 'UOIqAnmS11Reiei1Ytkc', name: 'Carolina' } },
  'es-latam': { male: { id: 'htFfPSZGJwjBv1CL0aMD', name: 'Antonio' }, female: { id: 'CaJslL1xziwefCeTNzHv', name: 'Cristina' } },
};
export const RU_VOICE: VoicePreset = { id: '3EuKHIEZbSzrHGNmdYsx', name: 'Nikolay' };
