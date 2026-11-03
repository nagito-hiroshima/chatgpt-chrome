import './main.js';
import { createChatClient } from './chat-auth.mjs';
import { createMoodleAI, isMoodleSender } from './moodle-ai.mjs';

const client = createChatClient({ local: chrome.storage.local, transient: chrome.storage.session, fetcher: (...args) => fetch(...args) });
const panelURL = chrome.runtime.getURL('chat-panel.html');
const resultURL = chrome.runtime.getURL('chat-auth-result.html');
const popupURL = chrome.runtime.getURL('popup.html');
const moodleAI = createMoodleAI({ client, sync: chrome.storage.sync, local: chrome.storage.local });
const trusted = sender => sender.id === chrome.runtime.id && sender.url?.split('?')[0] === panelURL;
const safeMessage = e => e.name === 'AbortError' ? '送信を停止したか、接続がタイムアウトしました。' : e.chatSafe ? e.message : '通信または認証に失敗しました。再接続・再ログインしてください。';

// Only our extension panel can issue authenticated operations. Content scripts
// and web pages cannot turn this worker into an authenticated fetch proxy.
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.channel === 'etc' && sender.id === chrome.runtime.id) {
    if (message.action === 'keepalive' && isMoodleSender(sender, chrome.runtime.id)) {
      chrome.storage.sync.get('ncheak').then(async settings => ({ connected: settings.ncheak === true && (await (await client).status()).connected }))
        .then(data => reply({ data }), e => reply({ error: safeMessage(e) }));
      return true;
    }
    if (message.action === 'status' && sender.url === popupURL) {
      moodleAI.status().then(data => reply({ data }), e => reply({ error: safeMessage(e) }));
      return true;
    }
    if (message.action === 'open-chat' && (sender.url === popupURL || isMoodleSender(sender, chrome.runtime.id))) {
      const options = sender.tab?.id !== undefined ? { tabId: sender.tab.id } : { windowId: sender.tab?.windowId };
      (async () => {
        try {
          if (options.windowId === undefined && options.tabId === undefined) options.windowId = (await chrome.windows.getCurrent()).id;
          await chrome.sidePanel.open(options);
        } catch { await chrome.tabs.create({ url: panelURL }); }
        return { opened: true };
      })().then(data => reply({ data }), e => reply({ error: safeMessage(e) }));
      return true;
    }
  }
  // The result page has read-only access to its own authentication attempt.
  if (message?.channel === 'chat-result' && message.action === 'status' && sender.id === chrome.runtime.id && sender.url === resultURL) {
    client.then(api => api.result(sender.tab?.id)).then(data => reply({ data }), e => reply({ error: safeMessage(e) }));
    return true;
  }
  if (message?.channel !== 'chat' || !trusted(sender)) return;
  (async () => {
    const api = await client;
    switch (message.action) {
      case 'status': return api.status();
      case 'models': return api.models();
      case 'logout': return api.logout();
      case 'login': {
        const tab = await chrome.tabs.create({ url: 'about:blank' });
        try {
          const url = await api.begin(message.clientId, tab.id);
          await chrome.tabs.update(tab.id, { url });
          return { started: true };
        } catch (e) { await chrome.tabs.remove(tab.id).catch(() => {}); throw e; }
      }
      default: throw new Error('不明な操作です。');
    }
  })().then(data => reply({ data }), e => reply({ error: safeMessage(e) }));
  return true;
});

// Observe each HTTP request, including server-side OAuth redirects. A
// webNavigation.onBeforeNavigate listener alone misses some redirect chains.
chrome.webRequest.onBeforeRequest.addListener(details => {
  if (details.frameId !== 0) return;
  (async () => {
    await (await client).callback(details.url, details.tabId, async () => {
      // Remove the authorization code from the visible page URL.
      await chrome.tabs.update(details.tabId, { url: chrome.runtime.getURL('chat-auth-result.html') });
    });
  })().catch(() => {});
}, { urls: ['http://127.0.0.1:1455/auth/callback*'], types: ['main_frame'] });
chrome.tabs.onRemoved.addListener(tabId => { client.then(api => api.cancelLogin(tabId)).catch(() => {}); });

chrome.runtime.onConnect.addListener(port => {
  const etc = port.name === 'etc-stream' && isMoodleSender(port.sender, chrome.runtime.id);
  if (!etc && (port.name !== 'chat-stream' || !trusted(port.sender))) { port.disconnect(); return; }
  const controller = new AbortController(); let started = false;
  const send = value => { try { port.postMessage(value); } catch { controller.abort(); } };
  port.onDisconnect.addListener(() => controller.abort());
  port.onMessage.addListener(message => {
    if (message.type === 'ping') { send({ pong: true }); return; }
    if (message.type === 'stop') { controller.abort(); return; }
    if (message.type !== 'start' || started) return;
    started = true;
    (etc ? moodleAI.ask(message.text, send, controller.signal, message.question, message.images) : client.then(api => api.chat(message.body, send, controller.signal)))
      .catch(e => send({ error: safeMessage(e) }));
  });
});
