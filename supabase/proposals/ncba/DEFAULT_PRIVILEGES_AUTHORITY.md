# Default privileges: authority and narrow alternative

Reviewed official guidance on 20 October 2026; no database was contacted.

## Supported semantics

PostgreSQL permits changing one's own defaults and defaults of roles one belongs
to. Defaults used for creation are those of the effective creator, not defaults
inherited from parent roles. Schema defaults add to global defaults; a public-schema
REVOKE cannot cancel built-in/global PUBLIC EXECUTE. These rules underpin the
narrow proposal. [PostgreSQL 17 ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html)

Assuming a role also depends on the SET option along the membership chain; role
INHERIT or ADMIN flags alone do not prove SET ROLE authority.
[PostgreSQL 17 role membership](https://www.postgresql.org/docs/17/role-membership.html)

Supabase describes postgres as the application administrator and supabase_admin
as an internal administrative role; dashboard SQL executes as postgres. Do not
assume the dashboard provides supabase_admin authority.
[Supabase roles](https://supabase.com/docs/guides/database/postgres/roles)
Hosted postgres is not a general superuser.
[Supabase role explanation](https://supabase.com/blog/postgres-roles-and-privileges)

## What the saved audit establishes

- All nine audited application tables and the secure creator are owned by postgres.
- Six public-schema default ACL entries exist: tables, sequences and functions for
  each of postgres and supabase_admin. Browser defaults are broad for both.
- The audit ran as postgres. It shows no membership path from postgres to
  supabase_admin, but it omits postgres/supabase_admin role attributes and
  membership SET/INHERIT options. It is not sufficient authority proof for a
  separate login or for managed-role impersonation.

Without connecting, inspect the signed credential-issuance record to establish
the intended login/effective creator, compare it with the exported owner/membership
data, and obtain a complete recent role/SET-option export from an independently
authorized operator or platform support. Check evidence date and clone identity.
An offline export can support an authority assessment, not prove present server
permissions. No available evidence currently establishes managed-role authority.
The later approved read-only preflight must verify session/effective identity,
role options and schema privileges; no trial ALTER or role-membership change is
an authority test. If authority is absent, stop. Do not grant postgres membership
in supabase_admin, alter roles, reassign managed objects or obtain internal secrets.

## Revised 02: preferred narrowly scoped proposal

02 now changes only postgres defaults IN SCHEMA public for future tables,
sequences and functions. It removes explicit public/browser schema defaults and
preserves service_role defaults. No global default, other schema, existing object
ACL or supabase_admin default is changed. The old global-revocation proposal is
superseded and must not be applied from an older checkout.

There is NO claim that future functions become private automatically. PUBLIC
EXECUTE remains globally; supabase_admin-created public objects retain their
audited broad defaults. Require per-object ACLs for every application creator:

| Future object | Required transaction contract |
| --- | --- |
| Private table | Enable RLS; revoke all PUBLIC/anon/authenticated table AND independent column grants; grant server SELECT/INSERT and only necessary UPDATE columns; no implicit DELETE/TRUNCATE/MAINTAIN; assert effective grants |
| Application function | Create exact reviewed signature, SECURITY INVOKER/empty search_path by default; revoke ALL on that signature from PUBLIC/anon/authenticated before COMMIT; explicitly grant EXECUTE to service_role only when required; inspect all overloads/effective inherited execution |
| Sequence | Revoke browser/PUBLIC access; grant only required server USAGE/SELECT/UPDATE; never assume table grants cover its sequence |
| Public catalogue | Separate reviewed field/policy contract; no blanket grant of private fields or browser writes |

All CREATE and REVOKE/GRANT operations must share one transaction: a later
cleanup migration leaves an exposure window. The existing NCBA draft already
uses transactional explicit RPC revocations; 10_privileges checks resulting ACLs.
05 now demonstrates default PUBLIC EXECUTE on a harmless postgres probe and
then verifies same-transaction explicit revoke/server grant. It does not SET ROLE
supabase_admin or claim to fix that role's defaults.

Residual risk: ad hoc SQL or managed automations can create newly exposed public
objects without this contract. Do not create application objects as supabase_admin.
Inventory exposed schemas and new objects during each release; hold deployment
until effective ACL assertions pass. If platform-owned public object creation is
unavoidable, request a supported owner/platform action to secure the exact object
in its creation transaction. Until resolved, managed-owner automatic privacy is
an unresolved platform risk, not a passed test. Event-trigger enforcement or a
new unexposed application schema would be separate architectural work.

## Alternatives and acceptance

Global EXECUTE revocation can enforce broader defaults but changes future behavior
in other schemas; it is not required or included in this proposal. Do not combine
both approaches. Cross-schema behavior is now preserved at the cost of mandatory
per-function revocations. Accept this tradeoff explicitly and require release
review/ACL tests; no procedure can promise default-deny for arbitrary future
functions while retaining their global PUBLIC default.
