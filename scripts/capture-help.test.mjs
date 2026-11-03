import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

test('capture help guide screenshots', async t => {
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
  await command('Emulation.setDeviceMetricsOverride', {width: 300, height: 600, deviceScaleFactor: 2, mobile: false});
  async function capture(name, selector) {
    const clip = await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.scrollIntoView({block:'start'}); const r=node.getBoundingClientRect(); return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}; })()`);
    const shot = await command('Page.captureScreenshot', {format:'png',clip,captureBeyondViewport:true});
    await writeFile(new URL('../assets/img/help/' + name + '.png', import.meta.url), Buffer.from(shot.data, 'base64'));
  }
  await evaluate("document.getElementById('timestamp').textContent='9:30:00'; document.getElementById('timestamp2').textContent='1限目 (9:00 - 10:45)'; document.getElementById('timestamp3').textContent='あと 75 分'");
  await capture('tools', '.tab-panel');
  await evaluate("document.getElementById('panel-A').classList.remove('is-show'); document.getElementById('panel-B').classList.add('is-show'); document.querySelectorAll('.tab').forEach(n=>n.classList.remove('is-active')); document.getElementById('tab-B').classList.add('is-active'); document.getElementById('switch2').checked=true; document.getElementById('switch3').checked=true");
  await capture('sync', '#panel-B > .personal-section:nth-of-type(1)');
  await capture('timetable-settings', '#panel-B > .personal-section:nth-of-type(2)');
  await evaluate("document.getElementById('user_id').value='GP12345'; document.getElementById('user_pass').value='sample-only'; document.getElementById('login-status').textContent='保存しました。Moodleで自動ログインします。'");
  await capture('login', '#panel-B > .personal-section:nth-of-type(3)');
  await evaluate("document.getElementById('panel-B').classList.remove('is-show'); document.getElementById('panel-C').classList.add('is-show'); document.querySelectorAll('.tab').forEach(n=>n.classList.remove('is-active')); document.getElementById('tab-C').classList.add('is-active'); document.getElementById('nkey-checkbox').checked=true; document.querySelector('.ai-master').dataset.enabled='true'; document.getElementById('setting').hidden=false; document.querySelector('.ai-savebar').hidden=false; document.getElementById('etc-account').textContent='未ログイン：ChatGPT画面からログインしてください。'; document.getElementById('etc-connect-label').textContent='ChatGPTでログイン'; document.getElementById('etc-model').replaceChildren(new Option('ログイン後に選択できます','')); document.getElementById('status').textContent='変更した設定は、保存すると反映されます。'");
  await evaluate("document.getElementById('panel-C').style.maxHeight='none'; document.getElementById('panel-C').style.overflow='visible'; document.getElementById('setting').style.overflow='visible'");
  await capture('ai', '.tab-panel');
  await command('Emulation.setDeviceMetricsOverride', {width: 960, height: 1100, deviceScaleFactor: 1, mobile: false});
  await command('Page.navigate', {url: pathToFileURL(fileURLToPath(new URL('../help/help.html', import.meta.url))).href});
  for (let i = 0; i < 50; i++) {
    if (await evaluate("document.querySelectorAll('.guide-screenshot img').length === 11")) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await evaluate("document.querySelectorAll('.guide-screenshot img').forEach(img => img.loading='eager')");
  for (let i = 0; i < 50; i++) {
    if (await evaluate("[...document.querySelectorAll('.guide-screenshot img')].every(img => img.complete && img.naturalWidth > 0)")) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(await evaluate("[...document.querySelectorAll('.guide-screenshot img')].every(img => img.complete && img.naturalWidth > 0)"), true);
  await evaluate("document.querySelector('.guide-screenshot').scrollIntoView({block:'center'})");
  const preview = await command('Page.captureScreenshot', {format:'png'});
  await writeFile('/tmp/help-preview.png', Buffer.from(preview.data, 'base64'));
  await command('Emulation.setDeviceMetricsOverride', {width: 360, height: 700, deviceScaleFactor: 1, mobile: false});
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, 'guide fits mobile width');
});
