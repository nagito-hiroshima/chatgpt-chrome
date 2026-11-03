import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

test('chat panel login, model choice, safe streaming, failure, and new chat in Chromium', async t => {
  const executable = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean).find(existsSync);
  assert.ok(executable, 'Install Chromium or set CHROME_PATH');
  const profile = await mkdtemp(path.join(os.tmpdir(), 'chat-panel-test-'));
  const child = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let ws;
  t.after(async () => {
    ws?.close(); child.kill();
    await new Promise(resolve => setTimeout(resolve, 600));
    // Delete only the explicitly created temporary test profile.
    if (path.dirname(profile) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('chat-panel-test-')) await rm(profile, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  });
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Browser startup timed out')), 15000);
    child.once('error', reject);
    child.stderr.on('data', data => { const match = String(data).match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  ws = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let serial = 0; const calls = new Map();
  ws.addEventListener('message', event => {
    const value = JSON.parse(event.data); if (!value.id) return;
    const pending = calls.get(value.id); if (!pending) return; calls.delete(value.id); clearTimeout(pending.timer);
    if (value.error) pending.reject(Error(JSON.stringify(value.error))); else pending.resolve(value.result);
  });
  function call(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++serial; const timer = setTimeout(() => reject(Error(`${method} timeout`)), 10000);
      calls.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  const command = (method, params = {}) => call(method, params, sessionId);
  await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 850, deviceScaleFactor: 1, mobile: false });
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.mockConnected = false; window.mockMode = 'complete'; window.openedURL = '';
    Object.assign(window.chrome, { runtime: {
      async sendMessage(message) {
        const json = data => ({data});
        if (message.action === 'status') return json({ connected: window.mockConnected, accounts: [{ clientId: 'older-client', email: 'older@example.test' }, { clientId: 'test-client', email: 'demo@example.test' }], account: window.mockConnected ? { clientId: 'test-client', email: 'demo@example.test' } : null });
        if (message.action === 'login') { window.loginClientId = message.clientId; window.openedURL = 'https://auth.openai.com/api/accounts/authorize?test=1'; return json({ started: true }); }
        if (message.action === 'models') return json({ models: [{ id: 'test-model', name: 'Test model' }, { id: 'other', name: 'Other model' }] });
        if (message.action === 'logout') { window.mockConnected = false; return json({ revoked: true }); }
        throw Error('Unexpected action ' + message.action);
      },
      connect() {
        const messages = [], disconnects = []; let closed = false;
        return {
          onMessage: { addListener(fn) { messages.push(fn); } },
          onDisconnect: { addListener(fn) { disconnects.push(fn); } },
          disconnect() { if (closed) return; closed = true; disconnects.forEach(fn => fn()); },
          postMessage(message) {
            if (message.type !== 'start') return;
            window.lastSent = message.body;
            if (window.mockMode === 'wait') return;
            const events = [{ delta: '<img src=x onerror=alert(1)>日本語の返信です。' }, window.mockMode === 'failed' ? { error: '利用上限です' } : { done: true }];
            setTimeout(() => events.forEach(e => { if (!closed) messages.forEach(fn => fn(e)); }), 0);
          }
        };
      }
    } });
  ` });
  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value;
  }
  await command('Page.navigate', { url: pathToFileURL(fileURLToPath(new URL('../chat-panel.html', import.meta.url))).href });
  async function until(expression) {
    for (let i = 0; i < 50; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.fail(`Not reached: ${expression}`);
  }
  await until("Boolean(document.getElementById('login')) && typeof checkConnection === 'function'");
  assert.equal(await evaluate("document.getElementById('send').disabled"), true);
  await until("!document.getElementById('login').disabled");
  assert.equal(await evaluate("document.getElementById('account').value"), 'test-client', 'most recently used saved account is selected while logged out');
  await evaluate("document.getElementById('account').value = ''; checkConnection(true)");
  assert.equal(await evaluate("document.getElementById('account').value"), '', 'explicit add-account choice survives polling');
  await evaluate("document.getElementById('account').value = 'older-client'; checkConnection(true)");
  assert.equal(await evaluate("document.getElementById('account').value"), 'older-client');
  await evaluate("document.getElementById('account').value = 'test-client'");
  await evaluate("document.getElementById('login').click()");
  await until("window.openedURL.startsWith('https://auth.openai.com/')");
  assert.equal(await evaluate('window.loginClientId'), 'test-client');
  await evaluate('window.mockConnected = true; checkConnection(true)');
  await until("!document.getElementById('prompt').disabled");
  assert.equal(await evaluate("document.getElementById('model').value"), 'test-model');
  await evaluate("document.getElementById('prompt').value = 'こんにちは'; document.getElementById('composer').requestSubmit()");
  await until("document.getElementById('status').textContent.includes('返信が完了')");
  assert.equal(await evaluate("document.querySelectorAll('.message .text img').length"), 0);
  assert.equal(await evaluate('window.lastSent.messages.length'), 1);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await evaluate("renderAnswer(document.querySelector('.message.assistant .text'), '# 見出し\\n\\n- **要点**を確認\\n- `code`\\n\\n```js\\nconst value = \"<script>alert(1)</script>\";\\n```')");
  assert.equal(await evaluate("document.querySelector('.message.assistant h2').textContent"), '見出し');
  assert.equal(await evaluate("document.querySelector('.message.assistant strong').textContent"), '要点');
  assert.equal(await evaluate("document.querySelectorAll('.message.assistant li').length"), 2);
  assert.equal(await evaluate("document.querySelectorAll('.message.assistant script').length"), 0);
  assert.ok(await evaluate("document.querySelector('.message.assistant pre code').textContent.includes('<script>')"));
  await evaluate("Object.defineProperty(navigator, 'clipboard', { configurable:true, value: { async writeText(text) { window.copiedReply = text; } } }); document.querySelector('.copy-reply').click()");
  await until("document.querySelector('.copy-reply').textContent === 'コピーしました'");
  assert.ok(await evaluate("window.copiedReply.includes('日本語の返信です。')"));
  await evaluate("document.getElementById('prompt').value = '質問\\n'.repeat(12); document.getElementById('prompt').dispatchEvent(new Event('input'))");
  assert.equal(await evaluate("document.getElementById('prompt').getBoundingClientRect().height"), 160);
  await evaluate("document.getElementById('connection').open = true; document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'}))");
  assert.equal(await evaluate("document.getElementById('connection').open"), false);
  // Refreshing the catalog must preserve the user's model choice.
  await evaluate("document.getElementById('model').value = 'other'; checkConnection(true)");
  assert.equal(await evaluate("document.getElementById('model').value"), 'other');
  if (process.env.CHAT_SCREENSHOT) {
    const shot = await command('Page.captureScreenshot', { format: 'png' });
    await mkdir(path.dirname(path.resolve(process.env.CHAT_SCREENSHOT)), { recursive: true });
    await writeFile(path.resolve(process.env.CHAT_SCREENSHOT) + '-conversation.png', Buffer.from(shot.data, 'base64'));
  }
  await evaluate("window.mockMode = 'failed'; document.getElementById('prompt').value = '失敗する入力'; document.getElementById('composer').requestSubmit()");
  await until("Boolean(document.querySelector('.message.failed'))");
  assert.equal(await evaluate("document.getElementById('prompt').value"), '失敗する入力');
  await evaluate("window.mockMode = 'wait'; document.getElementById('composer').requestSubmit()");
  await until("!document.getElementById('stop').hidden");
  await evaluate("document.getElementById('stop').click()");
  await until("document.getElementById('status').textContent.includes('送信を停止')");
  await evaluate("document.getElementById('new-chat').click()");
  assert.equal(await evaluate("document.querySelectorAll('.message').length"), 0);
  assert.equal(await evaluate("document.getElementById('welcome').hidden"), false);
  await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 600, deviceScaleFactor: 1, mobile: false });
  await evaluate("document.getElementById('connection').open = true");
  const layout = await evaluate("({width:document.documentElement.scrollWidth, viewport:window.innerWidth, bottom:document.querySelector('footer').getBoundingClientRect().bottom, height:window.innerHeight, parts:[...document.body.children].map(e=>[e.tagName,e.getBoundingClientRect().height])})");
  assert.ok(layout.width <= layout.viewport && layout.bottom <= layout.height + 1, JSON.stringify(layout));
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 850, deviceScaleFactor: 1, mobile: false });
  await evaluate("document.getElementById('connection').open = false");
  // A review artifact only when explicitly requested by the test runner.
  if (process.env.CHAT_SCREENSHOT) {
    const artifact = path.resolve(process.env.CHAT_SCREENSHOT);
    await mkdir(path.dirname(artifact), { recursive: true });
    const shot = await command('Page.captureScreenshot', { format: 'png' });
    await writeFile(artifact, Buffer.from(shot.data, 'base64'));
  }
  await command('Target.closeTarget', { targetId });
});
