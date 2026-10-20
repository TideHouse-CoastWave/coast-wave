# Coast Wave / TIDEHOUSE LIVE: local NCBA readiness proposal

Prepared 20 October 2026. REVIEW ONLY: no SQL execution, Supabase connection,
deployment, provider activation, or checkout/admin changes were performed.
Approval to prepare these files is not permission to execute them.

## Confirmed findings

Source: `../../audits/coastwave_staging_audit.json`, SHA-256
`8313fcde29cea1791a3d3a6896f177daf4d14b2f9b1a098b7ac9342cc9fb6ccd`.
The export parses as one audit record: 9 tables, 111 columns, 97 validated
constraints, 37 indexes, 189 table privilege checks and 1,332 column checks.
No duplicate identities in those collections. It reports PostgreSQL 17.11,
read-only audit transaction and READ COMMITTED isolation.

All nine tables use RLS, owned by postgres, with no policies. Ordinary browser
row reads/writes are consequently denied in this snapshot. Broad browser grants
on orders/tickets are still unsafe, especially TRUNCATE, which RLS does not
protect. The audit did not test PostgreSQL 17 MAINTAIN privileges; the proposal
adds that check. Effective column privileges arise from table grants: all column
ACL fields in the export are null, not independent column grants.

The secure-order function body matches migration 20261017000200 exactly,
uses SECURITY INVOKER/empty search_path and is executable only by service_role
and its owner. Foundation column types/required fields and named constraints
checked against 20261017000100 are compatible. NCBA objects are absent.
The legacy confirmation RPC has zero overloads; the bypass-function heuristic
and user-trigger inventory are empty. No duplicate index definitions were found.

The JSON contains an expected project ref, `fknoimjcovjmmiivmime`, but explicitly
does not verify connection identity. It is not a complete dependency graph,
row-data audit, function census or view inventory. Project provenance and
indirect paths require independent review before execution approval.

## Proposed changes

| Artifact | Proposed behavior |
| --- | --- |
| `01_security_hardening.sql` | Remove public/browser access to private foundation data; preserve catalogue SELECT grants, RLS denial and service access; add restrictive safeguards |
| `02_default_privileges.sql` | Restrict postgres public-schema defaults only; retain global and managed-owner defaults, requiring atomic per-object ACLs |
| `PRODUCTION_ISOLATION.md` | Independent clone identity, dedicated credentials, endpoint isolation and signed action approval |
| `DEFAULT_PRIVILEGES_AUTHORITY.md` | Official role/default semantics, offline authority assessment and residual risks |
| `STAFF_REDEMPTION_ARCHITECTURE.md` | Proposed event-scoped authorization and atomic individual admission contract |
| `BASELINE_HASHES.json` | Byte hashes binding evidence and approved-source candidates; not execution approval |
| `BASELINE_RECONCILIATION.md` | Reconcile deployed objects before recording any migration baseline |
| `ADMIN_COMPATIBILITY.md` | Trace current interfaces and define a future authenticated staff transition without payment shortcuts |
| `NCBA_PREREQUISITES.md` | Exact four-table/15-RPC inventory, dependency and bank gates |
| `STAGING_TEST_PLAN.md` | Ordered offline and future disposable-clone validation |
| `ROLLBACK.md` | Empty-install recovery versus recovery after activity |
| `../../tests/sql/05_security_baseline.sql` | Transactional assertions and rollback-only postgres-default/per-function ACL probes |
| `../../tests/ncba-proposal.test.mjs` | Offline export consistency, schema contract, inventory and disabled-provider checks |

No new SQL is added to `supabase/migrations`. The existing operations draft
`20261020000100_ncba_payment_operations.sql` is referenced, not changed or
duplicated. Its presence in that directory remains a reason NOT to run a blind
CLI push. Do not deploy any existing migration file until separately approved.
The older `drafts/security_cutover.sql` is not the plan for this package: it does
not cover privacy, catalogue grants or default privileges. Do not apply both.

The hardening proposal requires the audited owner/RLS/no-policy baseline and
aborts on drift. It is intentionally one-time, not idempotent. Its policies do
not make any currently denied browser operation succeed. A future direct staff
policy would require revisiting restrictive denials; the proposed staff design
uses authenticated backend boundaries instead.

Existing service-role access is not revoked or expanded. No existing object is
recreated. No backend runtime changes are needed to prepare the database package.
Adding a staff service without an approved staff role/event model would invent
authorization, so future backend requirements are specified rather than shipped.
The existing create-customer-order, status, ticket-access and reconciliation
handlers already use the 15-RPC contract. The documentation-only redeem-ticket
directory is not an implemented staff service.

## Approval boundaries and order

1. Review this proposal, project provenance, full dependency inventory and
   restorable disposable-clone baseline. Reconcile history; do not recreate tables.
2. Complete PRODUCTION_ISOLATION.md and DEFAULT_PRIVILEGES_AUTHORITY.md; approve
   postgres-only public defaults and mandatory per-object revocations. The earlier
   global/supabase_admin default proposal is superseded. Managed-owner automatic
   privacy remains unresolved; no managed impersonation is proposed.
3. On the clone only: run 01, then 02, then 05 baseline tests.
4. After baseline passes, separately approve the operations draft; run it once,
   then existing privilege, lifecycle, isolation and concurrency suites.
5. Resolve staff/customer interface transitions, inventory and bank requirements
   before any functional rollout. Provider tests and deployments need new approval.

Do not set approval flags in source files. Flags are operator acknowledgments,
not proof of authorization or project identity. The execution session must set
only flags for actions explicitly approved; flags cannot enable provider calls.

## Unresolved bank requirements

Keep NCBA_NETWORK_ENABLED, NCBA_SANDBOX_APPROVED,
NCBA_INITIATION_CONTRACT_CONFIRMED and NCBA_NOTIFICATION_HASH_CONFIRMED false;
leave handlers undeployed and schedules disabled. Never infer sandbox credentials
or a host from published production examples. Exact bank requirements and the
distinction between database tests and provider activation are in
`NCBA_PREREQUISITES.md`. There is still no automatic trusted-verifier writer.

Status: local package ready for review; database correctness and staging
execution readiness remain unproven until the stated gates and tests pass.
