# Recovery and rollback proposal

No rollback was executed. Approval is required for each recovery action and exact
target. Keep provider networking off, stop workers and isolate the affected clone
before assessing recovery. Save diagnostics without PII or secrets in logs.

## Transaction failure

01 and 02 use BEGIN/COMMIT and fail on baseline drift. With stop-on-error, a
failure must roll back the entire transaction; disconnect/ROLLBACK an aborted
session before proceeding. The operations migration is also atomic. Verify the
catalog after failure; a successful earlier file is not undone by a later file's
failure. Never rerun the full batch to guess which files committed.

## Security grants and defaults

Preferred test recovery is restoring the disposable-clone snapshot, preserving
the source staging environment untouched. Do not ship a generic GRANT ALL undo:
the audited browser grants are unsafe and should not be restored in an exposed
database. Existing checkout/admin compatibility is not a reason to reopen them.

If an approved targeted recovery is needed, use the privately captured exact
pre-change ACL/default statements, creator identities and policy inventory.
Reversing 01 would require removing only its named policies and restoring only
reviewed access. Do not drop unrelated policies, disable RLS or use CASCADE.
Default changes affect future objects only: restoring defaults does not change
ACLs on objects created during the hardened period. Inventory those separately.
The revised 02 does not change global defaults or supabase_admin defaults. Do
not execute an older global-revocation proposal or a global GRANT as its undo.
Restore only reviewed postgres public-schema defaults if explicitly approved.

No executable security undo SQL is supplied because a blanket reversal would
reopen unsafe privileges. A specific safe forward fix or clone restoration is
the recommended response.

## Empty NCBA installation

The existing `../../drafts/rollback_ncba_operations_empty.sql` is a review-only
starting point. Use only after separate approval, independently verifying no
new tables contain rows and no NCBA attempts/events/receipts or test schema exist.
Stop API/worker traffic, acquire appropriate locks and recheck emptiness in the
same transaction before a reviewed drop sequence. Its current guard alone is
not a race-proof production rollback. Do not execute it as an automated step.

It uses explicit function signatures and RESTRICT; preserve those safeguards.
Drop only the NCBA additions, never the nine foundation tables or secure creator.
The evidence queue index is owned by its dropped table; the conflict index on
the existing payment_events table needs its explicit drop. Reconcile the chosen
migration ledger only after the actual schema recovery is verified.

## After any order/payment/admission activity

Do not drop or delete NCBA records, revoke admissions silently, reset redeemed
state, reuse receipts, or mark Paid orders pending as a schema rollback.
Pause workers/provider calls, retain evidence/audit/outbox history and investigate
with a forward repair. Financial reversals and admission revocations require
separate bank/business rules and authorization. A clone can be restored and
tests repeated; a database with real activity needs a documented recovery and
reconciliation plan. This package does not implement that financial process.
