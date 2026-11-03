import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMoodleAI, isMoodleSender, decodeAnswer, usableQuestion } from '../moodle/moodle-ai.mjs';

test('Moodle bridge accepts only our extension on the intended HTTPS top frame', () => {
  const valid = { id: 'extension-id', frameId: 0, tab: { id: 1 }, url: 'https://moodle2026.mc2.osakac.ac.jp/2026/mod/quiz/attempt.php?id=1' };
  assert.equal(isMoodleSender(valid, 'extension-id'), true);
  for (const changed of [
    { id: 'other' }, { frameId: 1 }, { tab: {} },
    { url: 'http://moodle2026.mc2.osakac.ac.jp/' },
    { url: 'https://moodle2026.mc2.osakac.ac.jp.evil.example/' },
    { url: 'https://evil.example/?host=mc2.osakac.ac.jp' }
  ]) assert.equal(isMoodleSender({ ...valid, ...changed }, 'extension-id'), false);
});
test('structured answers require exact known IDs; prose and invalid selections never autofill', () => {
  const question = {kind:'single', choices:[{id:'choice-0',text:'a. A'},{id:'choice-1',text:'b. B'},{id:'choice-2',text:'c. C'}], fields:[]};
  assert.equal(usableQuestion(question), true);
  const raw = JSON.stringify({selection:['choice-2'],inputs:[],explanation:'正しくないのは c です。'});
  assert.deepEqual(decodeAnswer(raw, question).autofill, {selection:['choice-2'],inputs:[]});
  assert.ok(!decodeAnswer('**正しくないものは c です。**', question).autofill);
  assert.ok(!decodeAnswer(JSON.stringify({selection:['choice-9'],inputs:[],explanation:'解説'}), question).autofill);
  assert.ok(!decodeAnswer(JSON.stringify({selection:['choice-0','choice-1'],inputs:[],explanation:'解説'}), question).autofill);
  const fields = {kind:'fields',choices:[],fields:[{id:'field-0',type:'select',label:'問い',options:[{id:'option-0',text:'A'}]}]};
  assert.ok(decodeAnswer(JSON.stringify({selection:[],inputs:[{id:'field-0',value:'option-0'}],explanation:'A'}), fields).autofill);
  assert.ok(!decodeAnswer(JSON.stringify({selection:[],inputs:[{id:'unknown',value:'option-0'}],explanation:'A'}), fields).autofill);
});
test('ETC uses OAuth client and an available preferred model; OFF and logged-out never infer', async () => {
  let enabled = true, connected = true, preferred = 'fast', calls = 0, captured;
  const bridge = createMoodleAI({
    client: Promise.resolve({
      async status() { return { connected, account: { email: 'test@example.test' } }; },
      async models() { return { models: [{ id: 'first', name: 'First' }, { id: 'fast', name: 'Fast' }] }; },
      async chat(body, send) { calls++; captured = body; send({ delta: '2' }); send({ done: true }); }
    }),
    sync: { async get() { return { ncheak: enabled }; } },
    local: { async get() { return { etcModel: preferred }; } }
  });
  const output = [];
  await bridge.ask('1+1?', e => output.push(e));
  assert.equal(captured.model, 'fast');
  assert.ok(captured.messages[0].content.endsWith('1+1?'));
  assert.deepEqual(output, [{ delta: '2' }, { done: true }]);
  preferred = 'not-available'; await bridge.ask('question', () => {});
  assert.equal(captured.model, 'first');
  enabled = false; await assert.rejects(bridge.ask('question', () => {}), /ON/);
  enabled = true; connected = false; await assert.rejects(bridge.ask('question', () => {}), /ログイン/);
  await assert.rejects(bridge.ask('', () => {}));
  await assert.rejects(bridge.ask('x'.repeat(32001), () => {}));
  assert.equal(calls, 2);
});
