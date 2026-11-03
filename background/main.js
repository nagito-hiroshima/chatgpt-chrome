// Existing Moodle preferences; ChatGPT authentication is handled by chat-worker.
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') chrome.storage.local.set({ setting2: true, setting3: true });
  chrome.action.setBadgeText({ text: '' });
});
chrome.action.setBadgeText({ text: '' });
