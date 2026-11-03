'use strict';
const $ = id => document.getElementById(id);
let ready = false, connected = false, activeAccount = '', history = [];
let controller = null, polling = null, checking = false, revision = 0;
let accountCatalog = '';

const historyStore = new StudyChatHistory(chrome.storage.local);
let savedChats = {current: '', chats: []};
function historyOptions() {
  $('chat-history').replaceChildren(new Option('新しいチャット', ''));
  for (const chat of savedChats.chats) $('chat-history').append(new Option(chat.title, chat.id));
  $('chat-history').value = savedChats.current;
  $('delete-chat').disabled = !savedChats.current || Boolean(controller);
  $('chat-history').disabled = Boolean(controller) || !activeAccount;
}
function persistChat() {
  if (!activeAccount) return Promise.resolve();
  if (history.length) {
    if (!savedChats.current) savedChats.current = crypto.randomUUID();
    let chat = savedChats.chats.find(chat => chat.id === savedChats.current);
    if (!chat) { chat = {id: savedChats.current}; savedChats.chats.unshift(chat); }
    chat.title = history.find(item => item.role === 'user')?.content.slice(0, 60) || 'チャット';
    chat.messages = history.map(item => ({...item}));
  }
  historyOptions();
  return historyStore.save(activeAccount, savedChats).catch(() => status('履歴を保存できませんでした。端末の空き容量を確認してください。', true));
}
function restoreChat() {
  history = savedChats.chats.find(chat => chat.id === savedChats.current)?.messages || [];
  for (const item of history) {
    const rendered = message(item.role, item.content);
    if (item.role === 'assistant') { renderAnswer(rendered.content, item.content); addCopyButton(rendered.node, item.content); }
  }
  historyOptions();
}
$('chat-history').addEventListener('change', () => {
  const id = $('chat-history').value;
  clearChat(); savedChats.current = id; restoreChat(); persistChat();
});
$('delete-chat').addEventListener('click', () => {
  savedChats.chats = savedChats.chats.filter(chat => chat.id !== savedChats.current);
  clearChat(); savedChats.current = ''; historyOptions(); persistChat();
});

function status(message, isError = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', isError);
}
function resizePrompt() {
  $('prompt').style.height = 'auto';
  $('prompt').style.height = Math.min(160, Math.max(50, $('prompt').scrollHeight)) + 'px';
}
// Build formatted text with DOM nodes only; model output is never HTML.
function inlineText(parent, text) {
  const pattern = /\*\*([^*\n]+)\*\*|`([^`\n]+)`/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    parent.append(document.createTextNode(text.slice(offset, match.index)));
    const node = document.createElement(match[1] === undefined ? 'code' : 'strong');
    node.textContent = match[1] ?? match[2]; parent.append(node);
    offset = match.index + match[0].length;
  }
  parent.append(document.createTextNode(text.slice(offset)));
}
function renderAnswer(content, text) {
  const fragment = document.createDocumentFragment();
  let paragraph = null, list = null, code = null;
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) {
      paragraph = list = null;
      if (code) code = null;
      else { const pre = document.createElement('pre'); code = document.createElement('code'); pre.append(code); fragment.append(pre); }
      continue;
    }
    if (code) { code.textContent += (code.textContent ? '\n' : '') + line; continue; }
    if (!line.trim()) { paragraph = list = null; continue; }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      paragraph = list = null;
      const node = document.createElement('h' + Math.min(4, line.indexOf(' ') + 1));
      inlineText(node, heading[1]); fragment.append(node); continue;
    }
    const item = line.match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
    if (item) {
      paragraph = null; const tag = /^\d/.test(item[1]) ? 'OL' : 'UL';
      if (!list || list.tagName !== tag) { list = document.createElement(tag); fragment.append(list); }
      const node = document.createElement('li'); inlineText(node, item[2]); list.append(node); continue;
    }
    list = null;
    if (line.startsWith('> ')) {
      paragraph = null; const node = document.createElement('blockquote'); inlineText(node, line.slice(2)); fragment.append(node); continue;
    }
    if (!paragraph) { paragraph = document.createElement('p'); fragment.append(paragraph); }
    else paragraph.append(document.createElement('br'));
    inlineText(paragraph, line);
  }
  content.replaceChildren(fragment);
}
function addCopyButton(node, text) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'copy-reply'; button.textContent = '返信をコピー';
  button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); button.textContent = 'コピーしました'; }
    catch { button.textContent = 'コピーできませんでした'; }
    setTimeout(() => { button.textContent = '返信をコピー'; }, 2000);
  });
  node.append(button);
}
async function api(route, options = {}) {
  const body = options.body ? JSON.parse(options.body) : {};
  if (route === '/chat') return streamChat(body, options.signal);
  const actions = { '/status': 'status', '/models': 'models', '/logout': 'logout', '/auth/start': 'login' };
  let result;
  try { result = await chrome.runtime.sendMessage({ channel: 'chat', action: actions[route], ...body }); }
  catch { throw new Error('拡張機能に接続できません。拡張機能を更新して開き直してください。'); }
  if (!result || result.error) throw new Error(result?.error || '接続結果を取得できませんでした。');
  return new Response(JSON.stringify(result.data), { headers: { 'Content-Type': 'application/json' } });
}
function streamChat(body, signal) {
  const port = chrome.runtime.connect({ name: 'chat-stream' });
  const encoder = new TextEncoder(); let finished = false, ping;
  const stream = new ReadableStream({
    start(output) {
      const clean = () => { clearInterval(ping); signal?.removeEventListener('abort', abort); };
      const abort = () => {
        if (finished) return; finished = true; clean();
        port.disconnect(); output.error(new DOMException('Aborted', 'AbortError'));
      };
      signal?.addEventListener('abort', abort, { once: true });
      port.onMessage.addListener(item => {
        if (finished || item.pong) return;
        output.enqueue(encoder.encode(JSON.stringify(item) + '\n'));
        if (item.done || item.error) { finished = true; clean(); output.close(); port.disconnect(); }
      });
      port.onDisconnect.addListener(() => {
        if (finished) return; finished = true; clean();
        output.enqueue(encoder.encode(JSON.stringify({ error: '拡張機能との接続が切れました。再ログインして再送してください。' }) + '\n')); output.close();
      });
      if (signal?.aborted) { abort(); return; }
      // Port traffic keeps the worker alive while waiting for a streamed reply.
      ping = setInterval(() => { try { port.postMessage({ type: 'ping' }); } catch { abort(); } }, 15000);
      port.postMessage({ type: 'start', body });
    },
    cancel() { finished = true; clearInterval(ping); port.disconnect(); }
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } });
}
function controls() {
  const busy = Boolean(controller);
  $('prompt').disabled = !ready;
  $('send').disabled = !ready || busy || !$('prompt').value.trim();
  $('stop').hidden = !busy;
  $('send').hidden = busy;
  $('model').disabled = !ready || busy;
  $('login').disabled = !connected || busy;
  $('account').disabled = busy;
  $('logout').disabled = busy;
  document.querySelectorAll('[data-prompt]').forEach(button => { button.disabled = !ready; });
  historyOptions();
  $('prompt').placeholder = ready ? 'ChatGPTに質問する…' : 'ログインすると質問できます';
}
function clearChat() {
  revision++;
  controller?.abort();
  controller = null;
  history = [];
  document.querySelectorAll('.message').forEach(node => node.remove());
  $('welcome').hidden = false;
  controls();
}
function message(role, text = '') {
  $('welcome').hidden = true;
  const node = document.createElement('article');
  node.className = `message ${role}`;
  const author = document.createElement('div'); author.className = 'author';
  author.textContent = role === 'user' ? 'あなた' : 'アシスタント';
  const content = document.createElement('div'); content.className = 'text'; content.textContent = text;
  node.append(author, content); $('messages').append(node);
  $('messages').scrollTop = $('messages').scrollHeight;
  return { node, content };
}
async function loadModels() {
  const selected = ready ? $('model').value : '';
  const result = await (await api('/models')).json();
  $('model').replaceChildren();
  for (const item of result.models) {
    const option = document.createElement('option'); option.value = item.id; option.textContent = item.name || item.id; $('model').append(option);
  }
  if (!result.models.length) throw new Error('利用できるモデルがありません。ChatGPT側の利用許可を確認してください。');
  if (result.models.some(item => item.id === selected)) $('model').value = selected;
  ready = true;
  $('connection').open = false;
  status('接続しました。メッセージを送信できます。');
}
async function checkConnection(force = false) {
  if (checking) return;
  checking = true;
  try {
    const result = await (await api('/status')).json();
    connected = true;
    const catalog = JSON.stringify(result.accounts);
    if (catalog !== accountCatalog) {
      // Successful sign-ins move their registration to the end of accounts.
      // Reuse that account when the worker has lost its in-memory session.
      const selected = $('account').value || result.account?.clientId || result.accounts.at(-1)?.clientId;
      $('account').replaceChildren(new Option('別のアカウントを追加', ''));
      for (const [index, account] of result.accounts.entries()) {
        const duplicate = result.accounts.filter(a => a.email === account.email).length > 1;
        $('account').append(new Option(account.email + (duplicate ? ` · ${index + 1}` : ''), account.clientId));
      }
      if (result.accounts.some(a => a.clientId === selected)) $('account').value = selected;
      accountCatalog = catalog;
    }
    const nextAccount = result.connected ? result.account.clientId : '';
    const changed = activeAccount !== nextAccount;
    if (changed) {
      clearChat(); activeAccount = nextAccount; ready = false;
      savedChats = {current: '', chats: []};
      if (activeAccount) savedChats = await historyStore.load(activeAccount);
      restoreChat();
    }
    $('account-name').textContent = result.connected ? result.account.email : '未ログイン';
    $('logout').hidden = !result.connected;
    $('connection-label').textContent = result.connected ? `アカウント設定・${result.account.email}` : 'アカウント設定・未ログイン';
    $('connection-dot').classList.toggle('ready', result.connected);
    $('session-state').textContent = result.connected ? '接続済み' : '未ログイン';
    $('session-state').classList.toggle('ready', result.connected);
    $('account-help').textContent = result.connected ? 'アカウントの切り替えと接続を管理できます。' : 'ChatGPTにログインして、会話を始めましょう。';
    if (result.authError) { status(result.authError, true); $('connection').open = true; }
    else if (result.pending) status('ブラウザのログイン画面で認証を完了してください。');
    else if (result.connected && (changed || force || !ready) && !controller) await loadModels();
    else if (!result.connected) { ready = false; if (changed) $('connection').open = true; status('右上のアカウントからログインできます。'); }
  } catch (e) {
    connected = false; ready = false;
    $('connection').open = true; $('connection-dot').classList.remove('ready');
    $('connection-label').textContent = '接続を確認してください';
    $('session-state').textContent = '未接続'; $('session-state').classList.remove('ready');
    status(e.message, true);
  } finally { checking = false; controls(); }
}
$('login').addEventListener('click', async () => {
  $('login').disabled = true;
  try {
    await api('/auth/start', { method: 'POST', body: JSON.stringify({ clientId: $('account').value }) });
    status('新しいタブでChatGPTへのログインと利用許可を完了してください。');
  } catch (e) { status(e.message, true); }
  finally { controls(); }
});
$('logout').addEventListener('click', async () => {
  ready = false; controls();
  try {
    const result = await (await api('/logout', { method: 'POST' })).json();
    clearChat(); await checkConnection();
    if (!result.revoked) status('拡張機能からログアウトしました。OpenAI側の接続解除は確認できなかったため、ChatGPTの設定で解除してください。', true);
  } catch (e) { status(e.message, true); }
});
$('refresh').addEventListener('click', () => checkConnection(true));
$('close-settings').addEventListener('click', () => { $('connection').open = false; $('connection').querySelector('summary').focus(); });
document.addEventListener('click', event => { if (!$('connection').contains(event.target)) $('connection').open = false; });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('connection').open) { $('connection').open = false; $('connection').querySelector('summary').focus(); } });
$('new-chat').addEventListener('click', () => { clearChat(); savedChats.current = ''; persistChat(); $('prompt').value = ''; resizePrompt(); controls(); status('新しいチャットを始めます。'); $('prompt').focus(); });
$('stop').addEventListener('click', () => controller?.abort());
$('prompt').addEventListener('input', () => { controls(); resizePrompt(); });
$('prompt').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!$('send').disabled) $('composer').requestSubmit(); }
});
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => {
  $('prompt').value = button.dataset.prompt; resizePrompt(); controls(); $('prompt').focus();
}));
$('composer').addEventListener('submit', async event => {
  event.preventDefault();
  const text = $('prompt').value.trim();
  if (!text || !ready || controller) return;
  if (history.length >= 98) { status('会話が長くなりました。＋から新しいチャットを始めてください。', true); return; }
  const currentRevision = revision;
  const current = new AbortController(); controller = current; controls();
  message('user', text);
  const reply = message('assistant'); reply.node.classList.add('pending');
  $('prompt').value = '';
  resizePrompt();
  const input = [...history, { role: 'user', content: text }];
  history = input;
  await persistChat();
  if (revision !== currentRevision) return;
  let answer = '', completed = false;
  status('返信を生成しています…');
  try {
    const response = await api('/chat', { method: 'POST', body: JSON.stringify({ model: $('model').value, messages: input }), signal: current.signal });
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        if (!line.trim()) continue;
        const item = JSON.parse(line);
        if (item.error) throw new Error(item.error);
        if (item.delta) {
          const atBottom = $('messages').scrollHeight - $('messages').scrollTop - $('messages').clientHeight < 80;
          answer += item.delta; renderAnswer(reply.content, answer);
          if (atBottom) $('messages').scrollTop = $('messages').scrollHeight;
        }
        if (item.done) completed = true;
      }
      if (chunk.done) break;
    }
    if (!completed) throw new Error('返信が途中で切れました。もう一度送信してください。');
    if (revision === currentRevision) { history = [...input, { role: 'assistant', content: answer }]; await persistChat(); addCopyButton(reply.node, answer); status('返信が完了しました。'); }
  } catch (e) {
    if (revision === currentRevision) {
      history = answer ? [...input, {role: 'assistant', content: answer}] : input;
      await persistChat();
      const explanation = current.signal.aborted ? '送信を停止しました。' : e.message;
      reply.node.classList.add('failed');
      renderAnswer(reply.content, answer ? `${answer}\n\n［${explanation}］` : explanation);
      if (!$('prompt').value.trim()) $('prompt').value = text;
      resizePrompt();
      status(`${explanation} 入力欄から再送できます。`, !current.signal.aborted);
    }
  } finally {
    reply.node.classList.remove('pending');
    if (controller === current) { controller = null; controls(); }
  }
});
(async () => {
  await checkConnection();
  polling = setInterval(() => { if (!controller && !document.hidden) checkConnection(); }, 4000);
})();
window.addEventListener('pagehide', () => { clearInterval(polling); controller?.abort(); });
