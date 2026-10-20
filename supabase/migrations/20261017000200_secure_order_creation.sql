-- REVIEW ONLY: do not execute without staging schema verification and approval.
-- No existing tables/policies/functions are modified. No historical backfill.
-- Catalog-only preflight below: it never evaluates defaults or inserts test rows.
-- Arbitrary CHECK constraints/default bodies still require staging execution tests.
BEGIN;

DO $preflight$
DECLARE
  v_expected record;
  v_column record;
  v_default text;
  v_missing text;
  v_order_name_limit integer;
  v_ticket_name_limit integer;
BEGIN
  -- Restrict to the confirmed base-table contract; domains, enums and generated
  -- input columns require explicit review rather than implicit coercion guesses.
  FOR v_expected IN SELECT * FROM (VALUES
    ('orders', 'id', ARRAY['uuid'], 0),
    ('orders', 'customer_name', ARRAY['text','varchar'], 120),
    ('orders', 'customer_email', ARRAY['text','varchar'], 254),
    ('orders', 'customer_phone', ARRAY['text','varchar'], 12),
    ('orders', 'ticket_id', ARRAY['uuid'], 0),
    ('orders', 'ticket_name', ARRAY['text','varchar'], 0),
    ('orders', 'quantity', ARRAY['int2','int4','int8'], 0),
    ('orders', 'unit_price', ARRAY['int8'], 0),
    ('orders', 'total_amount', ARRAY['int8'], 0),
    ('orders', 'payment_status', ARRAY['text','varchar'], 7),
    ('tickets', 'id', ARRAY['uuid'], 0),
    ('tickets', 'name', ARRAY['text','varchar'], 0),
    ('tickets', 'price', ARRAY['int8'], 0),
    ('tickets', 'status', ARRAY['text','varchar'], 6)
  ) AS expected(table_name, column_name, allowed_types, minimum_length)
  LOOP
    SELECT a.*, t.typname, n.nspname AS type_schema INTO v_column
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
      JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE a.attrelid = pg_catalog.to_regclass('public.' || v_expected.table_name)
        AND c.relkind = 'r' AND a.attname = v_expected.column_name
        AND a.attnum > 0 AND NOT a.attisdropped;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Missing prerequisite: public.%.% on an ordinary table',
        v_expected.table_name, v_expected.column_name;
    END IF;
    IF v_column.type_schema <> 'pg_catalog'
      OR NOT (v_column.typname = ANY(v_expected.allowed_types))
      OR v_column.attgenerated <> '' OR v_column.attidentity <> '' THEN
      RAISE EXCEPTION 'Incompatible prerequisite: public.%.% must be a writable column of type % (found %)',
        v_expected.table_name, v_expected.column_name, v_expected.allowed_types,
        pg_catalog.format_type(v_column.atttypid, v_column.atttypmod);
    END IF;
    IF v_column.typname = 'varchar' AND v_column.atttypmod >= 0
      AND v_column.atttypmod - 4 < v_expected.minimum_length THEN
      RAISE EXCEPTION 'Incompatible length: public.%.% must hold at least % characters',
        v_expected.table_name, v_expected.column_name, v_expected.minimum_length;
    END IF;
  END LOOP;

  -- Require actual single-column UUID primary keys, not merely UUID columns.
  FOR v_expected IN SELECT unnest(ARRAY['orders','tickets']) AS table_name LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attname = 'id'
      WHERE c.conrelid = pg_catalog.to_regclass('public.' || v_expected.table_name)
        AND c.contype = 'p' AND c.conkey = ARRAY[a.attnum]
    ) THEN
      RAISE EXCEPTION 'Missing prerequisite: public.% needs PRIMARY KEY (id)', v_expected.table_name;
    END IF;
  END LOOP;

  SELECT pg_catalog.pg_get_expr(d.adbin, d.adrelid) INTO v_default
    FROM pg_catalog.pg_attrdef d JOIN pg_catalog.pg_attribute a
      ON a.attrelid = d.adrelid AND a.attnum = d.adnum
    WHERE a.attrelid = 'public.orders'::regclass AND a.attname = 'id';
  -- Conservative allowlist: a direct known UUID generator, optionally qualified.
  -- Custom expressions/wrappers must be reviewed explicitly, never test-executed
  -- by preflight. pg_attrdef dependencies establish function existence.
  IF v_default IS NULL OR v_default !~
    '^([a-zA-Z_][a-zA-Z_0-9]*\.)?(gen_random_uuid|uuid_generate_v4)\(\)$' THEN
    RAISE EXCEPTION 'Missing/incompatible orders.id UUID default: require a reviewed direct gen_random_uuid() or uuid_generate_v4() call';
  END IF;
  IF NOT pg_catalog.has_schema_privilege('service_role', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'Missing prerequisite: service_role needs USAGE on schema public';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE p.oid = pg_catalog.to_regprocedure(v_default)
      AND p.prorettype = 'uuid'::regtype AND p.pronargs = 0
      AND pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
      AND pg_catalog.has_schema_privilege('service_role', n.oid, 'USAGE')) THEN
    RAISE EXCEPTION 'Unusable orders.id default: service_role needs access to a zero-argument UUID-returning generator';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role' AND rolbypassrls) THEN
    RAISE EXCEPTION 'Missing prerequisite: service_role must have BYPASSRLS for this invoker RPC';
  END IF;
  FOR v_expected IN SELECT unnest(ARRAY['orders','tickets']) AS table_name LOOP
    IF NOT pg_catalog.has_table_privilege('service_role', 'public.' || v_expected.table_name, 'SELECT')
      OR NOT pg_catalog.has_table_privilege('service_role', 'public.' || v_expected.table_name, 'INSERT')
      OR NOT pg_catalog.has_table_privilege('service_role', 'public.' || v_expected.table_name, 'UPDATE') THEN
      RAISE EXCEPTION 'Missing prerequisite: service_role needs SELECT/INSERT/UPDATE on public.%', v_expected.table_name;
    END IF;
  END LOOP;

  SELECT string_agg(a.attname, ', ' ORDER BY a.attnum) INTO v_missing
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.orders'::regclass AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attname <> ALL(ARRAY['id','customer_name','customer_email','customer_phone',
        'ticket_id','ticket_name','quantity','unit_price','total_amount','payment_status'])
      AND a.attnotnull AND NOT a.atthasdef AND a.attgenerated = '' AND a.attidentity = '';
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Unfilled required orders columns without defaults: %', v_missing;
  END IF;

  SELECT CASE WHEN atttypmod < 0 THEN NULL ELSE atttypmod - 4 END
    INTO v_order_name_limit FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.orders'::regclass AND attname = 'ticket_name';
  SELECT CASE WHEN atttypmod < 0 THEN NULL ELSE atttypmod - 4 END
    INTO v_ticket_name_limit FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.tickets'::regclass AND attname = 'name';
  IF v_order_name_limit IS NOT NULL
    AND (v_ticket_name_limit IS NULL OR v_ticket_name_limit > v_order_name_limit) THEN
    RAISE EXCEPTION 'orders.ticket_name must accommodate the full tickets.name column length';
  END IF;
  -- Arbitrary existing CHECK, FK, UNIQUE, exclusion constraints and omitted-column
  -- default semantics cannot be proven from type metadata alone. Review their
  -- definitions and test valid inserts/rollback in staging before deployment.
  -- No existing constraints/defaults/grants are changed by this preflight.
END;
$preflight$;

-- A random UUID key is scoped to this operation, NOT a customer access token.
-- Keep rows indefinitely until an explicit archival/non-reuse policy is approved.
-- Contains PII: same retention/access safeguards as orders; never log request data.
CREATE TABLE public.order_creation_requests (
  idempotency_key uuid PRIMARY KEY,
  request_input jsonb NOT NULL CHECK (jsonb_typeof(request_input) = 'object'),
  order_id uuid UNIQUE REFERENCES public.orders(id) ON DELETE RESTRICT,
  response_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((order_id IS NULL) = (response_snapshot IS NULL)),
  CHECK (response_snapshot IS NULL OR jsonb_typeof(response_snapshot) = 'object')
);
ALTER TABLE public.order_creation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON public.order_creation_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.order_creation_requests TO service_role;

-- SECURITY INVOKER intentionally: callable only by service_role, whose existing
-- orders/tickets privileges must be verified. No caller-supplied price fields.
-- All new function grants are restricted in the same transaction as creation.
CREATE FUNCTION public.create_pending_order_secure(p_input jsonb, p_max_quantity integer)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_key uuid;
  v_ticket_id uuid;
  v_quantity integer;
  v_request jsonb;
  v_saved public.order_creation_requests%ROWTYPE;
  v_ticket public.tickets%ROWTYPE;
  v_order_id uuid;
  v_price numeric;
  v_total numeric;
  v_response jsonb;
BEGIN
  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object'
    OR p_max_quantity IS NULL OR p_max_quantity NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = 'CW004', MESSAGE = 'invalid_input';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_input)) <> 6
    OR NOT (p_input ?& ARRAY['customer_name','customer_email','customer_phone','ticket_id','quantity','idempotency_key'])
    OR jsonb_typeof(p_input->'quantity') <> 'number'
    OR EXISTS (SELECT 1 FROM jsonb_each(p_input) AS e(key, value)
      WHERE e.key <> 'quantity' AND jsonb_typeof(e.value) <> 'string') THEN
    RAISE EXCEPTION USING ERRCODE = 'CW004', MESSAGE = 'invalid_input';
  END IF;
  IF length(p_input->>'customer_name') NOT BETWEEN 2 AND 120
    OR (p_input->>'customer_name') <> btrim(p_input->>'customer_name')
    OR (p_input->>'customer_name') ~ '[[:cntrl:]<>]'
    OR length(p_input->>'customer_email') > 254
    OR (p_input->>'customer_email') !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]{2,}$'
    OR (p_input->>'customer_phone') !~ '^254[17][0-9]{8}$'
    OR (p_input->>'quantity') !~ '^[1-9][0-9]{0,2}$'
    OR (p_input->>'ticket_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR (p_input->>'idempotency_key') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'CW004', MESSAGE = 'invalid_input';
  END IF;
  v_quantity := (p_input->>'quantity')::integer;
  v_key := (p_input->>'idempotency_key')::uuid;
  v_ticket_id := (p_input->>'ticket_id')::uuid;
  v_request := p_input - 'idempotency_key';

  -- UNIQUE arbitration blocks competing insertions until the winner commits or
  -- rolls back. Under PostgREST's default READ COMMITTED, the subsequent locked
  -- SELECT sees that committed row. There is no unprotected SELECT-then-INSERT.
  INSERT INTO public.order_creation_requests(idempotency_key, request_input)
    VALUES (v_key, v_request) ON CONFLICT (idempotency_key) DO NOTHING;
  SELECT * INTO STRICT v_saved FROM public.order_creation_requests
    WHERE idempotency_key = v_key FOR UPDATE;
  IF v_saved.request_input IS DISTINCT FROM v_request THEN
    RAISE EXCEPTION USING ERRCODE = 'CW001', MESSAGE = 'idempotency_conflict';
  END IF;
  IF v_saved.order_id IS NOT NULL THEN
    RETURN v_saved.response_snapshot || jsonb_build_object('replayed', true);
  END IF;

  -- Current policy applies only to NEW orders, not committed replay snapshots.
  -- A same-key changed request still conflicts before this check. On failure the
  -- newly inserted claim rolls back, preserving atomicity and safe retries.
  IF v_quantity > p_max_quantity THEN
    RAISE EXCEPTION USING ERRCODE = 'CW004', MESSAGE = 'invalid_input';
  END IF;

  -- Lock category through insertion so an admin price/status update cannot race
  -- the snapshot. This verifies active sale status, NOT inventory reservation.
  SELECT * INTO v_ticket FROM public.tickets WHERE id = v_ticket_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'CW002', MESSAGE = 'ticket_not_found';
  END IF;
  IF v_ticket.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION USING ERRCODE = 'CW003', MESSAGE = 'ticket_unavailable';
  END IF;
  v_price := v_ticket.price::numeric;
  IF v_price IS NULL OR v_price <= 0 OR v_price <> trunc(v_price)
    OR v_price > 2147483647 THEN
    RAISE EXCEPTION USING ERRCODE = 'CW005', MESSAGE = 'ticket_price_unavailable';
  END IF;
  v_total := v_price * v_quantity;
  -- Existing amount/price columns are confirmed bigint. Retain this conservative
  -- application limit intentionally; it is not the bigint storage maximum.
  IF v_total > 2147483647 THEN
    RAISE EXCEPTION USING ERRCODE = 'CW005', MESSAGE = 'ticket_price_unavailable';
  END IF;
  INSERT INTO public.orders (
    customer_name, customer_email, customer_phone, ticket_id, ticket_name,
    quantity, unit_price, total_amount, payment_status
  ) VALUES (
    p_input->>'customer_name', p_input->>'customer_email', p_input->>'customer_phone',
    v_ticket.id, v_ticket.name, v_quantity, v_price, v_total, 'pending'
  ) RETURNING id INTO v_order_id;
  v_response := jsonb_build_object('order_id', v_order_id, 'quantity', v_quantity,
    'total_amount', v_total, 'currency', 'KES', 'payment_status', 'pending');
  UPDATE public.order_creation_requests SET order_id = v_order_id,
    response_snapshot = v_response WHERE idempotency_key = v_key;
  RETURN v_response || jsonb_build_object('replayed', false);
END;
$function$;
REVOKE ALL PRIVILEGES ON FUNCTION public.create_pending_order_secure(jsonb, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_pending_order_secure(jsonb, integer) TO service_role;

-- Any error rolls back BOTH the request claim and order. Transient failures may
-- be retried with the same key; a committed success always replays its snapshot.
-- Snapshot is creation-time acknowledgement, NOT current payment/order status.
-- This does not restrict legacy browser INSERT or existing payment RPC access.
-- No payment, QR issuance, inventory/capacity, expiry or customer ownership flow
-- is implemented here. Those need separately approved contracts and cutover.
COMMIT;
