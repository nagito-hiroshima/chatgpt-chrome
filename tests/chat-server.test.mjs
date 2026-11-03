import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createChatServer, validateIdentity, consumeSSE } from '../local-chat/server.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256' };
const clientId = 'oaiapp_local_test';
function jwt(nonce, extra = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: 'https://auth.openai.com', aud: clientId, sub: 'test-user', email: 'demo@example.test', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, nonce, ...extra })).toString('base64url');
  return `${header}.${payload}.${sign('sha256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url')}`;
}
test('ID token validation rejects mismatched nonce, client, expiry, and signature', () => {
  const keys = { keys: [jwk] };
  assert.equal(validateIdentity(jwt('nonce'), keys, clientId, 'nonce').sub, 'test-user');
  assert.throws(() => validateIdentity(jwt('other'), keys, clientId, 'nonce'));
  assert.throws(() => validateIdentity(jwt('nonce'), keys, 'wrong-client', 'nonce'));
  assert.throws(() => validateIdentity(jwt('nonce', { exp: 10 }), keys, clientId, 'nonce'));
  const tampered = jwt('nonce').split('.');
  tampered[2] = (tampered[2][0] === 'A' ? 'B' : 'A') + tampered[2].slice(1);
  assert.throws(() => validateIdentity(tampered.join('.'), keys, clientId, 'nonce'));
});
test('SSE parser preserves Japanese text across split bytes and CRLF', async () => {
  const bytes = Buffer.from('data: {"type":"response.output_text.delta","delta":"日本語"}\r\n\r\ndata: {"type":"response.completed"}\n\n');
  async function* chunks() { for (const byte of bytes) yield Buffer.from([byte]); }
  const events = []; await consumeSSE(chunks(), e => events.push(e));
  assert.equal(events[0].delta, '日本語'); assert.equal(events[1].type, 'response.completed');
});
test('local OAuth, model list, streaming errors, and logout', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'chat-server-test-'));
  let nonce, captured, mode = 'complete';
  const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
  const fetcher = async (url, options) => {
    const route = new URL(url).pathname;
    if (route === '/api/accounts/oauth/token') return json({ id_token: jwt(nonce), access_token: 'test-access', refresh_token: 'test-refresh', scope: 'openid chatgpt.tokens.use.direct', expires_in: 3600 });
    if (route === '/.well-known/jwks.json') return json({ keys: [jwk] });
    if (route === '/.well-known/openid-configuration') return json({ revocation_endpoint: 'https://auth.openai.com/revoke' });
    if (route === '/revoke') return new Response('');
    if (route === '/v1/models') return json({ models: [{ visibility: 'list', slug: 'allowed-model', display_name: 'Test model' }, { visibility: 'hide', slug: 'hidden' }] });
    if (route === '/v1/responses') {
      captured = JSON.parse(options.body);
      return new Response('data: {"type":"response.output_text.delta","delta":"こんにちは"}\n\n' +
        (mode === 'complete' ? 'data: {"type":"response.completed"}\n\n' : 'data: {"type":"response.failed"}\n\n'));
    }
    throw Error(`Unexpected test URL: ${route}`);
  };
  const helper = await createChatServer({ port: 0, directory, fetcher, pairCode: 'test-pair-code' });
  t.after(async () => { await new Promise(resolve => helper.server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${helper.port}`;
  const headers = { 'X-Chat-Pair': helper.pairCode, 'Content-Type': 'application/json' };
  const call = (route, body) => fetch(base + route, { headers, ...(body !== undefined ? { method: 'POST', body: JSON.stringify(body) } : {}) });
  assert.equal((await fetch(base + '/status')).status, 401);
  assert.equal((await fetch(base + '/status', { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
  const badHostStatus = await new Promise((resolve, reject) => {
    const req = http.get(base + '/status', { headers: { ...headers, Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
  });
  assert.equal(badHostStatus, 403);
  const preflight = await fetch(base + '/status', { method: 'OPTIONS', headers: { Origin: 'chrome-extension://' + 'a'.repeat(32) } });
  assert.equal(preflight.status, 204);
  assert.equal((await call('/status').then(r => r.json())).connected, false);
  const start = await call('/auth/start', {}).then(r => r.json());
  const auth = new URL(start.url); nonce = auth.searchParams.get('nonce');
  assert.equal(auth.searchParams.get('client_id'), 'dynamic_agent_client');
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  const callback = new URL(auth.searchParams.get('redirect_uri'));
  callback.search = new URLSearchParams({ code: 'test-code', state: 'wrong-state', client_id: clientId });
  assert.equal((await fetch(callback)).status, 400);
  callback.searchParams.set('state', auth.searchParams.get('state'));
  assert.equal((await fetch(callback)).status, 200);
  assert.equal((await fetch(callback)).status, 400, 'callback cannot be replayed');
  const state = await call('/status').then(r => r.json());
  assert.equal(state.account.email, 'demo@example.test');
  assert.ok(!JSON.stringify(state).includes('test-access'));
  const host = await readFile(path.join(directory, 'host.json'), 'utf8');
  assert.ok(!host.includes('test-access') && !host.includes('test-refresh'));
  assert.deepEqual((await call('/models').then(r => r.json())).models, [{ id: 'allowed-model', name: 'Test model' }]);
  const body = { model: 'allowed-model', messages: [{ role: 'user', content: 'こんにちは' }] };
  const stream = await call('/chat', body).then(r => r.text());
  assert.ok(stream.includes('こんにちは') && stream.includes('"done":true'));
  assert.equal(captured.store, false); assert.equal(captured.stream, true); assert.deepEqual(captured.input, body.messages);
  assert.ok(!Object.hasOwn(captured, 'previous_response_id'));
  mode = 'failed';
  const failure = await call('/chat', body).then(r => r.text());
  assert.ok(failure.includes('"error":')); assert.ok(!failure.includes('"done":true'));
  assert.equal((await call('/chat', { ...body, messages: [{ role: 'system', content: 'bad' }] })).status, 400);
  assert.equal((await call('/logout', {}).then(r => r.json())).revoked, true);
  assert.equal((await call('/models')).status, 401);
  const returning = new URL((await call('/auth/start', { clientId }).then(r => r.json())).url);
  assert.equal(returning.searchParams.get('client_id'), clientId);
  assert.ok(!returning.searchParams.has('agent_name_hint'));
  assert.equal(returning.searchParams.get('ext_agent_host_id'), auth.searchParams.get('ext_agent_host_id'));
  const denied = new URL(returning.searchParams.get('redirect_uri'));
  denied.search = new URLSearchParams({ state: returning.searchParams.get('state'), error: 'access_denied' });
  assert.equal((await fetch(denied)).status, 400);
  assert.ok((await call('/status').then(r => r.json())).authError);
});
