-- READ ONLY. Run only against the explicitly approved staging target.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
DO $$ DECLARE relation text;
BEGIN
 FOREACH relation IN ARRAY ARRAY['orders','tickets','order_creation_requests','payment_attempts','payment_events','payment_receipts','issued_tickets','payment_audit_events','delivery_outbox'] LOOP
  IF to_regclass('public.'||relation) IS NULL THEN RAISE EXCEPTION 'Missing prerequisite: public.%',relation; END IF;
 END LOOP;
 IF to_regprocedure('public.create_pending_order_secure(jsonb,integer)') IS NULL THEN RAISE EXCEPTION 'Missing secure-order RPC'; END IF;
 IF NOT has_function_privilege('service_role','public.create_pending_order_secure(jsonb,integer)','EXECUTE')
 OR NOT has_schema_privilege('service_role','public','USAGE') THEN RAISE EXCEPTION 'Missing service-role access to secure-order foundation'; END IF;
END $$;
SELECT current_database(),current_user,version();
SHOW default_transaction_isolation;
SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS has_migration_history \gset
\if :has_migration_history
 SELECT version FROM supabase_migrations.schema_migrations
 WHERE version IN ('20261017000100','20261017000200','20261020000100') ORDER BY version;
\else
 \echo 'No migration history table: manually reconcile deployed schema with reviewed migrations before applying anything'
\endif
SELECT rolname,rolbypassrls,rolinherit FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role');
SELECT to_regprocedure('gen_random_uuid()'),to_regprocedure('sha256(bytea)'),
       to_regprocedure('public.create_pending_order_secure(jsonb,integer)');
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) AS owner,c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
AND c.relname IN ('orders','tickets','order_creation_requests','payment_attempts','payment_events','payment_receipts','issued_tickets','payment_audit_events','delivery_outbox','order_customer_access','customer_order_creation_keys','ncba_verification_evidence','ncba_query_jobs');
SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('orders','tickets') ORDER BY table_name,ordinal_position;
SELECT conrelid::regclass,conname,pg_get_constraintdef(oid) FROM pg_constraint
WHERE connamespace='public'::regnamespace ORDER BY conrelid::regclass::text,conname;
SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname;
SELECT tgrelid::regclass,tgname,pg_get_triggerdef(oid) FROM pg_trigger
WHERE NOT tgisinternal AND tgrelid IN ('public.orders'::regclass,'public.tickets'::regclass);
-- Every legacy overload, including security mode, owner, defaults, body and ACL.
-- Capture securely: a legacy body could itself contain hard-coded secrets.
SELECT p.oid::regprocedure,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) AS owner,
       p.proacl,pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('confirm_payment_and_issue_ticket','create_pending_order_secure');
SELECT p.oid::regprocedure,r.role_name,has_function_privilege(r.role_name,p.oid,'EXECUTE') AS can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) r(role_name)
WHERE n.nspname='public' AND p.proname='confirm_payment_and_issue_ticket';
SELECT r.role_name,priv,has_table_privilege(r.role_name,'public.orders',priv) AS granted
FROM (VALUES('anon'),('authenticated'),('service_role')) r(role_name)
CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) priv;
-- Column grants can survive a table-level REVOKE.
SELECT r.role_name,a.attname,priv,has_column_privilege(r.role_name,a.attrelid,a.attnum,priv) AS granted
FROM pg_attribute a CROSS JOIN (VALUES('anon'),('authenticated')) r(role_name)
CROSS JOIN unnest(ARRAY['INSERT','UPDATE']) priv
WHERE a.attrelid='public.orders'::regclass AND a.attnum>0 AND NOT a.attisdropped;
-- Candidate bypasses/wrappers for manual review, not a complete dependency proof.
SELECT p.oid::regprocedure,p.prosecdef,pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prokind='f'
AND (p.prosrc ILIKE '%confirm_payment_and_issue_ticket%' OR (p.prosecdef AND p.prosrc ILIKE '%orders%'));
ROLLBACK;
