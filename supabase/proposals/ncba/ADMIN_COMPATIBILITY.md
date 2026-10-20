# Existing checkout/admin and individual ticket compatibility

## Confirmed code dependencies

| Source | Current behavior | Consequence for rollout |
| --- | --- | --- |
| `src/main.js`, checkout near order INSERT | Browser reads catalogue price and inserts a quantity-one pending order directly | Audited RLS already denies this; future checkout must use trusted server pricing and ownership binding |
| `src/admin.js`, orders list/report paths | Browser selects orders including customer information | Audited RLS already denies this; do not add blanket authenticated SELECT |
| `src/admin.js`, ticket management | Browser updates ticket category records | Replace with scoped staff backend before rollout; do not restore browser UPDATE |
| `src/admin.js`, confirmation near line 1272 | Calls absent confirm_payment_and_issue_ticket using browser receipt text and adminEmail | Existing call cannot work on audited staging; do not recreate it or accept the email/status as authority |
| `src/admin.js`, ticket display | Expects orders.ticket_code | New finalizer does not populate this legacy credential |
| `src/admin.js`, check-in near line 2140 | Sets whole-order checked_in/checked_in_at from browser | Does not represent quantity-many admissions; must not redeem issued_tickets indirectly |
| `supabase/functions/redeem-ticket/README.md` | Design notes only, no index.ts | Atomic authenticated staff redemption is missing |

Lines are navigation aids for the reviewed local snapshot. No interfaces were
edited. The audit is staging-only: it does not establish that the live site's
schema or access behaves the same. Removing grants preserves the audited deny
behavior and existing service privileges, not a claim that staging checkout is
functional. Do not apply this package to a different live configuration.

## Proposed transition contract (not implemented or deployed)

Use existing create-customer-order for a verified Supabase user, server price and
atomic ownership binding. Existing create-order creates unbound guest orders:
do not adopt them using order UUID, email, receipt text or idempotency key. An
approved guest-to-user recovery policy would be separate work.

Staff routes must verify JWT with Auth and determine staff role and event scope
from a trusted server-side store. Define that store and permission lifecycle
before implementation. Client adminEmail, local allowlists, CORS and possession
of a decoded QR are not staff authorization. Never forward the caller's bearer
token as service-role database authority. Minimize list fields; paginate and
scope queries; restrict PII reports/exports separately. Add rate limits and
auditing with verified actor UUIDs and no credentials/customer payloads in logs.

A read-only staff order view may aggregate issued/admitted/revoked counts and
show reconciliation-required status. It must not mint a credential or mark Paid.
A compatibility response may expose old ticket_code only for explicitly
classified historical records through an authorized route, never as proof of a
new NCBA admission. No projection from checked_in may redeem new admissions.

For NCBA, each issued_tickets UUID/ordinal is an admission. Parse only
`cw-ticket:v1:<ticket_uuid>:<256-bit-credential>`; hash server-side and atomically
check paid state, allocated verified receipt, exact admission, matching current
token hash, not revoked and not already redeemed. Under a row lock, record the
server timestamp and authenticated actor and append audit. Concurrent scans
must yield one success. A lost response must return already-used on retry,
never create a replacement admission. Lock order must be compatible with
finalization and credential rotation (order before ticket); test races.

Customer retrieval already rotates the hash on the same unused admission and
increments credential_version; old QR copies become invalid. Hashes cannot
reconstruct raw QR tokens, and no raw credentials may enter outbox, logs or audit.
The delivery worker and staff redemption remain activation prerequisites.

Historical order-level tickets need an explicit inventory and separate approved
validation path. Do not backfill one admission per quantity or accept legacy
codes for new NCBA orders without reviewed payment provenance. Do not change or
invalidate historical admissions silently. Resolve quantity, event scope,
revocations, check-in history and reconciliation before any dual-format rollout.

## Why no backend code was added

The existing customer and worker handlers match the operations RPC signatures.
No staff role store, event authorization model or historical migration policy is
defined. Implementing an adapter now would invent those trust rules and could
create a payment/admission bypass. This package delivers the exact required
contracts and test gates; runtime implementation and interface wiring need a
separate scoped approval. No manual confirmation endpoint is proposed.

See STAFF_REDEMPTION_ARCHITECTURE.md for the proposed permission store, missing
event mapping, atomic redemption, revocation/rotation races and acceptance matrix.
These remain design proposals; no authorization model is silently implemented.
