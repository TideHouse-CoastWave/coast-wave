-- COMMITTED SYNTHETIC DATA. Disposable clone ONLY; restore snapshot to clean up.
\set ON_ERROR_STOP on
\if :{?disposable_clone}
 \if :disposable_clone
 \else
  \quit 3
 \endif
\else
 \echo 'Explicit -v disposable_clone=yes is required'
 \quit 3
\endif
\if :{?ticket_id}
\else
 \quit 3
\endif
BEGIN ISOLATION LEVEL READ COMMITTED;
CREATE SCHEMA ncba_staging_test;
CREATE TABLE ncba_staging_test.context(name text PRIMARY KEY,value jsonb NOT NULL);
GRANT USAGE ON SCHEMA ncba_staging_test TO service_role;
GRANT SELECT,INSERT,UPDATE ON ncba_staging_test.context TO service_role;
\ir helpers.sql
SET LOCAL ROLE service_role;
DO $$
DECLARE n text; category uuid; actor uuid; request_key uuid; shared_key uuid:=gen_random_uuid(); o jsonb; f jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM public.ncba_query_jobs) OR EXISTS(SELECT 1 FROM public.ncba_verification_evidence) THEN
  RAISE EXCEPTION 'Use a clean disposable clone; existing job/evidence queues would interfere'; END IF;
 SELECT ticket_id INTO STRICT category FROM pg_temp.ncba_test_context;
 FOREACH n IN ARRAY ARRAY['retry','different_key','cross_a','cross_b','expiry'] LOOP
  actor:=gen_random_uuid(); request_key:=gen_random_uuid(); o:=pg_temp.order_fixture(category,actor,request_key);
  INSERT INTO ncba_staging_test.context VALUES(n,jsonb_build_object('order_id',o->>'order_id','actor',actor,
   'key',CASE WHEN n IN ('cross_a','cross_b') THEN shared_key ELSE gen_random_uuid() END));
 END LOOP;
 actor:=gen_random_uuid();
 INSERT INTO ncba_staging_test.context VALUES('creation',jsonb_build_object('actor',actor,'key',gen_random_uuid()));
 FOREACH n IN ARRAY ARRAY['finalize','conflict_before','conflict_after','query_job','evidence_job'] LOOP
  f:=pg_temp.fixture('SQLRACE'||replace(upper(n),'_',''));
  INSERT INTO ncba_staging_test.context VALUES(n,f);
 END LOOP;
 f:=pg_temp.fixture('SQLRACERECEIPTA','SQLRACECANON');
 INSERT INTO ncba_staging_test.context VALUES('receipt_a',f);
 f:=pg_temp.fixture('SQLRACERECEIPTB','SQLRACECANON');
 INSERT INTO ncba_staging_test.context VALUES('receipt_b',f);
 SELECT value INTO f FROM ncba_staging_test.context WHERE name='query_job';
 PERFORM public.record_ncba_submission((f->>'attempt_id')::uuid,'pending','{"TransactionID":"SQLQUERYRACE","ReferenceID":"SQLREFRACE"}');
 UPDATE public.payment_attempts SET updated_at=clock_timestamp()-interval '3 minutes' WHERE id=(f->>'attempt_id')::uuid;
 SELECT value INTO f FROM ncba_staging_test.context WHERE name='evidence_job';
 UPDATE public.ncba_verification_evidence SET processing_status='pending',claim_token=NULL,claim_expires_at=NULL
 WHERE id=(f->>'evidence_id')::uuid;
 -- Test-only long claim window permits manual paired sessions; no workers run here.
 UPDATE public.ncba_verification_evidence SET claim_expires_at=clock_timestamp()+interval '1 hour'
 WHERE merchant_scope='NCBA_SQL_SERIAL' AND processing_status='processing';
 SELECT value INTO f FROM ncba_staging_test.context WHERE name='finalize';
 f:=jsonb_set(f,'{payload,TransID}','"SQLRACENEWNOTIFICATION"');
 INSERT INTO ncba_staging_test.context VALUES('notification',f);
END $$;
RESET ROLE;
COMMIT;
