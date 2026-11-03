// Node.js 22+. OAuth tokens stay in memory, never in Chrome storage or logs.
import http from 'node:http';
import { randomBytes, randomUUID, createHash, createPublicKey, verify, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const SCOPE = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const random = () => randomBytes(32).toString('base64url');
const same = (a, b) => typeof a === 'string' && typeof b === 'string' &&
  Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const error = (message, status = 400) => Object.assign(new Error(message), { status });
const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };

export function validateIdentity(jwt, jwks, clientId, nonce, now = Date.now() / 1000) {
  const parts = jwt?.split('.');
  if (parts?.length !== 3) throw error('IDトークンの形式が不正です。');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
  if (!['RS256', 'ES256'].includes(header.alg)) throw error('IDトークンの署名方式を検証できません。');
  const jwk = jwks.keys?.find(key => key.kid === header.kid && (!key.alg || key.alg === header.alg) && (!key.use || key.use === 'sig'));
  if (!jwk) throw error('IDトークンの検証鍵が見つかりません。');
  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  if (!verify('sha256', Buffer.from(parts.slice(0, 2).join('.')),
    { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'))) throw error('IDトークンの署名が一致しません。');
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== ISSUER || !audience.includes(clientId) ||
    (audience.length > 1 && claims.azp !== clientId) ||
    !Number.isFinite(claims.exp) || claims.exp <= now - 5 ||
    !Number.isFinite(claims.iat) || claims.iat > now + 5 ||
    (claims.nbf !== undefined && claims.nbf > now + 5) ||
    typeof claims.sub !== 'string' || !claims.sub || !same(claims.nonce, nonce)) throw error('IDトークンの本人確認に失敗しました。再ログインしてください。');
  return claims;
}

// Handles fragmented UTF-8, CRLF, and multiple events per network chunk.
export async function consumeSSE(body, onEvent) {
  let buffer = '';
  const decoder = new TextDecoder();
  const drain = () => {
    buffer = buffer.replace(/\r\n/g, '\n');
    let end;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
      const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (data && data !== '[DONE]') onEvent(JSON.parse(data));
    }
  };
  for await (const chunk of body) { buffer += decoder.decode(chunk, { stream: true }); drain(); }
  buffer += decoder.decode(); drain();
}

async function readJSON(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw error('JSON形式が必要です。', 415);
  let data = ''; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 256000) throw error('会話が長すぎます。新しいチャットを開いてください。', 413); data += chunk; }
  try { return JSON.parse(data); } catch { throw error('JSON形式が不正です。'); }
}

export async function createChatServer({ port = 1455, directory, fetcher = fetch, pairCode = random() } = {}) {
  const dataDirectory = directory ?? fileURLToPath(new URL('../.chatgpt-local/', import.meta.url));
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const hostFile = path.join(dataDirectory, 'host.json');
  let host;
  try { host = JSON.parse(await readFile(hostFile, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; host = { id: `urn:uuid:${randomUUID()}`, accounts: [] }; }
  const save = () => writeFile(hostFile, JSON.stringify(host), { mode: 0o600 });
  await save();
  const sessions = new Map();
  let active = null, pending = null, authError = '', generation = 0, refreshPromise = null, runningChat = null;
  const request = (url, options = {}) => fetcher(url, { ...options, signal: options.signal ?? AbortSignal.timeout(30000) });
  async function upstreamJSON(url, options) {
    const response = await request(url, options);
    if (!response.ok) {
      // Do not return raw OAuth responses: they can contain credentials or codes.
      throw error(`OpenAIへの接続に失敗しました（${response.status}）。利用許可・プラン・接続状況を確認してください。`, response.status === 401 ? 401 : 502);
    }
    return response.json();
  }
  const formPost = body => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  async function accessToken() {
    const session = sessions.get(active);
    if (!session) throw error('ChatGPTにログインしてください。', 401);
    if (!session.scope.split(' ').includes('chatgpt.tokens.use.direct')) throw error('ChatGPTプランの利用が許可されていません。もう一度ログインして許可してください。', 403);
    if (session.expiresAt < Date.now() + 60000) {
      if (!session.refresh_token) throw error('ログインの有効期限が切れました。再ログインしてください。', 401);
      if (!refreshPromise) refreshPromise = (async () => {
        const tokens = await upstreamJSON(`${ISSUER}/api/accounts/oauth/token`, formPost({ grant_type: 'refresh_token', client_id: session.clientId, refresh_token: session.refresh_token, resource: RESOURCE }));
        if (!tokens.access_token) throw error('再認証が必要です。', 401);
        Object.assign(session, tokens, { expiresAt: Date.now() + Number(tokens.expires_in ?? 3600) * 1000 });
      })().finally(() => { refreshPromise = null; });
      await refreshPromise;
    }
    return session.access_token;
  }
  let server;
  const handler = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    try {
      const address = server.address();
      const expectedHost = `127.0.0.1:${address.port}`;
      if (req.headers.host !== expectedHost) throw error('Hostが不正です。', 403);
      const url = new URL(req.url, `http://${expectedHost}`);
      const origin = req.headers.origin;
      const extensionOrigin = typeof origin === 'string' && /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
      if (origin && !extensionOrigin) throw error('この接続元は許可されていません。', 403);
      if (extensionOrigin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Chat-Pair');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      }
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      if (url.pathname === '/auth/callback' && req.method === 'GET') {
        const attempt = pending;
        if (!attempt || attempt.expires < Date.now() || !same(url.searchParams.get('state'), attempt.state)) throw error('ログインの期限が切れたか、stateが一致しません。再ログインしてください。');
        pending = null;
        try {
          if (url.searchParams.has('error')) throw error('ログインまたはプラン利用の許可がキャンセルされました。');
          const clientId = url.searchParams.get('client_id') || attempt.account?.clientId;
          if (!clientId || clientId === 'dynamic_agent_client' || (attempt.account && clientId !== attempt.account.clientId)) throw error('ログイン登録が完了しませんでした。');
          const code = url.searchParams.get('code');
          if (!code) throw error('認証コードがありません。');
          const tokens = await upstreamJSON(`${ISSUER}/api/accounts/oauth/token`, formPost({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: attempt.verifier, redirect_uri: attempt.redirect, resource: RESOURCE }));
          const jwks = await upstreamJSON(`${ISSUER}/.well-known/jwks.json`);
          const claims = validateIdentity(tokens.id_token, jwks, clientId, attempt.nonce);
          if (attempt.account && claims.sub !== attempt.account.subject) throw error('選択したアカウントと一致しません。');
          if (attempt.generation !== generation) throw error('ログインが取り消されました。');
          if (!tokens.access_token || typeof tokens.scope !== 'string') throw error('必要なアクセス許可がありません。');
          const account = { clientId, subject: claims.sub, email: claims.email || claims.sub };
          host.accounts = host.accounts.filter(item => item.clientId !== clientId).concat(account);
          await save();
          sessions.set(clientId, { ...tokens, clientId, expiresAt: Date.now() + Number(tokens.expires_in ?? 3600) * 1000 });
          active = clientId; authError = '';
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<!doctype html><html lang="ja"><meta charset="utf-8"><title>接続完了</title><h1>ChatGPTに接続しました</h1><p>このタブを閉じて、高規格道路のチャット欄に戻ってください。</p></html>');
        } catch (e) { authError = e.message; throw e; }
        return;
      }
      if (!same(req.headers['x-chat-pair'], pairCode)) throw error('補助サーバーの接続コードを確認してください。', 401);
      if (url.pathname === '/status' && req.method === 'GET') {
        const account = host.accounts.find(item => item.clientId === active);
        json(res, { connected: Boolean(sessions.get(active)), account: account ?? null, accounts: host.accounts, pending: Boolean(pending && pending.expires > Date.now()), authError }); return;
      }
      if (url.pathname === '/auth/start' && req.method === 'POST') {
        const body = await readJSON(req);
        const account = host.accounts.find(item => item.clientId === body.clientId);
        const state = random(), nonce = random(), verifier = random();
        const redirect = `http://${expectedHost}/auth/callback`;
        generation++;
        pending = { state, nonce, verifier, redirect, account, expires: Date.now() + 600000, generation };
        authError = '';
        const authorize = new URL(`${ISSUER}/api/accounts/authorize`);
        const params = { client_id: account?.clientId ?? 'dynamic_agent_client', ext_agent_host_id: host.id, response_type: 'code', redirect_uri: redirect, scope: SCOPE, resource: RESOURCE, state, nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') };
        if (!account) params.agent_name_hint = '高規格道路';
        else {
          const hint = sessions.get(account.clientId)?.id_token;
          if (hint) params.id_token_hint = hint;
          params.login_hint = account.email;
        }
        authorize.search = new URLSearchParams(params).toString();
        json(res, { url: authorize.href }); return;
      }
      if (url.pathname === '/models' && req.method === 'GET') {
        const token = await accessToken();
        const catalog = await upstreamJSON(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${token}` } });
        const models = (catalog.models ?? []).filter(model => model.visibility === 'list').map(model => ({ id: model.slug, name: model.display_name }));
        json(res, { models }); return;
      }
      if (url.pathname === '/logout' && req.method === 'POST') {
        generation++; pending = null; runningChat?.abort();
        const session = sessions.get(active); const clientId = active; active = null;
        let revoked = !session?.refresh_token;
        try {
          if (session?.refresh_token) {
            const discovery = await upstreamJSON(`${ISSUER}/.well-known/openid-configuration`);
            const endpoint = new URL(discovery.revocation_endpoint);
            if (endpoint.origin !== ISSUER) throw error('失効先が不正です。');
            const response = await request(endpoint, formPost({ token: session.refresh_token, token_type_hint: 'refresh_token', client_id: clientId }));
            revoked = response.ok;
          }
        } catch { revoked = false; }
        finally { sessions.delete(clientId); }
        json(res, { revoked }); return;
      }
      if (url.pathname === '/chat' && req.method === 'POST') {
        if (runningChat) throw error('返信を生成中です。完了を待ってください。', 409);
        const body = await readJSON(req);
        if (typeof body.model !== 'string' || !body.model || !Array.isArray(body.messages) || !body.messages.length || body.messages.length > 100 || body.messages.some(m => !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 64000)) throw error('モデルまたは会話内容を確認してください。');
        const controller = new AbortController(); runningChat = controller;
        res.on('close', () => controller.abort());
        const timeout = setTimeout(() => controller.abort(), 180000);
        try {
          const token = await accessToken();
          const response = await request(`${RESOURCE}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: body.model, input: body.messages, instructions: '日本語で、わかりやすく回答してください。', store: false, stream: true }), signal: controller.signal });
          if (!response.ok) throw error(`返信を取得できませんでした（${response.status}）。プランの利用上限・モデル・ログイン状態を確認してください。`, 502);
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' });
          let completed = false;
          await consumeSSE(response.body, event => {
            if (event.type === 'response.output_text.delta') res.write(JSON.stringify({ delta: event.delta }) + '\n');
            if (['response.failed', 'response.incomplete', 'error'].includes(event.type)) throw error('返信が中断されました。利用上限や接続状況を確認し、もう一度送信してください。');
            if (event.type === 'response.completed') completed = true;
          });
          if (!completed) throw error('接続が途中で切れました。もう一度送信してください。');
          res.end(JSON.stringify({ done: true }) + '\n');
        } finally { clearTimeout(timeout); runningChat = null; }
        return;
      }
      throw error('ページが見つかりません。', 404);
    } catch (e) {
      const message = e.name === 'AbortError' ? '送信を停止したか、接続がタイムアウトしました。' : (e.status ? e.message : '処理に失敗しました。接続状況を確認して再試行してください。');
      if (res.headersSent) { if (!res.destroyed) res.end(JSON.stringify({ error: message }) + '\n'); }
      else json(res, { error: message }, e.status ?? 500);
    }
  };
  server = http.createServer(handler);
  server.requestTimeout = 190000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, pairCode, port: server.address().port };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { port, pairCode } = await createChatServer();
    console.log(`高規格道路 ChatGPT補助サーバー: http://127.0.0.1:${port}\n接続コード: ${pairCode}\n拡張機能のChatGPT欄に接続コードを入力してください。\n停止: Ctrl+C（ログイン情報はメモリから消去されます）`);
  } catch (e) {
    console.error(e.code === 'EADDRINUSE' ? 'ポート1455が使用中です。既存の補助サーバーを確認してください。' : '補助サーバーを起動できませんでした。');
    process.exitCode = 1;
  }
}
