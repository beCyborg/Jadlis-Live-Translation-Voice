// Spike 1: language stickiness. Modes: single (one session, auto lang), secondary (one session, ru + secondary_languages), rotate (new session per utterance).
import fs from 'node:fs';
const KEY = process.env.XI; const MODE = process.argv[2];
const utts = JSON.parse(fs.readFileSync(new URL('./utterances.json', import.meta.url)));
const pcm = utts.map((_, i) => fs.readFileSync(new URL(`./out/${String(i).padStart(2, '0')}.pcm`, import.meta.url)));
const CHUNK = 3200; // 100 ms of 16k mono s16
const SILENCE = Buffer.alloc(CHUNK);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function token() {
  const r = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', { method: 'POST', headers: { 'xi-api-key': KEY } });
  if (!r.ok) throw new Error('token ' + r.status + ' ' + await r.text());
  return (await r.json()).token;
}
function url(tok, extra = '') {
  return `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&token=${tok}&audio_format=pcm_16000&commit_strategy=vad&vad_silence_threshold_secs=0.8&include_language_detection=true${extra}`;
}
function open(u) {
  const ws = new WebSocket(u); const events = [];
  const ready = new Promise((res, rej) => {
    ws.onmessage = m => { const d = JSON.parse(m.data); d.t = performance.now(); events.push(d); if (d.message_type === 'session_started') res(); if (/error|exceeded|throttled|limited/.test(d.message_type)) console.log('ERR', JSON.stringify(d)); };
    ws.onerror = e => rej(e); ws.onclose = c => { if (c.code !== 1000) console.log('close', c.code, c.reason); };
  });
  return { ws, events, ready };
}
const send = (ws, buf, prev) => ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: buf.toString('base64'), commit: false, sample_rate: 16000, ...(prev ? { previous_text: prev } : {}) }));
async function stream(ws, buf) { for (let o = 0; o < buf.length; o += CHUNK) { send(ws, buf.subarray(o, o + CHUNK)); await sleep(100); } }
const results = [];
async function waitCommit(events, from, maxMs = 6000) {
  const t0 = performance.now();
  while (performance.now() - t0 < maxMs) {
    const c = events.slice(from).find(e => e.message_type === 'committed_transcript_with_timestamps');
    if (c) return c; await sleep(20);
  }
  return null;
}
if (MODE === 'rotate') {
  let next = token();
  for (const [i, u] of utts.entries()) {
    if (process.env.ONLY && !process.env.ONLY.split(',').includes(String(i))) continue;
    const tok = await next; next = token(); // keep one token in reserve
    const t0 = performance.now(); const s = open(url(tok)); await s.ready; const openMs = performance.now() - t0;
    for (let k = 0; k < Number(process.env.PRE ?? 0) * 10; k++) { send(s.ws, SILENCE); await sleep(100); }
    await stream(s.ws, pcm[i]); const endSpeech = performance.now();
    const pump = (async () => { for (let k = 0; k < 40 && s.ws.readyState === 1; k++) { send(s.ws, SILENCE); await sleep(100); } })();
    const c = await waitCommit(s.events, 0);
    s.ws.close(1000); await pump.catch(() => {});
    results.push({ i, ref: u.lang, got: c?.language_code ?? null, text: c?.text ?? null, latency: c ? Math.round(c.t - endSpeech) : null, openMs: Math.round(openMs) });
    console.log(JSON.stringify(results.at(-1)));
  }
} else {
  const extra = MODE === 'secondary' ? '&language_code=ru&secondary_languages=pl&secondary_languages=es&secondary_languages=cs' : '';
  const s = open(url(await token(), extra)); await s.ready;
  for (const [i, u] of utts.entries()) {
    const from = s.events.length;
    await stream(s.ws, pcm[i]); const endSpeech = performance.now();
    let c = null; for (let k = 0; k < 40 && !c; k++) { send(s.ws, SILENCE); await sleep(100); c = s.events.slice(from).find(e => e.message_type === 'committed_transcript_with_timestamps'); }
    if (!c) c = await waitCommit(s.events, from, 1500);
    results.push({ i, ref: u.lang, got: c?.language_code ?? null, text: c?.text ?? null, latency: c ? Math.round(c.t - endSpeech) : null });
    console.log(JSON.stringify(results.at(-1)));
    for (let k = 0; k < 3; k++) { send(s.ws, SILENCE); await sleep(100); }
  }
  s.ws.close(1000);
}
fs.writeFileSync(new URL(`./out/result-${MODE}.json`, import.meta.url), JSON.stringify(results, null, 1));
