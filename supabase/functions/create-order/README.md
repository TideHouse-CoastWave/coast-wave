# create-order: local implementation, not deployed

The Edge Function calls the service-role-only `create_pending_order_secure` RPC.
Review-only migration: `../../migrations/20261017000200_secure_order_creation.sql`.
Neither SQL nor function has been applied or deployed by this change.

## Request and response

POST JSON with exactly `customer_name`, `customer_email`, `customer_phone`,
`ticket_id`, `quantity` and `idempotency_key`. IDs are UUID strings. Clients should
generate keys with `crypto.randomUUID()`, persist them across retries, and use a
new key only for a new purchase intent. Price/payment/token fields are rejected.
Input is limited to 4096 bytes. Kenyan 01/07 mobile numbers are normalized to 254.

Response: `order_id`, `quantity`, integer `total_amount` in KES, `currency`, and
creation-time `payment_status: pending`. HTTP 201 for new creation, 200 for replay.
This is NOT a current payment-status query. Neither order UUID nor idempotency key
authorizes subsequent status retrieval, ticket access, or STK initiation.

## Concurrency and trusted values

The database first INSERTs a durable claim with UNIQUE arbitration, then locks it.
Concurrent identical normalized inputs return the same committed snapshot; a
changed request with the same key returns 409. Errors roll back claim and order
together. Keep claims until an approved archival/non-reuse policy is established.

The RPC loads and locks the category, checks `active` status and a positive whole
KES database price, calculates exact amounts, and inserts a pending order in one
transaction. Category status/price updates cannot race that snapshot. No
process-local locks or browser financial fields are trusted.

## Server environment

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: server runtime configuration only.
- `ALLOWED_ORIGINS`: exact comma-separated origins, no wildcard/trailing slash.
- `ORDER_MAX_QUANTITY`: integer 1 through 100. Defaults to **1**, preserving the
  current checkout limit; a larger business limit requires approval.

No caller Authorization header is forwarded to the privileged database request.
The implementation uses native fetch; no new dependency is installed. See
[Supabase secret guidance](https://supabase.com/docs/guides/functions/secrets).

Missing/disallowed Origin fails closed. CORS is not authentication or bot defense;
non-browser callers can forge Origin. Only safe error codes and request IDs are
logged for server failures. Unknown network outcomes do not trigger automatic
resubmission: the client must retry using the same key.

## Deployment prerequisites and unresolved decisions

- Full orders/tickets DDL is not available locally. Confirm UUID IDs, order UUID
  default, required columns/defaults, numeric price/amount types, and service-role
  privileges before applying SQL. The UUID preflight is not full schema validation.
- Amounts are conservatively capped at 2,147,483,647 KES pending column confirmation.
- Availability means active sale status, not capacity or reservations. Define the
  authoritative inventory model before exposing this endpoint for sales.
- Add distributed rate limits/bot controls before guest public exposure.
- Define customer ownership/access credentials before connecting status/STK/tickets.
- Confirm guest gateway/JWT configuration separately; no config.toml or gateway
  configuration is changed. An anonymous API key is not staff authorization.
- Existing frontend checkout/admin and legacy INSERT/RPC paths remain unchanged.
  Their secure cutover needs separate approval.
- No NCBA call, payment verification, QR issuance, or receipt handling is included.

## Validation

Offline: `node --test supabase/tests/create-order.test.mjs`, using Node 24 built-in
TypeScript stripping and mocked fetch. No SQL/database/NCBA connection is involved.
This does not replace Deno type checking or database concurrency tests.

After separate approval, staging tests must cover concurrent identical requests
(one order), same-key/different-input conflicts, independent keys, failed-insert
rollback, lost HTTP responses/replay, category price/status races, invalid/fractional
prices, quantity limits, and anonymous/authenticated denial for the new RPC/table.
Verify existing checkout/admin still work and no payment/ticket records are issued.
