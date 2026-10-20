-- REVIEW DRAFT ONLY. Do not apply until schema types and runtime are confirmed.
-- Additive only: no existing rows, policies, functions or tables are changed.
-- Requires PostgreSQL gen_random_uuid(), Supabase roles and public.orders(id UUID).
-- This file is a one-time migration, not a rerunnable bootstrap script.
BEGIN;

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = pg_catalog.to_regclass('public.orders')
      AND attname = 'id' AND atttypid = 'uuid'::regtype
      AND attnum > 0 AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'Review prerequisite: public.orders.id must be UUID; adapt all order foreign keys before applying otherwise';
  END IF;
END;
$preflight$;

-- Durable initiation attempts. Namespace keys by provider/environment/merchant.
-- request_fingerprint is SHA-256 of canonical business inputs, not credentials.
-- Retries must compare this fingerprint; uniqueness alone cannot validate reuse.
CREATE TABLE public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (btrim(provider) <> ''),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'production')),
  merchant_scope text NOT NULL CHECK (btrim(merchant_scope) <> ''),
  idempotency_key text NOT NULL CHECK (btrim(idempotency_key) <> ''),
  request_fingerprint bytea NOT NULL CHECK (octet_length(request_fingerprint) = 32),
  expected_amount numeric(20,2) NOT NULL CHECK (expected_amount > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'submitted', 'pending', 'succeeded', 'failed', 'unknown', 'cancelled')),
  provider_identifiers jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(provider_identifiers) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_attempts_idempotency_unique
    UNIQUE (provider, environment, merchant_scope, idempotency_key),
  -- Composite candidate keys support consistent child references.
  CONSTRAINT payment_attempts_id_order_unique UNIQUE (id, order_id),
  CONSTRAINT payment_attempts_id_scope_unique
    UNIQUE (id, provider, environment, merchant_scope)
);
CREATE INDEX payment_attempts_order_idx ON public.payment_attempts(order_id);

-- Verified receipts can remain unallocated for reconciliation. One receipt per
-- order is the initial exact-payment model; split payments require redesign.
-- Preserve the exact reference. The canonical deduplication key must be derived
-- only after NCBA confirms reference scope and normalization (including case).
-- Do not uppercase/trim references implicitly or change canonicalization for
-- new rows without reconciling existing keys. A versioned rule identifier below
-- is provenance, NOT part of uniqueness: changing versions must not permit reuse.
CREATE TABLE public.payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid UNIQUE REFERENCES public.orders(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (btrim(provider) <> ''),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'production')),
  merchant_scope text NOT NULL CHECK (btrim(merchant_scope) <> ''),
  provider_reference text NOT NULL CHECK (btrim(provider_reference) <> ''),
  reference_deduplication_key text NOT NULL CHECK (btrim(reference_deduplication_key) <> ''),
  reference_key_rule text NOT NULL CHECK (btrim(reference_key_rule) <> ''),
  amount numeric(20,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  verification_source text NOT NULL CHECK (btrim(verification_source) <> ''),
  evidence_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(evidence_metadata) = 'object'),
  received_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz NOT NULL,
  allocated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_receipts_reference_unique
    UNIQUE (provider, environment, merchant_scope, reference_deduplication_key),
  CONSTRAINT payment_receipts_allocation_consistent
    CHECK ((order_id IS NULL) = (allocated_at IS NULL)),
  CONSTRAINT payment_receipts_id_order_unique UNIQUE (id, order_id),
  CONSTRAINT payment_receipts_id_scope_unique
    UNIQUE (id, provider, environment, merchant_scope)
);

-- Authenticated callback/reconciliation inbox. Unmatched events need no order.
-- This table is not proof of payment. Store only approved, redacted payloads;
-- never credentials or QR tokens. Retention and encryption remain to be defined.
CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (btrim(provider) <> ''),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'production')),
  merchant_scope text NOT NULL CHECK (btrim(merchant_scope) <> ''),
  source text NOT NULL CHECK (btrim(source) <> ''),
  deduplication_key text NOT NULL CHECK (btrim(deduplication_key) <> ''),
  payload_digest bytea NOT NULL CHECK (octet_length(payload_digest) = 32),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  attempt_id uuid REFERENCES public.payment_attempts(id) ON DELETE RESTRICT,
  receipt_id uuid REFERENCES public.payment_receipts(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processing', 'processed', 'unmatched', 'failed', 'ignored')),
  processing_attempts integer NOT NULL DEFAULT 0 CHECK (processing_attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error_code text,
  CONSTRAINT payment_events_deduplication_unique
    UNIQUE (provider, environment, merchant_scope, source, deduplication_key),
  CONSTRAINT payment_events_id_order_unique UNIQUE (id, order_id),
  CONSTRAINT payment_events_attempt_requires_order
    CHECK (attempt_id IS NULL OR order_id IS NOT NULL),
  CONSTRAINT payment_events_attempt_order_fk
    FOREIGN KEY (attempt_id, order_id)
    REFERENCES public.payment_attempts(id, order_id) ON DELETE RESTRICT,
  CONSTRAINT payment_events_receipt_order_fk
    FOREIGN KEY (receipt_id, order_id)
    REFERENCES public.payment_receipts(id, order_id) ON DELETE RESTRICT,
  CONSTRAINT payment_events_attempt_scope_fk
    FOREIGN KEY (attempt_id, provider, environment, merchant_scope)
    REFERENCES public.payment_attempts(id, provider, environment, merchant_scope)
    ON DELETE RESTRICT,
  CONSTRAINT payment_events_receipt_scope_fk
    FOREIGN KEY (receipt_id, provider, environment, merchant_scope)
    REFERENCES public.payment_receipts(id, provider, environment, merchant_scope)
    ON DELETE RESTRICT
);
-- Default MATCH SIMPLE intentionally permits unmatched events and links to an
-- unallocated receipt when order_id is NULL; single-column FKs still check IDs.
-- Before allocation/processing, a transaction must compare all linked entities
-- and populate order_id consistently. Later receipt allocation cannot silently
-- reassign a non-NULL order already referenced by an event.
-- source is an internal stable channel identifier, not untrusted payload text.
-- Define deduplication keys from the official delivery identity. Do not use the
-- receipt alone if multiple lifecycle events can share it. On conflict compare
-- payload digests; never silently overwrite mismatching evidence. Cross-channel
-- duplicates may remain separate inbox rows; receipt/finalization uniqueness
-- must still prevent duplicate financial effects.
CREATE INDEX payment_events_order_idx ON public.payment_events(order_id);
CREATE INDEX payment_events_attempt_idx ON public.payment_events(attempt_id);
CREATE INDEX payment_events_receipt_idx ON public.payment_events(receipt_id);
CREATE INDEX payment_events_queue_idx ON public.payment_events(status, next_attempt_at);

-- One admission per ordinal, independent of the legacy order-level ticket code.
-- SHA-256 hashes of independently generated 256-bit random credentials only.
-- Never store raw QR credentials here or in JSON/outbox/audit fields.
CREATE TABLE public.issued_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  ticket_ordinal integer NOT NULL CHECK (ticket_ordinal > 0),
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  credential_version integer NOT NULL DEFAULT 1 CHECK (credential_version > 0),
  issued_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  redeemed_by uuid,
  revoked_at timestamptz,
  revocation_reason text,
  CONSTRAINT issued_tickets_order_ordinal_unique UNIQUE (order_id, ticket_ordinal),
  CONSTRAINT issued_tickets_id_order_unique UNIQUE (id, order_id),
  CONSTRAINT issued_tickets_redemption_consistent
    CHECK ((redeemed_at IS NULL) = (redeemed_by IS NULL)),
  CHECK (redeemed_at IS NULL OR redeemed_at >= issued_at),
  CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);
-- redeemed_by is an immutable actor identifier, deliberately not cascading from
-- auth.users: deleting a login must not delete or erase admission history.

-- Append-only to the application role. Actor identity must be established by
-- trusted authentication, never a browser-supplied email. Owners can still alter
-- records; this is not a tamper-proof external ledger.
CREATE TABLE public.payment_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  attempt_id uuid REFERENCES public.payment_attempts(id) ON DELETE RESTRICT,
  receipt_id uuid REFERENCES public.payment_receipts(id) ON DELETE RESTRICT,
  event_id uuid REFERENCES public.payment_events(id) ON DELETE RESTRICT,
  issued_ticket_id uuid REFERENCES public.issued_tickets(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (btrim(action) <> ''),
  actor_type text NOT NULL CHECK (actor_type IN ('system', 'staff', 'bank')),
  actor_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (actor_type <> 'staff' OR actor_id IS NOT NULL),
  CHECK ((attempt_id IS NULL AND issued_ticket_id IS NULL) OR order_id IS NOT NULL),
  CONSTRAINT payment_audit_events_attempt_order_fk
    FOREIGN KEY (attempt_id, order_id)
    REFERENCES public.payment_attempts(id, order_id) ON DELETE RESTRICT,
  CONSTRAINT payment_audit_events_receipt_order_fk
    FOREIGN KEY (receipt_id, order_id)
    REFERENCES public.payment_receipts(id, order_id) ON DELETE RESTRICT,
  CONSTRAINT payment_audit_events_event_order_fk
    FOREIGN KEY (event_id, order_id)
    REFERENCES public.payment_events(id, order_id) ON DELETE RESTRICT,
  CONSTRAINT payment_audit_events_ticket_order_fk
    FOREIGN KEY (issued_ticket_id, order_id)
    REFERENCES public.issued_tickets(id, order_id) ON DELETE RESTRICT
);
-- Order-less audits may describe unallocated receipts/unmatched events. Their
-- links use MATCH SIMPLE; the writer must verify that any multiple references
-- describe the same incident, including provider scope and attempt/receipt IDs.
-- Order-scoped audits require their event to be correlated first. Do not mutate
-- old audit entries when an unmatched event is later allocated: append a new one.
CREATE INDEX payment_audit_events_order_idx ON public.payment_audit_events(order_id, created_at);
CREATE INDEX payment_audit_events_attempt_idx ON public.payment_audit_events(attempt_id);
CREATE INDEX payment_audit_events_receipt_idx ON public.payment_audit_events(receipt_id);
CREATE INDEX payment_audit_events_event_idx ON public.payment_audit_events(event_id);
CREATE INDEX payment_audit_events_ticket_idx ON public.payment_audit_events(issued_ticket_id);

-- Commit delivery intent with issuance; workers retry without issuing tickets.
-- Contains identifiers only. Secure credential delivery/reissue must be designed
-- before use because hashes cannot reconstruct QR credentials.
-- Proposed hash-only delivery: send a generic notification to an authenticated
-- customer portal (no QR token in the outbox). Issuance generates an initial
-- credential in memory and stores its hash; if not returned securely immediately,
-- discard the credential. Authorized portal retrieval then uses the reissue flow:
-- generate a credential in server memory, atomically replace the hash, and return the
-- QR over TLS with no-store caching and redacted logs. On lost delivery/retrieval,
-- an authorized, serialized reissue rotates the hash and increments the version
-- on the SAME admission; all older QR copies become invalid. Never reset redeemed
-- or revoked state or create another admission during reissue. Worker retries
-- send the same notification job, not a new token. If asynchronous attachment
-- delivery or stable redisplay is required, approve a separate protected secret
-- storage design before implementation; none of these tables may hold raw tokens.
-- The final portal authentication/reissue policy is still an approval prerequisite.
CREATE TABLE public.delivery_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  issued_ticket_id uuid REFERENCES public.issued_tickets(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (btrim(channel) <> ''),
  deduplication_key text NOT NULL UNIQUE CHECK (btrim(deduplication_key) <> ''),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  lock_owner uuid,
  sent_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_outbox_ticket_order_fk
    FOREIGN KEY (issued_ticket_id, order_id)
    REFERENCES public.issued_tickets(id, order_id) ON DELETE RESTRICT,
  CHECK ((locked_at IS NULL) = (lock_owner IS NULL)),
  CHECK ((status = 'sent') = (sent_at IS NOT NULL))
);
CREATE INDEX delivery_outbox_order_idx ON public.delivery_outbox(order_id);
CREATE INDEX delivery_outbox_ticket_idx ON public.delivery_outbox(issued_ticket_id);
CREATE INDEX delivery_outbox_queue_idx ON public.delivery_outbox(status, available_at);
-- Deduplication keys identify one logical delivery, including channel and
-- credential version where relevant; retries reuse that key and immutable inputs.
-- A worker must claim jobs atomically, recover expired leases, and compare inputs
-- on key conflict. Provider-side idempotency is needed for exactly-once delivery;
-- a crash after sending but before recording sent_at may otherwise resend.

-- Explicitly undo potential Supabase default grants on these NEW tables only.
-- No browser policies are created. RLS with no policies denies ordinary roles.
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issued_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.payment_attempts, public.payment_receipts, public.payment_events,
  public.issued_tickets, public.payment_audit_events, public.delivery_outbox
  FROM PUBLIC, anon, authenticated, service_role;

-- Explicit server-only operational privileges; no DELETE/TRUNCATE grants.
-- service_role bypasses RLS: credentials must never enter browser code.
-- Ordinary anon/authenticated roles have neither table privileges nor policies.
-- Owners/BYPASSRLS roles remain privileged. Verify actual role inheritance and
-- effective privileges in staging; this draft does not alter existing role grants.
GRANT SELECT, INSERT, UPDATE ON TABLE
  public.payment_attempts, public.payment_receipts, public.payment_events,
  public.issued_tickets, public.delivery_outbox TO service_role;
GRANT SELECT, INSERT ON TABLE public.payment_audit_events TO service_role;

-- No triggers, backfill, public RPCs, or existing permission changes are included.
-- Finalization/redemption must later enforce remaining nullable-link consistency,
-- paid-state checks, ticket count, inventory, state transitions, and atomicity.
-- Also validate attempt/receipt amount and currency against the locked order,
-- stable merchant/provider scope, verification evidence, and actor authorization.
-- Composite FKs establish shared order ownership, not that every optional ID in
-- an audit row equals the corresponding ID in its referenced event.
-- This migration does NOT close the existing public orders INSERT/RPC paths.
-- Those require a separately approved coordinated backend/frontend cutover.
-- updated_at/worker locks require explicit maintenance by those future operations.
-- Callback dedupe must detect key reuse with differing payload digests.
COMMIT;
