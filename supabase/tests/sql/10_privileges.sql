\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE ncba_privilege_test_marker(id integer);
CREATE FUNCTION pg_temp.assert_true(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.expect_denied(statement text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN insufficient_privilege THEN RETURN;
 END;
 RAISE EXCEPTION 'Expected insufficient_privilege: %',statement;
END $$;
CREATE FUNCTION pg_temp.check_browser_denials() RETURNS void LANGUAGE plpgsql AS $$
DECLARE n text; f record; args text;
BEGIN
 FOREACH n IN ARRAY ARRAY['order_customer_access','customer_order_creation_keys','ncba_verification_evidence','ncba_query_jobs'] LOOP
  PERFORM pg_temp.expect_denied(format('SELECT * FROM public.%I',n));
  PERFORM pg_temp.expect_denied(format('DELETE FROM public.%I WHERE false',n));
 END LOOP;
 FOR f IN SELECT p.* FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public'
 AND p.proname IN ('create_customer_pending_order_secure','ncba_lock_identity','claim_ncba_attempt','record_ncba_submission','ingest_ncba_notification','customer_payment_status','finalize_ncba_payment','ncba_finalization_quantity','retrieve_customer_ticket','list_customer_tickets','ncba_reconciliation_queue','block_ncba_evidence','claim_ncba_query_jobs','begin_ncba_query','record_ncba_query') LOOP
  SELECT string_agg('NULL::'||format_type(t,NULL),',' ORDER BY ordinal) INTO args FROM unnest(f.proargtypes::oid[]) WITH ORDINALITY a(t,ordinal);
  PERFORM pg_temp.expect_denied(format('SELECT public.%I(%s)',f.proname,coalesce(args,'')));
 END LOOP;
END $$;
DO $$
DECLARE n text; r text; priv text; f record; col record; total integer;
BEGIN
 SELECT count(*) INTO total FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public'
 AND p.proname IN ('create_customer_pending_order_secure','ncba_lock_identity','claim_ncba_attempt','record_ncba_submission','ingest_ncba_notification','customer_payment_status','finalize_ncba_payment','ncba_finalization_quantity','retrieve_customer_ticket','list_customer_tickets','ncba_reconciliation_queue','block_ncba_evidence','claim_ncba_query_jobs','begin_ncba_query','record_ncba_query');
 PERFORM pg_temp.assert_true(total=15,'exactly 15 expected RPCs: no stale overloads');
 FOR f IN SELECT p.* FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public'
 AND p.proname IN ('create_customer_pending_order_secure','ncba_lock_identity','claim_ncba_attempt','record_ncba_submission','ingest_ncba_notification','customer_payment_status','finalize_ncba_payment','ncba_finalization_quantity','retrieve_customer_ticket','list_customer_tickets','ncba_reconciliation_queue','block_ncba_evidence','claim_ncba_query_jobs','begin_ncba_query','record_ncba_query') LOOP
  PERFORM pg_temp.assert_true(NOT f.prosecdef,'SECURITY INVOKER: '||f.proname);
  PERFORM pg_temp.assert_true(array_to_string(f.proconfig,',')='search_path=""','empty search_path: '||f.proname);
  PERFORM pg_temp.assert_true(has_function_privilege('service_role',f.oid,'EXECUTE'),'server execute: '||f.proname);
  PERFORM pg_temp.assert_true(NOT has_function_privilege('anon',f.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',f.oid,'EXECUTE'),'no browser execute: '||f.proname);
  PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),'no PUBLIC execute: '||f.proname);
 END LOOP;
 FOREACH n IN ARRAY ARRAY['order_customer_access','customer_order_creation_keys','ncba_verification_evidence','ncba_query_jobs'] LOOP
  PERFORM pg_temp.assert_true((SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||n)::regclass),'RLS: '||n);
  PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=n),'no browser policies: '||n);
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
    PERFORM pg_temp.assert_true(NOT has_table_privilege(r,'public.'||n,priv),'no '||priv||' for '||r||' on '||n);
   END LOOP;
   FOR col IN SELECT attname FROM pg_attribute WHERE attrelid=('public.'||n)::regclass AND attnum>0 AND NOT attisdropped LOOP
    FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
     PERFORM pg_temp.assert_true(NOT has_column_privilege(r,'public.'||n,col.attname,priv),'no browser column grant');
    END LOOP;
   END LOOP;
  END LOOP;
 END LOOP;
 PERFORM pg_temp.assert_true(NOT has_column_privilege('service_role','public.ncba_verification_evidence','amount','UPDATE'),'immutable attested amount');
 PERFORM pg_temp.assert_true(NOT has_column_privilege('service_role','public.ncba_verification_evidence','event_payload_digest','UPDATE'),'immutable evidence digest');
 PERFORM pg_temp.assert_true(has_column_privilege('service_role','public.ncba_verification_evidence','processing_status','UPDATE'),'server processing updates');
 PERFORM pg_temp.assert_true(has_schema_privilege('service_role','public','USAGE'),'public schema usage');
 PERFORM pg_temp.assert_true((SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role'),'server role RLS bypass');
 EXECUTE format('GRANT USAGE ON SCHEMA %I TO service_role,anon,authenticated',pg_my_temp_schema()::regnamespace::text);
 EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %I TO service_role,anon,authenticated',pg_my_temp_schema()::regnamespace::text);
END $$;
SET LOCAL ROLE anon;
SELECT pg_temp.check_browser_denials();
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_browser_denials();
RESET ROLE;
ROLLBACK;
