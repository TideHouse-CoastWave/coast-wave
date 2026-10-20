-- PROPOSAL ONLY. Never executed here. Affects FUTURE objects, not existing ACLs.
-- Narrow alternative: postgres-created objects in public ONLY.
-- No global changes, managed supabase_admin changes or service_role revocations.
-- Residual global PUBLIC EXECUTE remains: each application function MUST revoke
-- execution on its exact signature before the creation transaction commits.
-- Read DEFAULT_PRIVILEGES_AUTHORITY.md and PRODUCTION_ISOLATION.md first.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $guard$
BEGIN
 IF current_setting('coastwave.defaults_proposal_approved',true) IS DISTINCT FROM 'yes'
 OR current_setting('coastwave.disposable_clone_verified',true) IS DISTINCT FROM 'yes'
 OR current_setting('coastwave.per_object_acl_contract_reviewed',true) IS DISTINCT FROM 'yes' THEN
  RAISE EXCEPTION 'Default privilege proposal requires clone approval and per-object ACL review';
 END IF;
 -- The audit lists only public-schema defaults for the two creators. Unexpected
 -- global ACL entries need review before changing their future-object contract.
 IF EXISTS(SELECT 1 FROM pg_default_acl d WHERE d.defaclnamespace=0
 AND pg_get_userbyid(d.defaclrole)='postgres') THEN
  RAISE EXCEPTION 'Baseline drift: global default ACLs require fresh review';
 END IF;
END;
$guard$;
DO $defaults$
DECLARE creator text;
BEGIN
 FOREACH creator IN ARRAY ARRAY['postgres'] LOOP
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC,anon,authenticated',creator);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC,anon,authenticated',creator);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC,anon,authenticated',creator);
  -- This per-schema function REVOKE removes explicit schema grants only.
  -- Global/built-in PUBLIC EXECUTE still applies; never treat this as denial.
  -- Managed-owner defaults and other schemas are deliberately untouched.
 END LOOP;
END;
$defaults$;
DO $assert$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
 WHERE pg_get_userbyid(d.defaclrole)='postgres'
 AND d.defaclnamespace='public'::regnamespace
 AND d.defaclobjtype IN ('r','S','f')
 AND (a.grantee=0 OR a.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated')))) THEN
  RAISE EXCEPTION 'Unsafe direct default grants remain';
 END IF;
END;
$assert$;
COMMIT;
