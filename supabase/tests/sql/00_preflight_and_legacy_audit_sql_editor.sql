-- READ-ONLY SQL EDITOR COMPANION to 00_preflight_and_legacy_audit.sql.
-- NOT EXECUTED BY CODEX. No application rows or credential settings are queried.
-- Before Run: independently verify the dashboard project reference is exactly
-- fknoimjcovjmmiivmime (CoastWave Staging). This comment is NOT proof of connection
-- identity; current_database() commonly returns postgres on many Supabase projects.
-- Inspect function definitions privately; redact any embedded secrets before sharing.
-- One JSON result collects the catalog audit so the SQL Editor need not retain
-- multiple result sets. Missing dependencies are reported rather than aborting.
-- Dashboard SQL Editor entry point: use this file, not the psql companion.
-- Standard PostgreSQL only: no client-side commands, procedural blocks or DDL.
-- The only dynamically evaluated statement below is a fixed SELECT of migration
-- version metadata. CASE prevents parsing it when the optional table is absent.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';
WITH migration_history_relation AS (
 SELECT c.oid, c.relkind,
        has_schema_privilege(n.oid,'USAGE') AS schema_usage,
        has_table_privilege(c.oid,'SELECT') AS table_select
 FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='supabase_migrations' AND c.relname='schema_migrations'
), migration_history AS (
 SELECT CASE
  WHEN NOT EXISTS (SELECT 1 FROM migration_history_relation) THEN 'missing'
  WHEN NOT EXISTS (SELECT 1 FROM migration_history_relation
                   WHERE relkind IN ('r','p') AND schema_usage AND table_select)
   THEN 'unreadable_or_unexpected_relation_type'
  ELSE 'available'
 END AS status,
 CASE WHEN EXISTS (SELECT 1 FROM migration_history_relation
                   WHERE relkind IN ('r','p') AND schema_usage AND table_select)
  THEN pg_catalog.query_to_xml(
   'SELECT to_jsonb(h)->>''version'' AS version
    FROM supabase_migrations.schema_migrations AS h
    WHERE to_jsonb(h)->>''version'' IN
     (''20261017000100'',''20261017000200'',''20261020000100'')
    ORDER BY to_jsonb(h)->>''version''',
   false, false, '')
  ELSE NULL::xml
 END AS versions_xml
), expected_migrations(version) AS (
 VALUES ('20261017000100'),('20261017000200'),('20261020000100')
), recorded_migrations AS (
 SELECT v::text AS version
 FROM migration_history h
 CROSS JOIN LATERAL unnest(pg_catalog.xpath('/table/row/version/text()',h.versions_xml)) AS x(v)
), expected_tables(name) AS (
 VALUES ('orders'),('tickets'),('order_creation_requests'),('payment_attempts'),
 ('payment_events'),('payment_receipts'),('issued_tickets'),('payment_audit_events'),
 ('delivery_outbox'),('order_customer_access'),('customer_order_creation_keys'),
 ('ncba_verification_evidence'),('ncba_query_jobs')
), expected_functions(name) AS (
 VALUES ('create_pending_order_secure'),('confirm_payment_and_issue_ticket'),
 ('create_customer_pending_order_secure'),('ncba_lock_identity'),('claim_ncba_attempt'),
 ('record_ncba_submission'),('ingest_ncba_notification'),('customer_payment_status'),
 ('finalize_ncba_payment'),('ncba_finalization_quantity'),('retrieve_customer_ticket'),
 ('list_customer_tickets'),('ncba_reconciliation_queue'),('block_ncba_evidence'),
 ('claim_ncba_query_jobs'),('begin_ncba_query'),('record_ncba_query')
), relations AS (
 SELECT c.* FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN expected_tables e ON e.name=c.relname
 WHERE n.nspname='public' AND c.relkind IN ('r','p')
), functions AS (
 SELECT p.* FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 JOIN expected_functions e ON e.name=p.proname
 WHERE n.nspname='public' AND p.prokind='f'
), application_roles AS (
 SELECT * FROM pg_catalog.pg_roles
 WHERE rolname IN ('anon','authenticated','service_role')
), audit_triggers AS (
 SELECT t.* FROM pg_catalog.pg_trigger t JOIN relations r ON r.oid=t.tgrelid
 WHERE NOT t.tgisinternal
)
SELECT jsonb_build_object(
 'inspection',jsonb_build_object(
  'expected_project_ref','fknoimjcovjmmiivmime',
  'project_identity_verified_by_sql',false,
  'database',current_database(),'current_user',current_user,
  'server_version',version(),
  'transaction_read_only',current_setting('transaction_read_only'),
  'default_transaction_isolation',current_setting('default_transaction_isolation'),
  'transaction_isolation',current_setting('transaction_isolation')
 ),
 'migration_history',jsonb_build_object(
  'status',(SELECT status FROM migration_history),
  'note','History alone does not prove schema compatibility; missing or unreadable history does not prove a migration is absent.',
  'matching_versions',coalesce((SELECT jsonb_agg(version ORDER BY version) FROM recorded_migrations),'[]'::jsonb),
  'expected_migrations',(SELECT jsonb_agg(jsonb_build_object(
   'version',e.version,
   'recorded',CASE WHEN (SELECT status FROM migration_history)='available'
    THEN EXISTS (SELECT 1 FROM recorded_migrations r WHERE r.version=e.version)
    ELSE NULL::boolean END
  ) ORDER BY e.version) FROM expected_migrations e)
 ),
 'table_presence',(SELECT jsonb_agg(jsonb_build_object('table',name,'present',to_regclass('public.'||name) IS NOT NULL) ORDER BY name) FROM expected_tables),
 'function_presence',(SELECT jsonb_agg(jsonb_build_object('function',e.name,'overload_count',(SELECT count(*) FROM functions f WHERE f.proname=e.name)) ORDER BY e.name) FROM expected_functions e),
 'prerequisites',jsonb_build_object(
  'uuid_generator',to_regprocedure('pg_catalog.gen_random_uuid()')::text,
  'sha256',to_regprocedure('pg_catalog.sha256(bytea)')::text,
  'secure_order_rpc',to_regprocedure('public.create_pending_order_secure(jsonb,integer)')::text,
  'migration_history_table',to_regclass('supabase_migrations.schema_migrations')::text
 ),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'bypass_rls',rolbypassrls,'inherit',rolinherit,'public_schema_usage',has_schema_privilege(rolname,'public','USAGE')) ORDER BY rolname) FROM application_roles),
 'role_memberships',coalesce((SELECT jsonb_agg(jsonb_build_object('parent_role',parent.rolname,'member_role',member.rolname,'admin_option',m.admin_option) ORDER BY parent.rolname,member.rolname)
  FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles parent ON parent.oid=m.roleid JOIN pg_catalog.pg_roles member ON member.oid=m.member),'[]'::jsonb),
 'tables',coalesce((SELECT jsonb_agg(jsonb_build_object('name',relname,'kind',relkind,'rls',relrowsecurity,'force_rls',relforcerowsecurity,'owner',pg_get_userbyid(relowner),'acl',relacl::text) ORDER BY relname) FROM relations),'[]'::jsonb),
 'columns',coalesce((SELECT jsonb_agg(jsonb_build_object('table',r.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),'acl',a.attacl::text) ORDER BY r.relname,a.attnum)
  FROM relations r JOIN pg_catalog.pg_attribute a ON a.attrelid=r.oid
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
 'constraints',coalesce((SELECT jsonb_agg(jsonb_build_object('table',r.relname,'name',c.conname,'type',c.contype,'validated',c.convalidated,'deferrable',c.condeferrable,'definition',pg_get_constraintdef(c.oid)) ORDER BY r.relname,c.conname)
  FROM relations r JOIN pg_catalog.pg_constraint c ON c.conrelid=r.oid),'[]'::jsonb),
 'indexes',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.tablename,i.indexname) FROM pg_catalog.pg_indexes i JOIN expected_tables e ON e.name=i.tablename WHERE i.schemaname='public'),'[]'::jsonb),
 'rls_policies',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.tablename,p.policyname) FROM pg_catalog.pg_policies p JOIN expected_tables e ON e.name=p.tablename WHERE p.schemaname='public'),'[]'::jsonb),
 'triggers',coalesce((SELECT jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid),'function',t.tgfoid::regprocedure::text) ORDER BY t.tgrelid::regclass::text,t.tgname) FROM audit_triggers t),'[]'::jsonb),
 'trigger_functions',coalesce((SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'security_definer',p.prosecdef,'settings',p.proconfig,'owner',pg_get_userbyid(p.proowner),'definition',pg_get_functiondef(p.oid)) ORDER BY p.oid::regprocedure::text)
  FROM pg_catalog.pg_proc p WHERE p.oid IN (SELECT tgfoid FROM audit_triggers)),'[]'::jsonb),
 'functions',coalesce((SELECT jsonb_agg(jsonb_build_object('signature',f.oid::regprocedure::text,'security_definer',f.prosecdef,'volatility',f.provolatile,'settings',f.proconfig,'owner',pg_get_userbyid(f.proowner),'acl',f.proacl::text,'definition',pg_get_functiondef(f.oid)) ORDER BY f.oid::regprocedure::text) FROM functions f),'[]'::jsonb),
 'effective_function_privileges',coalesce((SELECT jsonb_agg(jsonb_build_object('function',f.oid::regprocedure::text,'role',r.rolname,'execute',has_function_privilege(r.rolname,f.oid,'EXECUTE')) ORDER BY f.oid::regprocedure::text,r.rolname) FROM functions f CROSS JOIN application_roles r),'[]'::jsonb),
 'public_function_execute',coalesce((SELECT jsonb_agg(jsonb_build_object('function',f.oid::regprocedure::text,'public_execute',EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) ORDER BY f.oid::regprocedure::text) FROM functions f),'[]'::jsonb),
 'effective_table_privileges',coalesce((SELECT jsonb_agg(jsonb_build_object('table',t.relname,'role',r.rolname,'privilege',priv,'granted',has_table_privilege(r.rolname,t.oid,priv)) ORDER BY t.relname,r.rolname,priv)
  FROM relations t CROSS JOIN application_roles r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) priv),'[]'::jsonb),
 'effective_column_privileges',coalesce((SELECT jsonb_agg(jsonb_build_object('table',t.relname,'column',a.attname,'role',r.rolname,'privilege',priv,'granted',has_column_privilege(r.rolname,t.oid,a.attnum,priv)) ORDER BY t.relname,a.attnum,r.rolname,priv)
  FROM relations t JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid CROSS JOIN application_roles r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) priv WHERE a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
 'default_privileges',coalesce((SELECT jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'object_type',d.defaclobjtype,'acl',d.defaclacl::text))
  FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace WHERE d.defaclnamespace=0 OR n.nspname='public'),'[]'::jsonb),
 'possible_bypass_functions',coalesce((SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'security_definer',p.prosecdef,'owner',pg_get_userbyid(p.proowner),'settings',p.proconfig,'definition',pg_get_functiondef(p.oid)) ORDER BY p.oid::regprocedure::text)
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'
  AND (p.prosrc ILIKE '%confirm_payment_and_issue_ticket%' OR (p.prosecdef AND p.prosrc ILIKE '%orders%'))),'[]'::jsonb)
) AS staging_read_only_audit;
ROLLBACK;
