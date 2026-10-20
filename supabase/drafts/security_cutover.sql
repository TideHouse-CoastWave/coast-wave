-- NOT AN AUTOMATIC MIGRATION. Local review draft; never executed here.
-- This deliberately lives OUTSIDE supabase/migrations. It will BREAK legacy
-- browser inserts/manual confirmation/check-in writes when eventually applied.
-- Requires a separately approved coordinated checkout + staff backend cutover.
BEGIN;
DO $$ BEGIN
 IF current_setting('coastwave.staging_security_cutover_approved',true) IS DISTINCT FROM 'yes'
 OR current_setting('coastwave.legacy_audit_reviewed',true) IS DISTINCT FROM 'yes'
 OR current_setting('coastwave.checkout_cutover_ready',true) IS DISTINCT FROM 'yes'
 OR current_setting('coastwave.staff_routes_ready',true) IS DISTINCT FROM 'yes' THEN
  RAISE EXCEPTION 'Security cutover is not approved or its prerequisites are incomplete';
 END IF;
END $$;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.orders FROM PUBLIC,anon,authenticated;
DO $$ DECLARE col record; fn record; r text; priv text;
BEGIN
 FOR col IN SELECT attname FROM pg_attribute WHERE attrelid='public.orders'::regclass AND attnum>0 AND NOT attisdropped LOOP
  EXECUTE format('REVOKE INSERT (%I),UPDATE (%I) ON public.orders FROM PUBLIC,anon,authenticated',col.attname,col.attname);
 END LOOP;
 FOR fn IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='confirm_payment_and_issue_ticket' LOOP
  -- No unverified manual issuance, including service-role API calls to legacy RPC.
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',fn.signature);
 END LOOP;
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r AND (rolsuper OR rolbypassrls))
  OR pg_has_role(r,(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.orders'::regclass),'MEMBER') THEN
   RAISE EXCEPTION 'Unexpected browser role ownership or RLS bypass: %',r;
  END IF;
  FOREACH priv IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE'] LOOP
   IF has_table_privilege(r,'public.orders',priv) THEN RAISE EXCEPTION 'Inherited % grant remains for %',priv,r; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid='public.orders'::regclass AND a.attnum>0 AND NOT a.attisdropped
  AND (has_column_privilege(r,a.attrelid,a.attnum,'INSERT') OR has_column_privilege(r,a.attrelid,a.attnum,'UPDATE'))) THEN
   RAISE EXCEPTION 'Inherited column write grant remains for %',r;
  END IF;
 END LOOP;
 FOR fn IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='confirm_payment_and_issue_ticket' LOOP
  IF has_function_privilege('anon',fn.oid,'EXECUTE') OR has_function_privilege('authenticated',fn.oid,'EXECUTE') OR has_function_privilege('service_role',fn.oid,'EXECUTE') THEN
   RAISE EXCEPTION 'Inherited legacy RPC execution remains; review role graph'; END IF;
 END LOOP;
END $$;
-- Restrictive policies guard against permissive browser policies or future grants.
CREATE POLICY ncba_cutover_deny_browser_insert ON public.orders AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(false);
CREATE POLICY ncba_cutover_deny_browser_update ON public.orders AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(false) WITH CHECK(false);
CREATE POLICY ncba_cutover_deny_browser_delete ON public.orders AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(false);
-- SELECT/privacy policies require the actual staff/ownership role model. They
-- are audited separately; this draft does not invent one or expose order reads.
COMMIT;
