// Public OAuth client. Tokens stay in trusted, browser-session memory storage.
import { validMessages } from './chat-content.mjs';
export const ISSUER = 'https://auth.openai.com';
export const RESOURCE = 'https://api.openai.com/v1';
export const CALLBACK = 'http://127.0.0.1:1455/auth/callback';
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const fail = message => { throw Object.assign(new Error(message), { chatSafe: true }); };
const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const random = () => encode(crypto.getRandomValues(new Uint8Array(32)));
const parseJWT = part => JSON.parse(new TextDecoder().decode(decode(part)));

export async function validateIdentity(jwt, jwks, clientId, nonce, now = Date.now() / 1000) {
  const parts = jwt?.split('.');
  if (parts?.length !== 3) fail('IDトークンの形式が不正です。');
  const header = parseJWT(parts[0]), claims = parseJWT(parts[1]);
  const algorithms = {
    RS256: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    ES256: { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' }
  };
  const algorithm = algorithms[header.alg];
  if (!algorithm) fail('未対応の署名方式です。');
  const jwk = jwks.keys?.find(key => key.kid === header.kid && (!key.alg || key.alg === header.alg) && (!key.use || key.use === 'sig'));
  if (!jwk) fail('IDトークンの検証鍵が見つかりません。');
  const key = await crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify']);
  if (!await crypto.subtle.verify(algorithm, key, decode(parts[2]), new TextEncoder().encode(parts.slice(0, 2).join('.')))) fail('IDトークンの署名が一致しません。');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== ISSUER || !audiences.includes(clientId) ||
    (audiences.length > 1 && claims.azp !== clientId) ||
    !Number.isFinite(claims.exp) || claims.exp <= now - 5 ||
    !Number.isFinite(claims.iat) || claims.iat > now + 5 ||
    (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now + 5)) ||
    !claims.sub || typeof claims.sub !== 'string' || claims.nonce !== nonce) fail('本人確認に失敗しました。再ログインしてください。');
  return claims;
}

export async function consumeSSE(body, onEvent) {
  let buffer = ''; const decoder = new TextDecoder();
  const drain = () => {
    buffer = buffer.replace(/\r\n/g, '\n');
    let end;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
      const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (data && data !== '[DONE]') onEvent(JSON.parse(data));
    }
  };
  const reader = body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }); drain();
      if (done) break;
    }
  } catch (e) { await reader.cancel().catch(() => {}); throw e; }
  finally { reader.releaseLock(); }
}

export async function createChatClient({ local, transient, fetcher = fetch } = {}) {
  let { chatHost } = await local.get('chatHost');
  if (!chatHost) {
    chatHost = { id: `urn:uuid:${crypto.randomUUID()}`, accounts: [] };
    await local.set({ chatHost });
  }
  const { chatSessions } = await transient.get('chatSessions');
  let active = chatSessions?.active ?? '', generation = 0, refresh = null, processing = false;
  const sessions = new Map(chatSessions?.entries ?? []); const chats = new Set();
  const saveSessions = () => transient.set({ chatSessions: { active, entries: [...sessions] } });
  const saveHost = () => local.set({ chatHost });
  const form = body => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  const request = (url, options = {}) => fetcher(url, { ...options, signal: options.signal ?? AbortSignal.timeout(30000), credentials: 'omit', cache: 'no-store', redirect: 'error' });
  async function read(url, options) {
    const response = await request(url, options);
    if (!response.ok) fail(`OpenAIへの接続に失敗しました（${response.status}）。プラン・利用許可・ログイン状態を確認してください。`);
    return response.json();
  }
  async function token() {
    const session = sessions.get(active);
    if (!session) fail('ChatGPTにログインしてください。');
    if (!session.scope.split(' ').includes('chatgpt.tokens.use.direct')) fail('ChatGPTプランの利用が許可されていません。再ログインして許可してください。');
    if (session.expiresAt < Date.now() + 60000) {
      if (!session.refresh_token) fail('有効期限が切れました。再ログインしてください。');
      if (!refresh) refresh = (async () => {
        const tokens = await read(`${ISSUER}/api/accounts/oauth/token`, form({ grant_type: 'refresh_token', client_id: session.clientId, refresh_token: session.refresh_token, resource: RESOURCE }));
        if (!tokens.access_token) fail('再ログインが必要です。');
        Object.assign(session, tokens, { expiresAt: Date.now() + Number(tokens.expires_in ?? 3600) * 1000 });
        await saveSessions();
      })().finally(() => { refresh = null; });
      await refresh;
    }
    return session.access_token;
  }
  return {
    async result(tabId) {
      const { chatResult } = await transient.get('chatResult');
      if (!chatResult || chatResult.tabId !== tabId) return { state: 'idle' };
      if (chatResult.state === 'connected' && !sessions.has(chatResult.clientId)) return { state: 'expired' };
      return { state: chatResult.state, message: chatResult.message, email: chatResult.email };
    },
    async status() {
      const { chatPending, chatAuthError } = await transient.get(['chatPending', 'chatAuthError']);
      return { connected: sessions.has(active), account: chatHost.accounts.find(a => a.clientId === active) ?? null, accounts: chatHost.accounts, pending: Boolean(chatPending && chatPending.expires > Date.now()), authError: chatAuthError || '' };
    },
    async begin(clientId, tabId) {
      if (processing) fail('ログイン処理中です。完了を待ってください。');
      generation++;
      const account = chatHost.accounts.find(a => a.clientId === clientId);
      const attempt = { state: random(), nonce: random(), verifier: random(), account, tabId, generation, expires: Date.now() + 600000 };
      const challenge = encode(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(attempt.verifier)));
      // Keep PKCE transaction state across service worker restarts.
      await transient.set({ chatPending: attempt, chatAuthError: '' });
      const params = { client_id: account?.clientId ?? 'dynamic_agent_client', ext_agent_host_id: chatHost.id, response_type: 'code', redirect_uri: CALLBACK, scope: SCOPES, resource: RESOURCE, state: attempt.state, nonce: attempt.nonce, code_challenge_method: 'S256', code_challenge: challenge };
      if (!account) params.agent_name_hint = '高規格道路';
      else {
        params.login_hint = account.email;
        const hint = sessions.get(account.clientId)?.id_token;
        if (hint) params.id_token_hint = hint;
      }
      return `${ISSUER}/api/accounts/authorize?${new URLSearchParams(params)}`;
    },
    async callback(rawURL, tabId, onAccepted = async () => {}) {
      const url = new URL(rawURL);
      if (`${url.origin}${url.pathname}` !== CALLBACK || processing) return false;
      const { chatPending: attempt } = await transient.get('chatPending');
      if (processing || !attempt || attempt.expires < Date.now() || attempt.tabId !== tabId || attempt.state !== url.searchParams.get('state')) return false;
      processing = true;
      const callbackGeneration = generation;
      await transient.remove('chatPending');
      await transient.set({ chatResult: { tabId, state: 'processing' } });
      try {
        await onAccepted();
        if (url.searchParams.has('error')) fail('ログインまたは利用許可がキャンセルされました。');
        const code = url.searchParams.get('code');
        const clientId = url.searchParams.get('client_id') || attempt.account?.clientId;
        if (!code || !clientId || clientId === 'dynamic_agent_client' || (attempt.account && attempt.account.clientId !== clientId)) fail('ログイン登録が完了しませんでした。');
        const tokens = await read(`${ISSUER}/api/accounts/oauth/token`, form({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: attempt.verifier, redirect_uri: CALLBACK, resource: RESOURCE }));
        const claims = await validateIdentity(tokens.id_token, await read(`${ISSUER}/.well-known/jwks.json`), clientId, attempt.nonce);
        if (attempt.account && claims.sub !== attempt.account.subject) fail('選択したアカウントと一致しません。');
        if (callbackGeneration !== generation) fail('ログインが取り消されました。');
        if (!tokens.access_token || typeof tokens.scope !== 'string') fail('必要なアクセス許可がありません。');
        const account = { clientId, subject: claims.sub, email: claims.email || claims.sub };
        chatHost.accounts = chatHost.accounts.filter(a => a.clientId !== clientId).concat(account);
        await saveHost();
        sessions.set(clientId, { ...tokens, clientId, expiresAt: Date.now() + Number(tokens.expires_in ?? 3600) * 1000 });
        active = clientId;
        await saveSessions();
        await transient.set({ chatAuthError: '', chatResult: { tabId, state: 'connected', clientId, email: account.email } });
      } catch (e) {
        const message = e.chatSafe ? e.message : 'ログインを完了できませんでした。接続状況を確認して再ログインしてください。';
        await transient.set({ chatAuthError: message, chatResult: { tabId, state: 'error', message } });
      } finally { processing = false; }
      return true;
    },
    async cancelLogin(tabId) {
      const { chatPending } = await transient.get('chatPending');
      if (chatPending?.tabId === tabId) { await transient.remove('chatPending'); await transient.set({ chatAuthError: 'ログイン画面を閉じました。もう一度ログインしてください。' }); }
    },
    async models() {
      const catalog = await read(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${await token()}` } });
      return { models: (catalog.models ?? []).filter(m => m.visibility === 'list').map(m => ({ id: m.slug, name: m.display_name })) };
    },
    async chat(body, onEvent, signal) {
      if (typeof body.model !== 'string' || !body.model || !validMessages(body.messages)) fail('会話・画像が大きすぎるか、送信内容が不正です。新しいチャットを開いてください。');
      const hasImages = body.messages.some(message => Array.isArray(message.content) && message.content.some(part => part.type === 'input_image'));
      const controller = new AbortController(); chats.add(controller);
      const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      const timeout = setTimeout(abort, 180000);
      try {
        const response = await request(`${RESOURCE}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: body.model, input: body.messages, instructions: '日本語で、わかりやすく回答してください。', store: false, stream: true }), signal: controller.signal });
        if (!response.ok) fail(hasImages ? `画像付きの返信を取得できませんでした（${response.status}）。画像対応モデル・利用上限・ログイン状態を確認してください。` : `返信を取得できませんでした（${response.status}）。利用上限・ログイン状態を確認してください。`);
        let completed = false;
        await consumeSSE(response.body, event => {
          if (event.type === 'response.output_text.delta') onEvent({ delta: event.delta });
          if (['response.failed', 'response.incomplete', 'error'].includes(event.type)) fail('返信が中断されました。利用上限や接続状況を確認してください。');
          if (event.type === 'response.completed') completed = true;
        });
        if (!completed) fail('接続が途中で切れました。もう一度送信してください。');
        onEvent({ done: true });
      } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); chats.delete(controller); }
    },
    async logout() {
      generation++;
      await transient.remove('chatPending');
      for (const controller of chats) controller.abort();
      const session = sessions.get(active); const clientId = active; active = '';
      sessions.delete(clientId);
      await saveSessions();
      // Finish an in-flight rotation before revoking its latest refresh token.
      if (refresh) await refresh.catch(() => {});
      let revoked = !session?.refresh_token;
      try {
        if (session?.refresh_token) {
          const discovery = await read(`${ISSUER}/.well-known/openid-configuration`);
          const endpoint = new URL(discovery.revocation_endpoint);
          if (endpoint.origin !== ISSUER) fail('失効先が不正です。');
          revoked = (await request(endpoint, form({ token: session.refresh_token, token_type_hint: 'refresh_token', client_id: clientId }))).ok;
        }
      } catch { revoked = false; }
      finally { await transient.set({ chatAuthError: '' }); }
      return { revoked };
    }
  };
}
