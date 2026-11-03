import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

test('popup stylesheet loads and AI details hide when disabled', async t => {
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
  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', {expression, returnByValue: true});
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  await command('Page.navigate', {url: pathToFileURL(fileURLToPath(new URL('../popup/popup.html', import.meta.url))).href});
  for (let i = 0; i < 50; i++) {
    if (await evaluate("Boolean(document.querySelector('.ai-master')) && document.readyState === 'complete'")) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.tab-group')).display"), 'grid');
  assert.equal(await evaluate("getComputedStyle(document.getElementById('panel-B')).display"), 'none');
  assert.equal(await evaluate("getComputedStyle(document.body).width"), '300px');
  await evaluate("document.getElementById('panel-A').classList.remove('is-show'); document.getElementById('panel-C').classList.add('is-show')");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.ai-master')).display"), 'grid');
  assert.equal(await evaluate("getComputedStyle(document.getElementById('setting')).display"), 'none');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.ai-savebar')).display"), 'none');
  await evaluate("document.getElementById('setting').hidden = false; document.querySelector('.ai-savebar').hidden = false");
  assert.notEqual(await evaluate("getComputedStyle(document.getElementById('setting')).display"), 'none');
  await command('Emulation.setDeviceMetricsOverride', {width: 300, height: 400, deviceScaleFactor: 1, mobile: false});
  await evaluate("document.getElementById('panel-C').classList.remove('is-show'); document.getElementById('panel-B').classList.add('is-show'); document.getElementById('save-login').scrollIntoView({block:'end'})");
  assert.equal(await evaluate("document.scrollingElement.scrollTop > 0"), true, 'long settings can scroll');
  assert.equal(await evaluate("document.getElementById('save-login').getBoundingClientRect().bottom <= innerHeight + 1"), true, 'login save button is reachable (allow subpixel rounding)');

});
