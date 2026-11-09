// Quick check of the English pair through the app's Translator (Sonnet 5.5, polite).
import { Translator, type HistoryLine } from '../src/lib/translate';
const lines: [string, string][] = [
  ['ru', 'Здравствуйте, где здесь ближайшая аптека?'],
  ['en', "It's around the corner, next to the bakery. Do you need anything else?"],
  ['ru', 'Да.'],
  ['en', 'Yeah, sure.'],
  ['en', 'Сюр.'], // English misheard in Cyrillic
  ['ru', 'Меня зовут Сергей, сколько стоит такси до вокзала?'],
];
const tr = new Translator(); const history: HistoryLine[] = []; let ok = 0;
for (const [lang, text] of lines) {
  const res = await tr.translate(
    { apiKey: process.env.ANTHROPIC_API_KEY!, model: 'claude-sonnet-5-5', foreign: 'en', polite: true, esVariant: 'spain', glossary: [], customPrompt: '' },
    { asrText: text, asrLang: null, history },
    { direction: () => {}, text: () => {}, sentence: () => {} },
  );
  if (res.src === lang) ok++;
  console.log(`${lang}→${res.src ?? '∅'} ${res.src === lang ? '✓' : '✗'} | ${text} ⟹ ${res.text}`);
  if (res.src) history.push({ src: res.src, text, translation: res.text });
}
console.log(`direction ${ok}/${lines.length}`);
