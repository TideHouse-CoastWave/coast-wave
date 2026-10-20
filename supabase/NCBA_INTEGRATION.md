# NCBA backend implementation and unresolved contract

Local implementation only. No migrations executed, deployments, bank calls, or
website/admin changes. Environment variable names are application choices, not
bank-prescribed names. Sandbox-only records are used by this implementation.

## Source contracts

Sources: both PDFs and the unsigned blank activation letter in docs/ncba/.
The 2024 STK guide pages 3-5 publishes https://c2bapis.ncbagroup.com, not identified
as sandbox. Basic username/password obtains a Bearer token at
`/payments/api/v1/auth/token`; POST is explicit in the same guide's QR section,
but missing from the STK token table. Response has access_token, token_type,
expires_in (example 18000) and status. No Daraja passkey/timestamp conventions apply.

POST `/payments/api/v1/stk-push/initiate` has string TelephoneNo, Amount, PayBillNo,
AccountNo, Network and TransactionType; sample omits AccountNo. Network example
is Safaricom, TransactionType CustomerPayBillOnline. Response fields are
TransactionID, StatusCode, StatusDescription, ReferenceID. Failure example is
code "1" with null identifiers; successful acceptance code is unspecified.
POST `/payments/api/v1/stk-push/query` takes TransactionID. Its description=Success
example supplies no financial evidence; FAILED/internal error is also shown.
Neither is sufficient to finalize or infer a safe new charge after uncertainty.

2023 notification guide pages 3-6 and 11 describes POST JSON notifications and
merchant-supplied username/password/secret. Java signs exact concatenation:
secret + TransType + TransID + TransTime + TransAmount + BusinessShortCode +
BillRefNumber + Mobile + name + "1", using UTF-8 SHA-256, lowercase hex text,
then Base64 of that text. The Java variable names TransactionTime/CreditAccount/
Name differ from JSON field names: mapping and serialization require bank vectors.
This implementation activates this mapping only with explicit hash confirmation.
Never normalize signed amounts, names, phones, timestamps or case before hashing.
Authentication comparisons hash both operands and compare fixed length digests.
This is not a claim of runtime-level constant-time JavaScript execution.

Only JSON NCBA Till alias profile is implemented: Pay Bill, 880100 and configured
merchant alias in BillRefNumber. TransID is documented unique M-PESA reference.
FTRef, Narrative and created_at are not in the documented hash and are excluded
from persisted financial evidence; authentication fields are also discarded.
Signed customer details remain restricted PII; retention/encryption needs review.
ACK is ResultCode "0"/"1" plus ResultDesc. HTTP behavior/retry rules are unspecified;
current HTTP 200 after durable ingest, 4xx rejection and 503 transient failures
are application choices requiring NCBA sandbox confirmation. XML is unsupported.

No dedicated STK callback contract exists in these guides; that endpoint rejects
all requests. The merchant notification endpoint must be registered with NCBA.
No callback URL is invented in initiation. NCBA's QR API creates payment QR images,
not admission tickets, and is not used for ticket issuance.

## Mandatory clarifications before activation

- Sandbox host/credentials; whether letter's STK secret is Basic Auth password.
- Confirm token POST, AccountNo semantics, acceptance code and limits.
- Confirm merchant eligibility: active NCBA Till under 880100. Website Buy Goods
  Till 1777530 is not proven eligible. Never copy it into this profile by assumption.
- A bank-authenticated mapping between TransactionID/ReferenceID and signed
  notification TransID/order. Phone plus amount is never sufficient. Narrative
  is unsigned and BillRefNumber is the merchant alias, not automatically an order.
- Exact final-success evidence, KES/currency semantics, receipt normalization,
  reversals, late payments, notification retries/HTTP status and replay policy.
- Hash field mapping, null/decimal/unicode handling and working bank test vectors.
- Timestamp table says YYMMDDhhmmss, but examples have 14 digits. The current
  parser follows the examples and requires bank confirmation before activation.

No environment toggle bypasses the missing financial verification rule. There is
no automatic writer to ncba_verification_evidence. A future trusted verifier must
implement bank-confirmed rules and create the attestation; ingestion alone cannot.
Never populate this table from a customer claim or from description=Success.

## Local stages

1. Initiation verifies JWT through Supabase Auth, checks ownership in a service-only
   RPC, locks the order, snapshots financial/merchant inputs and claims an attempt.
   Existing scoped keys replay; changed fingerprints conflict; active/uncertain
   attempts block alternate keys. submitted is committed before contacting NCBA.
   Provider failures/timeouts never invoke issuance; unknown outcomes require query.
2. Authenticated notification ingestion durably deduplicates signed evidence by
   merchant scope/TransID. Changed signed content conflicts. Replays ACK without
   financial effects. Events remain unmatched until the correlation contract exists.
3. Worker queries uncertain attempts and stores restricted non-financial snapshots.
   It never resubmits charges or finalizes query Success. No automatic resolution
   exists for a lost initiation identifier: obtain the NCBA recovery contract.
4. Worker consumes trusted verification attestations. SQL locks evidence/order/
   attempt/event; checks amounts, currency, merchant, receipt and order ownership;
   atomically inserts unique receipt, one ticket per ordinal, audit and delivery
   intent, and sets Paid. Transaction replay cannot issue additional tickets.
5. Customer ticket retrieval requires paid state, receipt, ownership and unused,
   unrevoked ticket. It rotates a 256-bit random credential on the SAME ticket;
   only SHA-256 hash is stored. Returned qr_payload can be encoded as a QR by a
   future client. No raw token persists in outbox/logs. A lost response requires
   another rotation; older copies become invalid. Stable redisplay needs a
   separately reviewed encrypted credential design.

## Ownership, deployment and remaining operational work

order_customer_access is a service-only binding to a verified Supabase user UUID.
The new create-customer-order endpoint wraps the existing secure order RPC and
binds a newly created order atomically. Public keys are namespaced by verified
user and mapped to random internal keys: a replay cannot adopt a guest order.
The existing create-order endpoint does not create bindings; no historical orders
are auto-bound. Its idempotency key/order ID is never proof of ownership.
ORDER_RESERVATION_TTL_SECONDS controls new payment initiation (60-86400);
CUSTOMER_ORDER_ACCESS_TTL_SECONDS separately controls customer access (60-31536000).
Both require explicit configuration; no assumed business window is installed.
Replay cannot extend either window. These application bounds are not bank rules.
No UI is changed here. Inventory/capacity reservation, distributed rate limits,
staff atomic redemption and a delivery-outbox worker remain activation prerequisites.
The outbox currently represents portal notification intent; no emails are sent.

Review the full base schema, legacy confirm_payment_and_issue_ticket definition,
RLS/grants and Paid/pending casing in staging. Existing browser insert/manual
payment paths are unchanged and must be secured in the coordinated cutover.
RPC service-role keys bypass RLS; protect them and worker secrets in runtime
secret storage. Configure bank gateway behavior separately: a customer JWT is
not bank authentication. Do not disable JWT verification globally.

20261020000100 migration is a draft requiring SQL review and staging execution
tests for unique-key races, duplicate callbacks, deadlocks, receipt reuse,
wrong amount/merchant/currency, rollback after ticket/outbox failure, concurrent
finalization and retrieval. It does not change legacy permissions.

Offline command: `node --test supabase/tests/*.test.mjs`. HTTP/crypto tests mock
the database/provider. SQL source assertions are not SQL execution or concurrency
proof. Deno checking and staging transactional checks are still required.


## Readiness corrections

See [STAGING_RUNBOOK.md](STAGING_RUNBOOK.md) for the current migration/test order,
full local audit findings, approval gates, test coverage and rollback procedure.
The revised unapplied draft changes internal RPC signatures; it must not be
reapplied over an older deployed version without a separate upgrade migration.

Authorized existing STK attempts replay before new-charge checks, including
while NCBA networking is disabled. Current customer access still must be valid.
Scoped key locks serialize cross-order races. Ingestion/finalization share receipt
locks, and quarantines block issuance or success replay. Late conflicts flag
manual review without silently reversing committed payment.

Attestations now snapshot event digest and attempt fingerprint. Finalization replay
checks receipt/evidence, paid order/attempt/event state, exact ticket ordinals,
per-ticket delivery records and audit. Matching unallocated verified receipts
can be allocated; conflicting receipts cannot be reassigned. Null checks fail closed.

Reconciliation uses bounded SKIP LOCKED evidence claims and token fencing;
poison records block individually. Durable single-use query dispatch prevents
concurrent worker duplicates. Uncertain dispatched queries require manual review,
not automatic lease-based redispatch. No bank verification rules have been added.

Security cutover and empty rollback drafts live in drafts/, OUTSIDE automatic
migrations, and require explicit session approval flags. Neither is activated.
The actual legacy RPC body/role graph remains unavailable locally and must be
reviewed using the supplied read-only audit before a coordinated cutover.
