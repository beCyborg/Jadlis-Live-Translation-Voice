// End-to-end: built site in Chromium, fake mic plays spike/out/pl-scene.wav (7 utterances RU/PL).
import { chromium } from 'playwright';
import path from 'node:path';
const wav = path.resolve('spike/out/pl-scene.wav');
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}%noloop`, '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['microphone'] });
const settings = process.env.DEMO ? { foreign: 'pl', debug: true } : { anthropicKey: process.env.ANTHROPIC_API_KEY, elevenKey: process.env.XI, foreign: 'pl', debug: true };
await ctx.addInitScript((s) => { if (!localStorage.getItem('jt.settings.v1')) localStorage.setItem('jt.settings.v1', JSON.stringify(s)); }, settings);
const page = await ctx.newPage();
const hosts = new Set(); const errors = [];
page.on('request', (r) => hosts.add(new URL(r.url()).host));
page.on('websocket', (ws) => hosts.add('ws:' + new URL(ws.url()).host));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('http://localhost:4173/Jadlis-Live-Translation-Voice/');
await page.screenshot({ path: 'spike/out/e2e-0-start.png' });
const t0 = Date.now();
await page.getByRole('button', { name: 'Начать разговор' }).click();
await page.waitForTimeout(15000);
await page.screenshot({ path: 'spike/out/e2e-1-mid.png' });
await page.waitForTimeout(Number(process.env.WAIT ?? 80000));
await page.screenshot({ path: 'spike/out/e2e-2-end.png' });
const history = await page.evaluate(() => JSON.parse(localStorage.getItem('jt.history.v1') ?? '[]'));
const banner = await page.locator('.banner p').allTextContents();
await page.getByRole('button', { name: 'Настройки' }).click();
await page.waitForTimeout(500);
const rows = await page.locator('table tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent).join(' | ')));
await page.screenshot({ path: 'spike/out/e2e-3-settings.png', fullPage: false });
console.log('elapsed', Math.round((Date.now() - t0) / 1000), 's');
console.log('hosts', [...hosts].join(', '));
console.log('banner', banner);
console.log('errors', errors.slice(0, 10));
for (const t of history) console.log(`#${t.id} ${t.side} ${t.src}→${t.tgt} | ${t.srcText} ⟹ ${t.text}`);
console.log('timings (# | phrase | first word | first sound | cache):'); rows.forEach((r) => console.log('  ' + r));
await browser.close();
