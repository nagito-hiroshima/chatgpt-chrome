const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync('chat/chat-history.js', 'utf8') + '\nglobalThis.Store = StudyChatHistory;', ctx);
test('history persists across instances and is isolated by account', async () => {
  const data = {};
  const storage = {async get(key) {return {[key]: data[key]};}, async set(value) {Object.assign(data, value);}};
  const store = new ctx.Store(storage);
  const chat = {current: 'one', chats: [{id: 'one', title: '質問', messages: [{role: 'user', content: '質問'}]}]};
  const saving = store.save('a', chat);
  chat.chats[0].messages[0].content = 'changed';
  await saving;
  const reopened = new ctx.Store(storage);
  assert.equal((await reopened.load('a')).chats[0].messages[0].content, '質問');
  assert.equal((await reopened.load('b')).chats.length, 0);
  await reopened.save('a', {current: '', chats: []});
  assert.equal((await store.load('a')).chats.length, 0);
});
test('failed writes are reported and later saves can recover', async () => {
  let fail = true;
  const storage = {async set() {if (fail) throw Error('quota');}};
  const store = new ctx.Store(storage);
  await assert.rejects(store.save('a', {chats: []}), /quota/);
  fail = false;
  await store.save('a', {chats: []});
});
