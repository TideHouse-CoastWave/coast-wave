-- REVIEW DRAFT ONLY. Revised locally; never applied by this change. Requires the two foundation
-- migrations and reviewed base schema. All RPCs are service-role-only.
BEGIN;
-- Fail closed over the reported legacy grants. Do not silently perform the
-- separately approved checkout/staff/privacy cutover from this migration.
-- These catalog checks do not replace review of the exported definitions,
-- policies, triggers, views, SECURITY DEFINER wrappers and role memberships.
DO $security_preflight$
DECLARE n text; r text; priv text; obj regclass; fn record;
BEGIN
 IF to_regprocedure('public.create_pending_order_secure(jsonb,integer)') IS NULL THEN
  RAISE EXCEPTION 'Missing prerequisite: create_pending_order_secure(jsonb,integer)';
 END IF;
 IF NOT has_function_privilege('service_role','public.create_pending_order_secure(jsonb,integer)','EXECUTE')
 OR NOT has_schema_privilege('service_role','public','USAGE')
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) THEN
  RAISE EXCEPTION 'Missing service_role execution, schema access or BYPASSRLS prerequisite';
 END IF;
 -- Reject stale overloads as well as exact duplicates. Never CREATE OR REPLACE
 -- objects whose deployed contract and migration provenance are unknown.
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='public' AND p.proname=ANY(ARRAY[
 'create_customer_pending_order_secure','ncba_lock_identity','claim_ncba_attempt',
 'record_ncba_submission','ingest_ncba_notification','customer_payment_status',
 'finalize_ncba_payment','ncba_finalization_quantity','retrieve_customer_ticket',
 'list_customer_tickets','ncba_reconciliation_queue','block_ncba_evidence',
 'claim_ncba_query_jobs','begin_ncba_query','record_ncba_query'])) THEN
  RAISE EXCEPTION 'NCBA RPC already exists: review deployed definitions and prepare an upgrade migration';
 END IF;
 FOREACH n IN ARRAY ARRAY['orders','tickets','payment_attempts','payment_receipts',
 'payment_events','issued_tickets','payment_audit_events','delivery_outbox','order_creation_requests'] LOOP
  obj := to_regclass('public.'||n);
  IF obj IS NULL THEN RAISE EXCEPTION 'Missing prerequisite table: public.%',n; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=obj AND relkind='r' AND relrowsecurity) THEN
   RAISE EXCEPTION 'Prerequisite requires ordinary RLS-enabled table: public.%',n;
  END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r AND (rolsuper OR rolbypassrls))
   OR pg_has_role(r,(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=obj),'MEMBER') THEN
    RAISE EXCEPTION 'Unsafe browser role ownership or RLS bypass: % on %',r,n;
   END IF;
   FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    -- Catalog ticket reads may remain public; catalog writes cannot remain public.
    IF NOT (n='tickets' AND priv='SELECT') AND has_table_privilege(r,obj,priv) THEN
     RAISE EXCEPTION 'Security cutover required: effective % on public.% for %',priv,n,r;
    END IF;
   END LOOP;
   FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
    IF NOT (n='tickets' AND priv='SELECT') AND EXISTS(
     SELECT 1 FROM pg_attribute a WHERE a.attrelid=obj AND a.attnum>0 AND NOT a.attisdropped
     AND has_column_privilege(r,obj,a.attnum,priv)) THEN
     RAISE EXCEPTION 'Security cutover required: effective column % on public.% for %',priv,n,r;
    END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 FOR fn IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='public' AND p.proname IN ('create_pending_order_secure','confirm_payment_and_issue_ticket') LOOP
  IF has_function_privilege('anon',fn.oid,'EXECUTE') OR has_function_privilege('authenticated',fn.oid,'EXECUTE')
  OR (fn.proname='confirm_payment_and_issue_ticket' AND has_function_privilege('service_role',fn.oid,'EXECUTE')) THEN
   RAISE EXCEPTION 'Unsafe legacy RPC execution remains: %',fn.oid::regprocedure;
  END IF;
 END LOOP;
END;
$security_preflight$;

CREATE TABLE public.order_customer_access (
 order_id uuid PRIMARY KEY REFERENCES public.orders(id), user_id uuid NOT NULL,
 expires_at timestamptz NOT NULL, payment_expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(expires_at>=payment_expires_at)
);
-- Bind only from a trusted server ownership flow. Never bind by order UUID,
-- customer email claims, or an order-creation idempotency key. No public binder.
CREATE TABLE public.ncba_verification_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL UNIQUE REFERENCES public.payment_events(id),
 attempt_id uuid NOT NULL REFERENCES public.payment_attempts(id),
 order_id uuid NOT NULL REFERENCES public.orders(id),
 provider_reference text NOT NULL, reference_deduplication_key text NOT NULL,
 reference_key_rule text NOT NULL, amount numeric(20,2) NOT NULL CHECK(amount > 0),
 currency text NOT NULL CHECK(currency = 'KES'), merchant_scope text NOT NULL,
 contract_rule text NOT NULL CHECK(btrim(contract_rule) <> ''),
 evidence_metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(evidence_metadata)='object'),
 event_payload_digest bytea NOT NULL CHECK(octet_length(event_payload_digest)=32),
 attempt_request_fingerprint bytea NOT NULL CHECK(octet_length(attempt_request_fingerprint)=32),
 verified_at timestamptz NOT NULL, finalized_at timestamptz,
 processing_status text NOT NULL DEFAULT 'pending' CHECK(processing_status IN ('pending','processing','blocked','completed')),
 processing_attempts integer NOT NULL DEFAULT 0 CHECK(processing_attempts>=0),
 claim_token uuid, claim_expires_at timestamptz, error_code text,
 CHECK ((claim_token IS NULL) = (claim_expires_at IS NULL)),
 CHECK ((processing_status='processing') = (claim_token IS NOT NULL)),
 CHECK ((processing_status='completed') = (finalized_at IS NOT NULL)),
 CHECK(btrim(provider_reference)<>'' AND btrim(reference_deduplication_key)<>'' AND btrim(reference_key_rule)<>'' AND btrim(merchant_scope)<>''),
 FOREIGN KEY(attempt_id,order_id) REFERENCES public.payment_attempts(id,order_id)
);
-- No automated writer until NCBA supplies correlation/final-success rules.
-- This is a privileged verifier attestation, NEVER customer-supplied evidence.
ALTER TABLE public.order_customer_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncba_verification_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_customer_access, public.ncba_verification_evidence FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.order_customer_access TO service_role;
GRANT SELECT,INSERT ON public.ncba_verification_evidence TO service_role;
GRANT UPDATE(finalized_at,processing_status,processing_attempts,claim_token,claim_expires_at,error_code) ON public.ncba_verification_evidence TO service_role;

CREATE TABLE public.customer_order_creation_keys (
 user_id uuid NOT NULL, idempotency_key uuid NOT NULL,
 internal_key uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 PRIMARY KEY(user_id,idempotency_key)
);
ALTER TABLE public.customer_order_creation_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_order_creation_keys FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.customer_order_creation_keys TO service_role;
CREATE FUNCTION public.create_customer_pending_order_secure(p_user uuid,p_input jsonb,p_max_quantity integer,p_access_ttl integer,p_payment_ttl integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE k uuid; result jsonb; bound_at timestamptz;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION USING ERRCODE='CP005',MESSAGE='read_committed_required'; END IF;
 IF p_user IS NULL OR p_access_ttl IS NULL OR p_access_ttl NOT BETWEEN 60 AND 31536000
 OR p_payment_ttl IS NULL OR p_payment_ttl NOT BETWEEN 60 AND 86400 OR p_access_ttl<p_payment_ttl
 OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_customer_order'; END IF;
 INSERT INTO public.customer_order_creation_keys(user_id,idempotency_key)
 VALUES(p_user,(p_input->>'idempotency_key')::uuid) ON CONFLICT DO NOTHING;
 SELECT internal_key INTO STRICT k FROM public.customer_order_creation_keys
 WHERE user_id=p_user AND idempotency_key=(p_input->>'idempotency_key')::uuid FOR UPDATE;
 result := public.create_pending_order_secure(jsonb_set(p_input,'{idempotency_key}',to_jsonb(k::text)),p_max_quantity);
 IF (result->>'replayed')::boolean IS FALSE THEN
  bound_at := clock_timestamp();
  INSERT INTO public.order_customer_access(order_id,user_id,expires_at,payment_expires_at)
  VALUES((result->>'order_id')::uuid,p_user,bound_at+make_interval(secs=>p_access_ttl),bound_at+make_interval(secs=>p_payment_ttl));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.order_customer_access WHERE order_id=(result->>'order_id')::uuid AND user_id=p_user) THEN
 RAISE EXCEPTION USING ERRCODE='CP001',MESSAGE='ownership_conflict'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.create_customer_pending_order_secure(uuid,jsonb,integer,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_customer_pending_order_secure(uuid,jsonb,integer,integer,integer) TO service_role;


-- All lock-dependent operations require READ COMMITTED. Advisory hash collisions
-- only serialize unrelated work; they cannot merge business identities.
CREATE FUNCTION public.ncba_lock_identity(p_kind text,p_scope text,p_identity text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION USING ERRCODE='CP005',MESSAGE='read_committed_required'; END IF;
 IF p_kind IS NULL OR p_scope IS NULL OR p_identity IS NULL OR btrim(p_scope)='' OR btrim(p_identity)='' THEN
  RAISE EXCEPTION USING ERRCODE='CP002',MESSAGE='invalid_lock_identity'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array('ncba','sandbox',p_kind,p_scope,p_identity)::text,0));
END $$;

CREATE FUNCTION public.claim_ncba_attempt(p_order uuid,p_user uuid,p_key text,p_scope text,p_account text,p_paybill text,p_allow_new boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE; a public.payment_attempts%ROWTYPE;
 access_row public.order_customer_access%ROWTYPE; fp bytea; conflict_constraint text;
BEGIN
 IF p_key IS NULL OR p_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR p_scope IS NULL OR btrim(p_scope)='' OR p_account IS NULL OR btrim(p_account)='' OR p_paybill IS DISTINCT FROM '880100' THEN
  RAISE EXCEPTION USING ERRCODE='CP002',MESSAGE='invalid_attempt_input'; END IF;
 p_key := lower(p_key);
 -- Lock key BEFORE order: different orders sharing a key serialize as well.
 PERFORM public.ncba_lock_identity('attempt-key',p_scope,p_key);
 SELECT * INTO o FROM public.orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='CP001',MESSAGE='access_denied'; END IF;
 SELECT * INTO access_row FROM public.order_customer_access WHERE order_id=p_order FOR SHARE;
 IF NOT FOUND OR access_row.user_id IS DISTINCT FROM p_user OR access_row.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION USING ERRCODE='CP001',MESSAGE='access_denied'; END IF;
 fp := sha256(convert_to(jsonb_build_array(p_order,o.total_amount,'KES',o.customer_phone,p_scope,p_account,p_paybill,o.quantity,o.unit_price,o.ticket_id)::text,'UTF8'));
 SELECT * INTO a FROM public.payment_attempts WHERE provider='ncba' AND environment='sandbox'
 AND merchant_scope=p_scope AND idempotency_key=p_key FOR UPDATE;
 IF FOUND THEN
  IF a.order_id IS DISTINCT FROM p_order OR a.request_fingerprint IS DISTINCT FROM fp THEN
   RAISE EXCEPTION USING ERRCODE='CP002',MESSAGE='idempotency_conflict'; END IF;
  -- Authorized replay precedes NEW-charge eligibility and network checks.
  RETURN jsonb_build_object('id',a.id,'status',a.status,'claimed',false);
 END IF;
 IF p_allow_new IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='CP004',MESSAGE='ncba_disabled'; END IF;
 IF (access_row.payment_expires_at>clock_timestamp() AND o.payment_status='pending'
 AND o.total_amount>0 AND o.total_amount<=2147483647 AND o.quantity BETWEEN 1 AND 100
 AND o.unit_price>0 AND o.unit_price::numeric*o.quantity::numeric=o.total_amount::numeric
 AND o.customer_phone ~ '^254[17][0-9]{8}$') IS DISTINCT FROM true THEN
  RAISE EXCEPTION USING ERRCODE='CP002',MESSAGE='ineligible'; END IF;
 IF EXISTS(SELECT 1 FROM public.payment_attempts WHERE order_id=p_order AND status IN ('created','submitted','pending','unknown','succeeded')) THEN
  RAISE EXCEPTION USING ERRCODE='CP002',MESSAGE='attempt_in_progress'; END IF;
 BEGIN
  INSERT INTO public.payment_attempts(order_id,provider,environment,merchant_scope,idempotency_key,request_fingerprint,expected_amount,currency,status,provider_identifiers)
  VALUES(p_order,'ncba','sandbox',p_scope,p_key,fp,o.total_amount,'KES','submitted',jsonb_build_object('AccountNo',p_account,'PayBillNo',p_paybill,'Quantity',o.quantity,'UnitPrice',o.unit_price::text,'TicketCategory',o.ticket_id::text)) RETURNING * INTO a;
 EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS conflict_constraint=CONSTRAINT_NAME;
  IF conflict_constraint='payment_attempts_idempotency_unique' THEN
   RAISE EXCEPTION USING ERRCODE='CP002',MESSAGE='idempotency_conflict'; ELSE RAISE; END IF;
 END;
 INSERT INTO public.payment_audit_events(order_id,attempt_id,action,actor_type) VALUES(p_order,a.id,'stk_claimed','system');
 RETURN jsonb_build_object('id',a.id,'status',a.status,'claimed',true,'phone',o.customer_phone,'amount',o.total_amount::text);
END $$;

CREATE FUNCTION public.record_ncba_submission(p_attempt uuid,p_status text,p_identifiers jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.payment_attempts%ROWTYPE;
BEGIN
 SELECT * INTO a FROM public.payment_attempts WHERE id=p_attempt FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='CP002',MESSAGE='attempt_missing'; END IF;
 IF (a.provider='ncba' AND a.environment='sandbox' AND p_status IN ('pending','failed','unknown')
 AND jsonb_typeof(p_identifiers)='object') IS DISTINCT FROM true THEN
  RAISE EXCEPTION USING ERRCODE='CP002',MESSAGE='invalid_transition'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_identifiers) k WHERE k NOT IN ('TransactionID','ReferenceID')) THEN
  RAISE EXCEPTION USING ERRCODE='CP002',MESSAGE='unexpected_identifiers'; END IF;
 IF p_status='pending' AND (jsonb_typeof(p_identifiers->'TransactionID')='string'
 AND length(p_identifiers->>'TransactionID') BETWEEN 1 AND 256
 AND jsonb_typeof(p_identifiers->'ReferenceID')='string'
 AND length(p_identifiers->>'ReferenceID') BETWEEN 1 AND 256) IS DISTINCT FROM true THEN
  RAISE EXCEPTION USING ERRCODE='CP002',MESSAGE='missing_identifiers'; END IF;
 IF a.status='submitted' THEN
  UPDATE public.payment_attempts SET status=p_status,provider_identifiers=provider_identifiers||p_identifiers,updated_at=clock_timestamp() WHERE id=a.id;
 ELSIF a.status NOT IN ('succeeded','cancelled') AND (a.status IS DISTINCT FROM p_status
 OR (p_identifiers<>'{}' AND (a.provider_identifiers->'TransactionID' IS DISTINCT FROM p_identifiers->'TransactionID' OR a.provider_identifiers->'ReferenceID' IS DISTINCT FROM p_identifiers->'ReferenceID'))) THEN
  RAISE EXCEPTION USING ERRCODE='CP002',MESSAGE='submission_conflict';
 END IF;
 RETURN jsonb_build_object('stored',true);
END $$;

CREATE FUNCTION public.ingest_ncba_notification(p_scope text,p_key text,p_digest text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e public.payment_events%ROWTYPE;
BEGIN
 IF (p_digest ~ '^[0-9a-f]{64}$' AND p_key ~ '^[A-Za-z0-9]{1,128}$'
 AND p_payload->>'TransID'=p_key AND jsonb_typeof(p_payload)='object'
 AND p_payload ?& ARRAY['TransType','TransID','TransTime','TransAmount','BusinessShortCode','BillRefNumber','Mobile','name']) IS DISTINCT FROM true THEN
  RAISE EXCEPTION USING ERRCODE='CP002',MESSAGE='invalid_evidence'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_payload) x WHERE x.key NOT IN ('TransType','TransID','TransTime','TransAmount','BusinessShortCode','BillRefNumber','Mobile','name') OR jsonb_typeof(x.value)<>'string') THEN
  RAISE EXCEPTION USING ERRCODE='CP002',MESSAGE='unexpected_evidence_fields'; END IF;
 IF (p_payload->>'TransType'='Pay Bill' AND p_payload->>'BusinessShortCode'='880100'
 AND length(p_payload->>'BillRefNumber')>0 AND p_payload->>'TransTime' ~ '^[0-9]{14}$'
 AND p_payload->>'TransAmount' ~ '^[0-9]{1,10}(\.[0-9]{1,2})?$') IS DISTINCT FROM true THEN
  RAISE EXCEPTION USING ERRCODE='CP002',MESSAGE='invalid_notification_profile'; END IF;
 IF (p_payload->>'TransAmount')::numeric<=0 THEN RAISE EXCEPTION USING ERRCODE='CP002',MESSAGE='invalid_amount'; END IF;
 -- Common protocol: receipt identity lock BEFORE event/evidence/order locks.
 PERFORM public.ncba_lock_identity('receipt',p_scope,p_key);
 INSERT INTO public.payment_events(provider,environment,merchant_scope,source,deduplication_key,payload_digest,payload,status,error_code)
 VALUES('ncba','sandbox',p_scope,'merchant-notification',p_key,decode(p_digest,'hex'),p_payload,'unmatched','ncba_correlation_contract_missing')
 ON CONFLICT(provider,environment,merchant_scope,source,deduplication_key) DO NOTHING;
 SELECT * INTO STRICT e FROM public.payment_events WHERE provider='ncba' AND environment='sandbox' AND merchant_scope=p_scope AND source='merchant-notification' AND deduplication_key=p_key FOR UPDATE;
 IF e.payload_digest IS DISTINCT FROM decode(p_digest,'hex') OR e.payload IS DISTINCT FROM p_payload THEN
  INSERT INTO public.payment_events(provider,environment,merchant_scope,source,deduplication_key,payload_digest,payload,status,error_code)
  VALUES('ncba','sandbox',p_scope,'merchant-notification-conflict',p_key||':'||p_digest,decode(p_digest,'hex'),p_payload,'failed','notification_key_conflict')
  ON CONFLICT(provider,environment,merchant_scope,source,deduplication_key) DO NOTHING;
  -- Never regress Paid or revoke admissions using an invented bank rule.
  UPDATE public.payment_events SET error_code=CASE WHEN status='processed' THEN 'late_notification_conflict' ELSE 'notification_key_conflict' END WHERE id=e.id;
  RETURN jsonb_build_object('conflict',true);
 END IF;
 RETURN jsonb_build_object('event_id',e.id,'status',e.status);
END $$;
CREATE INDEX ncba_conflict_receipt_idx ON public.payment_events(merchant_scope,(payload->>'TransID'))
 WHERE provider='ncba' AND environment='sandbox' AND source='merchant-notification-conflict';

CREATE FUNCTION public.customer_payment_status(p_order uuid,p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.order_customer_access WHERE order_id=p_order AND user_id=p_user AND expires_at>clock_timestamp()) THEN
  RAISE EXCEPTION USING ERRCODE='CP001',MESSAGE='access_denied'; END IF;
 SELECT jsonb_build_object('order_id',id,'payment_status',payment_status,'attempt_status',
 (SELECT status FROM public.payment_attempts WHERE order_id=p_order ORDER BY created_at DESC,id DESC LIMIT 1),'tickets_issued',
 (SELECT count(*) FROM public.issued_tickets WHERE order_id=p_order)) INTO STRICT result FROM public.orders WHERE id=p_order;
 RETURN result;
END $$;

CREATE FUNCTION public.finalize_ncba_payment(p_evidence uuid,p_hashes jsonb,p_claim uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.ncba_verification_evidence%ROWTYPE; o public.orders%ROWTYPE;
 a public.payment_attempts%ROWTYPE; e public.payment_events%ROWTYPE; r public.payment_receipts%ROWTYPE; i integer; ticket uuid;
BEGIN
 -- Evidence financial fields are immutable to the application role.
 SELECT * INTO v FROM public.ncba_verification_evidence WHERE id=p_evidence;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='CP003',MESSAGE='evidence_missing'; END IF;
 PERFORM public.ncba_lock_identity('receipt',v.merchant_scope,v.provider_reference);
 SELECT * INTO STRICT v FROM public.ncba_verification_evidence WHERE id=p_evidence FOR UPDATE;
 SELECT * INTO STRICT o FROM public.orders WHERE id=v.order_id FOR UPDATE;
 SELECT * INTO STRICT a FROM public.payment_attempts WHERE id=v.attempt_id FOR UPDATE;
 SELECT * INTO STRICT e FROM public.payment_events WHERE id=v.event_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.payment_events WHERE provider='ncba' AND environment='sandbox'
 AND merchant_scope=v.merchant_scope AND source='merchant-notification-conflict' AND payload->>'TransID'=v.provider_reference)
 OR e.error_code IN ('notification_key_conflict','late_notification_conflict') THEN
  RAISE EXCEPTION USING ERRCODE='CP003',MESSAGE='notification_conflict'; END IF;
 IF (jsonb_typeof(e.payload->'TransAmount')='string' AND e.payload->>'TransAmount' ~ '^[0-9]{1,10}(\.[0-9]{1,2})?$') IS DISTINCT FROM true THEN
  RAISE EXCEPTION USING ERRCODE='CP003',MESSAGE='invalid_financial_evidence'; END IF;
 IF (a.order_id=o.id AND a.provider='ncba' AND a.environment='sandbox'
 AND a.status IN ('submitted','pending','unknown','failed','succeeded')
 AND e.provider=a.provider AND e.environment=a.environment
 AND a.merchant_scope=v.merchant_scope AND e.merchant_scope=v.merchant_scope
 AND e.source='merchant-notification' AND e.deduplication_key=v.provider_reference
 AND e.payload->>'TransID'=v.provider_reference AND e.payload->>'TransType'='Pay Bill'
 AND e.payload->>'BusinessShortCode'='880100'
 AND a.provider_identifiers->>'PayBillNo'='880100'
 AND jsonb_typeof(a.provider_identifiers->'AccountNo')='string'
 AND length(a.provider_identifiers->>'AccountNo')>0
 AND e.payload->>'BillRefNumber'=a.provider_identifiers->>'AccountNo'
 AND (e.payload->>'TransAmount')::numeric=v.amount AND v.amount=o.total_amount AND a.expected_amount=v.amount
 AND v.amount>0 AND o.total_amount<=2147483647 AND o.quantity BETWEEN 1 AND 100
 AND o.unit_price>0 AND o.unit_price::numeric*o.quantity::numeric=o.total_amount::numeric
 AND a.provider_identifiers->'Quantity'=to_jsonb(o.quantity)
 AND a.provider_identifiers->>'UnitPrice'=o.unit_price::text
 AND a.provider_identifiers->>'TicketCategory'=o.ticket_id::text
 AND v.currency='KES' AND a.currency=v.currency AND v.verified_at<=clock_timestamp()
 AND v.event_payload_digest=e.payload_digest AND v.attempt_request_fingerprint=a.request_fingerprint
 AND (e.order_id IS NULL OR e.order_id=o.id) AND (e.attempt_id IS NULL OR e.attempt_id=a.id)) IS DISTINCT FROM true THEN
  RAISE EXCEPTION USING ERRCODE='CP003',MESSAGE='verification_mismatch'; END IF;

 IF v.finalized_at IS NOT NULL THEN
  SELECT * INTO r FROM public.payment_receipts WHERE id=e.receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='CP003',MESSAGE='receipt_missing_on_replay'; END IF;
 ELSE
  IF (v.processing_status='processing' AND v.claim_token=p_claim AND v.claim_expires_at>clock_timestamp()
  AND o.payment_status='pending' AND a.status<>'succeeded'
  AND e.status IN ('unmatched','received','processing') AND e.processed_at IS NULL) IS DISTINCT FROM true THEN
   RAISE EXCEPTION USING ERRCODE='CP003',MESSAGE='finalization_not_eligible'; END IF;
  IF jsonb_typeof(p_hashes) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='CP003',MESSAGE='invalid_ticket_hashes'; END IF;
  IF jsonb_array_length(p_hashes) IS DISTINCT FROM o.quantity::integer THEN RAISE EXCEPTION USING ERRCODE='CP003',MESSAGE='invalid_ticket_count'; END IF;
  -- Reuse an already verified unallocated receipt ONLY if every evidence field
  -- matches. Unique arbitration also protects other orders competing for it.
  INSERT INTO public.payment_receipts(provider,environment,merchant_scope,provider_reference,reference_deduplication_key,reference_key_rule,amount,currency,verification_source,evidence_metadata,verified_at)
  VALUES('ncba','sandbox',v.merchant_scope,v.provider_reference,v.reference_deduplication_key,v.reference_key_rule,v.amount,v.currency,v.contract_rule,v.evidence_metadata,v.verified_at)
  ON CONFLICT(provider,environment,merchant_scope,reference_deduplication_key) DO NOTHING;
  SELECT * INTO STRICT r FROM public.payment_receipts WHERE provider='ncba' AND environment='sandbox'
  AND merchant_scope=v.merchant_scope AND reference_deduplication_key=v.reference_deduplication_key FOR UPDATE;
 END IF;
 IF (r.provider='ncba' AND r.environment='sandbox' AND r.merchant_scope=v.merchant_scope
 AND r.provider_reference=v.provider_reference AND r.reference_deduplication_key=v.reference_deduplication_key
 AND r.reference_key_rule=v.reference_key_rule AND r.amount=v.amount AND r.currency=v.currency
 AND r.verification_source=v.contract_rule AND r.evidence_metadata=v.evidence_metadata AND r.verified_at=v.verified_at
 AND (r.order_id IS NULL OR r.order_id=o.id) AND (e.receipt_id IS NULL OR e.receipt_id=r.id)) IS DISTINCT FROM true THEN
  RAISE EXCEPTION USING ERRCODE='CP003',MESSAGE='receipt_evidence_conflict'; END IF;

 IF v.finalized_at IS NOT NULL THEN
  PERFORM 1 FROM public.issued_tickets WHERE order_id=o.id FOR SHARE;
  PERFORM 1 FROM public.delivery_outbox WHERE order_id=o.id FOR SHARE;
  IF (v.processing_status='completed' AND o.payment_status='Paid' AND a.status='succeeded'
  AND e.status='processed' AND e.processed_at IS NOT NULL AND e.order_id=o.id AND e.attempt_id=a.id AND e.receipt_id=r.id
  AND r.order_id=o.id AND r.allocated_at IS NOT NULL
  AND (SELECT count(*) FROM public.issued_tickets WHERE order_id=o.id)=o.quantity
  AND NOT EXISTS(SELECT 1 FROM generate_series(1,o.quantity::integer) n WHERE NOT EXISTS(
    SELECT 1 FROM public.issued_tickets t WHERE t.order_id=o.id AND t.ticket_ordinal=n))
  AND (SELECT count(*) FROM public.delivery_outbox WHERE order_id=o.id AND channel='customer-portal')=o.quantity
  AND NOT EXISTS(SELECT 1 FROM public.issued_tickets t WHERE t.order_id=o.id AND NOT EXISTS(
    SELECT 1 FROM public.delivery_outbox d WHERE d.order_id=o.id AND d.issued_ticket_id=t.id AND d.channel='customer-portal' AND d.deduplication_key='ticket-issued:'||t.id::text))
  AND (SELECT count(*) FROM public.payment_audit_events WHERE order_id=o.id AND attempt_id=a.id AND receipt_id=r.id AND event_id=e.id AND action='verified_payment_and_ticket_issuance' AND actor_type='system')=1) IS DISTINCT FROM true THEN
   RAISE EXCEPTION USING ERRCODE='CP003',MESSAGE='committed_state_inconsistent'; END IF;
  RETURN jsonb_build_object('paid',true,'replayed',true);
 END IF;
 IF EXISTS(SELECT 1 FROM public.issued_tickets WHERE order_id=o.id)
 OR EXISTS(SELECT 1 FROM public.delivery_outbox WHERE order_id=o.id AND channel='customer-portal')
 OR EXISTS(SELECT 1 FROM public.payment_receipts WHERE order_id=o.id AND id<>r.id) THEN
  RAISE EXCEPTION USING ERRCODE='CP003',MESSAGE='preexisting_allocation_conflict'; END IF;
 UPDATE public.payment_receipts SET order_id=o.id,allocated_at=coalesce(allocated_at,clock_timestamp()) WHERE id=r.id;
 FOR i IN 1..o.quantity LOOP
  IF (jsonb_typeof(p_hashes->(i-1))='string' AND p_hashes->>(i-1) ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true THEN
   RAISE EXCEPTION USING ERRCODE='CP003',MESSAGE='invalid_ticket_hash'; END IF;
  INSERT INTO public.issued_tickets(order_id,ticket_ordinal,token_hash) VALUES(o.id,i,decode(p_hashes->>(i-1),'hex')) RETURNING id INTO ticket;
  INSERT INTO public.delivery_outbox(order_id,issued_ticket_id,channel,deduplication_key) VALUES(o.id,ticket,'customer-portal','ticket-issued:'||ticket::text);
 END LOOP;
 UPDATE public.orders SET payment_status='Paid' WHERE id=o.id;
 UPDATE public.payment_attempts SET status='succeeded',updated_at=clock_timestamp() WHERE id=a.id;
 UPDATE public.payment_events SET status='processed',order_id=o.id,attempt_id=a.id,receipt_id=r.id,processed_at=clock_timestamp(),error_code=NULL WHERE id=e.id;
 UPDATE public.ncba_verification_evidence SET finalized_at=clock_timestamp(),processing_status='completed',claim_token=NULL,claim_expires_at=NULL,error_code=NULL WHERE id=v.id;
 INSERT INTO public.payment_audit_events(order_id,attempt_id,receipt_id,event_id,action,actor_type) VALUES(o.id,a.id,r.id,e.id,'verified_payment_and_ticket_issuance','system');
 RETURN jsonb_build_object('paid',true,'replayed',false);
END $$;

CREATE FUNCTION public.ncba_finalization_quantity(p_evidence uuid)
RETURNS integer LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT o.quantity::integer FROM public.orders o JOIN public.ncba_verification_evidence v ON v.order_id=o.id WHERE v.id=p_evidence;
$$;

CREATE FUNCTION public.retrieve_customer_ticket(p_order uuid,p_user uuid,p_ticket uuid,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE; t public.issued_tickets%ROWTYPE; ownership public.order_customer_access%ROWTYPE;
BEGIN
 SELECT * INTO STRICT o FROM public.orders WHERE id=p_order FOR UPDATE;
 SELECT * INTO ownership FROM public.order_customer_access WHERE order_id=p_order FOR SHARE;
 IF NOT FOUND OR ownership.user_id IS DISTINCT FROM p_user OR ownership.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION USING ERRCODE='CP001',MESSAGE='access_denied'; END IF;
 IF o.payment_status IS DISTINCT FROM 'Paid' OR NOT EXISTS(SELECT 1 FROM public.payment_receipts WHERE order_id=p_order) THEN
  RAISE EXCEPTION USING ERRCODE='CP003',MESSAGE='payment_required'; END IF;
 SELECT * INTO t FROM public.issued_tickets WHERE id=p_ticket AND order_id=p_order FOR UPDATE;
 IF NOT FOUND OR t.redeemed_at IS NOT NULL OR t.revoked_at IS NOT NULL OR p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION USING ERRCODE='CP002',MESSAGE='ticket_unavailable'; END IF;
 UPDATE public.issued_tickets SET token_hash=decode(p_hash,'hex'),credential_version=credential_version+1 WHERE id=t.id;
 INSERT INTO public.payment_audit_events(order_id,issued_ticket_id,action,actor_type) VALUES(p_order,t.id,'customer_ticket_credential_rotated','system');
 RETURN jsonb_build_object('ticket_id',t.id,'credential_version',t.credential_version+1);
END $$;

CREATE FUNCTION public.list_customer_tickets(p_order uuid,p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.order_customer_access WHERE order_id=p_order AND user_id=p_user AND expires_at>clock_timestamp()) THEN
  RAISE EXCEPTION USING ERRCODE='CP001',MESSAGE='access_denied'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('ticket_id',t.id,'ordinal',t.ticket_ordinal,'redeemed',t.redeemed_at IS NOT NULL,'revoked',t.revoked_at IS NOT NULL)),'[]') FROM public.issued_tickets t JOIN public.orders o ON o.id=t.order_id WHERE t.order_id=p_order AND o.payment_status='Paid' AND EXISTS(SELECT 1 FROM public.payment_receipts WHERE order_id=p_order));
END $$;

-- Query jobs are independent of charge attempts. No automatically expiring
-- dispatch lease: a crashed/uncertain dispatched query is quarantined, never
-- re-dispatched by another worker. Expired PRE-dispatch claims can be reclaimed.
CREATE TABLE public.ncba_query_jobs (
 attempt_id uuid PRIMARY KEY REFERENCES public.payment_attempts(id),
 merchant_scope text NOT NULL CHECK(btrim(merchant_scope)<>''),
 transaction_id text NOT NULL CHECK(length(transaction_id) BETWEEN 1 AND 256),
 status text NOT NULL CHECK(status IN ('claimed','dispatched','complete','unknown')),
 claim_token uuid NOT NULL, claimed_at timestamptz NOT NULL,
 next_attempt_at timestamptz NOT NULL, error_code text,
 UNIQUE(merchant_scope,transaction_id)
);
ALTER TABLE public.ncba_query_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ncba_query_jobs FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.ncba_query_jobs TO service_role;
CREATE INDEX ncba_evidence_queue_idx ON public.ncba_verification_evidence(processing_status,claim_expires_at,verified_at) WHERE finalized_at IS NULL;

CREATE FUNCTION public.ncba_reconciliation_queue()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION USING ERRCODE='CP005',MESSAGE='read_committed_required'; END IF;
 WITH exhausted AS (
  SELECT id FROM public.ncba_verification_evidence
  WHERE finalized_at IS NULL AND processing_status='processing' AND claim_expires_at<=clock_timestamp() AND processing_attempts>=5
  ORDER BY id LIMIT 25 FOR UPDATE SKIP LOCKED
 ) UPDATE public.ncba_verification_evidence v SET processing_status='blocked',claim_token=NULL,claim_expires_at=NULL,error_code='claim_exhausted'
 FROM exhausted WHERE v.id=exhausted.id;
 WITH picked AS (
  SELECT id FROM public.ncba_verification_evidence WHERE finalized_at IS NULL AND processing_attempts<5
  AND (processing_status='pending' OR (processing_status='processing' AND claim_expires_at<=clock_timestamp()))
  ORDER BY verified_at,id LIMIT 5 FOR UPDATE SKIP LOCKED
 ), claimed AS (
  UPDATE public.ncba_verification_evidence v SET processing_status='processing',processing_attempts=processing_attempts+1,
  claim_token=gen_random_uuid(),claim_expires_at=clock_timestamp()+interval '5 minutes',error_code=NULL
  FROM picked WHERE v.id=picked.id RETURNING v.id,v.order_id,v.claim_token
 ) SELECT coalesce(jsonb_agg(claimed),'[]') INTO result FROM claimed;
 RETURN jsonb_build_object('evidence',result);
END $$;

CREATE FUNCTION public.block_ncba_evidence(p_evidence uuid,p_claim uuid,p_error text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE changed integer;
BEGIN
 IF p_error IS NULL OR p_error NOT IN ('verification_rejected','worker_error','invalid_quantity') THEN RAISE EXCEPTION USING ERRCODE='CP002',MESSAGE='invalid_error_code'; END IF;
 UPDATE public.ncba_verification_evidence SET processing_status='blocked',claim_token=NULL,claim_expires_at=NULL,error_code=p_error
 WHERE id=p_evidence AND finalized_at IS NULL AND processing_status='processing' AND claim_token=p_claim;
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN jsonb_build_object('blocked',changed=1);
END $$;

CREATE FUNCTION public.claim_ncba_query_jobs()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION USING ERRCODE='CP005',MESSAGE='read_committed_required'; END IF;
 INSERT INTO public.ncba_query_jobs(attempt_id,merchant_scope,transaction_id,status,claim_token,claimed_at,next_attempt_at)
 SELECT id,merchant_scope,provider_identifiers->>'TransactionID','complete',gen_random_uuid(),clock_timestamp(),clock_timestamp() FROM public.payment_attempts a
 WHERE provider='ncba' AND environment='sandbox' AND status IN ('submitted','pending','unknown')
 AND updated_at<=clock_timestamp()-interval '2 minutes'
 AND jsonb_typeof(provider_identifiers->'TransactionID')='string' AND length(provider_identifiers->>'TransactionID') BETWEEN 1 AND 256
 AND NOT EXISTS(SELECT 1 FROM public.ncba_query_jobs j WHERE j.attempt_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM public.ncba_query_jobs j WHERE j.merchant_scope=a.merchant_scope AND j.transaction_id=a.provider_identifiers->>'TransactionID')
 ORDER BY updated_at,id LIMIT 25
 ON CONFLICT DO NOTHING;
 WITH picked AS (
  SELECT j.attempt_id FROM public.ncba_query_jobs j JOIN public.payment_attempts a ON a.id=j.attempt_id
  WHERE a.status IN ('submitted','pending','unknown') AND a.provider='ncba' AND a.environment='sandbox'
  AND ((j.status='complete' AND j.next_attempt_at<=clock_timestamp()) OR (j.status='claimed' AND j.claimed_at<=clock_timestamp()-interval '2 minutes'))
  ORDER BY j.next_attempt_at,j.attempt_id LIMIT 5 FOR UPDATE OF j SKIP LOCKED
 ), claimed AS (
  UPDATE public.ncba_query_jobs j SET status='claimed',claim_token=gen_random_uuid(),claimed_at=clock_timestamp(),error_code=NULL
  FROM picked WHERE j.attempt_id=picked.attempt_id RETURNING j.attempt_id,j.claim_token
 ) SELECT coalesce(jsonb_agg(claimed),'[]') INTO result FROM claimed;
 RETURN result;
END $$;

CREATE FUNCTION public.begin_ncba_query(p_attempt uuid,p_claim uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.ncba_query_jobs%ROWTYPE; a public.payment_attempts%ROWTYPE;
BEGIN
 SELECT * INTO j FROM public.ncba_query_jobs WHERE attempt_id=p_attempt FOR UPDATE;
 IF NOT FOUND OR j.status<>'claimed' OR j.claim_token IS DISTINCT FROM p_claim OR j.claimed_at<=clock_timestamp()-interval '2 minutes' THEN
  RETURN jsonb_build_object('allowed',false); END IF;
 SELECT * INTO STRICT a FROM public.payment_attempts WHERE id=p_attempt;
 IF (a.provider='ncba' AND a.environment='sandbox' AND a.status IN ('submitted','pending','unknown')
 AND a.merchant_scope=j.merchant_scope AND a.provider_identifiers->>'TransactionID'=j.transaction_id) IS DISTINCT FROM true THEN
  UPDATE public.ncba_query_jobs SET status='complete',next_attempt_at='infinity' WHERE attempt_id=p_attempt;
  RETURN jsonb_build_object('allowed',false); END IF;
 UPDATE public.ncba_query_jobs SET status='dispatched' WHERE attempt_id=p_attempt;
 RETURN jsonb_build_object('allowed',true,'transaction_id',j.transaction_id);
END $$;

CREATE FUNCTION public.record_ncba_query(p_attempt uuid,p_claim uuid,p_payload jsonb,p_digest text,p_unknown boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.payment_attempts%ROWTYPE; j public.ncba_query_jobs%ROWTYPE;
BEGIN
 SELECT * INTO j FROM public.ncba_query_jobs WHERE attempt_id=p_attempt FOR UPDATE;
 IF NOT FOUND OR j.status<>'dispatched' OR j.claim_token IS DISTINCT FROM p_claim THEN RETURN jsonb_build_object('stored',false); END IF;
 IF p_unknown IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION USING ERRCODE='CP002',MESSAGE='invalid_query_evidence'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_payload) x WHERE x.key NOT IN ('status','description') OR jsonb_typeof(x.value)<>'string' OR length(x.value#>>'{}')>256) THEN
  RAISE EXCEPTION USING ERRCODE='CP002',MESSAGE='invalid_query_evidence'; END IF;
 SELECT * INTO STRICT a FROM public.payment_attempts WHERE id=p_attempt;
 INSERT INTO public.payment_events(provider,environment,merchant_scope,source,deduplication_key,payload_digest,payload,attempt_id,order_id,status,error_code)
 VALUES('ncba','sandbox',a.merchant_scope,'stk-query',a.id::text||':'||p_digest,decode(p_digest,'hex'),p_payload,a.id,a.order_id,'ignored','query_not_financial_verification')
 ON CONFLICT(provider,environment,merchant_scope,source,deduplication_key) DO NOTHING;
 UPDATE public.ncba_query_jobs SET status=CASE WHEN p_unknown THEN 'unknown' ELSE 'complete' END,
 next_attempt_at=clock_timestamp()+interval '2 minutes',error_code=CASE WHEN p_unknown THEN 'query_outcome_unknown' ELSE NULL END WHERE attempt_id=p_attempt;
 RETURN jsonb_build_object('stored',true);
END $$;

-- Explicit signatures: default PUBLIC function grants are revoked atomically.
REVOKE ALL ON FUNCTION public.ncba_lock_identity(text,text,text),public.claim_ncba_attempt(uuid,uuid,text,text,text,text,boolean),public.record_ncba_submission(uuid,text,jsonb),public.ingest_ncba_notification(text,text,text,jsonb),public.customer_payment_status(uuid,uuid),public.finalize_ncba_payment(uuid,jsonb,uuid),public.retrieve_customer_ticket(uuid,uuid,uuid,text),public.list_customer_tickets(uuid,uuid),public.ncba_reconciliation_queue(),public.ncba_finalization_quantity(uuid),public.block_ncba_evidence(uuid,uuid,text),public.claim_ncba_query_jobs(),public.begin_ncba_query(uuid,uuid),public.record_ncba_query(uuid,uuid,jsonb,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ncba_lock_identity(text,text,text),public.claim_ncba_attempt(uuid,uuid,text,text,text,text,boolean),public.record_ncba_submission(uuid,text,jsonb),public.ingest_ncba_notification(text,text,text,jsonb),public.customer_payment_status(uuid,uuid),public.finalize_ncba_payment(uuid,jsonb,uuid),public.retrieve_customer_ticket(uuid,uuid,uuid,text),public.list_customer_tickets(uuid,uuid),public.ncba_reconciliation_queue(),public.ncba_finalization_quantity(uuid),public.block_ncba_evidence(uuid,uuid,text),public.claim_ncba_query_jobs(),public.begin_ncba_query(uuid,uuid),public.record_ncba_query(uuid,uuid,jsonb,text,boolean) TO service_role;
-- Direct REVOKEs cannot remove privileges inherited through other roles.
-- Abort the entire transaction if the effective grants are still unsafe.
DO $security_postflight$
DECLARE n text; r text; priv text; obj regclass; fn record;
BEGIN
 FOREACH n IN ARRAY ARRAY['order_customer_access','customer_order_creation_keys','ncba_verification_evidence','ncba_query_jobs'] LOOP
  obj := to_regclass('public.'||n);
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF pg_has_role(r,(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=obj),'MEMBER') THEN
    RAISE EXCEPTION 'Unsafe browser membership in NCBA table owner role: %',r;
   END IF;
   FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege(r,obj,priv) THEN
     RAISE EXCEPTION 'Inherited NCBA table privilege remains: % % %',r,n,priv;
    END IF;
   END LOOP;
   FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
    IF EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=obj AND a.attnum>0 AND NOT a.attisdropped
    AND has_column_privilege(r,obj,a.attnum,priv)) THEN
     RAISE EXCEPTION 'Inherited NCBA column privilege remains: % % %',r,n,priv;
    END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 FOR fn IN SELECT p.oid FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='public' AND p.proname=ANY(ARRAY[
 'create_customer_pending_order_secure','ncba_lock_identity','claim_ncba_attempt',
 'record_ncba_submission','ingest_ncba_notification','customer_payment_status',
 'finalize_ncba_payment','ncba_finalization_quantity','retrieve_customer_ticket',
 'list_customer_tickets','ncba_reconciliation_queue','block_ncba_evidence',
 'claim_ncba_query_jobs','begin_ncba_query','record_ncba_query']) LOOP
  IF has_function_privilege('anon',fn.oid,'EXECUTE') OR has_function_privilege('authenticated',fn.oid,'EXECUTE') THEN
   RAISE EXCEPTION 'Inherited NCBA RPC execution remains: %',fn.oid::regprocedure;
  END IF;
 END LOOP;
END;
$security_postflight$;
COMMIT;
