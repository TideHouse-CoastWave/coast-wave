# Validation plan (SQL not executed)

## Offline checks now

Run `node --test supabase/tests/*.test.mjs` from the coast-wave project.
All HTTP/provider access in these tests is injected/mocked. The new proposal
tests parse the audit, verify inventory/privilege coverage, compare the secure
creator body and foundation contracts, and exercise disabled provider gates.
Static checks do not prove PostgreSQL parsing, role switching, locking or RLS.
Do not run build/dev commands that could alter application artifacts unnecessarily.

## Gate A: before future database execution

Obtain separate approval identifying the disposable clone endpoint/project,
approved SQL file hashes, data-free or synthetic baseline, permitted test writes,
authorized operator role and restore plan. Verify source staging provenance
independently. Complete BASELINE_RECONCILIATION.md and full dependency review.
Preserve all four NCBA flags as false and keep schedules/handlers undeployed.

Complete PRODUCTION_ISOLATION.md before any connection or credential release.
The existing SQL flags do not establish target identity. The narrow 02 changes
postgres-created public defaults only; it preserves global and supabase_admin
defaults. Review DEFAULT_PRIVILEGES_AUTHORITY.md and accept the residual PUBLIC
EXECUTE risk and mandatory atomic per-function revocations. Confirm the approved
operator can act as postgres; managed-role impersonation is not required. No
membership changes are permitted. Full present authority still needs later
approved read-only verification, not trial DDL.

Save exact pre-change ACLs, column grants, defaults and policies in private
recovery artifacts. Preserve service privileges and the secure-order function
checksum. Review current platform/tool instructions before executing deployment
or baseline repair commands; no such tool was connected for this package.

## Gate B: security and baseline, clone only

Use explicit clone connection configuration and a client configured to stop on
the first error. Each proposal has its own transaction. Session flags must be
set by the approved operator in the same connection, not assumed from a prior
session or inserted permanently into source files.

| Sequence | File/action | Required acknowledgments |
| --- | --- | --- |
| 1 | 01_security_hardening.sql | coastwave.security_proposal_approved=yes; coastwave.disposable_clone_verified=yes; coastwave.baseline_reviewed=yes |
| 2 | 02_default_privileges.sql | coastwave.defaults_proposal_approved=yes; coastwave.disposable_clone_verified=yes; coastwave.per_object_acl_contract_reviewed=yes |
| 3 | tests/sql/05_security_baseline.sql | coastwave.disposable_clone_verified=yes |

05 is a psql script with ON_ERROR_STOP and a rollback-only transaction. It
asserts browser and inherited privilege denial, owner/bypass safety, restrictive
private policies, preserved service grants and secure creator execution. It
creates temporary-name public probe objects as postgres. It confirms residual
global PUBLIC EXECUTE on a harmless function, explicitly revokes browser/PUBLIC
execution and grants service execution in the same transaction, then rolls all
probes back. No supabase_admin impersonation or default-deny claim is made. These are test DDL writes and need explicit test permission.
It also verifies a service-role SELECT/UPDATE on an empty probe table succeeds
and a public browser SELECT fails. It never invokes real financial operations
or TRUNCATE: TRUNCATE denial is checked through effective privileges to avoid
destructive tests. If probes fail or a connection is interrupted, confirm the
transaction rolled back and restore the clone if necessary.

Expected result: no private browser table or column privileges, no catalogue
writes/maintenance, RLS enabled, no permissive private browser policy, service
creator access intact, no legacy confirmation RPC. The baseline test targets
the exported pre-NCBA state; run it before operations are installed.

## Gate C: NCBA database operations, still no provider calls

Separately approve the exact existing operations SQL and execution ledger. Run
once only after B passes. Do not run the foundation CREATE migrations. Then:

1. Existing `tests/sql/10_privileges.sql`: exactly 15 service-only RPCs, no stale
   overloads, browser invocation denial, private table grants including PostgreSQL
   17 MAINTAIN, evidence financial
   field immutability and service execution.
2. Existing `20_lifecycle.sql`: use an approved synthetic active category UUID;
   execute as service_role, check ownership denial, invalid financial evidence,
   replay, duplicate/conflicting notifications, receipt reuse, ticket hashes,
   exact quantity/ordinals, outbox/audit and rollback on intermediate failure.
3. Existing `40_isolation.sql`: explicitly reject unsupported isolation.
4. Existing `30_concurrency_setup.sql`, paired `31_concurrency_session.sql`, then
   `32_concurrency_assertions.sql`: follow STAGING_RUNBOOK.md timing/markers for
   each scenario. This setup COMMITS fixtures; restore clone afterward. Verify
   idempotency across orders/keys, expiry after lock waits, callback/finalizer
   races, shared receipt arbitration, fenced evidence work and one query dispatch.
5. Before rollout extend tests for future staff redemption versus credential
   rotation, double scans, event scope, staff removal and historical formats;
   those backend paths are not implemented and cannot yet pass end-to-end tests.

Inspect unexpected SQLSTATEs; unavailable helpers or privilege failures are not
passes. Test role behavior through the eventual authenticated API boundary in
addition to direct SQL before any interface rollout. No synthetic attestation
is evidence of a working bank verifier or actual payment.

## Acceptance and stop conditions

Stop on schema/policy drift, history ambiguity, identity uncertainty, unsafe
effective grants, unavailable owner privileges, unexpected payment/ticket data,
test failures, provider attempts or inconsistent committed state. Do not weaken
assertions to obtain a pass. Record version/file hashes, test results, operator,
target identity and clone restoration. Database-only tests can proceed after
separate approval without bank credentials; provider activation cannot.

Bank test vectors, verifier contract, credential handling, retention, inventory,
rate limits, delivery and authenticated staff transition remain activation gates.
