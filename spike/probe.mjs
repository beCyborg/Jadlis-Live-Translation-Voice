const KEY = process.env.XI;
const variants = process.argv.slice(2);
for (const v of variants) {
  const r = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', { method: 'POST', headers: { 'xi-api-key': KEY } });
  const { token } = await r.json();
  const res = await new Promise(res => {
    const ws = new WebSocket(`wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=${process.env.M||"scribe_v2_realtime"}&token=${token}${v}`);
    ws.onmessage = m => { res('MSG ' + m.data.slice(0, 300)); ws.close(1000); };
    ws.onclose = c => res(`close ${c.code} ${c.reason}`);
    setTimeout(() => res('timeout'), 5000);
  });
  console.log(v || '(base)', '=>', res);
}
process.exit(0);
