# NCBA merchant notification local implementation

POST JSON only; NCBA Till alias under 880100 only. Strict size-limited payload
validation verifies Username/Password and SHA-256 hexadecimal-text Base64 Hash
without normalizing signed strings. Hash field mapping must be confirmed with
bank test vectors before enabling. XML/other merchant profiles are unsupported.

Durable ingestion stores signed evidence only: no authentication secrets or
unsigned FTRef/Narrative/created_at. Identical TransID replays ACK after durable
storage; changed signed content conflicts. Database failure never ACKs success.
HTTP status/retry choices require NCBA confirmation. Customer JWT is not bank
authentication; gateway configuration needs separate review.

Events remain unmatched until NCBA provides authenticated transaction/order
correlation and final-success rules. Phone plus amount and unsigned Narrative
never authorize matching or issuance. See supabase/NCBA_INTEGRATION.md.


Readiness revision: the receipt identity lock is shared with finalization before
row locks. Committed conflicting evidence blocks issuance and success replay.
A conflict after payment has already committed flags manual review without
inventing reversal/revocation semantics. No automated conflict resolution exists.
