-- After BOTH sessions complete for every scenario in the runbook.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
DO $$ DECLARE f jsonb; n text; order_id uuid;
BEGIN
 FOREACH n IN ARRAY ARRAY['retry','different_key','cross_a'] LOOP
  SELECT value INTO STRICT f FROM ncba_staging_test.context WHERE name=n;
  IF (SELECT count(*) FROM public.payment_attempts WHERE payment_attempts.order_id=(f->>'order_id')::uuid)<>1 THEN RAISE EXCEPTION 'Wrong attempt count: %',n; END IF;
 END LOOP;
 FOREACH n IN ARRAY ARRAY['cross_b','expiry'] LOOP
  SELECT value INTO STRICT f FROM ncba_staging_test.context WHERE name=n;
  IF EXISTS(SELECT 1 FROM public.payment_attempts WHERE payment_attempts.order_id=(f->>'order_id')::uuid) THEN RAISE EXCEPTION 'Unexpected charge claim: %',n; END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.payment_events WHERE source='merchant-notification' AND merchant_scope='NCBA_SQL_SERIAL' AND deduplication_key='SQLRACENEWNOTIFICATION')<>1 THEN RAISE EXCEPTION 'Duplicate notification'; END IF;
 FOREACH n IN ARRAY ARRAY['finalize','conflict_after','receipt_a'] LOOP
  SELECT value INTO STRICT f FROM ncba_staging_test.context WHERE name=n;
  IF (SELECT count(*) FROM public.issued_tickets WHERE issued_tickets.order_id=(f->>'order_id')::uuid)<>2
  OR (SELECT count(*) FROM public.delivery_outbox WHERE delivery_outbox.order_id=(f->>'order_id')::uuid)<>2
  OR (SELECT payment_status FROM public.orders WHERE id=(f->>'order_id')::uuid) IS DISTINCT FROM 'Paid' THEN RAISE EXCEPTION 'Wrong finalization: %',n; END IF;
 END LOOP;
 FOREACH n IN ARRAY ARRAY['conflict_before','receipt_b'] LOOP
  SELECT value INTO STRICT f FROM ncba_staging_test.context WHERE name=n;
  IF EXISTS(SELECT 1 FROM public.issued_tickets WHERE issued_tickets.order_id=(f->>'order_id')::uuid)
  OR (SELECT payment_status FROM public.orders WHERE id=(f->>'order_id')::uuid) IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'Unsafe allocation: %',n; END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.payment_receipts WHERE merchant_scope='NCBA_SQL_SERIAL' AND reference_deduplication_key='SQLRACECANON')<>1 THEN RAISE EXCEPTION 'Receipt reused'; END IF;
 SELECT value INTO STRICT f FROM ncba_staging_test.context WHERE name='query_job';
 IF (SELECT status FROM public.ncba_query_jobs WHERE attempt_id=(f->>'attempt_id')::uuid) IS DISTINCT FROM 'dispatched' THEN RAISE EXCEPTION 'Wrong query dispatch state'; END IF;
 SELECT value INTO STRICT f FROM ncba_staging_test.context WHERE name='evidence_job';
 IF (SELECT processing_attempts FROM public.ncba_verification_evidence WHERE id=(f->>'evidence_id')::uuid)<>1 THEN RAISE EXCEPTION 'Duplicate evidence claims'; END IF;
 RAISE NOTICE 'Concurrency assertions passed';
END $$;
ROLLBACK;
