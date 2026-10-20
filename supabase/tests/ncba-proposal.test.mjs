import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {provider, authenticateNotification} from '../functions/_shared/ncba.ts';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const raw = read('../audits/coastwave_staging_audit.json');
const root = JSON.parse(raw);
const audit = root[0].staging_read_only_audit;
const proposal = name => read(`../proposals/ncba/${name}`);
const operations = read('../migrations/20261020000100_ncba_payment_operations.sql');
const tables = ['order_customer_access','ncba_verification_evidence','customer_order_creation_keys','ncba_query_jobs'];
const signatures = [
 'create_customer_pending_order_secure(uuid,jsonb,integer,integer,integer)',
 'ncba_lock_identity(text,text,text)',
 'claim_ncba_attempt(uuid,uuid,text,text,text,text,boolean)',
 'record_ncba_submission(uuid,text,jsonb)',
 'ingest_ncba_notification(text,text,text,jsonb)',
 'customer_payment_status(uuid,uuid)',
 'finalize_ncba_payment(uuid,jsonb,uuid)',
 'ncba_finalization_quantity(uuid)',
 'retrieve_customer_ticket(uuid,uuid,uuid,text)',
 'list_customer_tickets(uuid,uuid)',
 'ncba_reconciliation_queue()',
 'block_ncba_evidence(uuid,uuid,text)',
 'claim_ncba_query_jobs()',
 'begin_ncba_query(uuid,uuid)',
 'record_ncba_query(uuid,uuid,jsonb,text,boolean)',
];
const normalize = value => value.replace(/\r/g, '').trim();

test('proposal evidence is the pinned complete audit snapshot, not execution readiness', () => {
 assert.equal(root.length, 1);
 assert.equal(createHash('sha256').update(raw).digest('hex'), '8313fcde29cea1791a3d3a6896f177daf4d14b2f9b1a098b7ac9342cc9fb6ccd');
 assert.equal(audit.inspection.expected_project_ref, 'fknoimjcovjmmiivmime');
 assert.equal(audit.inspection.project_identity_verified_by_sql, false);
 assert.equal(audit.inspection.transaction_read_only, 'on');
 for (const [key, fields, count] of [
  ['tables',['name'],9], ['columns',['table','name'],111],
  ['constraints',['table','name'],97], ['indexes',['schemaname','indexname'],37],
  ['effective_table_privileges',['role','table','privilege'],189],
  ['effective_column_privileges',['role','table','column','privilege'],1332],
 ]) {
  assert.equal(audit[key].length, count, key);
  const keys = audit[key].map(row => fields.map(f => {assert.equal(typeof row[f], 'string');return row[f];}).join('|'));
  assert.equal(new Set(keys).size, keys.length, key);
 }
 for (const table of audit.tables) {
  for (const role of ['anon','authenticated','service_role']) {
   for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) {
    assert.equal(typeof audit.effective_table_privileges.find(p => p.table===table.name&&p.role===role&&p.privilege===privilege)?.granted, 'boolean');
   }
  }
 }
 for (const column of audit.columns) {
  for (const role of ['anon','authenticated','service_role']) {
   for (const privilege of ['SELECT','INSERT','UPDATE','REFERENCES']) {
    assert.equal(typeof audit.effective_column_privileges.find(p => p.table===column.table&&p.column===column.name&&p.role===role&&p.privilege===privilege)?.granted, 'boolean');
   }
  }
 }
 assert.ok(audit.constraints.every(c => c.validated));
});

test('snapshot confirms row denial, unsafe grants and missing history as separate facts', () => {
 assert.ok(audit.tables.every(t => t.rls && t.owner==='postgres'));
 assert.deepEqual(audit.rls_policies, []);
 assert.ok(audit.columns.every(c => c.acl===null));
 assert.equal(audit.migration_history.status, 'missing');
 for (const role of ['anon','authenticated']) {
  assert.equal(audit.roles.find(r => r.name===role).bypass_rls, false);
  for (const table of ['orders','tickets']) {
   assert.equal(audit.effective_table_privileges.find(p=>p.table===table&&p.role===role&&p.privilege==='TRUNCATE').granted, true);
  }
  assert.ok(audit.effective_table_privileges.filter(p=>p.role===role&&!['orders','tickets'].includes(p.table)).every(p=>!p.granted));
 }
 assert.equal(audit.function_presence.find(f=>f.function==='confirm_payment_and_issue_ticket').overload_count, 0);
});

test('foundation column and named constraint contracts agree with exported catalog', () => {
 const foundation = read('../migrations/20261017000100_secure_payment_foundation.sql');
 let checked = 0;
 for (const match of foundation.matchAll(/CREATE TABLE public\.(\w+) \(([\s\S]*?)\n\);/g)) {
  for (const line of match[2].split('\n')) {
   const column = line.match(/^  (\w+) (uuid|text|bytea|integer|jsonb|timestamptz|numeric\(20,2\))(.*)/);
   if (!column) continue;
   checked++;
   const actual = audit.columns.find(c=>c.table===match[1]&&c.name===column[1]);
   assert.ok(actual, `${match[1]}.${column[1]}`);
   assert.equal(actual.type, column[2]==='timestamptz'?'timestamp with time zone':column[2]);
   if (/NOT NULL|PRIMARY KEY/.test(column[3])) assert.equal(actual.not_null, true);
  }
 }
 assert.equal(checked, 81);
 for (const [,name] of foundation.matchAll(/CONSTRAINT\s+(\w+)/g)) assert.ok(audit.constraints.some(c=>c.name===name), name);
 const local = read('../migrations/20261017000200_secure_order_creation.sql');
 const body = sql => normalize(sql.split('AS $function$')[1].split('$function$')[0]);
 assert.equal(body(local), body(audit.functions[0].definition));
 assert.equal(audit.functions[0].security_definer, false);
 assert.equal(audit.public_function_execute[0].public_execute, false);
});

test('documented four-table and fifteen-RPC inventory matches existing unapplied source', () => {
 assert.deepEqual([...operations.matchAll(/^CREATE TABLE public\.(\w+)/gm)].map(m=>m[1]).sort(), [...tables].sort());
 const actual = [...operations.matchAll(/^CREATE FUNCTION public\.(\w+)\(([^\n]*)\)/gm)].map(([,name,args]) => {
  const types = args ? args.split(',').map(a=>a.trim().split(/\s+/)[1]).join(',') : '';
  return `${name}(${types})`;
 });
 assert.deepEqual(actual.sort(), [...signatures].sort());
 for (const signature of signatures) {
  assert.ok(proposal('NCBA_PREREQUISITES.md').includes(signature), signature);
  assert.equal(audit.function_presence.find(f=>f.function===signature.split('(')[0]).overload_count, 0);
 }
 for (const table of tables) assert.equal(audit.table_presence.find(t=>t.table===table).present, false);
});

test('proposal SQL remains separately gated and does not recreate foundation or grant browser writes', () => {
 const files = readdirSync(new URL('../proposals/ncba/', import.meta.url)).filter(f=>f.endsWith('.sql'));
 assert.deepEqual(files.sort(), ['01_security_hardening.sql','02_default_privileges.sql']);
 for (const file of files) {
  const sql = proposal(file);
  assert.ok(sql.includes("current_setting('coastwave.disposable_clone_verified',true)"));
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /CREATE\s+(?:OR REPLACE\s+)?(?:TABLE|FUNCTION)\s+public\./i);
  assert.doesNotMatch(sql, /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE|TRUNCATE)[^;]*TO\s+(?:PUBLIC|anon|authenticated)/i);
  // Catch accidental unmatched dollar-quote blocks during local editing.
  const tags = [...sql.matchAll(/\$[a-z_]+\$/g)].map(m=>m[0]);
  for (const tag of new Set(tags)) assert.equal(tags.filter(t=>t===tag).length, 2, tag);
 }
});

for (const flag of ['network','approved','contract']) {
 test(`unconfirmed ${flag} prevents initiation and query provider calls`, async () => {
  let calls = 0;
  const settings = {network:true,approved:true,contract:true,base:'https://bank.example.test/',username:'offline',password:'offline',paybill:'880100',account:'TEST',scope:'TEST',acceptedCode:'0',[flag]:false};
  const bank = provider(settings, async () => {calls++;throw new Error('Unexpected provider call');});
  await assert.rejects(bank.initiate('254712345678','10'), /ncba_disabled_or_unconfirmed/);
  await assert.rejects(bank.query('TEST'), /ncba_disabled_or_unconfirmed/);
  assert.equal(calls, 0);
 });
}

test('unconfirmed notification contract cannot authenticate evidence', async () => {
 await assert.rejects(authenticateNotification({}, {hashConfirmed:false}), /notification_contract_unconfirmed/);
});

test('baseline byte-hash manifest binds exact audit, migration and security test files', () => {
 const manifest = JSON.parse(proposal('BASELINE_HASHES.json'));
 assert.equal(manifest.approval_status, 'not-approved-for-execution');
 assert.equal(Object.keys(manifest.files).length, 8);
 for (const [path, expected] of Object.entries(manifest.files)) {
  assert.ok(!path.includes('..') && !path.startsWith('/'), path);
  const bytes = readFileSync(new URL(`../${path}`, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, path);
 }
 assert.equal(manifest.files['migrations/20261017000100_secure_payment_foundation.sql'], '8cafc16fb888b85525e4392a4573a0765a726fcbf4a490e73c73c61bb9e89e22');
 assert.equal(manifest.files['migrations/20261017000200_secure_order_creation.sql'], '9b83335c7694bf0d3c0d390d544b35041bb86f59d89ade9da4d9a23dca9976f5');
 assert.equal(manifest.files['migrations/20261020000100_ncba_payment_operations.sql'], '541e332676496293a2c4e879717c8435a4c46b193940b4e887e00b7ca4ec825b');
});

test('narrow default SQL changes only postgres public defaults and never global or managed defaults', () => {
 const sql = proposal('02_default_privileges.sql');
 const statements = [...sql.matchAll(/EXECUTE format\('([^']*ALTER DEFAULT PRIVILEGES[^']*)'/g)].map(m=>m[1]);
 assert.equal(statements.length, 3);
 for (const statement of statements) assert.ok(statement.includes('IN SCHEMA public REVOKE'), statement);
 assert.match(sql, /FOREACH creator IN ARRAY ARRAY\['postgres'\]/);
 assert.doesNotMatch(sql.replace(/--[^\n]*/g,''), /supabase_admin/);
 const baseline = read('../tests/sql/05_security_baseline.sql');
 assert.match(baseline, /FOREACH creator IN ARRAY ARRAY\['postgres'\]/);
 assert.ok(baseline.indexOf('Unexpected global function-default drift') < baseline.indexOf('REVOKE ALL PRIVILEGES ON FUNCTION'));
 assert.ok(baseline.indexOf('REVOKE ALL PRIVILEGES ON FUNCTION') < baseline.indexOf('GRANT EXECUTE ON FUNCTION'));
 assert.ok(baseline.indexOf('GRANT EXECUTE ON FUNCTION') < baseline.lastIndexOf('ROLLBACK;'));
});

test('post-NCBA browser privilege denial includes PostgreSQL 17 MAINTAIN', () => {
 const sql = read('../tests/sql/10_privileges.sql');
 const loop = sql.match(/FOREACH priv IN ARRAY ARRAY\[([^\]]+)\] LOOP\s+PERFORM pg_temp.assert_true\(NOT has_table_privilege/);
 assert.ok(loop);
 assert.ok(loop[1].includes("'MAINTAIN'"));
 assert.ok(sql.includes("ARRAY['anon','authenticated']"));
 assert.match(sql, /ROLLBACK;\s*$/);
});
