-- Run A, wait for its HOLDING notice, then run B within 8 seconds.
-- Both calls: -v ticket_id=... -v scenario=... -v side=A (or B).
-- Setup must already exist in an approved disposable clone. NO bank HTTP calls.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='20s';
SET LOCAL statement_timeout='45s';
\ir helpers.sql
SELECT set_config('coastwave.test_scenario',:'scenario',true);
SELECT set_config('coastwave.test_side',:'side',true);
SET LOCAL ROLE service_role;
DO $$
DECLARE scenario text:=current_setting('coastwave.test_scenario'); side text:=current_setting('coastwave.test_side');
 f jsonb; result jsonb; payload jsonb; token uuid; category uuid;
BEGIN
 IF side NOT IN ('A','B') OR scenario NOT IN ('creation','retry','different_key','cross_order','expiry','notification','finalize','conflict_before','conflict_after','receipt_race','query_job','evidence_job') THEN RAISE EXCEPTION 'Invalid concurrency scenario/side'; END IF;
 SELECT ticket_id INTO STRICT category FROM pg_temp.ncba_test_context;
 SELECT value INTO STRICT f FROM ncba_staging_test.context WHERE name=CASE
  WHEN scenario='cross_order' THEN CASE WHEN side='A' THEN 'cross_a' ELSE 'cross_b' END
  WHEN scenario='receipt_race' THEN CASE WHEN side='A' THEN 'receipt_a' ELSE 'receipt_b' END
  ELSE scenario END;
 IF scenario='creation' THEN
  result:=pg_temp.order_fixture(category,(f->>'actor')::uuid,(f->>'key')::uuid);
  IF side='A' THEN UPDATE ncba_staging_test.context SET value=value||jsonb_build_object('order_id',result->>'order_id') WHERE name='creation';
  ELSE PERFORM pg_temp.assert_true(result->>'replayed'='true','concurrent customer creation replay'); END IF;
 ELSIF scenario IN ('retry','different_key','cross_order') THEN
  IF side='B' AND scenario IN ('different_key','cross_order') THEN
   PERFORM pg_temp.expect_state(format('SELECT public.claim_ncba_attempt(%L::uuid,%L::uuid,%L,%L,%L,%L,true)',f->>'order_id',f->>'actor',CASE WHEN scenario='different_key' THEN gen_random_uuid()::text ELSE f->>'key' END,'NCBA_SQL_RACE','SQLALIAS','880100'),'CP002');
  ELSE
   result:=public.claim_ncba_attempt((f->>'order_id')::uuid,(f->>'actor')::uuid,f->>'key','NCBA_SQL_RACE','SQLALIAS','880100',true);
   PERFORM pg_temp.assert_true(result->>'claimed'=CASE WHEN side='A' THEN 'true' ELSE 'false' END,'single concurrent claim');
  END IF;
 ELSIF scenario='expiry' THEN
  IF side='A' THEN
   PERFORM 1 FROM public.orders WHERE id=(f->>'order_id')::uuid FOR UPDATE;
   UPDATE public.order_customer_access SET payment_expires_at=clock_timestamp()+interval '4 seconds' WHERE order_id=(f->>'order_id')::uuid;
  ELSE
   PERFORM pg_temp.expect_state(format('SELECT public.claim_ncba_attempt(%L::uuid,%L::uuid,%L,%L,%L,%L,true)',f->>'order_id',f->>'actor',f->>'key','NCBA_SQL_RACE','SQLALIAS','880100'),'CP002');
  END IF;
  IF side='B' THEN
   PERFORM pg_temp.assert_true(transaction_timestamp()<(SELECT payment_expires_at FROM public.order_customer_access WHERE order_id=(f->>'order_id')::uuid),'expiry test must start B before cutoff; rerun this pair if too late');
  END IF;
 ELSIF scenario='notification' THEN
  payload:=f->'payload';
  result:=public.ingest_ncba_notification('NCBA_SQL_SERIAL',payload->>'TransID',encode(sha256(convert_to(payload::text,'UTF8')),'hex'),payload);
  PERFORM pg_temp.assert_true(result->>'event_id' IS NOT NULL,'concurrent notification accepted');
 ELSIF scenario IN ('finalize','receipt_race') THEN
  IF side='B' AND scenario='receipt_race' THEN
   PERFORM pg_temp.expect_state(format('SELECT public.finalize_ncba_payment(%L::uuid,%L::jsonb,%L::uuid)',f->>'evidence_id',pg_temp.hashes(),f->>'claim'),'CP003');
  ELSE
   result:=public.finalize_ncba_payment((f->>'evidence_id')::uuid,pg_temp.hashes(),(f->>'claim')::uuid);
   PERFORM pg_temp.assert_true(result->>'paid'='true','concurrent finalization');
   IF side='B' THEN PERFORM pg_temp.assert_true(result->>'replayed'='true','second finalizer replay'); END IF;
  END IF;
 ELSIF scenario IN ('conflict_before','conflict_after') THEN
  IF (scenario='conflict_before' AND side='A') OR (scenario='conflict_after' AND side='B') THEN
   payload:=jsonb_set(f->'payload','{TransAmount}','"1.00"');
   result:=public.ingest_ncba_notification('NCBA_SQL_SERIAL',payload->>'TransID',encode(sha256(convert_to(payload::text,'UTF8')),'hex'),payload);
   PERFORM pg_temp.assert_true(result->>'conflict'='true','concurrent conflict quarantined');
  ELSIF scenario='conflict_before' THEN
   PERFORM pg_temp.expect_state(format('SELECT public.finalize_ncba_payment(%L::uuid,%L::jsonb,%L::uuid)',f->>'evidence_id',pg_temp.hashes(),f->>'claim'),'CP003');
  ELSE
   PERFORM public.finalize_ncba_payment((f->>'evidence_id')::uuid,pg_temp.hashes(),(f->>'claim')::uuid);
  END IF;
 ELSIF scenario='query_job' THEN
  result:=public.claim_ncba_query_jobs();
  IF side='A' THEN
   SELECT claim_token INTO STRICT token FROM public.ncba_query_jobs WHERE attempt_id=(f->>'attempt_id')::uuid;
   PERFORM pg_temp.assert_true((public.begin_ncba_query((f->>'attempt_id')::uuid,token)->>'allowed')='true','single dispatched query');
  ELSE PERFORM pg_temp.assert_true(jsonb_array_length(result)=0,'other worker cannot query same job'); END IF;
 ELSE
  result:=public.ncba_reconciliation_queue();
  PERFORM pg_temp.assert_true(jsonb_array_length(result->'evidence')=CASE WHEN side='A' THEN 1 ELSE 0 END,'SKIP LOCKED evidence queue');
 END IF;
 IF side='A' THEN RAISE NOTICE 'A HOLDING %, start session B now',scenario; PERFORM pg_sleep(8); END IF;
END $$;
RESET ROLE;
COMMIT;
