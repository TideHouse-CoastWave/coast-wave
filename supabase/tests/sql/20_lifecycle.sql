-- psql -v ticket_id=<approved active synthetic category UUID> -f ...
-- Requires revised migration; no bank calls. All fixtures roll back.
\set ON_ERROR_STOP on
\if :{?ticket_id}
\else
 \echo 'ticket_id must identify an approved staging-only active category'
 \quit 3
\endif
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
\ir helpers.sql
SET LOCAL ROLE service_role;
DO $$
DECLARE f jsonb; g jsonb; h jsonb; result jsonb; before_payload jsonb; bad jsonb;
 category uuid; actor uuid:=gen_random_uuid(); k uuid:=gen_random_uuid(); replay jsonb; expiry timestamptz;
 t uuid; r uuid; c text; old_key text; old_amount numeric; old_ordinal integer;
BEGIN
 IF EXISTS(SELECT 1 FROM public.ncba_query_jobs) OR EXISTS(SELECT 1 FROM public.ncba_verification_evidence) THEN RAISE EXCEPTION 'Use a clean disposable clone for synthetic lifecycle tests'; END IF;
 SELECT ticket_id INTO STRICT category FROM pg_temp.ncba_test_context;
 result:=pg_temp.order_fixture(category,actor,k);
 SELECT expires_at INTO expiry FROM public.order_customer_access WHERE order_id=(result->>'order_id')::uuid;
 replay:=pg_temp.order_fixture(category,actor,k);
 PERFORM pg_temp.assert_true(result->>'order_id'=replay->>'order_id','same customer key creates one order');
 PERFORM pg_temp.assert_true((SELECT expires_at=expiry FROM public.order_customer_access WHERE order_id=(result->>'order_id')::uuid),'replay never extends access');
 PERFORM pg_temp.expect_state(format('SELECT public.create_customer_pending_order_secure(%L::uuid,%L::jsonb,2,86400,900)',actor,
 jsonb_build_object('customer_name','Different Buyer','customer_email','ncba-sql@example.test','customer_phone','254712345678','ticket_id',category::text,'quantity',2,'idempotency_key',k::text)),'CW001');
 f:=pg_temp.fixture('SQLRECEIPT01');
 UPDATE public.order_customer_access SET payment_expires_at=clock_timestamp()-interval '1 second' WHERE order_id=(f->>'order_id')::uuid;
 result:=public.claim_ncba_attempt((f->>'order_id')::uuid,(f->>'actor')::uuid,f->>'attempt_key','NCBA_SQL_SERIAL','SQLALIAS','880100',false);
 PERFORM pg_temp.assert_true(result->>'claimed'='false' AND result->>'id'=f->>'attempt_id','expired-window replay returns original, even with network disabled');
 PERFORM pg_temp.expect_state(format('SELECT public.claim_ncba_attempt(%L::uuid,%L::uuid,%L,%L,%L,%L,true)',f->>'order_id',f->>'actor',gen_random_uuid()::text,'NCBA_SQL_SERIAL','SQLALIAS','880100'),'CP002');
 PERFORM pg_temp.expect_state(format('SELECT public.customer_payment_status(%L::uuid,%L::uuid)',f->>'order_id',gen_random_uuid()),'CP001');
 PERFORM pg_temp.expect_state(format('SELECT public.list_customer_tickets(%L::uuid,%L::uuid)',f->>'order_id',gen_random_uuid()),'CP001');
 PERFORM pg_temp.expect_state(format('SELECT public.retrieve_customer_ticket(%L::uuid,%L::uuid,%L::uuid,%L)',f->>'order_id',gen_random_uuid(),gen_random_uuid(),repeat('a',64)),'CP001');
 result:=public.ingest_ncba_notification('NCBA_SQL_SERIAL','SQLRECEIPT01',f->>'digest',f->'payload');
 PERFORM pg_temp.assert_true(result->>'event_id'=f->>'event_id','identical notification event ID');
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.payment_events WHERE merchant_scope='NCBA_SQL_SERIAL' AND source='merchant-notification' AND deduplication_key='SQLRECEIPT01'),'duplicate notification count');
 -- Force a failure AFTER receipt + first ticket + outbox insert, then inspect rollback.
 PERFORM pg_temp.expect_state(format('SELECT public.finalize_ncba_payment(%L::uuid,%L::jsonb,%L::uuid)',f->>'evidence_id',jsonb_build_array(repeat('a',64),repeat('a',64)),f->>'claim'),'23505');
 PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.payment_receipts WHERE provider_reference='SQLRECEIPT01'),'receipt rollback');
 PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.issued_tickets WHERE order_id=(f->>'order_id')::uuid),'tickets rollback');
 PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.delivery_outbox WHERE order_id=(f->>'order_id')::uuid),'outbox rollback');
 PERFORM pg_temp.assert_true((SELECT payment_status='pending' FROM public.orders WHERE id=(f->>'order_id')::uuid),'order rollback');
 PERFORM pg_temp.assert_true((SELECT status='submitted' FROM public.payment_attempts WHERE id=(f->>'attempt_id')::uuid),'attempt rollback');
 PERFORM pg_temp.assert_true((SELECT status='unmatched' AND processed_at IS NULL FROM public.payment_events WHERE id=(f->>'event_id')::uuid),'event rollback');
 PERFORM pg_temp.assert_true((SELECT finalized_at IS NULL FROM public.ncba_verification_evidence WHERE id=(f->>'evidence_id')::uuid),'evidence rollback');
 PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.payment_audit_events WHERE order_id=(f->>'order_id')::uuid AND action='verified_payment_and_ticket_issuance'),'audit rollback');
 result:=public.finalize_ncba_payment((f->>'evidence_id')::uuid,pg_temp.hashes(),(f->>'claim')::uuid);
 PERFORM pg_temp.assert_true(result->>'paid'='true' AND result->>'replayed'='false','verified fixture finalization');
 result:=public.finalize_ncba_payment((f->>'evidence_id')::uuid,'[]',(f->>'claim')::uuid);
 PERFORM pg_temp.assert_true(result->>'replayed'='true','committed finalization replay');
 PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM public.issued_tickets WHERE order_id=(f->>'order_id')::uuid),'exact admission count');
 PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM public.delivery_outbox WHERE order_id=(f->>'order_id')::uuid),'exact delivery count');
 result:=public.claim_ncba_attempt((f->>'order_id')::uuid,(f->>'actor')::uuid,f->>'attempt_key','NCBA_SQL_SERIAL','SQLALIAS','880100',false);
 PERFORM pg_temp.assert_true(result->>'status'='succeeded' AND result->>'claimed'='false','Paid order attempt replay');
 PERFORM public.record_ncba_submission((f->>'attempt_id')::uuid,'failed','{}');
 PERFORM pg_temp.assert_true((SELECT status='succeeded' FROM public.payment_attempts WHERE id=(f->>'attempt_id')::uuid),'late failure cannot regress success');
 SELECT id,amount INTO r,old_amount FROM public.payment_receipts WHERE order_id=(f->>'order_id')::uuid;
 PERFORM pg_temp.expect_state(format('INSERT INTO public.payment_receipts(provider,environment,merchant_scope,provider_reference,reference_deduplication_key,reference_key_rule,amount,currency,verification_source,verified_at) VALUES(%L,%L,%L,%L,%L,%L,1,%L,%L,clock_timestamp())','ncba','sandbox','NCBA_SQL_SERIAL','SQLRECEIPT01','SQLRECEIPT01','SYNTHETIC_SQL_ONLY','KES','SYNTHETIC_SQL_ONLY'),'23505');
 -- Replay must detect corruption without trying to repair or mint more tickets.
 UPDATE public.payment_receipts SET amount=amount+1 WHERE id=r;
 PERFORM pg_temp.expect_state(format('SELECT public.finalize_ncba_payment(%L::uuid,%L::jsonb,%L::uuid)',f->>'evidence_id','[]',f->>'claim'),'CP003');
 UPDATE public.payment_receipts SET amount=old_amount WHERE id=r;
 SELECT id,ticket_ordinal INTO t,old_ordinal FROM public.issued_tickets WHERE order_id=(f->>'order_id')::uuid ORDER BY ticket_ordinal LIMIT 1;
 UPDATE public.issued_tickets SET ticket_ordinal=99 WHERE id=t;
 PERFORM pg_temp.expect_state(format('SELECT public.finalize_ncba_payment(%L::uuid,%L::jsonb,%L::uuid)',f->>'evidence_id','[]',f->>'claim'),'CP003');
 UPDATE public.issued_tickets SET ticket_ordinal=old_ordinal WHERE id=t;
 SELECT deduplication_key INTO old_key FROM public.delivery_outbox WHERE issued_ticket_id=t;
 UPDATE public.delivery_outbox SET deduplication_key='corrupt:'||old_key WHERE issued_ticket_id=t;
 PERFORM pg_temp.expect_state(format('SELECT public.finalize_ncba_payment(%L::uuid,%L::jsonb,%L::uuid)',f->>'evidence_id','[]',f->>'claim'),'CP003');
 UPDATE public.delivery_outbox SET deduplication_key=old_key WHERE issued_ticket_id=t;
 PERFORM public.retrieve_customer_ticket((f->>'order_id')::uuid,(f->>'actor')::uuid,t,repeat('b',64));
 PERFORM pg_temp.assert_true((SELECT credential_version=2 FROM public.issued_tickets WHERE id=t),'QR rotation on same admission');
 PERFORM pg_temp.assert_true((public.finalize_ncba_payment((f->>'evidence_id')::uuid,'[]',(f->>'claim')::uuid)->>'replayed')='true','legitimate QR rotation preserves replay');
 UPDATE public.issued_tickets SET revoked_at=clock_timestamp() WHERE id=t;
 PERFORM pg_temp.expect_state(format('SELECT public.retrieve_customer_ticket(%L::uuid,%L::uuid,%L::uuid,%L)',f->>'order_id',f->>'actor',t,repeat('c',64)),'CP002');
 -- Null/mismatched amount, currency, merchant, receipt, event and attempt evidence.
 FOREACH c IN ARRAY ARRAY['amount','null_amount','currency','merchant','receipt','event','attempt','quantity','null_merchant'] LOOP
  g:=pg_temp.fixture('SQLBAD'||replace(upper(c),'_',''));
  IF c='amount' THEN UPDATE public.payment_events SET payload=jsonb_set(payload,'{TransAmount}','"1.00"') WHERE id=(g->>'event_id')::uuid;
  ELSIF c='null_amount' THEN UPDATE public.payment_events SET payload=jsonb_set(payload,'{TransAmount}','null') WHERE id=(g->>'event_id')::uuid;
  ELSIF c='currency' THEN UPDATE public.payment_attempts SET currency='USD' WHERE id=(g->>'attempt_id')::uuid;
  ELSIF c='merchant' THEN UPDATE public.payment_events SET payload=jsonb_set(payload,'{BillRefNumber}','"OTHER"') WHERE id=(g->>'event_id')::uuid;
  ELSIF c='receipt' THEN UPDATE public.payment_events SET receipt_id=r WHERE id=(g->>'event_id')::uuid;
  ELSIF c='event' THEN UPDATE public.payment_events SET payload_digest=decode(repeat('e',64),'hex') WHERE id=(g->>'event_id')::uuid;
  ELSIF c='quantity' THEN UPDATE public.orders SET quantity=1 WHERE id=(g->>'order_id')::uuid;
  ELSIF c='attempt' THEN UPDATE public.payment_attempts SET request_fingerprint=decode(repeat('f',64),'hex') WHERE id=(g->>'attempt_id')::uuid;
  ELSE UPDATE public.payment_attempts SET provider_identifiers=jsonb_set(provider_identifiers,'{AccountNo}','null') WHERE id=(g->>'attempt_id')::uuid;
  END IF;
  PERFORM pg_temp.expect_state(format('SELECT public.finalize_ncba_payment(%L::uuid,%L::jsonb,%L::uuid)',g->>'evidence_id',pg_temp.hashes(),g->>'claim'),'CP003');
  PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.issued_tickets WHERE order_id=(g->>'order_id')::uuid),'mismatched evidence never issues');
 END LOOP;
 -- Matching previously verified, unallocated receipt is allocated exactly once.
 g:=pg_temp.fixture('SQLUNALLOCATED01');
 INSERT INTO public.payment_receipts(provider,environment,merchant_scope,provider_reference,reference_deduplication_key,reference_key_rule,amount,currency,verification_source,evidence_metadata,verified_at)
 SELECT 'ncba','sandbox',merchant_scope,provider_reference,reference_deduplication_key,reference_key_rule,amount,currency,contract_rule,evidence_metadata,verified_at
 FROM public.ncba_verification_evidence WHERE id=(g->>'evidence_id')::uuid;
 PERFORM public.finalize_ncba_payment((g->>'evidence_id')::uuid,pg_temp.hashes(),(g->>'claim')::uuid);
 PERFORM pg_temp.assert_true((SELECT count(*)=1 AND bool_and(order_id=(g->>'order_id')::uuid) FROM public.payment_receipts WHERE provider_reference='SQLUNALLOCATED01'),'reuse matching unallocated verified receipt');
 g:=pg_temp.fixture('SQLCONFLICT01');
 bad:=jsonb_set(g->'payload','{TransAmount}','"1.00"');
 result:=public.ingest_ncba_notification('NCBA_SQL_SERIAL','SQLCONFLICT01',encode(sha256(convert_to(bad::text,'UTF8')),'hex'),bad);
 PERFORM pg_temp.assert_true(result->>'conflict'='true','changed notification quarantined');
 PERFORM pg_temp.expect_state(format('SELECT public.finalize_ncba_payment(%L::uuid,%L::jsonb,%L::uuid)',g->>'evidence_id',pg_temp.hashes(),g->>'claim'),'CP003');
 PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.issued_tickets WHERE order_id=(g->>'order_id')::uuid),'conflict blocks issuance');
 -- Canonical receipt cannot be allocated again using another event/order.
 h:=pg_temp.fixture('SQLREUSED01','SQLRECEIPT01');
 PERFORM pg_temp.expect_state(format('SELECT public.finalize_ncba_payment(%L::uuid,%L::jsonb,%L::uuid)',h->>'evidence_id',pg_temp.hashes(),h->>'claim'),'CP003');
 PERFORM pg_temp.expect_state(format('SELECT public.claim_ncba_attempt(%L::uuid,%L::uuid,%L,%L,%L,%L,true)',h->>'order_id',h->>'actor',f->>'attempt_key','NCBA_SQL_SERIAL','SQLALIAS','880100'),'CP002');
 -- Unknown dispatched queries are never auto-reclaimed; old fences cannot dispatch twice.
 UPDATE public.payment_attempts SET updated_at=clock_timestamp()-interval '3 minutes',provider_identifiers=provider_identifiers||'{"TransactionID":"SQLQUERY1","ReferenceID":"SQLREF1"}' WHERE id=(h->>'attempt_id')::uuid;
 result:=public.claim_ncba_query_jobs();
 SELECT jsonb_build_object('claim_token',claim_token) INTO bad FROM public.ncba_query_jobs WHERE attempt_id=(h->>'attempt_id')::uuid;
 PERFORM pg_temp.assert_true((public.begin_ncba_query((h->>'attempt_id')::uuid,(bad->>'claim_token')::uuid)->>'allowed')='true','query dispatch acquired');
 PERFORM pg_temp.assert_true((public.begin_ncba_query((h->>'attempt_id')::uuid,(bad->>'claim_token')::uuid)->>'allowed')='false','query dispatch single use');
 PERFORM public.record_ncba_query((h->>'attempt_id')::uuid,(bad->>'claim_token')::uuid,'{}',encode(sha256(convert_to('{}','UTF8')),'hex'),true);
 PERFORM public.claim_ncba_query_jobs();
 PERFORM pg_temp.assert_true((SELECT status='unknown' FROM public.ncba_query_jobs WHERE attempt_id=(h->>'attempt_id')::uuid),'uncertain query not redispatched');
 -- A pre-finalization conflict is blocked; a later conflict flags review but never silently revokes admission.
 bad:=jsonb_set(f->'payload','{TransAmount}','"1.00"');
 PERFORM public.ingest_ncba_notification('NCBA_SQL_SERIAL','SQLRECEIPT01',encode(sha256(convert_to(bad::text,'UTF8')),'hex'),bad);
 PERFORM pg_temp.expect_state(format('SELECT public.finalize_ncba_payment(%L::uuid,%L::jsonb,%L::uuid)',f->>'evidence_id','[]',f->>'claim'),'CP003');
 PERFORM pg_temp.assert_true((SELECT payment_status='Paid' FROM public.orders WHERE id=(f->>'order_id')::uuid),'late conflict retains committed financial state');
 RAISE NOTICE 'NCBA lifecycle assertions passed (synthetic bank evidence only)';
END $$;
RESET ROLE;
ROLLBACK;
