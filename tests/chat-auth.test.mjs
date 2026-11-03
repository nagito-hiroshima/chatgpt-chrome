import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createChatClient, validateIdentity, CALLBACK } from '../chat-auth.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'serverless-key', alg: 'RS256' };
const clientId = 'oaiapp_serverless_test';
const json = value => new Response(JSON.stringify(value));
function jwt(nonce, claims = {}) {
  const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ iss: 'https://auth.openai.com', aud: clientId, sub: 'test-user', email: 'demo@example.test', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, nonce, ...claims })).toString('base64url');
  return `${head}.${body}.${sign('sha256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url')}`;
}
function store() {
  const data = {};
  return {
    data,
    async get(keys) { return structuredClone(Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in data).map(k => [k, data[k]]))); },
    async set(values) { Object.assign(data, structuredClone(values)); },
    async remove(key) { delete data[key]; }
  };
}
test('Web Crypto rejects forged signature, nonce, audience and expiry', async () => {
  const keys = { keys: [jwk] };
  assert.equal((await validateIdentity(jwt('nonce'), keys, clientId, 'nonce')).sub, 'test-user');
  await assert.rejects(validateIdentity(jwt('wrong'), keys, clientId, 'nonce'));
  await assert.rejects(validateIdentity(jwt('nonce', { aud: 'other' }), keys, clientId, 'nonce'));
  await assert.rejects(validateIdentity(jwt('nonce', { exp: 10 }), keys, clientId, 'nonce'));
  const parts = jwt('nonce').split('.'); parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
  await assert.rejects(validateIdentity(parts.join('.'), keys, clientId, 'nonce'));
});
test('serverless PKCE callback, refresh, streaming, worker restart, and logout', async () => {
  const local = store(), transient = store(); let nonce, captured, mode = 'complete', refreshed = 0;
  const fetcher = async (url, options) => {
    const route = new URL(url).pathname;
    assert.ok(new URL(url).protocol === 'https:', 'no localhost or worker request');
    if (route === '/api/accounts/oauth/token') {
      const form = options.body;
      if (form.get('grant_type') === 'refresh_token') { refreshed++; return json({ access_token: 'refreshed-access', refresh_token: 'rotated-refresh', expires_in: 3600 }); }
      assert.equal(form.get('client_id'), clientId);
      assert.equal(form.get('redirect_uri'), CALLBACK);
      return json({ access_token: 'test-access-token', refresh_token: 'test-refresh-token', id_token: jwt(nonce), expires_in: 1, scope: 'openid chatgpt.tokens.use.direct' });
    }
    if (route === '/.well-known/jwks.json') return json({ keys: [jwk] });
    if (route === '/v1/models') return json({ models: [{ slug: 'test-model', display_name: 'Test model', visibility: 'list' }] });
    if (route === '/v1/responses') {
      assert.equal(options.headers.Authorization, 'Bearer refreshed-access');
      captured = JSON.parse(options.body);
      return new Response('data: {"type":"response.output_text.delta","delta":"日本語"}\n\n' +
        (mode === 'complete' ? 'data: {"type":"response.completed"}\n\n' : 'data: {"type":"response.failed"}\n\n'));
    }
    if (route === '/.well-known/openid-configuration') return json({ revocation_endpoint: 'https://auth.openai.com/revoke' });
    if (route === '/revoke') { assert.equal(options.body.get('token'), 'rotated-refresh'); return new Response(''); }
    throw Error('Unexpected request');
  };
  let api = await createChatClient({ local, transient, fetcher });
  assert.equal((await api.status()).connected, false);
  const auth = new URL(await api.begin('', 44)); nonce = auth.searchParams.get('nonce');
  const pending = transient.data.chatPending;
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(auth.searchParams.get('redirect_uri'), CALLBACK);
  assert.equal(auth.searchParams.get('client_id'), 'dynamic_agent_client');
  const callback = new URL(CALLBACK);
  callback.search = new URLSearchParams({ code: 'test-code', client_id: clientId, state: pending.state });
  assert.equal(await api.callback(callback.href, 45), false, 'another tab cannot deliver callback');
  const wrong = new URL(callback); wrong.searchParams.set('state', 'forged-state');
  assert.equal(await api.callback(wrong.href, 44), false);
  // A sleeping service worker may restart while the login tab is open.
  api = await createChatClient({ local, transient, fetcher });
  assert.equal(await api.callback(callback.href, 44, async () => {
    assert.equal((await api.result(44)).state, 'processing');
  }), true);
  assert.equal((await api.result(44)).state, 'connected');
  assert.equal((await api.result(44)).email, 'demo@example.test');
  assert.equal((await api.result(45)).state, 'idle', 'another tab cannot read this result');
  assert.equal(await api.callback(callback.href, 44), false, 'callback is consumed once');
  assert.equal((await api.status()).connected, true);
  assert.equal((await api.models()).models[0].id, 'test-model');
  assert.equal(refreshed, 1);
  const events = [];
  await api.chat({ model: 'test-model', messages: [{ role: 'user', content: '質問' }] }, e => events.push(e));
  assert.deepEqual(events, [{ delta: '日本語' }, { done: true }]);
  assert.equal(captured.store, false); assert.equal(captured.stream, true);
  const image = 'data:image/png;base64,iVBORw0KGgo=';
  await api.chat({model:'test-model',messages:[{role:'user',content:[{type:'input_text',text:'数式を説明して'},{type:'input_image',image_url:image,detail:'high'}]}]}, () => {});
  assert.equal(captured.input[0].content[1].image_url, image);
  assert.equal(captured.store, false); assert.equal(captured.stream, true);
  mode = 'failed';
  await assert.rejects(api.chat({ model: 'test-model', messages: [{ role: 'user', content: '質問' }] }, () => {}));
  assert.ok(!JSON.stringify({ local: local.data, transient: transient.data }).includes('test-access-token'));
  assert.ok(!JSON.stringify({ local: local.data, transient: transient.data }).includes('rotated-refresh'));
  const deniedAuth = new URL(await api.begin('', 46));
  const deniedCallback = new URL(CALLBACK);
  deniedCallback.search = new URLSearchParams({ state: deniedAuth.searchParams.get('state'), error: 'access_denied' });
  await api.callback(deniedCallback.href, 46);
  assert.equal((await api.result(46)).state, 'error');
  assert.equal((await api.status()).connected, true, 'an older active account must not turn a failed attempt into success');
  assert.equal((await api.logout()).revoked, true);
  assert.equal((await api.status()).connected, false);
  const returning = new URL(await api.begin(clientId, 45));
  assert.equal(returning.searchParams.get('client_id'), clientId);
  assert.equal(returning.searchParams.get('ext_agent_host_id'), auth.searchParams.get('ext_agent_host_id'));
  await api.cancelLogin(45);
  assert.equal((await api.status()).pending, false);
  const restarted = await createChatClient({ local, transient, fetcher });
  assert.equal((await restarted.status()).connected, false, 'credentials are not persisted across worker shutdown');
});
