# Coast Wave / TIDEHOUSE LIVE backend foundation

Status: local backend implementation with review-only migration drafts. See
[staging validation procedure](STAGING_RUNBOOK.md) for the corrected draft, SQL
suites, security cutover gates and rollback. No deployment,
database migration execution or NCBA request has been performed. Provider networking
defaults to disabled. See [NCBA implementation and blockers](NCBA_INTEGRATION.md).
The lifecycle below describes the target; bank correlation/verification and the
frontend authentication cutover still block activation. New authenticated orders
can bind ownership atomically. Offline tests mock external systems.

## Structure

- `migrations/`: review-only additive SQL drafts, including NCBA payment operations.
- `tests/`: offline authorization/provider/notification tests and SQL source checks;
  database transaction and concurrent redemption tests remain required in staging.
- `functions/`: local order/payment/customer handlers; dedicated STK callback rejects
  undocumented requests. Staff redemption remains a placeholder.
- `functions/_shared/`: native validation, authorization, database, response and
  gated NCBA provider utilities.

## Intended secure flow

1. `create-order` accepts customer details and a category identifier. The backend derives price, currency, availability, quantity rules, and initial payment state from trusted data. It creates an immutable financial snapshot, opaque reference, and protected customer access mechanism with durable request idempotency.
2. `initiate-stk` checks access to the order and its eligibility, creates a durable payment attempt, and uses the stored amount. Bank request acceptance does not mean payment success. An uncertain timeout must be reconciled before another charge is attempted.
3. The STK callback and Paybill notification handlers authenticate bank requests using the official contract, persist notifications durably, deduplicate them, and correlate them with payment attempts or order references. Phone number alone is insufficient for matching.
4. Trusted finalization verifies documented success evidence, merchant destination, amount, currency, and receipt uniqueness. A single database transaction records payment, transitions the order, and issues the ticket exactly once. Duplicate or out-of-order messages must not regress paid state or issue another ticket. Unmatched, conflicting, late, and incorrect-amount payments require reconciliation.
5. Ticket issuance is an internal transactional operation, not a public endpoint. Generate high-entropy ticket credentials, store hashes where appropriate, and keep personal data out of QR payloads. A durable delivery outbox can retry delivery without repeating issuance.
6. `order-status` exposes minimal customer-authorized progress. `ticket-access` provides authorized access to an issued ticket. An order ID alone is not an access credential.
7. `redeem-ticket` verifies staff permission and atomically checks payment, ticket validity, and unused status before recording admission with server time. Concurrent scans must allow one successful admission.

## Request trust boundaries

- Public checkout requests: may be unauthenticated but require server validation, abuse controls, idempotency, and order-specific authorization where applicable. Never trust submitted totals, payment status, receipt claims, or disabled UI controls. CORS is not authentication.
- Bank callbacks: use the bank's documented authentication and acknowledgement contract, not assumed customer/staff JWTs. Apply body limits, replay controls, durable deduplication, and reconciliation. Do not acknowledge successful processing before the required durable write.
- Staff operations: require verified authentication and server-enforced roles. Session existence and a browser-supplied verifier email are insufficient. Record the authenticated actor in an audit trail.

## Contract and implementation prerequisites

Actual NCBA URLs, credentials, authentication, request/response fields, notification verification, acknowledgements, retries, correlation identifiers, and reconciliation capabilities must come from the bank's official technical documentation. Nothing in this scaffold defines an NCBA contract. Confirm whether the current Buy Goods Till and proposed Paybill are covered by the merchant arrangement.

Inspect `orders`, category table `tickets`, related constraints/indexes/triggers, RLS and grants, staff roles, and the complete `confirm_payment_and_issue_ticket` definition before designing migrations. Audit RPC ownership, execution grants, authorization, search path, receipt uniqueness, ticket generation, and repeat-call behavior. Preserve existing order/category IDs and historical financial snapshots; account for legacy ticket codes and payment-status casing.

Confirm the runtime, network/certificate requirements, staging project, secret management, and deployment approach before creating `config.toml`. Supabase CLI availability and any installation need separate approval. Application-setting names in `.env.example` are proposals, not runtime configuration.

## Compatibility and security gates

Keep current checkout and admin code unchanged during foundation work. Develop against isolated local/staging data. Use additive schema changes and compatibility mappings. Test backend order creation before a coordinated frontend and database-permission cutover; never silently fall back to direct browser inserts. Historical pending orders must not be marked paid without evidence.

Before activation: enforce server-authoritative pricing and inventory, review RLS/RPC permissions, fix unsafe HTML rendering of customer/QR data, protect customer ticket access, implement authenticated/deduplicated notifications, transactional issuance and redemption, rate limits, redacted logs, reconciliation, and delivery retries. Test altered values, unauthorized access, replayed receipts, duplicate/delayed callbacks, uncertain timeouts, and simultaneous scans.

No production secrets belong in this repository or in frontend `VITE_` variables. No database changes, function deployments, or bank calls are authorized by these documents.
