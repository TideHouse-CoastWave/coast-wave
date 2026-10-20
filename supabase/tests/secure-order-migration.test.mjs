// Source-contract regression checks only. No SQL is parsed/executed here.
// Actual replay/concurrency and catalog compatibility require approved staging tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../migrations/20261017000200_secure_order_creation.sql', import.meta.url), 'utf8');
const sql = source.replace(/--[^\r\n]*/g, '');
const body = sql.split('AS $function$')[1].split('$function$;')[0];

test('committed identical replay precedes current quantity limit; new creation follows limit', () => {
  const replay = body.indexOf("RETURN v_saved.response_snapshot || jsonb_build_object('replayed', true);");
  const limit = body.indexOf('IF v_quantity > p_max_quantity THEN');
  const creation = body.indexOf('INSERT INTO public.orders');
  assert.ok(replay >= 0 && replay < limit && limit < creation);
  assert.equal(body.match(/v_quantity\s*>\s*p_max_quantity/g)?.length, 1);
  assert.match(body.slice(limit, creation), /ERRCODE = 'CW004'/);
});

test('conflicting inputs cannot replay and unique arbitration precedes locked lookup', () => {
  const claim = body.indexOf('INSERT INTO public.order_creation_requests');
  const conflict = body.indexOf('ON CONFLICT (idempotency_key) DO NOTHING');
  const lookup = body.indexOf('SELECT * INTO STRICT v_saved');
  const compare = body.indexOf('IF v_saved.request_input IS DISTINCT FROM v_request THEN');
  const replay = body.indexOf('IF v_saved.order_id IS NOT NULL THEN');
  assert.ok(claim < conflict && conflict < lookup && lookup < compare && compare < replay);
  assert.match(body.slice(lookup, compare), /FOR UPDATE/);
  assert.match(body.slice(compare, replay), /ERRCODE = 'CW001'/);
  assert.match(sql, /idempotency_key uuid PRIMARY KEY/);
});

test('input format and positive quantity checks remain before any claim/replay', () => {
  const claim = body.indexOf('INSERT INTO public.order_creation_requests');
  const validation = body.slice(0, claim);
  assert.ok(validation.includes("!~ '^[1-9][0-9]{0,2}$'"));
  assert.ok(validation.includes('p_max_quantity NOT BETWEEN 1 AND 100'));
  assert.ok(validation.includes('jsonb_object_keys(p_input)'));
  assert.ok(validation.includes("v_request := p_input - 'idempotency_key'"));
});

test('preflight checks columns, bigint prices, UUID defaults, omissions and permissions', () => {
  const preflight = sql.split('DO $preflight$')[1].split('$preflight$;')[0];
  for (const column of ['customer_name', 'customer_email', 'customer_phone', 'ticket_id', 'ticket_name', 'quantity', 'payment_status']) {
    assert.ok(preflight.includes(`('orders', '${column}',`));
  }
  for (const [table, column] of [['orders', 'unit_price'], ['orders', 'total_amount'], ['tickets', 'price']]) {
    assert.ok(preflight.includes(`('${table}', '${column}', ARRAY['int8'], 0)`));
  }
  for (const fragment of ['pg_catalog.pg_attrdef', 'pg_catalog.pg_constraint', "c.contype = 'p'", 'a.attnotnull AND NOT a.atthasdef', 'pg_catalog.has_function_privilege', 'pg_catalog.has_table_privilege', 'rolbypassrls', 'uuid_generate_v4']) {
    assert.ok(preflight.includes(fragment), fragment);
  }
});

test('invoker security, explicit volatility, RLS, grants and atomic boundary remain', () => {
  assert.match(sql, /LANGUAGE plpgsql\s+VOLATILE\s+SECURITY INVOKER\s+SET search_path = ''/);
  assert.match(sql, /ALTER TABLE public\.order_creation_requests ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON FUNCTION[\s\S]+FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.create_pending_order_secure\(jsonb, integer\) TO service_role/);
  assert.equal((sql.match(/\bBEGIN;/g) ?? []).length, 1);
  assert.match(sql.trim(), /COMMIT;$/);
  assert.ok(!/CREATE\s+(POLICY|TRIGGER)/i.test(sql));
});
