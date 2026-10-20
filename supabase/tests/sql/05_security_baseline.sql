-- FUTURE CLONE TEST ONLY. Not executed by this change. Requires proposals 01/02.
-- psql client; test DDL and role switching are rolled back. PostgreSQL 17+.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $baseline$
DECLARE n text; r text; priv text; obj regclass;
BEGIN
 IF current_setting('coastwave.disposable_clone_verified',true) IS DISTINCT FROM 'yes' THEN
  RAISE EXCEPTION 'Baseline tests require an approved independently verified disposable clone';
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'READ COMMITTED required'; END IF;
 FOREACH n IN ARRAY ARRAY['order_customer_access','customer_order_creation_keys','ncba_verification_evidence','ncba_query_jobs'] LOOP
  IF to_regclass('public.'||n) IS NOT NULL THEN RAISE EXCEPTION 'Run baseline before NCBA installation: %',n; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='public' AND p.proname='confirm_payment_and_issue_ticket') THEN
  RAISE EXCEPTION 'Unexpected legacy confirmation RPC';
 END IF;
 FOREACH n IN ARRAY ARRAY['orders','tickets','order_creation_requests','payment_attempts',
 'payment_receipts','payment_events','issued_tickets','payment_audit_events','delivery_outbox'] LOOP
  obj:=to_regclass('public.'||n);
  IF obj IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=obj AND relkind='r'
    AND relrowsecurity AND pg_get_userbyid(relowner)='postgres') THEN
   RAISE EXCEPTION 'Table/RLS/owner mismatch: %',n;
  END IF;
  -- Hardened snapshot has no permissive policy on these tables.
  IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=n AND permissive='PERMISSIVE') THEN
   RAISE EXCEPTION 'Unexpected permissive policy: %',n;
  END IF;
  IF n<>'tickets' AND NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename=n AND policyname='ncba_private_browser_deny' AND permissive='RESTRICTIVE'
    AND cmd='ALL' AND roles @> ARRAY['anon','authenticated']::name[]
    AND qual='false' AND with_check='false') THEN
   RAISE EXCEPTION 'Missing restrictive privacy policy: %',n;
  END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r AND (rolsuper OR rolbypassrls))
   OR pg_has_role(r,'postgres','MEMBER') THEN RAISE EXCEPTION 'Unsafe browser role: %',r; END IF;
   FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
    IF NOT(n='tickets' AND priv='SELECT') AND has_table_privilege(r,obj,priv) THEN
     RAISE EXCEPTION 'Browser effective table grant: % % %',r,n,priv;
    END IF;
   END LOOP;
   FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
    IF NOT(n='tickets' AND priv='SELECT') AND EXISTS(SELECT 1 FROM pg_attribute a
    WHERE a.attrelid=obj AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(r,obj,a.attnum,priv)) THEN
     RAISE EXCEPTION 'Browser effective column grant: % % %',r,n,priv;
    END IF;
   END LOOP;
  END LOOP;
  FOREACH priv IN ARRAY ARRAY['SELECT','INSERT'] LOOP
   IF NOT has_table_privilege('service_role',obj,priv) THEN RAISE EXCEPTION 'Server grant missing: % %',n,priv; END IF;
  END LOOP;
  IF n<>'payment_audit_events' AND NOT has_table_privilege('service_role',obj,'UPDATE') THEN RAISE EXCEPTION 'Server UPDATE missing: %',n; END IF;
  IF n='payment_audit_events' AND (has_table_privilege('service_role',obj,'UPDATE')
    OR has_table_privilege('service_role',obj,'DELETE') OR has_table_privilege('service_role',obj,'TRUNCATE')) THEN
   RAISE EXCEPTION 'Audit records not append-only to server';
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls)
 OR NOT has_schema_privilege('service_role','public','USAGE') THEN RAISE EXCEPTION 'Server schema/RLS contract'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.create_pending_order_secure(jsonb,integer)')
   AND NOT p.prosecdef AND p.provolatile='v' AND p.proconfig @> ARRAY['search_path=""']) THEN
  RAISE EXCEPTION 'Secure creator function settings mismatch';
 END IF;
 IF NOT has_function_privilege('service_role','public.create_pending_order_secure(jsonb,integer)','EXECUTE')
 OR has_function_privilege('anon','public.create_pending_order_secure(jsonb,integer)','EXECUTE')
 OR has_function_privilege('authenticated','public.create_pending_order_secure(jsonb,integer)','EXECUTE') THEN
  RAISE EXCEPTION 'Secure creator execution mismatch';
 END IF;
 IF to_regprocedure('pg_catalog.sha256(bytea)') IS NULL
 OR to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL THEN RAISE EXCEPTION 'Built-in prerequisites absent'; END IF;
END;
$baseline$;

-- These probes test effective grants, including inheritance, rather than merely
-- inspecting direct pg_default_acl entries. A name collision aborts; never drop
-- a pre-existing object. Managed supabase_admin defaults are NOT changed/tested
-- by impersonation. Their residual risk is recorded in the authority document.
DO $defaults$
DECLARE creator text; probe text; r text; priv text;
BEGIN
 FOREACH creator IN ARRAY ARRAY['postgres'] LOOP
  probe:='ncba_baseline_probe_'||creator;
  EXECUTE format('SET LOCAL ROLE %I',creator);
  EXECUTE format('CREATE TABLE public.%I (id integer)',probe);
  EXECUTE format('CREATE SEQUENCE public.%I',probe||'_seq');
  EXECUTE format('CREATE FUNCTION public.%I() RETURNS integer LANGUAGE sql SECURITY INVOKER SET search_path='''' AS %L',probe,'SELECT 1');
  -- Narrow defaults cannot remove built-in PUBLIC EXECUTE. Prove this residual
  -- before applying the required same-transaction per-function ACL contract.
  IF NOT has_function_privilege('anon','public.'||probe||'()','EXECUTE')
   OR NOT has_function_privilege('authenticated','public.'||probe||'()','EXECUTE') THEN
   RAISE EXCEPTION 'Unexpected global function-default drift; review before testing';
  END IF;
  EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION public.%I() FROM PUBLIC,anon,authenticated',probe);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I() TO service_role',probe);
  EXECUTE 'RESET ROLE';
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
    IF has_table_privilege(r,'public.'||probe,priv) THEN RAISE EXCEPTION 'Unsafe future table grant: % % %',creator,r,priv; END IF;
   END LOOP;
   FOREACH priv IN ARRAY ARRAY['USAGE','SELECT','UPDATE'] LOOP
    IF has_sequence_privilege(r,'public.'||probe||'_seq',priv) THEN RAISE EXCEPTION 'Unsafe future sequence grant: % % %',creator,r,priv; END IF;
   END LOOP;
   IF has_function_privilege(r,'public.'||probe||'()','EXECUTE') THEN RAISE EXCEPTION 'Unsafe future function grant: % %',creator,r; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid=to_regprocedure('public.'||probe||'()') AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
   RAISE EXCEPTION 'Per-function PUBLIC EXECUTE revoke failed: %',creator;
  END IF;
  FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE'] LOOP
   IF NOT has_table_privilege('service_role','public.'||probe,priv) THEN RAISE EXCEPTION 'Server default lost: % %',creator,priv; END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role','public.'||probe||'()','EXECUTE')
   OR NOT has_sequence_privilege('service_role','public.'||probe||'_seq','USAGE') THEN
   RAISE EXCEPTION 'Server function/sequence default lost: %',creator;
  END IF;
 END LOOP;
END;
$defaults$;

SET LOCAL ROLE service_role;
SELECT * FROM public.ncba_baseline_probe_postgres;
UPDATE public.ncba_baseline_probe_postgres SET id=1 WHERE false;
SELECT public.ncba_baseline_probe_postgres();
RESET ROLE;
SET LOCAL ROLE anon;
DO $denied$
BEGIN
 BEGIN PERFORM 1 FROM public.ncba_baseline_probe_postgres;
 EXCEPTION WHEN insufficient_privilege THEN RETURN;
 END;
 RAISE EXCEPTION 'Expected browser SELECT denial';
END;
$denied$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $denied$
BEGIN
 BEGIN PERFORM 1 FROM public.ncba_baseline_probe_postgres;
 EXCEPTION WHEN insufficient_privilege THEN RETURN;
 END;
 RAISE EXCEPTION 'Expected browser SELECT denial';
END;
$denied$;
RESET ROLE;
ROLLBACK;
