# CoastWave NCBA staging validation

Status: local review artifacts only. No Supabase SQL, deployment, bank request,
production access, or security cutover has been performed. Approval for local
changes is not approval to run the commands below.

## What has been reviewed

The revised 20261020000100 migration was compared to repository migrations
20261017000100 (payment foundation) and 20261017000200 (secure order creation).
No current staging catalog export or legacy RPC body is available locally.
The security of the actual deployed foundation is therefore NOT certified.

The migration is an unapplied draft, edited in place. Confirm migration history
BEFORE applying it. If any version of 20261020000100 already ran, stop: prepare
an additive upgrade migration from its actual schema; do not reapply this file.

## Approval and prerequisite checklist

1. Obtain explicit approval for read-only staging inspection and identify the
   exact CoastWave Staging project reference and database hostname. Match both
   to the connection configuration, not merely current_database() (Supabase
   databases commonly share a name). Never use an implicitly linked project.
2. Keep NCBA_NETWORK_ENABLED, NCBA_SANDBOX_APPROVED,
   NCBA_INITIATION_CONTRACT_CONFIRMED and NCBA_NOTIFICATION_HASH_CONFIRMED false.
   Keep schedules and new Edge Functions undeployed. No credentials are needed
   for the SQL tests; do not print connection strings or store them in Git.
3. Securely capture schema, grants (including column/default grants), role
   memberships, policies, triggers, migration history, and a restorable snapshot.
4. Run tests/sql/00_preflight_and_legacy_audit.sql READ ONLY after that approval.
   It collects all confirm_payment_and_issue_ticket overloads and candidate
   SECURITY DEFINER wrappers. Inspect ownership, search_path, staff permission,
   arbitrary p_verified_by, receipt uniqueness, paid-state mutation, QR creation,
   repeat calls and other indirect ways to mutate orders. Text searches are
   candidates, not complete proof of no bypass. Review the full bodies and role
   graph. Store audit outputs privately: legacy bodies could contain secrets.
5. Verify base orders/tickets schema is compatible with the existing secure-order
   preflight. Confirm UUID IDs, bigint financial values, valid quantity, category
   defaults/active status and Paid/pending casing, constraints and trigger effects.
   Check service_role BYPASSRLS, schema USAGE, SELECT/INSERT/UPDATE on orders and
   tickets, appropriate foundation privileges and EXECUTE on create_pending_order_secure.
   Verify pg_catalog gen_random_uuid(), sha256(bytea), advisory-lock and SKIP LOCKED
   support. New RPCs explicitly require READ COMMITTED where lock/snapshot correctness
   depends on it. Existing arbitrary schema/default/trigger behavior needs actual tests.
6. Confirm both prerequisite migrations are already applied exactly once. Otherwise
   review/apply 20261017000100 then 20261017000200 first, under separate execution
   approval. Do not run them blindly if tables already exist.
7. Create a disposable clone with clean new evidence/query queues, no active
   handlers/schedules and an approved synthetic active category supporting quantity 2.
   Never use a real customer's category/order for test fixtures. Capture a clone
   baseline to restore. SQL fixture users are synthetic UUIDs and do not prove Auth.

## Proposed execution sequence after separate approval

Use a secret environment variable for the explicit CLONE connection, never an
inline password. The examples are PowerShell and psql, not commands run here.
Use a known psql installation; it is unavailable in the current local environment.

```powershell
psql "$env:COASTWAVE_CLONE_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/sql/00_preflight_and_legacy_audit.sql
psql "$env:COASTWAVE_CLONE_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261020000100_ncba_payment_operations.sql
psql "$env:COASTWAVE_CLONE_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/sql/10_privileges.sql
psql "$env:COASTWAVE_CLONE_DB_URL" -X -v ON_ERROR_STOP=1 -v ticket_id=$env:COASTWAVE_TEST_CATEGORY_ID -f supabase/tests/sql/20_lifecycle.sql
```

The migration contains its own BEGIN/COMMIT. Run once with stop-on-error; do not
wrap conflicting transaction controls around it. Direct psql execution does not
record Supabase CLI migration history automatically. Choose and document ONE
migration-history procedure before application. If using CLI later, review its
pending migration list: never push unreviewed drafts or replay foundation SQL.

10_privileges and 20_lifecycle roll back their temporary helpers/fixtures.
Lifecycle tests operate as service_role, not as an owner silently bypassing
application privileges. The permission suite also executes denial checks as
anon/authenticated and verifies no stale overloads or PUBLIC execution grants.

### Paired-session concurrency verification

Only the disposable clone: setup commits synthetic fixtures and creates a private
ncba_staging_test schema. Restore the clone afterward; do not add browser policies
or expose this schema. Use a fresh baseline with no existing evidence/query jobs.

```powershell
psql "$env:COASTWAVE_CLONE_DB_URL" -X -v ON_ERROR_STOP=1 -v disposable_clone=yes -v ticket_id=$env:COASTWAVE_TEST_CATEGORY_ID -f supabase/tests/sql/30_concurrency_setup.sql
```

For EACH scenario below, start session A, wait for its `A HOLDING` notice, then
start B while A holds its transaction (within 2 seconds for the expiry scenario;
within 8 seconds for other scenarios). The expiry test asserts that B actually
started before the cutoff, so a late start cannot give a false pass. Both must finish without
unexpected SQLSTATEs. A and B are independent database connections. Tests use
20-second lock and 45-second statement timeouts. Finish within the synthetic
one-hour evidence claim window; restore/recreate the clone if it expires.

```powershell
# Terminal A (set the scenario in each terminal):
psql "$env:COASTWAVE_CLONE_DB_URL" -X -v ON_ERROR_STOP=1 -v ticket_id=$env:COASTWAVE_TEST_CATEGORY_ID -v scenario=retry -v side=A -f supabase/tests/sql/31_concurrency_session.sql
# Terminal B, during A's HOLDING window:
psql "$env:COASTWAVE_CLONE_DB_URL" -X -v ON_ERROR_STOP=1 -v ticket_id=$env:COASTWAVE_TEST_CATEGORY_ID -v scenario=retry -v side=B -f supabase/tests/sql/31_concurrency_session.sql
```

| Scenario | Expected result |
|---|---|
| creation | One customer order and stable ownership/key mapping; B replays. |
| retry | One attempt; B returns claimed=false. |
| different_key | B gets controlled CP002; no second attempt. |
| cross_order | Same scoped key on different orders: B gets CP002, never 23505. |
| expiry | B begins before deadline but waits; after A commits, no new claim. |
| notification | Two deliveries become one inbox event. |
| finalize | One receipt, two tickets/jobs; B verifies committed replay. |
| conflict_before | A commits quarantine; B cannot issue tickets (CP003). |
| conflict_after | A finalizes first; B flags late conflict without revoking Paid. |
| receipt_race | One canonical receipt allocation; B CP003, no partial writes. |
| query_job | One durable dispatch authorization; B cannot obtain same job. No HTTP. |
| evidence_job | One fenced evidence claim; B skips locked evidence. |

After all pairs, run:

```powershell
psql "$env:COASTWAVE_CLONE_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/sql/32_concurrency_assertions.sql
psql "$env:COASTWAVE_CLONE_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/sql/40_isolation.sql
```

A connection/process error is NOT a pass. Record scenario, SQLSTATE, result and
row counts. Extend tests to the actual staging constraints/triggers found in the
catalog audit. Neither source assertions nor these unexecuted scripts establish
PostgreSQL correctness until they pass against the clone.

## Serial verification coverage and acceptance gates

20_lifecycle covers creation replay/changed inputs, ownership denial, replay after
payment-window expiry and Paid, no alternate charge, duplicate and conflicting
notifications, canonical receipt reuse, null merchant/digest/currency/amount/attempt
mismatches, finalization replay integrity, QR rotation/revocation and query fencing.
Its duplicate ticket hash intentionally fails AFTER receipt, first admission and
outbox writes. Receipt, tickets, outbox, audit, event, attempt, evidence and order
must all roll back. Distinct hashes then finalize exactly once.

Fixtures insert explicit SYNTHETIC_SQL_ONLY attestations. These helpers are test
code, NOT bank verification. They are temporary and rolled back or confined to
the disposable test workflow. Never deploy them or generate real evidence this way.

A later staging HTTP phase must verify real Supabase customer JWTs and other-user
access denial, disabled new charges but allowed attempt replay, body limits,
notification hash vectors and authentication, worker bearer auth, no-store ticket
responses and redacted logs. No bank call is authorized by database-test approval.

## Locks, retries and recovery semantics

- Attempt key advisory lock precedes order/access/attempt locks. Same order and
  cross-order key races serialize; fallback constraint errors map to CP002.
  Replays require current authorized ownership but not an unexpired payment window.
  Customer access expiry still denies access; no recovery-by-order-ID is introduced.
- Receipt advisory lock precedes evidence/order/attempt/event/receipt locks in
  finalization. Ingestion uses the same identity before touching inbox rows.
  Any committed quarantine blocks new issuance and success replay. A conflict
  arriving AFTER a committed finalization cannot undo history: it flags review
  without invented refund/revocation behavior. All privileged writers must follow
  this protocol; service_role remains trusted and can bypass ordinary RLS.
- READ COMMITTED is enforced for lock-dependent snapshot arbitration. Unsupported
  isolation gets CP005. Expiry checks use clock_timestamp AFTER relevant waits.
- Finalization replay validates current receipt/evidence snapshots, paid state,
  exact ticket count/ordinals, per-ticket delivery keys and finalization audit.
  Attempt snapshots also pin quantity, unit price and category; changing quantity
  while keeping the total cannot increase admissions.
  Redemption/revocation/credential rotation do not erase the admission count.
- Evidence claims use SKIP LOCKED, tokens and five-minute leases; max five crash
  recoveries, then blocked. A rejected record is quarantined immediately; unrelated
  records continue. A stale worker cannot block a newer claim. Review blocked
  records manually; no automatic financial evidence repair is implemented.
- Query jobs have a two-minute PRE-dispatch lease and one-time begin authorization.
  Jobs also deduplicate the merchant/TransactionID query target across attempts;
  ambiguous reused identifiers are not treated as financial correlation.
  Complete queries may be polled again after two minutes. Dispatched/unknown jobs
  NEVER expire into automatic redispatch. If dispatch or completion acknowledgement
  is lost, operator reconciliation is required. This prevents overlapping worker
  dispatch, but does not claim exactly-once execution by NCBA or safely infer an
  external outcome. Never reset/requeue until the old worker has stopped and the
  uncertainty is resolved under a documented procedure.

## Security cutover is a separate, unactivated change

Local audit finds checkout directly inserting browser-derived orders and admin
calling confirm_payment_and_issue_ticket with a receipt string and p_verified_by
email. Its SQL body/grants are not in the repo: actual privilege/authorization
findings remain pending the read-only audit. No claim is made that it is currently
publicly executable or safely staff-restricted.

The legacy UI also trims/uppercases entered receipts. That behavior is not reused
by the NCBA verifier or signature checks; normalization/scope still needs the
bank contract. Existing checkout supplies price/total/status from browser code,
so effective database permissions and constraints, not disabled UI buttons,
must establish the security of the old path.

drafts/security_cutover.sql is intentionally outside automatic migrations and
requires four explicit session approval/readiness settings. It revokes table AND
column browser write privileges, denies browser writes with restrictive RLS policies,
and revokes all discovered legacy RPC overloads for PUBLIC/anon/authenticated and
service_role. Assertions fail if inherited access remains. It preserves definitions
for audit. It is NOT sufficient to audit every other SECURITY DEFINER wrapper.

Applying it now would break existing checkout/manual confirmation/check-in writes.
Do not apply until replacement checkout, verified staff routes, privacy policies,
legacy wrappers/role graph and rollback have separate approval. Existing SELECT
privacy controls are audited, not invented here. Runtime service keys never belong
in frontend code or VITE_ variables.

## Rollback

Before migration COMMIT: stop on error, ROLLBACK/disconnect, then verify no partial
objects/history entry. No bank request can be undone by a database rollback.

Committed but provably empty: stop all new endpoints/workers; review the gated
`drafts/rollback_ncba_operations_empty.sql`. It uses explicit signatures/RESTRICT,
refuses if new/NCBA records or concurrency fixtures exist and retains both foundation
migrations. It never deletes migration-history rows blindly.

Any new data/paid state: retain evidence, receipts, orders, admissions, audit and
outbox. Disable activity and use a corrective forward migration; dropping new
objects would not reverse foundation-table effects. For tests, restore the entire
disposable clone snapshot instead of deleting arbitrary orders or payment records.
For an eventual security-cutover rollback, restore the exact reviewed captured
ACL/policy definitions; never blanket-GRANT browser writes or legacy issuance.

## Remaining activation blockers

NCBA sandbox host/credentials, merchant mapping, acceptance code, callback hash
vectors and authenticated transaction/order correlation plus final-success rules
remain unconfirmed. No automatic verifier writes attestations. Existing browser
paths remain unchanged until coordinated cutover. Rate limits, capacity rules,
staff redemption and delivery workers remain separate prerequisites.

Next approval should authorize read-only staging catalog inspection first. Once
matched, approve the corrected migration and SQL suites on the disposable clone.
Only after that evidence should staging application/handler deployment be approved;
network enablement always requires another explicit decision.
