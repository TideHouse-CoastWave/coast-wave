// Offline boundary tests: all database requests are mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../functions/create-order/index.ts';
const origin = 'https://checkout.example.test';
const settings = { supabaseUrl: 'https://database.example.test', serviceKey: 'test-only-placeholder', origins: [origin], maxQuantity: 3 };
const input = { customer_name: 'Test Buyer', customer_email: 'BUYER@example.test', customer_phone: '0712 345 678', ticket_id: '11111111-1111-4111-8111-111111111111', quantity: 2, idempotency_key: '22222222-2222-4222-8222-222222222222' };
const snapshot = { order_id: '33333333-3333-4333-8333-333333333333', quantity: 2, total_amount: 3000, currency: 'KES', payment_status: 'pending', replayed: false };
const request = (body = input, extra = {}) => new Request('https://function.example.test', { method: 'POST', headers: { origin, 'content-type': 'application/json', authorization: 'Bearer caller-token' }, body: JSON.stringify(body), ...extra });
const unused = async () => { assert.fail('Database must not be contacted'); };
test('normalizes input, uses server credentials, returns allowlisted fields', async () => {
  const response = await createHandler(settings, async (url, options) => {
    assert.equal(url, `${settings.supabaseUrl}/rest/v1/rpc/create_pending_order_secure`);
    assert.equal(options.headers.Authorization, `Bearer ${settings.serviceKey}`);
    const data = JSON.parse(options.body);
    assert.equal(data.p_input.customer_phone, '254712345678');
    assert.equal(data.p_input.customer_email, 'buyer@example.test');
    assert.equal(data.p_max_quantity, 3);
    return Response.json({ ...snapshot, secret_field: 'must-not-return' });
  })(request());
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { replayed, ...expected } = snapshot;
  assert.deepEqual(await response.json(), expected);
});
test('replay is 200 and preserves idempotency key', async () => {
  const response = await createHandler(settings, async (_, options) => {
    assert.equal(JSON.parse(options.body).p_input.idempotency_key, input.idempotency_key);
    return Response.json({ ...snapshot, replayed: true });
  })(request());
  assert.equal(response.status, 200);
});
test('historical quantity above lowered limit reaches RPC and replays unchanged', async () => {
  let calls = 0;
  const response = await createHandler({ ...settings, maxQuantity: 1 }, async (_, options) => {
    calls++;
    const data = JSON.parse(options.body);
    assert.equal(data.p_input.quantity, 2);
    assert.equal(data.p_input.idempotency_key, input.idempotency_key);
    assert.equal(data.p_max_quantity, 1);
    return Response.json({ ...snapshot, replayed: true });
  })(request());
  assert.equal(calls, 1);
  assert.equal(response.status, 200);
  const { replayed, ...expected } = snapshot;
  assert.deepEqual(await response.json(), expected);
});
test('new quantity above current limit is rejected by RPC and mapped to HTTP 400', async () => {
  let calls = 0;
  const response = await createHandler({ ...settings, maxQuantity: 1 }, async (_, options) => {
    calls++;
    const data = JSON.parse(options.body);
    assert.equal(data.p_input.quantity, 2);
    assert.equal(data.p_max_quantity, 1);
    return Response.json({ code: 'CW004' }, { status: 400 });
  })(request());
  assert.equal(calls, 1);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'invalid_input');
});
test('absolute maximum 100 reaches RPC even with current limit one', async () => {
  const response = await createHandler({ ...settings, maxQuantity: 1 }, async (_, options) => {
    assert.equal(JSON.parse(options.body).p_input.quantity, 100);
    return Response.json({ ...snapshot, quantity: 100, total_amount: 150000, replayed: true });
  })(request({ ...input, quantity: 100 }));
  assert.equal(response.status, 200);
});
test('invalid quantities never reach RPC', async () => {
  let calls = 0;
  const handler = createHandler(settings, async () => { calls++; return Response.json(snapshot); });
  for (const quantity of [0, -1, 101, 1.5, '2', null, true, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
    const response = await handler(request({ ...input, quantity }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'invalid_quantity');
  }
  assert.equal(calls, 0);
});
test('phone regex accepts supported formats and rejects punctuation/extra digits', async () => {
  const handler = createHandler(settings, async (_, options) => {
    assert.equal(JSON.parse(options.body).p_input.customer_phone, '254712345678');
    return Response.json(snapshot);
  });
  for (const customer_phone of ['0712 345 678', '(0712)-345-678', '+254712345678', '254712345678']) {
    assert.equal((await handler(request({ ...input, customer_phone }))).status, 201);
  }
  for (const customer_phone of ['0712/345/678', '0712.345.678', '++254712345678', '2547123456789', '0712x345678']) {
    assert.equal((await createHandler(settings, unused)(request({ ...input, customer_phone }))).status, 400);
  }
});
test('email regex requires a literal domain dot and rejects whitespace', async () => {
  for (const customer_email of ['buyer@example', 'buyer@example test', 'buyer@@example.test']) {
    assert.equal((await createHandler(settings, unused)(request({ ...input, customer_email }))).status, 400);
  }
});
test('rejects injected financial/security fields', async () => {
  for (const field of ['price', 'unit_price', 'total_amount', 'payment_status', 'payment_reference', 'token_hash']) {
    assert.equal((await createHandler(settings, unused)(request({ ...input, [field]: 'forged' }))).status, 400);
  }
});
test('rejects invalid quantities, IDs and contact details', async () => {
  for (const patch of [{ quantity: 0 }, { quantity: 101 }, { quantity: 1.5 }, { quantity: '2' }, { ticket_id: 'bad' }, { customer_phone: '123' }, { customer_email: 'bad' }, { customer_name: '<script>' }]) {
    assert.equal((await createHandler(settings, unused)(request({ ...input, ...patch }))).status, 400);
  }
});
test('CORS preflight and disallowed origins', async () => {
  const handler = createHandler(settings, unused);
  assert.equal((await handler(request(input, { method: 'OPTIONS', body: undefined }))).status, 204);
  const denied = await handler(request(input, { headers: { origin: 'https://untrusted.example.test' } }));
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});
test('configuration fails closed', async () => {
  assert.equal((await createHandler({ ...settings, serviceKey: '' }, unused)(request())).status, 503);
});
test('method, content type, malformed JSON and streamed size limits', async () => {
  const handler = createHandler(settings, unused);
  assert.equal((await handler(request(input, { method: 'GET', body: undefined }))).status, 405);
  assert.equal((await handler(request(input, { headers: { origin, 'content-type': 'text/plain' } }))).status, 415);
  assert.equal((await handler(request(input, { body: '{' }))).status, 400);
  assert.equal((await handler(request(input, { body: ' '.repeat(4097) }))).status, 413);
});
test('safe database errors do not leak diagnostics', async () => {
  for (const [code, status] of [['CW001', 409], ['CW002', 404], ['CW003', 409], ['CW004', 400], ['CW005', 409], ['PGRST202', 503]]) {
    const response = await createHandler(settings, async () => Response.json({ code, message: 'sensitive-diagnostic' }, { status: 400 }))(request());
    assert.equal(response.status, status);
    assert.ok(!(await response.text()).includes('sensitive-diagnostic'));
  }
});
test('uncertain network outcome never automatically repeats insertion', async () => {
  let calls = 0;
  const response = await createHandler(settings, async () => { calls++; throw new Error('sensitive-network-error'); })(request());
  assert.equal(response.status, 503);
  assert.equal(calls, 1);
  assert.ok(!(await response.text()).includes('sensitive-network-error'));
});
