// 同期の選択自体は端末ごとに保持する。認証情報やAIのデータは対象外。
const timetableStorage = (() => {
  const managed = key => /^9999\d+$/.test(key) || /^https:\/\/moodle\d+\.mc2\.osakac\.ac\.jp\/.*course\/view\.php\?id=\d+$/.test(key) || ['setting2', 'setting3'].includes(key);
  const select = data => Object.fromEntries(Object.entries(data).filter(([key]) => managed(key)));
  let pending = Promise.resolve();
  async function area() {
    await pending;
    const flags = await chrome.storage.local.get('timetableSyncEnabled');
    return flags.timetableSyncEnabled === true ? chrome.storage.sync : chrome.storage.local;
  }
  function call(method, args, callback) {
    const result = area().then(storage => storage[method](...args));
    if (callback) result.then(callback).catch(error => console.error('時間割の保存に失敗しました', error));
    return result;
  }
  return {
    get: (keys, callback) => call('get', [keys], callback),
    set: (data, callback) => call('set', [data], callback),
    remove: (keys, callback) => call('remove', [keys], callback),
    setEnabled(enabled) {
      const change = pending.then(async () => {
        const flags = await chrome.storage.local.get('timetableSyncEnabled');
        if ((flags.timetableSyncEnabled === true) === enabled) return;
        const source = enabled ? chrome.storage.local : chrome.storage.sync;
        const target = enabled ? chrome.storage.sync : chrome.storage.local;
        const data = select(await source.get(null));
        // 書き込み成功後に切り替える。失敗時は元の保存先を使い続ける。
        await target.set(data);
        const obsolete = Object.keys(select(await target.get(null))).filter(key => !(key in data));
        if (obsolete.length) await target.remove(obsolete);
        await chrome.storage.local.set({ timetableSyncEnabled: enabled });
      });
      pending = change.catch(() => {});
      return change;
    }
  };
})();
