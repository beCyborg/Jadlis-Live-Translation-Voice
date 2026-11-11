// End-to-end for the two modes on spike/out/pl-scene.wav (RU at ~3, 25, 43, 65 s; PL at ~14, 35, 53 s).
// MODE=oneway: direction from-ru, auto listening — only Russian phrases must be translated.
// MODE=manual: push-to-talk — tap at 0 s, tap at 9 s (RU #1), tap at 23 s, tap at 29.5 s (RU #3);
// the Polish phrase at 14 s falls between taps and must not be translated.
import { chromium } from 'playwright';
import path from 'node:path';
const MODE = process.env.MODE ?? 'oneway';
const wav = path.resolve('spike/out/pl-scene.wav');
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}%noloop`, '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['microphone'] });
const settings = MODE === 'manual' ? { foreign: 'pl', talkMode: 'manual', debug: true } : { foreign: 'pl', direction: 'from-ru', debug: true };
await ctx.addInitScript((s) => { if (!localStorage.getItem('jt.settings.v1')) localStorage.setItem('jt.settings.v1', JSON.stringify(s)); }, settings);
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(process.env.URL ?? 'http://localhost:4174/Jadlis-Live-Translation-Voice/');
const shot = (n) => page.screenshot({ path: `spike/out/modes-${MODE}-${n}.png` });
const t0 = Date.now();
const at = (s) => page.waitForTimeout(Math.max(0, t0 + s * 1000 - Date.now()));
const tap = async (name) => { await page.getByRole('button', { name }).click(); console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s tap ${name}`); };
const turns = () => page.evaluate(() => JSON.parse(localStorage.getItem('jt.history.v1') ?? '[]'));
if (MODE === 'manual') {
  await shot('0-idle');
  await tap('Говорить');
  await at(7); await shot('1-listening');
  await at(9); await tap('Перевести');
  await at(16); await shot('2-after-first');
  console.log('turns after 16 s:', (await turns()).length);
  await at(23); await tap('Говорить');
  await at(29.5); await tap('Перевести');
  await at(38);
} else {
  await tap('Начать разговор');
  await at(15); await shot('1-mid');
  await at(80);
}
await shot('3-end');
const banner = await page.locator('.banner p').allTextContents();
console.log('banner', banner);
console.log('errors', errors.slice(0, 10));
for (const t of await turns()) console.log(`#${t.id} ${t.side} ${t.src}→${t.tgt} | ${t.srcText} ⟹ ${t.text}`);
await browser.close();
