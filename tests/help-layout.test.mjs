import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

test('guide registration screenshots load and fit narrow screens', async t => {
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
  await command('Page.navigate', {url: pathToFileURL(fileURLToPath(new URL('../help/help.html', import.meta.url))).href});
  for (let i=0; i<50; i++) {
    if (await evaluate("document.querySelectorAll('.registration-step').length === 5")) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(await evaluate("document.querySelectorAll('.registration-step').length"), 5);
  assert.equal(await evaluate("document.getElementById('registration-animation').getAttribute('src').endsWith('.gif')"), true);
  await evaluate("document.getElementById('registration-playback').click()");
  assert.equal(await evaluate("document.getElementById('registration-animation').getAttribute('src').endsWith('registration-edit.png')"), true);
  await evaluate("document.getElementById('registration-playback').click()");
  assert.equal(await evaluate("document.getElementById('registration-animation').getAttribute('src').endsWith('.gif')"), true);
  await evaluate("document.querySelector('.registration-details').open = true");

  await evaluate("document.querySelectorAll('img').forEach(img=>img.loading='eager')");
  for (let i=0; i<50; i++) {
    if (await evaluate("[...document.images].every(img=>img.complete && img.naturalWidth > 0)")) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(await evaluate("[...document.images].every(img=>img.complete && img.naturalWidth > 0)"), true);
  for (const width of [960,360]) {
    await command('Emulation.setDeviceMetricsOverride', {width,height:900,deviceScaleFactor:1,mobile:false});
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  }
  await command('Emulation.setDeviceMetricsOverride', {width:960,height:1100,deviceScaleFactor:1,mobile:false});
  await evaluate("document.querySelector('.registration-flow').scrollIntoView({block:'start'})");
  const shot = await command('Page.captureScreenshot', {format:'png'});
  await writeFile('/tmp/registration-guide-preview.png', Buffer.from(shot.data,'base64'));
});
