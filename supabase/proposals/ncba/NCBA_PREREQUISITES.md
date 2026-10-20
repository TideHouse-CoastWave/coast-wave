# NCBA database introduction requirements

## Exact proposed inventory

Source: existing `../../migrations/20261020000100_ncba_payment_operations.sql`.
No foundation CREATE statements are to be repeated. All new tables enable RLS,
have no customer policies and revoke PUBLIC/anon/authenticated grants. No DELETE
or TRUNCATE access is granted to service_role on these four tables.

| New table | Dependencies and server access |
| --- | --- |
| order_customer_access | orders(id); verified user UUID and separate access/payment expiries; service SELECT/INSERT/UPDATE |
| customer_order_creation_keys | user/key primary key, unique random internal key; service SELECT/INSERT/UPDATE |
| ncba_verification_evidence | unique payment_events(id), payment_attempts(id), orders(id), composite attempt/order FK; service SELECT/INSERT and UPDATE only on finalized_at, processing_status, processing_attempts, claim_token, claim_expires_at, error_code |
| ncba_query_jobs | payment_attempts(id), unique merchant_scope/transaction_id; service SELECT/INSERT/UPDATE |

Exact signatures (all in public, SECURITY INVOKER, empty search_path;
PUBLIC/anon/authenticated cannot EXECUTE; service_role can):

| RPC | Purpose |
| --- | --- |
| create_customer_pending_order_secure(uuid,jsonb,integer,integer,integer) | Namespace idempotency by verified user and bind new order atomically |
| ncba_lock_identity(text,text,text) | READ COMMITTED scoped transaction advisory lock |
| claim_ncba_attempt(uuid,uuid,text,text,text,text,boolean) | Ownership/expiry, financial snapshot and attempt arbitration; final boolean defaults false |
| record_ncba_submission(uuid,text,jsonb) | Record acceptance/failure/uncertainty, never payment success |
| ingest_ncba_notification(text,text,text,jsonb) | Deduplicate authenticated notification and quarantine conflicts |
| customer_payment_status(uuid,uuid) | Ownership-checked minimal status without PII |
| finalize_ncba_payment(uuid,jsonb,uuid) | Fenced trusted-evidence verification and atomic receipt/payment/issuance/outbox/audit |
| ncba_finalization_quantity(uuid) | Server worker quantity lookup |
| retrieve_customer_ticket(uuid,uuid,uuid,text) | Ownership-checked credential hash rotation on same unused admission |
| list_customer_tickets(uuid,uuid) | Ownership-checked minimal admission list |
| ncba_reconciliation_queue() | Bounded SKIP LOCKED evidence claims |
| block_ncba_evidence(uuid,uuid,text) | Token-fenced quarantine |
| claim_ncba_query_jobs() | Claim uncertain-attempt query work |
| begin_ncba_query(uuid,uuid) | One-time dispatch authorization |
| record_ncba_query(uuid,uuid,jsonb,text,boolean) | Restricted non-financial query evidence, never confirmation |

New indexes: ncba_conflict_receipt_idx on payment_events and
ncba_evidence_queue_idx on ncba_verification_evidence. No name conflicts were
found in the export. The absent-table and zero-overload inventories must be
rechecked immediately before any approved application. The draft rejects existing
RPC names, including alternate overloads; CREATE collisions abort transactionally.

## Database prerequisites and acceptance

- Reviewed ordinary RLS-enabled foundation tables, UUID primary keys and
  gen_random_uuid(); orders.quantity integer, unit_price/total_amount bigint;
  tickets.price bigint. Orders default to pending. The draft writes case-sensitive
  Paid only in finalization. Existing rows/casing are not established by a
  catalog-only audit; test representative synthetic rows and separately assess data.
- Secure-order RPC executable by service_role, exact reviewed body and empty
  search_path. Service_role needs public USAGE and BYPASSRLS, SELECT/INSERT/UPDATE
  on orders, tickets, order_creation_requests, payment_attempts, payment_receipts,
  payment_events, issued_tickets and delivery_outbox; SELECT/INSERT only on
  payment_audit_events. Existing broader service grants on orders/tickets are
  preserved by this package, not endorsed as a long-term least-privilege design.
- UUID, SHA-256/bytea, advisory locks, row locks, ON CONFLICT and SKIP LOCKED must
  be usable. Required functions have default pg_catalog lookup with empty
  search_path; verify generator/hash function execution and defaults under the
  actual service role. Audit presence alone is not a runtime test.
- Composite unique keys (id,order_id) on attempts/receipts/events/issued_tickets,
  scope keys on attempts/receipts and existing composite FKs must retain the
  exported definitions. Preserve receipt reference uniqueness, one receipt/order,
  attempt idempotency, event deduplication, unique admission ordinal/token hash,
  outbox deduplication and append-only application audit access.
- No browser grants on private records; no catalogue writes, TRUNCATE, REFERENCES,
  TRIGGER or MAINTAIN. Do not rely on RLS for TRUNCATE. Service-only RPC grants
  must pass effective inherited-grant checks, not just direct ACL inspection.
- Database/API worker transactions must use READ COMMITTED where required.
  Test PostgREST behavior as well as direct service-role transactions before rollout.
- Review view/wrapper/role dependencies and reconcile migration history first.
  Do not fabricate missing objects, use CREATE OR REPLACE to conceal an older
  deployment, or record the NCBA migration before its transaction succeeds.

The base orders table has nullable financial/customer fields and no exported
positive-quantity, total-equals-price-times-quantity or payment-state checks.
orders.ticket_id has no exported FK to tickets. The secure creator and NCBA
claim/finalizer enforce the relevant values, but arbitrary privileged writes
remain trusted. This package neither backfills old rows nor adds unreviewed
constraints that could invalidate historical orders. Keep direct browser writes
closed and review every additional service writer.

## Trust and backend requirements

Create ownership only from verified Auth identity through the existing customer
creator. Never bind by UUID/email/idempotency key. Define explicit TTLs (access
60..31536000 seconds; payment 60..86400; access at least payment), max quantity
1..100 and consistent merchant configuration. Replay must not extend expiry.

Notification authentication must precede ingest. Signed amount/reference/name/
phone strings retain their exact representation. Credentials, raw QR tokens and
unsigned fields cannot become financial evidence. Payload PII, request_input and
evidence_metadata require a reviewed retention/encryption/access policy.

service_role can INSERT trusted attestations and directly modify core records;
this design does not protect against a compromised service key. No public
attestation writer exists. A future verifier must implement the bank contract,
validate immutable event digest and attempt fingerprint and attest correlation,
amount, currency, scope and reference rule. It must not accept customer or staff
assertions as bank evidence. Reconciliation can finalize existing attestations
even when provider networking is disabled; keep workers undeployed/unscheduled,
and use only synthetic attestations in the disposable clone.

Existing query Success descriptions, STK acceptance, phone-plus-amount, merchant
alias and browser payment_status are insufficient to authorize issuance. No
environment toggle supplies the missing verification rule. Query dispatch that
is uncertain is quarantined rather than automatically repeated.

No runtime/backend changes accompany this proposal. Missing staff redemption,
outbox delivery, rate limits and inventory/capacity policy remain rollout gates.
See ADMIN_COMPATIBILITY.md for the future staff trust boundary.

## Unresolved bank requirements (not confirmed by staging audit)

1. Explicit sandbox host, credentials and merchant eligibility; whether the STK
   activation secret is the Basic password. Never default to the published host.
2. Token HTTP method, AccountNo semantics, success acceptance code and limits.
3. Confirm the implemented NCBA Till profile: Pay Bill, 880100, approved merchant
   alias. Website Till 1777530 is not evidence of eligibility for this profile.
4. Bank-authenticated TransactionID/ReferenceID -> signed TransID -> order
   correlation. BillRefNumber may be merchant alias, not an order identifier;
   unsigned Narrative cannot establish correlation.
5. Authoritative final-success evidence, KES semantics, reference scope/case/
   normalization and uniqueness, reversals, late payments and over/underpayments.
6. Notification hash field mapping, UTF-8/decimal/null/unicode representation,
   test vectors, 14-digit timestamp interpretation, HTTP ACK/retry behavior and
   registration requirements. Current verifier also requires unsigned FTRef to
   be a string while excluding it from persisted evidence; confirm presence with
   bank vectors or approve a targeted parser correction before activation.
7. Recovery after lost initiation identifiers, uncertain queries and dispatch
   crashes. No automatic new charge while an attempt is uncertain.

Keep all four network/contract approval flags false. No credentials are required
for database-only synthetic tests. A dedicated STK callback currently rejects
requests because no supported authentication contract is documented.

## Narrow-default release gate

02_default_privileges.sql now changes only postgres public-schema defaults.
Global PUBLIC EXECUTE and managed-owner defaults remain unchanged. Every new
application object must follow the same-transaction explicit ACL contract in
DEFAULT_PRIVILEGES_AUTHORITY.md, including exact function overloads. Never infer
RPC privacy from the narrowed defaults alone. Complete PRODUCTION_ISOLATION.md
and the baseline repair procedure before any separately approved clone writes.
