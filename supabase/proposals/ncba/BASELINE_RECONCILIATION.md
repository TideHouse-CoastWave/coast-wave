# Migration baseline reconciliation

## Confirmed

The audited `supabase_migrations.schema_migrations` relation is missing. This is
not evidence that existing objects are absent. The nine foundation tables and
secure-order RPC already exist; reapplying either foundation migration will
collide with them. The NCBA four tables and 15 functions are absent.

Sources: audit JSON and migrations 20261017000100, 20261017000200 and
20261020000100. The first two are structural prerequisites, not pending CREATE
statements to replay. The existing operations draft has privilege guards and
will refuse the current broad browser grants.

## Proposed reconciliation, before any execution

1. Independently verify project reference and exact dashboard/database endpoint.
   `current_database() = postgres` and the audit's constant expected ref do not
   establish identity. Record source provenance and audit checksum privately.
2. Capture a complete schema-only export and recoverable clone snapshot. Review
   views/materialized views, exposed schemas, function/procedure census and full
   bodies, pg_depend relationships, role memberships/SET ROLE options, schema
   CREATE privileges, triggers, policies, sequences and extension ownership.
   Text-matched bypass candidates in the audit are not comprehensive proof.
3. Compare all column types/nullability/default expressions, PK/unique/FK/check
   definitions, FK actions, indexes, ACLs and function settings against each
   foundation file. The local comparison confirms the secure-order body and
   checked foundation contracts; independent catalog acceptance must cover the
   full schema. Financial row consistency and retained data are separate checks.
4. If fully equivalent, record 20261017000100 and 20261017000200 as the accepted
   pre-existing baseline using a separately reviewed migration-tool procedure.
   If not equivalent, prepare targeted forward corrections for actual drift,
   validate them on a clone and only then accept the baseline. Never hide drift
   by marking a migration applied.
5. Review the tool's explicit target and pending list. Do not use an implicitly
   linked project or `db push` across all untracked drafts. Do not mark
   20261020000100 applied: its objects are absent. Do not manually fabricate a
   migration-history table/rows with this proposal.
6. Once execution is approved, assign fresh migration versions to the approved
   security proposals and a reviewed operations release. Decide whether to
   retain the existing operations version or promote a new version based on
   independently confirmed history; do not keep two executable copies.
   Only promote files into automatic migrations after separate approval.

The exact proposed history-only commands and stop/recovery conditions follow.
They are documentation, not executed scripts. Maintain one authoritative ledger
with version, file SHA-256, target identity, approval, result and schema acceptance.

## Acceptance

The baseline is accepted only when definitions match, no duplicate migrations
are pending, restore is demonstrated on the clone, and the ledger distinguishes
pre-existing foundation from newly applied security and NCBA operations. Missing
history remains a blocker until this is completed; no SQL has been run here.

## Exact foundation acceptance and repair procedure (future approval only)

0. Complete PRODUCTION_ISOLATION.md. Use an isolated run directory containing
   only verified copies of the TWO foundation migrations, with their original
   basenames, minimal local project configuration and no linked-project metadata.
   Do not run init/start/reset/push/pull/migration up. Those commands can apply
   SQL, generate schema snapshots or change history beyond this action.
1. Verify byte hashes against BASELINE_HASHES.json. At preparation time:

   | Version | File SHA-256 |
   | --- | --- |
   | 20261017000100 | 8cafc16fb888b85525e4392a4573a0765a726fcbf4a490e73c73c61bb9e89e22 |
   | 20261017000200 | 9b83335c7694bf0d3c0d390d544b35041bb86f59d89ade9da4d9a23dca9976f5 |
   | 20261020000100 (NOT a baseline) | 541e332676496293a2c4e879717c8435a4c46b193940b4e887e00b7ca4ec825b |

   Check duplicate version prefixes across every local migration before choosing
   the run directory. A line-ending change changes these byte hashes and needs
   renewed review; never silently normalize an approved file.
2. Choose and pin a Supabase CLI release and binary checksum. No CLI binary was
   found in the local PATH during preparation; no version is asserted as tested.
   Run only its offline --version and migration list/repair --help first. Confirm
   --db-url support and review that release's history-initialization path. Obtain
   approval for creation of migration metadata if schema_migrations is missing.
   If absent-history initialization is unsupported, stop for a supported
   platform/tooling procedure; do not hand-create a history table or run db push.
3. Under separately approved read-only clone access, capture schema-only/catalog
   exports and history state. Include session identity/role options; every
   foundation table column/type/typmod/nullability/default; all validated CHECK,
   PK/unique/FK definitions/actions; indexes; function signature/body/language/
   volatility/security/search_path/owner/ACL; RLS/policies, column ACLs and roles.
   Compare full definitions against the approved migration bytes, permitting only
   documented deparser formatting differences. Review extension/default function
   dependencies and row consistency separately. Names/counts alone cannot pass.
4. Review a comparison matrix for both versions: exact definition/ACL match,
   compatible intentional difference, or blocking drift. All intentional
   differences need signed acceptance with their forward correction plan; do not
   claim a migration was applied verbatim when only its baseline was accepted.
   The saved audit proves some contracts, not this complete matrix. In particular
   verify all unnamed constraints/defaults, views and indirect wrappers before
   recording the full foundation. No foundation CREATE statements are run.
5. Capture a restorable clone snapshot and pre-repair history export (or signed
   evidence of absence). Stop concurrent deployers. Inspect the complete history:
   each accepted foundation version may be absent or present once; duplicate or
   conflicting entries, an unexpected NCBA version, or newer unreviewed changes
   stop the procedure. Listing must not be assumed read-only when history is
   absent: review the pinned implementation for metadata initialization first.
6. After explicit HISTORY-ONLY write approval, the isolated runner executes the
   following one command at a time, checking exit status after each. The approved
   URL variable is secret-store supplied, clone-only, percent-encoded and never
   printed. Disable command tracing/debug; protect process arguments and logs.
   Do not pass --linked, --yes, --local or a production-capable credential.

   ```powershell
   supabase migration list --db-url "$env:COASTWAVE_CLONE_DB_URL"
   # Only if 20261017000100 is missing and its comparison was accepted:
   supabase migration repair 20261017000100 --status applied --db-url "$env:COASTWAVE_CLONE_DB_URL"
   supabase migration list --db-url "$env:COASTWAVE_CLONE_DB_URL"
   # Only if 20261017000200 is missing and its comparison was accepted:
   supabase migration repair 20261017000200 --status applied --db-url "$env:COASTWAVE_CLONE_DB_URL"
   supabase migration list --db-url "$env:COASTWAVE_CLONE_DB_URL"
   ```

   The documented CLI supports explicit --db-url history listing and applied/
   reverted repair. Repair records versions, rather than applying foundation SQL.
   [Supabase CLI reference](https://supabase.com/docs/reference/cli/supabase-migration-repair)
   [Existing-schema history repair guidance](https://supabase.com/docs/guides/deployment/database-migrations)
7. Verify each accepted version exists exactly once and 20261020000100 is NOT
   recorded. Re-export application catalog definitions/ACLs and compare with the
   pre-repair export: no application-schema or data changes are allowed. Record
   binary/version/hash, target, pre/post evidence and acceptance in the ledger.
   The ledger preserves byte hashes; history version presence alone does not
   authenticate migration contents. No blanket pending-migration push follows.

## Recovery if history repair is partial or incorrect

Each repair can commit separately. On interruption, stop and inspect the ledger
and actual version list under approved read-only access; do not replay the batch.
Prefer restoring the disposable clone snapshot. If restoring is inappropriate,
obtain specific history-only recovery approval and mark ONLY an incorrectly
inserted version reverted using the same isolated endpoint:

```powershell
# Example ONLY when the ledger proves this run wrongly inserted this version:
supabase migration repair 20261017000200 --status reverted --db-url "$env:COASTWAVE_CLONE_DB_URL"
```

This removes a history record; it does not reverse schema. Never remove records
that predated the run, reset the database, drop foundation objects or delete the
entire history relation. If any application definition changed, treat that as
an incident and restore the clone rather than masking it with history changes.
Missing metadata initialization, unpinned tooling and incomplete comparison
remain explicit execution blockers, not reasons to recreate foundations.
