'use strict';
const resultElement = id => document.getElementById(id);
const startedAt = Date.now();
let resultTimer, stopped = false, lastResult = '';
const resultStates = {
  connected: { label: '接続完了', title: 'チャットの準備ができました。', description: 'ChatGPTへのログインが完了しました。\n気になったことから、会話を始めましょう。', action: 'チャットに戻る', hint: 'チャットを開くと、このタブは自動で閉じます。' },
  error: { label: '接続を確認してください', title: 'ログインを完了できませんでした。', description: 'チャット欄に戻り、もう一度ログインしてください。', action: 'チャットでやり直す', hint: 'チャット欄の右上から、再ログインできます。' },
  idle: { label: 'ログイン結果がありません', title: 'チャットから始めましょう。', description: 'このページのログイン結果が見つかりません。\nチャット欄からログインしてください。', action: 'チャットを開く', hint: 'チャット欄の右上から、アカウントを接続できます。' },
  expired: { label: '再ログインが必要です', title: 'もう一度、接続してください。', description: 'ログイン状態が終了しています。\nチャット欄から再ログインできます。', action: 'チャットを開く', hint: '保存済みのアカウントを選んでログインしてください。' }
};
function showResult(result) {
  const state = resultStates[result.state] ? result.state : 'error';
  const view = resultStates[state];
  document.querySelector('.result-card').dataset.state = state;
  resultElement('result-state').textContent = view.label;
  resultElement('result-title').textContent = view.title;
  resultElement('result-description').textContent = result.message || view.description;
  resultElement('open-chat-label').textContent = view.action;
  resultElement('open-chat').disabled = false;
  resultElement('result-hint').textContent = view.hint;
  resultElement('result-account').hidden = state !== 'connected' || !result.email;
  resultElement('result-email').textContent = result.email || '';
  document.title = `高規格道路 — ${view.label}`;
}
async function checkResult() {
  if (stopped) return;
  clearTimeout(resultTimer);
  if (document.hidden) { resultTimer = setTimeout(checkResult, 15000); return; }
  try {
    const response = await chrome.runtime.sendMessage({ channel: 'chat-result', action: 'status' });
    if (!response?.data || response.error) throw new Error('接続結果を取得できませんでした。チャット欄から再ログインしてください。');
    if (response.data.state === 'processing') {
      if (Date.now() - startedAt > 75000) throw new Error('接続の確認に時間がかかっています。チャット欄で接続状態を確認してください。');
      resultTimer = setTimeout(checkResult, 800);
    } else {
      const next = JSON.stringify(response.data);
      if (next !== lastResult) { showResult(response.data); lastResult = next; }
      // Keep this newly authenticated in-memory session available while the
      // user reads the result page before returning to the chat panel.
      if (response.data.state === 'connected') resultTimer = setTimeout(checkResult, 15000);
    }
  } catch (e) { showResult({ state: 'error', message: e.message }); }
}
async function closeResultTab() {
  const tab = await chrome.tabs.getCurrent();
  if (tab?.id !== undefined) await chrome.tabs.remove(tab.id);
  else window.close();
}
resultElement('open-chat').addEventListener('click', () => {
  resultElement('open-chat').disabled = true;
  chrome.windows.getCurrent().then(currentWindow => chrome.sidePanel.open({ windowId: currentWindow.id }))
    .then(closeResultTab)
    .catch(() => { window.location.href = chrome.runtime.getURL('chat-panel.html'); });
});
resultElement('close-tab').addEventListener('click', () => closeResultTab().catch(() => window.close()));
window.addEventListener('pagehide', () => { stopped = true; clearTimeout(resultTimer); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkResult(); });
checkResult();
