import { Translator } from '../src/lib/translate';
const tr = new Translator();
const cases = [['es', 'Меня зовут Сергей, я жду друга по имени Мигель.'], ['pl', 'Меня зовут Сергей.'], ['cs', 'Да.'], ['pl', 'Да.']] as const;
for (const model of ['claude-haiku-5-5', 'claude-sonnet-5-5'] as const)
  for (const [f, text] of cases) {
    const r = await tr.translate({ apiKey: process.env.ANTHROPIC_API_KEY!, model, foreign: f, polite: true, esVariant: 'spain', glossary: [], customPrompt: '' },
      { asrText: text, asrLang: 'ru', history: [] }, { direction() {}, text() {}, sentence() {} });
    console.log(model.padEnd(18), f, '|', text, '⟹', r.text);
  }
