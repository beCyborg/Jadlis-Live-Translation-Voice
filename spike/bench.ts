// Translation bench: Haiku 5.5 vs Sonnet 5.5 on the spike utterances, through the app's Translator.
import fs from 'node:fs';
import { Translator, type HistoryLine } from '../src/lib/translate';
import type { Foreign } from '../src/lib/langs';
const utts: { lang: string; text: string }[] = JSON.parse(fs.readFileSync('spike/utterances.json', 'utf8'));
// Recogniser outputs as seen in the rotation spike (short words garbled).
const asr: Record<number, string> = { 3: 'Так.', 9: 'Sim.', 16: 'Ano.', 18: 'Да.' };
const sceneOf = (i: number): Foreign => (i < 7 ? 'pl' : i < 14 ? 'es' : 'cs');
const tr = new Translator();
const variants = [{ model: 'claude-haiku-5-5', think: false }, { model: 'claude-haiku-5-5', think: true }, { model: 'claude-sonnet-5-5', think: false }] as const;
for (const { model, think } of variants) {
  const history: HistoryLine[] = [];
  const rows: string[] = []; const ttft: number[] = []; const totals: number[] = []; let ok = 0; let cache = 0;
  let scene: Foreign | null = null;
  for (const [i, u] of utts.entries()) {
    const f = sceneOf(i); if (f !== scene) { history.length = 0; scene = f; }
    const t0 = performance.now(); let first = 0;
    const res = await tr.translate(
      { apiKey: process.env.ANTHROPIC_API_KEY!, model, foreign: f, polite: true, esVariant: 'spain', glossary: ['Сергей', 'Мигель', 'Novák'], customPrompt: '', haikuThinks: think },
      { asrText: asr[i] ?? u.text, asrLang: null, history },
      { direction: () => { first ||= performance.now() - t0; }, text: () => {}, sentence: () => {} },
    );
    const total = performance.now() - t0; ttft.push(first); totals.push(total);
    cache = Math.max(cache, res.usage?.cache_read_input_tokens ?? 0);
    const right = res.src === u.lang; if (right) ok++;
    rows.push(`${String(i).padStart(2)} ${u.lang}→${res.src ?? '∅'} ${right ? '✓' : '✗'} ${Math.round(first)}ms | ${asr[i] ?? u.text}  ⟹  ${res.text}`);
    if (res.src) history.push({ src: res.src, text: asr[i] ?? u.text, translation: res.text });
  }
  const med = (a: number[]) => Math.round([...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]);
  console.log(`\n=== ${model}${think ? ' +thinking' : ''}: direction ${ok}/${utts.length}, first label median ${med(ttft)} ms, full median ${med(totals)} ms, max cache_read ${cache}`);
  console.log(rows.join('\n'));
}
