import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

/* Teste local: abre o próprio index.html num Chrome headless,
   rola até cada seção e salva capturas dentro desta pasta. */
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = 'C:/Users/ygora/.deepai-code/scratch/2026-11-09-opa-ae42a1c8';
const PORT = 9333;

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  process.env.WIN || '--window-size=1440,900',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${ROOT}/.chrome-tmp`,
  '--no-first-run', '--no-default-browser-check',
  `file:///${ROOT}/index.html`
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function pageTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find(t => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('CDP não respondeu');
}

const page = await pageTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener('message', ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
await new Promise(r => ws.addEventListener('open', r, { once: true }));

function send(method, params = {}) {
  return new Promise(resolve => {
    const msgId = ++id;
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

const evaluate = async expression => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 40, y: 400, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 40, y: 400, button: 'left', clickCount: 1 });
await sleep(700);

const total = await evaluate('document.documentElement.scrollHeight - innerHeight');
const frames = await evaluate(`(() => [...document.querySelectorAll('[data-frame]')].map(el => ({
  id: el.id,
  y: Math.round(el.getBoundingClientRect().top + scrollY + el.offsetHeight / 2 - innerHeight / 2),
  label: el.dataset.label
})))()`);

console.log('rolagem máxima:', Math.round(total));
console.log('frames:', await evaluate("document.querySelector('#hudTotal').textContent"));
console.log('som:', await evaluate("document.querySelector('#sound').getAttribute('aria-pressed')"));

for (const [i, f] of frames.entries()) {
  const y = Math.max(0, Math.min(total, f.y));
  await evaluate(`scrollTo({ top: ${y}, behavior: 'instant' })`);
  await sleep(1400);
  const state = await evaluate(`(() => ({
    y: Math.round(scrollY),
    hud: document.querySelector('#hudIndex').textContent + ' · ' + document.querySelector('#hudStage').textContent,
    fill: document.querySelector('#hudFill').style.transform,
    rail: document.querySelector('#railFill').style.transform
  }))()`);
  console.log(`frame ${i + 1} (${f.id}) ->`, JSON.stringify(state));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${ROOT}/${process.env.PREFIX || 'f'}-${i + 1}.png`, Buffer.from(shot.result.data, 'base64'));
}

ws.close();
chrome.kill();
process.exit(0);
