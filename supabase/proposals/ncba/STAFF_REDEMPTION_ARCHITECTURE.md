# Proposed staff authorization and individual admission architecture

DESIGN ONLY. No backend, interface, table or RPC is implemented by this document.
This is future work beyond the four-table/15-RPC NCBA operations installation.

## Identity, event scope and permissions

Verify the access token through Supabase Auth at each staff request and enforce
the approved session freshness/MFA policy for privileged actions. Staff status
comes from a server-managed permission store, never browser email/localStorage,
client-supplied actor IDs, user-editable metadata, CORS or decoded QR contents.
Database service credentials remain server-only and are never copied from caller
headers. Require exact allowed fields; reject browser payment_status/verified_by.

Proposed permission records bind verified auth user UUID, event UUID, capability,
valid-from/expiry, revocation time and grantor/audit provenance. Capabilities are
separate: orders.read_minimal, customers.read_pii, catalogue.manage, tickets.scan,
and reconciliation.read. None permits payment confirmation, evidence insertion,
credential minting, arbitrary SQL or changing financial state. No blanket global
admin flag; cross-event roles require explicit event grants. Staff management
itself needs a separately authorized operator and audited revocation workflow.

The audit's orders/tickets columns contain no event ID. Before implementing this
design, approve a trusted immutable order-to-event mapping and category/event
mapping, and bind new orders to an event during server-side creation. Do not infer
scope from ticket_name or a browser event parameter. Historical mappings require
reviewed backfill evidence; unmapped orders fail closed. Event scope must also
be immutable across receipt issuance, credential rotation and redemption.

Proposed stores could be staff_event_permissions and order_event_scope in an
unexposed private schema with no browser privileges. These names are design
placeholders, not new dependencies silently added to the NCBA four-table package.
Approve schema ownership, staff lifecycle, MFA/session policy and retention before
writing executable DDL. A service-role compromise remains a privileged compromise;
consider dedicated least-privilege staff database access in the implementation.

## Atomic redemption contract

1. Backend authenticates the user, parses the exact versioned QR format
   cw-ticket:v1:<ticket UUID>:<64 lowercase hex characters>, and rate-limits by
   staff/event/device. Do not log raw QR, token hash, customer data or secrets.
   Backend hashes the credential's UTF-8 hex STRING consistently with ticket-access.
2. Backend invokes a future service-only redemption operation with verified actor,
   expected event, ticket ID and token hash. The database operation rechecks the
   actor's active tickets.scan permission and the trusted event mapping; caller
   assertions alone are not authorization. No payment/evidence writes occur.
3. In ONE transaction, lock the active permission row FOR SHARE, then the order,
   then the issued ticket FOR UPDATE. Finalization/rotation also lock order before
   ticket. Permission revocation must UPDATE/DELETE that same permission row so
   it serializes with scans; no stale capability cache can grant new admission.
   Define the business ordering: a scan holding the grant lock may finish before
   a waiting revocation; a committed revocation prevents subsequent scans.
4. Validate event scope, Paid state, allocated receipt and matching receipt/order,
   token hash, issued ordinal, not revoked and not redeemed. The QR is not proof
   of payment. Reject mismatches without exposing cross-event existence/PII.
5. Set redeemed_at to server time and redeemed_by to the verified actor only if
   still unused, and append payment_audit_events for that issued_ticket/order in
   the same transaction. Return a minimal admission result, never a credential.
   Audit failure rolls back admission. Do not update whole-order checked_in as
   the admission authority or issue a replacement ticket on error.

## Replay, races and uncertain responses

The admission row is the one-time arbiter. Two valid scans produce one success
and one already-used result under locking. A lost response and rescan cannot
admit again. If request idempotency is implemented, it may report the prior
committed outcome to the same authorized actor/event, but must not return a fresh
admission grant that a device can count twice. Offline admission is not supported.

Customer rotation changes the token hash/version on the same unused ticket.
If rotation commits first, the old QR fails. If redemption commits first, rotation
fails. Revoked tickets fail in either order. Permission expiry is re-evaluated
after locks using server time; do not use a timestamp captured before waiting.
No raw-token storage, token reuse across admissions or legacy-code fallback after
a failed v1 scan is allowed. Device UI must distinguish confirmed admission from
already-used/unknown network outcomes and never assume timeout means unused.

## Compatibility and rollout

Keep the current website/admin interfaces unchanged in this phase. A later
approved adapter may provide minimal event-scoped order summaries and one row
per issued admission. PII reports/exports require customers.read_pii. Category
editing routes must validate catalogue.manage and event scope; no browser writes
are reopened. Staff payment review is read-only reconciliation, with no override
that sets Paid or populates verification evidence.

The existing manual confirmation call, orders.ticket_code display and browser
whole-order check-in cannot be transparently made equivalent to this model.
Do not recreate confirm_payment_and_issue_ticket. Legacy admission inventory must
be classified by event and payment provenance; use a separately reviewed legacy
path with explicit cutover boundaries and no dual redemption of the same entry.
Do not auto-backfill quantity-many admissions from historical Paid strings.

Acceptance tests before rollout: invalid/expired/revoked JWT; forged actor/email;
staff removal; scope mismatch; no permission; PII minimization; malformed token;
hash mismatch; unpaid/unallocated receipt; revoked/redeemed admission; double
scan; lost response; permission revocation/expiry during lock waits; rotation vs
redemption; audit rollback; quantity-many admissions; legacy/new-format isolation.
No tests can certify these paths until their architecture and backend are approved
and implemented. Bank verification, outbox delivery, rate limits and inventory
remain additional rollout prerequisites.
