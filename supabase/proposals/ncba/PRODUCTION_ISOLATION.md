# Production isolation procedure: mandatory execution gate

LOCAL PROPOSAL ONLY, 20 October 2026. No target is approved by this document.
No connection, credential inspection, database execution or runner was performed.
SQL acknowledgment settings are secondary checks; they do not identify a server.

## Required independent evidence

Before credentials are released, an operator and a different reviewer must sign
one private, immutable execution record containing:

- Disposable clone project/branch ref, parent ref, organization and dashboard URL;
  creation/expiry time and reason it can be destroyed/restored. Never classify
  `fknoimjcovjmmiivmime` (source staging) as the disposable target.
- All production project refs and endpoints, independently supplied by the owner,
  plus source staging, on an explicit denylist. Unknown production identity is a
  stop condition. A display name such as Staging is insufficient.
- Two independently obtained identity artifacts: the reviewer observes the clone
  project/branch in the dashboard; the operator obtains its connection details
  from the clone-specific connection panel. Record matching project ref and
  hostname/user/port/database, evidence timestamps and SHA-256 hashes. Do not
  derive both artifacts from the same copied DSN, audit constant or SQL variable.
- Dedicated clone database credential secret-store reference and issuer evidence
  linking it exclusively to that clone. No password, service key or complete DSN
  in the record, shell history, Git or logs. A new clone postgres password may be
  used if authorized; this does not require adding role memberships. No existing
  production/staging password, restored service JWT secret or API key is accepted.
- Exact file hashes, permitted actions (read-only preflight, history-only repair,
  security DDL, rollback-only test DDL, or committed concurrency fixtures), operator
  identity, independent reviewer, approval ID and short expiry (maximum four hours).
  Approval for one action is not blanket permission for the next gate.
- Snapshot ID, restoration rehearsal evidence, sanitized fixture plan, and
  confirmation that schedules, webhooks, email, replication and provider jobs
  cannot contact real services. Restored clone data may still contain PII/secrets.

## Execution environment requirements (future work, not implemented)

Use an isolated workstation/runner profile with no production credentials,
Supabase login tokens, ambient PG service files, app .env files, inherited database
URLs, psql startup files, auto-deploy hooks or linked-project metadata. Inject only
the clone credential at run time. Deny outbound traffic except the approved clone
database endpoint; block all bank/API/mail hosts. Prefer a direct project-specific
database host with certificate hostname verification (verify-full). No shared
pooler, proxy, localhost tunnel or alternate DNS endpoint in the initial procedure;
supporting one requires a separate identity-binding design and approval.

The reviewed execution wrapper must validate the signed approval record and all
file hashes, compare the exact endpoint and project ref against allowlist AND
denylist, reject expired/missing/inconsistent evidence, and obtain explicit human
approval for the displayed sanitized target and action before opening a connection.
No implicit --linked, broad db push/reset, automatic yes-to-prompts, discovery of
credentials or fallback host is allowed. Use stop-on-error, timeouts and psql -X.
Use only a pinned verified CLI binary; never npx an unpinned package during a run.
This package specifies the wrapper contract; it does not contain an execution
wrapper or enforce these network/credential controls by itself.

After separate read-only connection approval, compare TLS-verified connection
parameters with signed identity evidence and capture session_user/current_user,
server version, isolation, schema/ACL drift and migration status. A database named
postgres is not identity proof. Stop before writes if anything differs. New write
approval must reference this preflight result. Only then set the SQL acknowledgment
variables in the approved session. Recheck approval expiry/hash/target per phase.

## Closeout and guarantees

Capture sanitized action results, catalog acceptance and migration ledger; rotate
or retire clone credentials, restore/destroy the clone when approved and revoke
runner secret access. Do not restore unsafe grants to production as a rollback.

Local files cannot affect Supabase by themselves. If privileged SQL is manually
executed on live, these files cannot prevent damage. Production exclusion depends
on the independent evidence, endpoint restrictions, dedicated credentials and
approved wrapper above. Until those exist, database execution remains BLOCKED.
