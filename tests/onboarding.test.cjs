const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('popup/onboarding.js', 'utf8');
const definition = source.slice(0, source.indexOf('\nopenFirstRunGuide().catch'));
function setup(fail = false) {
  const saved = {};
  const tabs = [];
  const chrome = {
    storage: {local: {async get() {return {...saved};}, async set(data) {Object.assign(saved, data);}}},
    runtime: {getURL: path => 'chrome-extension://test/' + path},
    tabs: {async create(data) {assert.equal(saved.usageGuideOpened, true, 'record first run before opening the tab'); if (fail) throw Error('tab unavailable'); tabs.push(data);}}
  };
  const ctx = vm.createContext({chrome});
  vm.runInContext(definition, ctx);
  return {saved, tabs, ctx};
}
test('first popup opens guide once and subsequent launches skip it', async () => {
  const {saved, tabs, ctx} = setup();
  await ctx.openFirstRunGuide();
  await ctx.openFirstRunGuide();
  assert.equal(tabs.length, 1);
  assert.equal(tabs[0].url, 'chrome-extension://test/help/help.html');
  assert.equal(tabs[0].active, false, 'keep focus on the popup');
  assert.equal(saved.usageGuideOpened, true);
});
test('failed opening can be retried next launch', async () => {
  const {saved, ctx} = setup(true);
  await assert.rejects(ctx.openFirstRunGuide(), /tab unavailable/);
  assert.equal(saved.usageGuideOpened, false);
});
