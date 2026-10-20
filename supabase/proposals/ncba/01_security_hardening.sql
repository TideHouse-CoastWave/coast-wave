-- PROPOSAL ONLY. Not executed; keep outside automatic migrations.
-- Apply only on an independently verified disposable clone after approval.
-- No new browser policies, legacy issuance RPC, or service_role changes.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $guard$
DECLARE n text;
BEGIN
 IF current_setting('coastwave.security_proposal_approved',true) IS DISTINCT FROM 'yes'
 OR current_setting('coastwave.disposable_clone_verified',true) IS DISTINCT FROM 'yes'
 OR current_setting('coastwave.baseline_reviewed',true) IS DISTINCT FROM 'yes' THEN
  RAISE EXCEPTION 'Security proposal requires approval, verified clone and reviewed baseline';
 END IF;
 FOREACH n IN ARRAY ARRAY['orders','tickets','order_creation_requests','payment_attempts',
 'payment_receipts','payment_events','issued_tickets','payment_audit_events','delivery_outbox'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||n)
   AND relkind='r' AND relrowsecurity AND pg_get_userbyid(relowner)='postgres') THEN
   RAISE EXCEPTION 'Baseline drift: missing table, owner or RLS mismatch: %',n;
  END IF;
  -- The reviewed export has no policies. Stop rather than deleting or guessing
  -- the semantics of policies added since the audit.
  IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=n) THEN
   RAISE EXCEPTION 'Baseline drift: policies require fresh review: %',n;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='public' AND p.proname='confirm_payment_and_issue_ticket') THEN
  RAISE EXCEPTION 'Baseline drift: legacy confirmation function requires review';
 END IF;
END;
$guard$;

DO $revoke$
DECLARE n text; col record;
BEGIN
 FOREACH n IN ARRAY ARRAY['orders','tickets','order_creation_requests','payment_attempts',
 'payment_receipts','payment_events','issued_tickets','payment_audit_events','delivery_outbox'] LOOP
  EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC,anon,authenticated',n);
  -- Table REVOKE does not revoke independent column grants.
  FOR col IN SELECT attname FROM pg_attribute WHERE attrelid=to_regclass('public.'||n)
   AND attnum>0 AND NOT attisdropped LOOP
   EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM PUBLIC,anon,authenticated',col.attname,n);
  END LOOP;
  IF n<>'tickets' THEN
   EXECUTE format('CREATE POLICY ncba_private_browser_deny ON public.%I AS RESTRICTIVE FOR ALL TO anon,authenticated USING(false) WITH CHECK(false)',n);
  END IF;
 END LOOP;
END;
$revoke$;
-- Preserve existing catalogue SELECT grants, without opening RLS reads.
-- A future public catalogue SELECT policy is a separate interface decision.
GRANT SELECT ON public.tickets TO anon,authenticated;
CREATE POLICY ncba_catalogue_browser_insert_deny ON public.tickets AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(false);
CREATE POLICY ncba_catalogue_browser_update_deny ON public.tickets AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(false) WITH CHECK(false);
CREATE POLICY ncba_catalogue_browser_delete_deny ON public.tickets AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(false);

DO $assert$
DECLARE n text; r text; priv text; obj regclass;
BEGIN
 FOREACH n IN ARRAY ARRAY['orders','tickets','order_creation_requests','payment_attempts',
 'payment_receipts','payment_events','issued_tickets','payment_audit_events','delivery_outbox'] LOOP
  obj:=to_regclass('public.'||n);
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r AND (rolsuper OR rolbypassrls))
   OR pg_has_role(r,(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=obj),'MEMBER') THEN
    RAISE EXCEPTION 'Unsafe browser role membership or bypass: %',r;
   END IF;
   FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
    IF NOT(n='tickets' AND priv='SELECT') AND has_table_privilege(r,obj,priv) THEN
     RAISE EXCEPTION 'Effective table privilege remains: % % %',r,n,priv;
    END IF;
   END LOOP;
   FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
    IF NOT(n='tickets' AND priv='SELECT') AND EXISTS(SELECT 1 FROM pg_attribute a
    WHERE a.attrelid=obj AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(r,obj,a.attnum,priv)) THEN
     RAISE EXCEPTION 'Effective column privilege remains: % % %',r,n,priv;
    END IF;
   END LOOP;
  END LOOP;
  FOREACH priv IN ARRAY ARRAY['SELECT','INSERT'] LOOP
   IF NOT has_table_privilege('service_role',obj,priv) THEN RAISE EXCEPTION 'Missing server privilege: % %',n,priv; END IF;
  END LOOP;
  IF n<>'payment_audit_events' AND NOT has_table_privilege('service_role',obj,'UPDATE') THEN
   RAISE EXCEPTION 'Missing server UPDATE: %',n;
  END IF;
 END LOOP;
 IF NOT has_schema_privilege('service_role','public','USAGE')
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls)
 OR NOT has_function_privilege('service_role','public.create_pending_order_secure(jsonb,integer)','EXECUTE')
 OR has_function_privilege('anon','public.create_pending_order_secure(jsonb,integer)','EXECUTE')
 OR has_function_privilege('authenticated','public.create_pending_order_secure(jsonb,integer)','EXECUTE') THEN
  RAISE EXCEPTION 'Secure-order service-only execution prerequisite failed';
 END IF;
END;
$assert$;
COMMIT;
