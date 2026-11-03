(() => {
  'use strict';
  function updatePreview() {
    document.querySelector('.ai-master').dataset.enabled = String(document.getElementById('nkey-checkbox').checked);
    document.getElementById('etc-overwrite').disabled = !document.getElementById('etc-autofill').checked;
  }
  async function refreshConnection() {
    const label = document.getElementById('etc-account');
    const model = document.getElementById('etc-model');
    const selected = model.value;
    label.textContent = '接続を確認中…';
    try {
      const result = await chrome.runtime.sendMessage({ channel: 'etc', action: 'status' });
      if (!result?.data || result.error) throw new Error(result?.error || '接続を確認できませんでした。');
      const data = result.data;
      label.textContent = data.connected ? '接続済み：' + data.email : '未ログイン：ChatGPT画面からログインしてください。';
      label.dataset.connected = String(data.connected);
      document.getElementById('etc-connect-label').textContent = data.connected ? 'チャット・アカウント管理' : 'ChatGPTでログイン';
      model.replaceChildren();
      for (const item of data.models) model.append(new Option(item.name || item.id, item.id));
      if (!data.models.length) model.append(new Option(data.connected ? '利用できるモデルがありません' : 'ログイン後に選択できます', ''));
      model.disabled = !data.models.length;
      model.value = data.models.some(item => item.id === selected) ? selected : data.model || '';
      if (data.error) document.getElementById('status').textContent = data.error;
    } catch (e) { label.textContent = e.message || '接続を確認できませんでした。'; model.disabled = true; }
  }
  async function saveOptions() {
    const button = document.getElementById('save');
    const status = document.getElementById('status');
    button.disabled = true; status.textContent = '保存中…';
    try {
      await chrome.storage.sync.set({
        ncheak: document.getElementById('nkey-checkbox').checked,
        etcAutoFill: document.getElementById('etc-autofill').checked,
        etcOverwriteAnswers: document.getElementById('etc-overwrite').checked
      });
      const model = document.getElementById('etc-model').value;
      if (model) await chrome.storage.local.set({ etcModel: model });
      // Remove the obsolete API key only when the user saves this new setup.
      await chrome.storage.sync.remove('nkey');
      status.textContent = 'AI設定を保存しました。';
    } catch { status.textContent = '保存できませんでした。もう一度お試しください。'; }
    finally { button.disabled = false; }
  }
  document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.sync.get({ ncheak: false, etcAutoFill: false, etcOverwriteAnswers: false, user_id: '', user_pass: '' }, items => {
      document.getElementById('nkey-checkbox').checked = items.ncheak === true;
      document.getElementById('etc-autofill').checked = items.etcAutoFill === true;
      document.getElementById('etc-overwrite').checked = items.etcOverwriteAnswers === true;
      updatePreview();
      document.getElementById('user_id').value = items.user_id;
      document.getElementById('user_pass').value = items.user_pass;
    });
    refreshConnection();
  });
  document.getElementById('save').addEventListener('click', saveOptions);
  for (const id of ['nkey-checkbox', 'etc-autofill', 'etc-overwrite', 'etc-model']) document.getElementById(id).addEventListener('change', () => {
    updatePreview();
    document.getElementById('status').textContent = '変更を保存してください。';
  });
  document.getElementById('etc-refresh').addEventListener('click', refreshConnection);
  document.getElementById('etc-chatgpt').addEventListener('click', () => {
    chrome.windows.getCurrent().then(currentWindow => chrome.sidePanel.open({ windowId: currentWindow.id }))
      .then(() => window.close())
      .catch(() => chrome.tabs.create({ url: chrome.runtime.getURL('chat-panel.html') }));
  });
})();
