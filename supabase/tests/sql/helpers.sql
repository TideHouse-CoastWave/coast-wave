-- Included inside an already-open test transaction, before SET ROLE.
CREATE TEMP TABLE ncba_test_context(ticket_id uuid);
INSERT INTO ncba_test_context VALUES (:'ticket_id'::uuid);
GRANT SELECT ON ncba_test_context TO service_role;
CREATE FUNCTION pg_temp.assert_true(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.expect_state(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE=expected THEN RETURN; ELSE RAISE; END IF;
 END;
 RAISE EXCEPTION 'Expected SQLSTATE %, statement unexpectedly succeeded',expected;
END $$;
CREATE FUNCTION pg_temp.hashes() RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_array(encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'));
$$;
CREATE FUNCTION pg_temp.order_fixture(category uuid,actor uuid,request_key uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.create_customer_pending_order_secure(actor,jsonb_build_object(
 'customer_name','NCBA SQL Test','customer_email','ncba-sql@example.test','customer_phone','254712345678',
 'ticket_id',category::text,'quantity',2,'idempotency_key',request_key::text),2,86400,900);
$$;
CREATE FUNCTION pg_temp.fixture(ref text,dedup text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor uuid:=gen_random_uuid(); request_key uuid:=gen_random_uuid(); attempt_key uuid:=gen_random_uuid();
 o jsonb; a jsonb; e jsonb; payload jsonb; evidence uuid; token uuid:=gen_random_uuid(); category uuid; d text;
BEGIN
 SELECT ticket_id INTO STRICT category FROM pg_temp.ncba_test_context;
 o:=pg_temp.order_fixture(category,actor,request_key);
 a:=public.claim_ncba_attempt((o->>'order_id')::uuid,actor,attempt_key::text,'NCBA_SQL_SERIAL','SQLALIAS','880100',true);
 payload:=jsonb_build_object('TransType','Pay Bill','TransID',ref,'TransTime','20261020120000',
 'TransAmount',(o->>'total_amount')||'.00','BusinessShortCode','880100','BillRefNumber','SQLALIAS',
 'Mobile','254712345678','name','NCBA SQL Test');
 d:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
 e:=public.ingest_ncba_notification('NCBA_SQL_SERIAL',ref,d,payload);
 -- SYNTHETIC ATTESTATION ONLY. Never use this helper as a real bank verifier.
 INSERT INTO public.ncba_verification_evidence(event_id,attempt_id,order_id,provider_reference,
 reference_deduplication_key,reference_key_rule,amount,currency,merchant_scope,contract_rule,
 event_payload_digest,attempt_request_fingerprint,verified_at,processing_status,claim_token,claim_expires_at)
 SELECT (e->>'event_id')::uuid,(a->>'id')::uuid,(o->>'order_id')::uuid,ref,coalesce(dedup,ref),
 'SYNTHETIC_SQL_ONLY',(o->>'total_amount')::numeric,'KES','NCBA_SQL_SERIAL','SYNTHETIC_SQL_ONLY',
 decode(d,'hex'),pa.request_fingerprint,clock_timestamp(),'processing',token,clock_timestamp()+interval '5 minutes'
 FROM public.payment_attempts pa WHERE id=(a->>'id')::uuid RETURNING id INTO evidence;
 RETURN jsonb_build_object('order_id',o->>'order_id','actor',actor,'attempt_key',attempt_key,'request_key',request_key,
 'attempt_id',a->>'id','event_id',e->>'event_id','evidence_id',evidence,'claim',token,'payload',payload,'digest',d,'amount',o->>'total_amount');
END $$;
DO $$ BEGIN
 EXECUTE format('GRANT USAGE ON SCHEMA %I TO service_role,anon,authenticated',pg_my_temp_schema()::regnamespace::text);
 EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %I TO service_role,anon,authenticated',pg_my_temp_schema()::regnamespace::text);
END $$;

