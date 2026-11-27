// Nusantara Sky Courier — screenshot driver (Node 22, stdlib only).
// Serves game/ on :8080 (serve.ts must be running), drives VM Chrome over
// CDP on 127.0.0.1:9222, takes the 4 screenshots in shots.json at 1280x720
// (JPEG quality 80, must stay under 262144 B each), then prints each file's
// size plus the live HUD state for the record. Exits 1 on any failure.
import { readFileSync, statSync, writeFileSync } from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shots = JSON.parse(readFileSync(new URL('./shots.json', import.meta.url), 'utf8'));

async function main() {
  const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  let page = list.find((t) => t.type === 'page' && t.url.includes('127.0.0.1:8080'));
  if (!page) page = await (await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return 'ERR:' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  for (const s of shots) {
    await send('Page.navigate', { url: `http://127.0.0.1:8080/${s.query}` });
    // Wait for the staged scene to paint twice (__shotReady), up to 120 s
    // (the end shot flies a whole mission in the browser first).
    let ready = false;
    for (let i = 0; i < 120; i += 1) {
      await sleep(1000);
      if (await ev('window.__shotReady')) { ready = true; break; }
    }
    if (!ready) throw new Error(`${s.name}: __shotReady never fired`);
    await sleep(400);
    const state = await ev(`(()=>{const w=window.__world?.state; return w ? {region:w.region.id, weather:w.weatherId, phase:w.phase, alt:Math.round(w.alt), spd:Math.round(w.speed), hdg:Math.round(w.heading), roll:+w.roll.toFixed(1), fuel:Math.round(w.fuel), rings:w.ringsPassed+'/'+w.rings.length, dist:+w.dist.toFixed(2), msg:w.message} : null;})()`);
    console.log(s.name, 'state:', JSON.stringify(state));
    const errs = await ev(`(window.__errs||[]).slice(0,5)`);
    if (errs && errs.length) console.log(s.name, 'page errors:', JSON.stringify(errs));
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    const buf = Buffer.from(r.result.data, 'base64');
    writeFileSync(new URL(`./screenshots/${s.name}`, import.meta.url), buf);
    console.log(s.name, 'bytes:', buf.length, buf.length <= 262144 ? 'OK' : 'OVER 256KiB!');
    if (buf.length > 262144) throw new Error(`${s.name} over the 262144 B cap`);
  }
  console.log('all 4 shots done');
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
