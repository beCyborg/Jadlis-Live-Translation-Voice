// Spike 2: HTTP stream TTS with eleven_v4_turbo; also produces PCM16k clips for the Scribe spike.
import fs from 'node:fs';
const KEY = process.env.XI;
const VOICE = { ru: '3EuKHIEZbSzrHGNmdYsx', other: 'EXAVITQu4vr4xnSDxMaL' };
const utts = JSON.parse(fs.readFileSync(new URL('./utterances.json', import.meta.url)));
const results = [];
for (const [i, u] of utts.entries()) {
  const voice = u.lang === 'ru' ? VOICE.ru : VOICE.other;
  const t0 = performance.now();
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream?output_format=pcm_16000`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ text: u.text, model_id: 'eleven_v4_turbo', language_code: u.lang }),
  });
  if (!r.ok) { console.log(i, r.status, await r.text()); process.exit(1); }
  const reader = r.body.getReader(); let first = null; const chunks = [];
  for (;;) { const { done, value } = await reader.read(); if (done) break; if (first === null) first = performance.now() - t0; chunks.push(value); }
  const buf = Buffer.concat(chunks);
  fs.writeFileSync(new URL(`./out/${String(i).padStart(2, '0')}.pcm`, import.meta.url), buf);
  results.push({ i, lang: u.lang, ttfb: Math.round(first), total: Math.round(performance.now() - t0), secs: +(buf.length / 32000).toFixed(2), region: r.headers.get('x-region') });
  console.log(JSON.stringify(results.at(-1)));
}
const tt = results.map(r => r.ttfb).sort((a, b) => a - b);
console.log('TTFB median', tt[Math.floor(tt.length / 2)], 'ms; min', tt[0], 'max', tt.at(-1));
