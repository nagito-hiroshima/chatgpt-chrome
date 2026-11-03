import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { generateKeyPairSync, sign } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

test('loaded extension captures loopback callback without a listening server', async t => {
  // Branded Chrome disables --load-extension on recent releases; Edge supports
  // unpacked extensions in an isolated automation profile.
  const executable = [process.env.EXTENSION_TEST_BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].filter(Boolean).find(existsSync);
  assert.ok(executable, 'Set EXTENSION_TEST_BROWSER to Edge or Chromium');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const profile = await mkdtemp(path.join(os.tmpdir(), 'chat-extension-test-'));
  const child = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--disable-extensions-except=${root}`, `--load-extension=${root}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let ws;
  t.after(async () => {
    ws?.close(); child.kill(); await new Promise(resolve => setTimeout(resolve, 600));
    if (path.dirname(profile) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('chat-extension-test-')) await rm(profile, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  });
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Browser startup timed out')), 15000);
    child.once('error', reject);
    child.stderr.on('data', data => { const match = String(data).match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  ws = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let serial = 0; const pending = new Map();
  ws.addEventListener('message', event => {
    const value = JSON.parse(event.data); if (!value.id) return;
    const call = pending.get(value.id); if (!call) return; pending.delete(value.id); clearTimeout(call.timer);
    if (value.error) call.reject(Error(JSON.stringify(value.error))); else call.resolve(value.result);
  });
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++serial; const timer = setTimeout(() => reject(Error(`${method} timeout`)), 10000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const evaluate = async (sessionId, expression) => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value;
  };
  async function until(get, predicate, label) {
    for (let i = 0; i < 80; i++) { const value = await get(); if (predicate(value)) return value; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.fail(label);
  }
  const worker = await until(() => call('Target.getTargets'), result => result.targetInfos.some(target => target.url.endsWith('/chat-worker.mjs')), 'extension worker did not load; check manifest');
  const target = worker.targetInfos.find(target => target.url.endsWith('/chat-worker.mjs'));
  const { sessionId: workerSession } = await call('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const origin = target.url.slice(0, target.url.lastIndexOf('/'));
  const { targetId: panelId } = await call('Target.createTarget', { url: origin + '/chat-panel.html' });
  const { sessionId: panelSession } = await call('Target.attachToTarget', { targetId: panelId, flatten: true });
  await until(() => evaluate(panelSession, "Boolean(document.getElementById('login')) && !document.getElementById('login').disabled"), Boolean, 'panel did not connect to worker');
  // Keep the sign-in tab local during this test, while using real Chrome APIs
  // for callback navigation. All OpenAI HTTP replies below are synthetic.
  await evaluate(workerSession, `
    globalThis.realTabUpdate = chrome.tabs.update.bind(chrome.tabs);
    chrome.tabs.update = async (id, props) => {
      if (props.url?.startsWith('https://auth.openai.com/api/accounts/authorize')) { globalThis.testAuthURL = props.url; globalThis.testAuthTab = id; return {id}; }
      return globalThis.realTabUpdate(id, props);
    };
  `);
  await evaluate(panelSession, "document.getElementById('login').click()");
  const authURL = await until(() => evaluate(workerSession, 'globalThis.testAuthURL || ""'), Boolean, 'login did not open');
  const auth = new URL(authURL);
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'extension-key', alg: 'RS256' };
  const clientId = 'oaiapp_extension_test';
  const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ iss: 'https://auth.openai.com', aud: clientId, sub: 'test-user', email: 'demo@example.test', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, nonce: auth.searchParams.get('nonce') })).toString('base64url');
  const jwt = `${head}.${body}.${sign('sha256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url')}`;
  await evaluate(workerSession, `
    globalThis.fetch = async (url, options) => {
      const route = new URL(url).pathname;
      const json = data => new Response(JSON.stringify(data));
      if (route === '/api/accounts/oauth/token') return json(${JSON.stringify({ access_token: 'extension-test-token', id_token: jwt, scope: 'chatgpt.tokens.use.direct', expires_in: 3600 })});
      if (route === '/.well-known/jwks.json') return json({keys:[${JSON.stringify(jwk)}]});
      if (route === '/v1/models') return json({models:[{slug:'test-model',display_name:'Test model',visibility:'list'}]});
      if (route === '/v1/responses') {
        if (globalThis.testResponseDelay) await new Promise(resolve=>setTimeout(resolve,globalThis.testResponseDelay));
        globalThis.testInferenceCount = (globalThis.testInferenceCount || 0) + 1;
        globalThis.testInferenceBody = JSON.parse(options.body);
        return new Response('data: ' + JSON.stringify({type:'response.output_text.delta',delta:globalThis.testReply || '拡張機能から返信'}) + '\\n\\ndata: {"type":"response.completed"}\\n\\n');
      }
      throw Error('Unexpected request');
    };
  `);
  const callback = new URL(auth.searchParams.get('redirect_uri'));
  callback.search = new URLSearchParams({ code: 'synthetic-code', state: auth.searchParams.get('state'), client_id: clientId });
  // Simulate an authorization server's real HTTP 302. No server listens at
  // the callback destination: only the extension receives the final URL.
  const redirector = http.createServer((req, res) => { res.writeHead(302, { Location: callback.href }); res.end(); });
  await new Promise(resolve => redirector.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => redirector.close(resolve)));
  await evaluate(workerSession, `globalThis.realTabUpdate(globalThis.testAuthTab, {url:'http://127.0.0.1:${redirector.address().port}/authorize'}).catch(()=>{})`);
  await until(() => evaluate(panelSession, "checkConnection(true).then(()=>!document.getElementById('prompt').disabled)"), Boolean, 'callback did not authenticate the extension');
  const tabs = await call('Target.getTargets');
  assert.ok(tabs.targetInfos.some(tab => tab.url.endsWith('/chat-auth-result.html')));
  const resultTarget = tabs.targetInfos.find(tab => tab.url.endsWith('/chat-auth-result.html'));
  const { sessionId: resultSession } = await call('Target.attachToTarget', { targetId: resultTarget.targetId, flatten: true });
  // The original panel tab is still active in headless tests; explicitly
  // activate the result page just as browser navigation does for a user.
  await call('Target.activateTarget', { targetId: resultTarget.targetId });
  await until(() => evaluate(resultSession, "Boolean(document.querySelector('.result-card')) && document.querySelector('.result-card').dataset.state === 'connected'"), Boolean, 'result page did not show verified success');
  assert.equal(await evaluate(resultSession, "document.getElementById('result-email').textContent"), 'demo@example.test');
  assert.equal(await evaluate(resultSession, "document.getElementById('open-chat').disabled"), false);
  if (process.env.AUTH_RESULT_SCREENSHOT) {
    await call('Emulation.setDeviceMetricsOverride', { width: 1000, height: 800, deviceScaleFactor: 1, mobile: false }, resultSession);
    const shot = await call('Page.captureScreenshot', { format: 'png' }, resultSession);
    await writeFile(path.resolve(process.env.AUTH_RESULT_SCREENSHOT), Buffer.from(shot.data, 'base64'));
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 600, deviceScaleFactor: 1, mobile: false }, resultSession);
  assert.equal(await evaluate(resultSession, 'document.documentElement.scrollWidth <= innerWidth'), true);
  await evaluate(workerSession, "chrome.storage.session.set({chatResult:{tabId:globalThis.testAuthTab,state:'error',message:'利用許可がキャンセルされました。'}})");
  await evaluate(resultSession, 'checkResult()');
  assert.equal(await evaluate(resultSession, "document.querySelector('.result-card').dataset.state"), 'error');
  assert.equal(await evaluate(resultSession, "document.getElementById('result-account').hidden"), true);
  assert.equal(await evaluate(resultSession, "document.getElementById('open-chat-label').textContent"), 'チャットでやり直す');
  await call('Target.activateTarget', { targetId: panelId });
  await evaluate(panelSession, "document.getElementById('prompt').value = '質問'; document.getElementById('composer').requestSubmit()");
  await until(() => evaluate(panelSession, "document.getElementById('status').textContent.includes('返信が完了')"), Boolean, 'runtime port did not stream response');
  assert.equal(await evaluate(panelSession, "document.querySelector('.message.assistant .text').textContent"), '拡張機能から返信');
  const persisted = await evaluate(workerSession, 'Promise.all([chrome.storage.local.get(null),chrome.storage.session.get(null)]).then(JSON.stringify)');
  assert.ok(!persisted.includes('extension-test-token'));
  assert.ok(!persisted.includes(jwt));

  // Exercise the actual popup, injected Moodle script, and OAuth worker as a
  // single flow. The synthetic Moodle page is served at its real origin.
  await evaluate(workerSession, "chrome.storage.sync.set({ncheak:false,nkey:'obsolete-test-key'})");
  const { targetId: popupId } = await call('Target.createTarget', { url: origin + '/popup.html' });
  const { sessionId: popupSession } = await call('Target.attachToTarget', { targetId: popupId, flatten: true });
  await until(() => evaluate(popupSession, "Boolean(document.getElementById('etc-account')) && document.getElementById('etc-account').textContent.includes('接続済み')"), Boolean, 'ETC popup did not show the OAuth account');
  await evaluate(popupSession, "document.getElementById('tab-C').click(); document.getElementById('nkey-checkbox').checked=true; document.getElementById('nkey-checkbox').dispatchEvent(new Event('change')); document.getElementById('save').click()");
  await until(() => evaluate(popupSession, "document.getElementById('status').textContent.includes('保存しました')"), Boolean, 'ETC settings failed to save');
  assert.equal(await evaluate(workerSession, "chrome.storage.sync.get('nkey').then(data=>data.nkey===undefined)"), true);
  assert.equal(await evaluate(workerSession, "chrome.storage.local.get('etcModel').then(data=>data.etcModel)"), 'test-model');
  assert.equal(await evaluate(popupSession, "document.getElementById('nkey-checkbox').getBoundingClientRect().top < document.getElementById('etc-account').getBoundingClientRect().top"), true, 'main switch must precede account settings');
  assert.equal(await evaluate(popupSession, "document.getElementById('ai-master-label').textContent"), 'MoodleでAIを使う');
  assert.equal(await evaluate(popupSession, "document.getElementById('etc-overwrite').disabled"), true, 'replacement depends on automatic input');
  assert.equal(await evaluate(popupSession, "document.getElementById('save').getBoundingClientRect().bottom <= 600 && document.documentElement.scrollWidth <= innerWidth"), true, 'save button must remain in the popup viewport');
  if (process.env.ETC_SCREENSHOT) {
    await call('Emulation.setDeviceMetricsOverride', { width: 360, height: 650, deviceScaleFactor: 1, mobile: false }, popupSession);
    const shot = await call('Page.captureScreenshot', { format: 'png' }, popupSession);
    await writeFile(path.resolve(process.env.ETC_SCREENSHOT), Buffer.from(shot.data, 'base64'));
  }
  await evaluate(workerSession, "globalThis.testInferenceCount=0; globalThis.testReply='2。解説です。'");
  const fixture = '<!doctype html><meta charset="utf-8"><span class="usertext mr-1">STUDENT12345</span><div class="que"><div class="info"><div class="questionflag"><label id="question-flag">問題1</label></div></div><div class="content"><div class="formulation"><div class="qtext">1+1は？ <a href="#details" id="ordinary-link">説明リンク</a></div><div class="answer"><label><input type="radio" name="answer" id="option-one">1</label><label><input type="radio" name="answer">2</label></div><a href="#clear">私の選択をクリアする</a></div></div></div>';
  const { targetId: moodleId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId: moodleSession } = await call('Target.attachToTarget', { targetId: moodleId, flatten: true });
  ws.addEventListener('message', event => {
    const value = JSON.parse(event.data);
    if (value.method === 'Fetch.requestPaused' && value.sessionId === moodleSession && !value.params.request.url.endsWith('/pluginfile.php/formula.png')) {
      call('Fetch.fulfillRequest', { requestId: value.params.requestId, responseCode: 200, responseHeaders: [{name:'Content-Type',value:'text/html; charset=utf-8'}], body: Buffer.from(fixture).toString('base64') }, moodleSession).catch(() => {});
    }
  });
  await call('Fetch.enable', { patterns: [{ urlPattern: 'https://moodle2026.mc2.osakac.ac.jp/*', requestStage: 'Request' }] }, moodleSession);
  await call('Page.navigate', { url: 'https://moodle2026.mc2.osakac.ac.jp/2026/mod/quiz/attempt.php?id=123' }, moodleSession);
  await call('Target.activateTarget', { targetId: moodleId });
  await until(() => evaluate(moodleSession, "document.querySelectorAll('[data-oecu-etc]').length===1"), Boolean, 'Moodle ETC button was not injected');
  assert.equal(await evaluate(workerSession, 'globalThis.testInferenceCount'), 0, 'page load must not send a question');
  await evaluate(moodleSession, "document.getElementById('option-one').addEventListener('change',()=>window.choiceChanged=true); document.getElementById('option-one').click(); document.getElementById('ordinary-link').click()");
  assert.equal(await evaluate(moodleSession, 'window.choiceChanged'), true, 'Moodle form listeners are preserved');
  assert.equal(await evaluate(workerSession, 'globalThis.testInferenceCount'), 0, 'ordinary Moodle links must not call AI');
  await evaluate(moodleSession, "document.querySelector('[data-oecu-etc]').click(); document.querySelector('[data-oecu-etc]').click()");
  await until(() => evaluate(moodleSession, "document.getElementById('question-flag').title==='2。解説です。'"), Boolean, 'OAuth answer did not return to Moodle tooltip');
  assert.equal(await evaluate(workerSession, 'globalThis.testInferenceCount'), 1, 'double click must send one question');
  assert.equal(await evaluate(workerSession, 'globalThis.testInferenceBody.model'), 'test-model');
  assert.ok(await evaluate(workerSession, "globalThis.testInferenceBody.input[0].content.includes('1+1は？')"));
  assert.equal(await evaluate(moodleSession, "document.querySelector('.usertext').textContent"), 'STUDENT22345');
  assert.equal(await evaluate(moodleSession, "document.getElementById('option-one').checked"), true, 'autofill OFF must preserve manual selection');
  // Reproduce the supplied Moodle structure: the inner flag link has its own
  // native title, while option labels are DIVs referenced by aria-labelledby.
  const autoFixture = `<form id="auto-form">
    <div class="que multichoice" id="auto-choice"><div class="info"><div class="questionflag editable" title="古い回答"><a id="auto-flag" href="#flag" tabindex="0" title="将来参照するためにフラグを付けます。">問題にフラグを付ける</a></div></div><div class="content"><div class="formulation"><div class="qtext">正しくないものを選んでください。</div><div class="answer">${['a','b','c','d'].map((letter,index) => `<div class="r${index%2}"><input type="radio" name="auto-choice" id="auto-${letter}" value="${index}" aria-labelledby="auto-${letter}-label"><div id="auto-${letter}-label" data-region="answer-label"><span class="answernumber">${letter}. </span><div>選択肢${letter}</div></div></div>`).join('')}</div><div class="qtype_multichoice_clearchoice" aria-hidden="true"><input type="radio" name="auto-choice" value="-1" checked aria-hidden="true"></div></div></div></div>
    <div class="que shortanswer" id="auto-text"><div class="info"><div class="questionflag"><a title="元のフラグ説明">フラグ</a></div></div><div class="content"><div class="formulation"><div class="qtext">用語を入力してください。</div><div class="answer"><label for="auto-input">回答</label><input type="text" id="auto-input" name="auto-text"></div></div></div></div>
    <div class="que multichoice" id="auto-multiple"><div class="info"><div class="questionflag">フラグ</div></div><div class="content"><div class="formulation"><div class="qtext">二つ選択してください。</div><div class="answer"><label><input type="checkbox" id="multi-a" name="multi-a">a. A</label><label><input type="checkbox" id="multi-b" name="multi-b">b. B</label><label><input type="checkbox" id="multi-c" name="multi-c">c. C</label></div></div></div></div>
    <div class="que match" id="auto-fields"><div class="info"><div class="questionflag">フラグ</div></div><div class="content"><div class="formulation"><div class="qtext">数値と対応する項目を回答してください。</div><div class="answer"><label for="auto-number">数値</label><input type="number" id="auto-number"><label for="auto-select">項目</label><select id="auto-select"><option value="0">選択してください</option><option value="north">北</option><option value="south">南</option></select></div></div></div></div>
    <button type="submit" id="final-submit">提出</button></form>`;
  await evaluate(moodleSession, `document.body.insertAdjacentHTML('beforeend',${JSON.stringify(autoFixture)}); window.submissions=0; document.getElementById('auto-form').addEventListener('submit',event=>{event.preventDefault(); window.submissions++}); window.savedEvents=0; document.getElementById('auto-input').addEventListener('change',()=>window.savedEvents++)`);
  await until(() => evaluate(moodleSession, "Boolean(document.querySelector('#auto-choice [data-oecu-etc]'))"), Boolean, 'dynamic questions missing trigger');
  assert.equal(await evaluate(popupSession, "document.getElementById('etc-autofill').checked"), false);
  assert.equal(await evaluate(popupSession, "document.getElementById('etc-autofill').closest('[role=tabpanel]').id"), 'panel-C');
  await evaluate(popupSession, "document.getElementById('etc-autofill').checked=true; document.getElementById('etc-autofill').dispatchEvent(new Event('change')); document.getElementById('save').click()");
  assert.equal(await evaluate(popupSession, "document.getElementById('etc-overwrite').disabled"), false, 'turning on automatic input enables replacement settings');
  await until(() => evaluate(workerSession, "chrome.storage.sync.get('etcAutoFill').then(s=>s.etcAutoFill===true)"), Boolean, 'autofill setting not saved');
  await evaluate(workerSession, `globalThis.testReply=${JSON.stringify(JSON.stringify({selection:['choice-2'],inputs:[],explanation:'**正しくないものは c です。**\n\n解説です。'}))}`);
  await evaluate(moodleSession, "document.querySelector('#auto-choice [data-oecu-etc]').click()");
  await until(() => evaluate(moodleSession, "document.getElementById('auto-c').checked"), Boolean, 'letter C did not select the third actual radio');
  assert.equal(await evaluate(moodleSession, "document.getElementById('auto-a').checked"), false);
  await evaluate(moodleSession, "document.getElementById('auto-flag').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))");
  assert.equal(await evaluate(moodleSession, "!document.getElementById('oecu-etc-answer-tooltip').hidden"), true);
  assert.ok(await evaluate(moodleSession, "document.querySelector('.oecu-etc-tooltip-body').textContent.includes('正しくないものは c')"));
  assert.ok(await evaluate(moodleSession, "document.getElementById('auto-flag').getAttribute('aria-describedby').includes('oecu-etc-answer-tooltip')"));
  if (process.env.ETC_HOVER_SCREENSHOT) {
    const shot = await call('Page.captureScreenshot', { format: 'png' }, moodleSession);
    await writeFile(path.resolve(process.env.ETC_HOVER_SCREENSHOT), Buffer.from(shot.data, 'base64'));
  }
  await evaluate(moodleSession, "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))");
  assert.equal(await evaluate(moodleSession, "document.getElementById('oecu-etc-answer-tooltip').hidden"), true);
  await evaluate(moodleSession, "document.querySelector('#auto-choice [data-oecu-etc]').dispatchEvent(new MouseEvent('mouseover',{bubbles:true})); document.querySelector('#auto-choice .qtext').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))");
  assert.equal(await evaluate(moodleSession, "document.getElementById('oecu-etc-answer-tooltip').hidden"), true, 'question area must not display the answer popup');
  assert.equal(await evaluate(moodleSession, "document.querySelector('#auto-choice [data-oecu-etc]').hasAttribute('title')"), false, 'invisible question trigger must not show a native answer tooltip');
  await evaluate(workerSession, `globalThis.testReply=${JSON.stringify(JSON.stringify({selection:[],inputs:[{id:'field-0',value:'工業化'}],explanation:'工業化です。'}))}`);
  await evaluate(moodleSession, "document.querySelector('#auto-text [data-oecu-etc]').click()");
  await until(() => evaluate(moodleSession, "document.getElementById('auto-input').value==='工業化'"), Boolean, 'text answer was not filled');
  assert.equal(await evaluate(moodleSession, 'window.savedEvents'), 1, 'Moodle change/autosave listeners must run');
  await evaluate(workerSession, `globalThis.testReply=${JSON.stringify(JSON.stringify({selection:[],inputs:[{id:'field-0',value:'置き換え'}],explanation:'新しい回答'}))}`);
  assert.equal(await evaluate(moodleSession, "document.querySelector('#auto-text .oecu-etc-fill-status') === null"), true, 'successful autofill must stay silent');
  await evaluate(moodleSession, "document.querySelector('#auto-text [data-oecu-etc]').click()");
  await until(() => evaluate(moodleSession, "Boolean(document.querySelector('#auto-text .oecu-etc-fill-status'))"), Boolean, 'existing-answer result missing');
  assert.equal(await evaluate(moodleSession, "document.getElementById('auto-input').value"), '工業化', 'existing answers are protected by default');
  await evaluate(popupSession, "document.getElementById('etc-overwrite').checked=true; document.getElementById('save').click()");
  await until(() => evaluate(workerSession, "chrome.storage.sync.get('etcOverwriteAnswers').then(s=>s.etcOverwriteAnswers===true)"), Boolean, 'overwrite setting not saved');
  await evaluate(moodleSession, "document.querySelector('#auto-text [data-oecu-etc]').click()");
  await until(() => evaluate(moodleSession, "document.getElementById('auto-input').value==='置き換え'"), Boolean, 'explicit overwrite was not applied');
  await evaluate(workerSession, `globalThis.testReply=${JSON.stringify(JSON.stringify({selection:['choice-0','choice-2'],inputs:[],explanation:'AとCです。'}))}`);
  await evaluate(moodleSession, "document.querySelector('#auto-multiple [data-oecu-etc]').click()");
  await until(() => evaluate(moodleSession, "document.getElementById('multi-a').checked && document.getElementById('multi-c').checked"), Boolean, 'multiple answers did not select A and C');
  assert.equal(await evaluate(moodleSession, "document.getElementById('multi-b').checked"), false);
  await evaluate(popupSession, "document.getElementById('etc-overwrite').checked=false; document.getElementById('save').click()");
  await until(() => evaluate(workerSession, "chrome.storage.sync.get('etcOverwriteAnswers').then(s=>s.etcOverwriteAnswers===false)"), Boolean, 'replacement setting failed to turn off');
  await evaluate(workerSession, `globalThis.testReply=${JSON.stringify(JSON.stringify({selection:[],inputs:[{id:'field-0',value:'42'},{id:'field-1',value:'option-2'}],explanation:'42、南です。'}))}`);
  await evaluate(moodleSession, "document.querySelector('#auto-fields [data-oecu-etc]').click()");
  await until(() => evaluate(moodleSession, "document.getElementById('auto-number').value==='42' && document.getElementById('auto-select').value==='south'"), Boolean, 'numeric and matching fields did not receive mapped values');
  assert.equal(await evaluate(moodleSession, 'window.submissions'), 0, 'automatic answer entry must never submit the quiz');
  // The snapshot is taken synchronously on click; edit before the synthetic
  // HTTP response to ensure even explicit overwrite preserves a newer draft.
  await evaluate(popupSession, "document.getElementById('etc-overwrite').checked=true; document.getElementById('save').click()");
  await until(() => evaluate(workerSession, "chrome.storage.sync.get('etcOverwriteAnswers').then(s=>s.etcOverwriteAnswers===true)"), Boolean, 'replacement setting failed to turn back on');
  await evaluate(workerSession, `globalThis.testResponseDelay=200; globalThis.testReply=${JSON.stringify(JSON.stringify({selection:[],inputs:[{id:'field-0',value:'AI'}],explanation:'AIの回答'}))}`);
  await evaluate(moodleSession, "document.querySelector('#auto-text [data-oecu-etc]').click(); document.getElementById('auto-input').value='手動編集'");
  await until(() => evaluate(moodleSession, "document.querySelector('#auto-text .oecu-etc-fill-status')?.textContent.includes('手動')"), Boolean, 'manual edits during inference were not protected');
  assert.equal(await evaluate(moodleSession, "document.getElementById('auto-input').value"), '手動編集');
  // Use the actual supplied inline formula image, without storing the user's
  // entire Moodle HTML or account/session metadata in the repository.
  const formulaData = 'data:image/png;base64,' + (await readFile(new URL('./fixtures/moodle-formula.png', import.meta.url))).toString('base64');
  await evaluate(popupSession, "document.getElementById('etc-autofill').checked=false; document.getElementById('save').click()");
  await until(() => evaluate(workerSession, "chrome.storage.sync.get('etcAutoFill').then(s=>s.etcAutoFill===false)"), Boolean, 'image test could not turn autofill off');
  const imageFixture = `<div class="que" id="image-question"><div class="info"><div class="questionflag">フラグ</div></div><div class="content"><div class="formulation"><p>このフーリエ級数を説明してください。<img id="formula-data" src="${formulaData}" alt=""></p><a class="feedbacktrigger"><img class="icon" src="${formulaData}" alt="正解"></a><input type="text" readonly value="採点済み"></div></div></div>`;
  await evaluate(moodleSession, `document.body.insertAdjacentHTML('beforeend',${JSON.stringify(imageFixture)})`);
  await until(() => evaluate(moodleSession, "Boolean(document.querySelector('#image-question [data-oecu-etc]'))"), Boolean, 'image question trigger missing');
  await evaluate(workerSession, "globalThis.testReply='画像の数式についての説明です。'; globalThis.testResponseDelay=0");
  const beforeRemote = await evaluate(workerSession, 'globalThis.testInferenceCount');
  await evaluate(moodleSession, "document.querySelector('#image-question [data-oecu-etc]').click()");
  await until(() => evaluate(moodleSession, "document.querySelector('#image-question .questionflag').title==='画像の数式についての説明です。'"), Boolean, 'inline formula did not reach vision request');
  assert.equal(await evaluate(workerSession, 'globalThis.testInferenceBody.input[0].content.filter(p=>p.type==="input_image").length'), 1, 'feedback icons must not be sent as question images');
  assert.equal(await evaluate(workerSession, 'globalThis.testInferenceBody.input[0].content[1].image_url'), formulaData);
  assert.ok(await evaluate(workerSession, 'globalThis.testInferenceBody.input[0].content[0].text.includes("[画像1]")'));
  assert.equal(await evaluate(moodleSession, "document.querySelector('#image-question input').value"), '採点済み', 'read-only graded answers must not change');
  // A same-origin Moodle image is converted using the pixels already loaded
  // in the page; no authenticated URL or cookie is forwarded to OpenAI.
  const remoteImage = 'https://moodle2026.mc2.osakac.ac.jp/2026/pluginfile.php/formula.png';
  ws.addEventListener('message', event => {
    const value = JSON.parse(event.data);
    if (value.method === 'Fetch.requestPaused' && value.sessionId === moodleSession && value.params.request.url === remoteImage) {
      // The generic fixture handler below is excluded for this image.
      call('Fetch.fulfillRequest', {requestId:value.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'image/png'}],body:formulaData.split(',')[1]},moodleSession).catch(()=>{});
    }
  });
  await evaluate(moodleSession, `document.querySelector('#image-question .formulation p img').src=${JSON.stringify(remoteImage)}`);
  await until(() => evaluate(moodleSession, 'document.getElementById("formula-data").complete && document.getElementById("formula-data").naturalWidth>0'), Boolean, 'same-origin formula failed to load');
  await evaluate(moodleSession, "document.querySelector('#image-question [data-oecu-etc]').click()");
  await until(() => evaluate(workerSession, 'globalThis.testInferenceCount'), count => count > beforeRemote + 1, 'same-origin image request did not reach inference');
  await until(() => evaluate(moodleSession, "!document.querySelector('#image-question [data-oecu-etc]').disabled"), Boolean, 'same-origin image request did not finish');
  assert.ok(await evaluate(workerSession, 'globalThis.testInferenceBody.input[0].content[1].image_url.startsWith("data:image/png;base64,")'));
  assert.ok(!await evaluate(workerSession, 'JSON.stringify(globalThis.testInferenceBody).includes("pluginfile.php")'));
  await evaluate(popupSession, "document.getElementById('etc-autofill').checked=true; document.getElementById('save').click()");
  await until(() => evaluate(workerSession, "chrome.storage.sync.get('etcAutoFill').then(s=>s.etcAutoFill===true)"), Boolean, 'vision autofill setting not saved');
  await evaluate(workerSession, `globalThis.testReply=${JSON.stringify(JSON.stringify({selection:[],inputs:[{id:'field-0',value:'画像からの回答'}],explanation:'画像を使った説明です。'}))}`);
  await evaluate(moodleSession, "document.querySelector('#image-question input').readOnly=false; document.querySelector('#image-question input').value=''; document.querySelector('#image-question [data-oecu-etc]').click()");
  await until(() => evaluate(moodleSession, "document.querySelector('#image-question input').value==='画像からの回答'"), Boolean, 'image input and structured autofill must work together');
  assert.equal(await evaluate(workerSession, 'globalThis.testInferenceBody.input[0].content[1].type'), 'input_image');
  const beforeBroken = await evaluate(workerSession, 'globalThis.testInferenceCount');
  await evaluate(moodleSession, "document.getElementById('formula-data').src='data:image/png;base64,AAAA'; document.querySelector('#image-question [data-oecu-etc]').click()");
  await until(() => evaluate(moodleSession, "document.querySelector('#image-question .oecu-etc-error-text')?.textContent.includes('画像')"), Boolean, 'unreadable image must produce an error instead of text-only inference');
  assert.equal(await evaluate(workerSession, 'globalThis.testInferenceCount'), beforeBroken);
  const inferenceCount = await evaluate(workerSession, 'globalThis.testInferenceCount');
  await evaluate(popupSession, "document.getElementById('nkey-checkbox').checked=false; document.getElementById('save').click()");
  await until(() => evaluate(moodleSession, "!document.querySelector('[data-oecu-etc]')"), Boolean, 'OFF setting must remove the trigger without reloading');
  await evaluate(panelSession, "api('/logout',{method:'POST'})");
  await evaluate(popupSession, "document.getElementById('nkey-checkbox').checked=true; document.getElementById('save').click()");
  await until(() => evaluate(moodleSession, "Boolean(document.querySelector('[data-oecu-etc]'))"), Boolean, 'ON setting did not restore trigger');
  await evaluate(moodleSession, "document.querySelector('[data-oecu-etc]').click()");
  await until(() => evaluate(moodleSession, "Boolean(document.querySelector('.oecu-etc-error')) && document.querySelector('.oecu-etc-error').textContent.includes('ログイン')"), Boolean, 'logged-out Moodle request should explain how to sign in');
  assert.equal(await evaluate(workerSession, 'globalThis.testInferenceCount'), inferenceCount);
  // Reproduce the reported condition: reload the installed extension while
  // leaving the Moodle page and its old isolated content-script world open.
  const invalidationErrors = [];
  ws.addEventListener('message', event => {
    const value = JSON.parse(event.data);
    if (value.sessionId === moodleSession && value.method === 'Runtime.exceptionThrown' && /Extension context invalidated/i.test(JSON.stringify(value.params))) invalidationErrors.push(value.params);
  });
  await call('Runtime.enable', {}, moodleSession);
  await evaluate(workerSession, 'setTimeout(()=>chrome.runtime.reload(),0)');
  await until(() => call('Target.getTargets'), data => !data.targetInfos.some(info => info.targetId === target.targetId), 'old worker did not stop on reload');
  await call('Target.activateTarget', { targetId: moodleId });
  await evaluate(moodleSession, "document.dispatchEvent(new Event('visibilitychange'))");
  await until(() => evaluate(moodleSession, "Boolean(document.querySelector('.oecu-etc-context-invalid'))"), Boolean, 'old script did not show the reload guidance');
  assert.equal(await evaluate(moodleSession, "document.querySelector('.oecu-etc-context-invalid button').textContent"), 'Moodleを再読み込み');
  assert.equal(await evaluate(moodleSession, "[...document.querySelectorAll('[data-oecu-etc]')].every(button=>button.disabled)"), true);
  await evaluate(moodleSession, "document.dispatchEvent(new Event('visibilitychange')); document.body.append(document.createElement('div'))");
  assert.equal(await evaluate(moodleSession, "document.getElementById('auto-input').value"), '手動編集', 'extension reload must not erase quiz edits');
  assert.equal(await evaluate(moodleSession, 'window.submissions'), 0);
  assert.equal(invalidationErrors.length, 0, 'invalidated context must not escape as an uncaught error');
});
