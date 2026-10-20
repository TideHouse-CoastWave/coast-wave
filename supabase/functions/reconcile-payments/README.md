# Payment reconciliation local implementation

POST empty JSON with independent PAYMENT_WORKER_SECRET Bearer token. No deployed
schedule or bank request is included. See ../../STAGING_RUNBOOK.md.

Evidence is claimed in bounded batches with SKIP LOCKED, five-minute leases and
fencing tokens. Invalid evidence is quarantined individually; errors do not abort
unrelated records. Crash recovery is bounded to five claims. Finalization is a
transaction and replays validate committed financial/admission/delivery evidence.

Query work uses separate durable jobs. A two-minute pre-dispatch claim can expire,
but begin_ncba_query grants dispatch once. Dispatched/unknown work never expires
into automatic redispatch. Complete results may be queried again after two minutes.
Jobs deduplicate merchant/TransactionID across attempts. Old claim tokens cannot
send/complete another worker's query. Query timeouts require operator review.
No bank calls or query claims occur while networking/configuration is disabled.

Query Success is never financial verification. The automatic attestation writer
remains absent pending NCBA's bank-authenticated correlation/final-success rules.
No request may submit its own verification evidence. Synthetic SQL test fixtures
are not a bank verifier. No credentials/QR tokens or full payloads are logged.
