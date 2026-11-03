const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup() {
  const local = {9999123: '1-1', setting2: true, secret: 'local-token'};
  const sync = {user_pass: 'password', 9999456: '2-2'};
  const storage = data => ({
    async get(keys) { return keys === null ? {...data} : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in data).map(k => [k, data[k]])); },
    async set(values) { Object.assign(data, values); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; }
  });
  const chrome = {storage: {local: storage(local), sync: storage(sync)}};
  const context = vm.createContext({chrome});
  vm.runInContext(fs.readFileSync('shared/timetable-storage.js', 'utf8') + '\nglobalThis.api = timetableStorage;', context);
  return {local, sync, chrome, api: context.api};
}
test('sync is opt-in and transfers only timetable preferences', async () => {
  const {local, sync, api} = setup();
  await api.set({9999111: '3-3'});
  assert.equal(sync[9999111], undefined);
  await api.setEnabled(true);
  assert.equal(local.timetableSyncEnabled, true);
  assert.equal(sync[9999123], '1-1');
  assert.equal(sync[9999456], undefined);
  assert.equal(sync.secret, undefined);
  assert.equal(sync.user_pass, 'password');
  await api.set({9999111: '4-4'});
  assert.equal(sync[9999111], '4-4');
  await api.remove('9999123');
  await api.setEnabled(false);
  assert.equal(local[9999111], '4-4');
  assert.equal(local[9999123], undefined);
  await api.set({9999111: '5-5'});
  assert.equal(sync[9999111], '4-4');
});
test('failed transfer keeps synchronization disabled', async () => {
  const {local, chrome, api} = setup();
  chrome.storage.sync.set = async () => { throw Error('quota'); };
  await assert.rejects(api.setEnabled(true), /quota/);
  assert.notEqual(local.timetableSyncEnabled, true);
  await api.set({setting3: false});
  assert.equal(local.setting3, false);
});
