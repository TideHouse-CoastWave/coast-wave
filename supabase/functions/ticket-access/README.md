# Customer ticket access local implementation

POST {order_id} lists issued ticket IDs, ordinals and validity flags.
POST {order_id,ticket_id} rotates the SAME admission credential and returns
qr_payload for QR encoding by a future client. All requests require verified
Supabase customer identity, unexpired order ownership and allowed Origin.
Retrieval requires Paid state, receipt, and an unused, unrevoked issued ticket.

256-bit random credentials have only their SHA-256 hashes persisted. Responses
use no-store. Tokens are neither logged nor queued. Retrieval invalidates older
copies, including after a lost response; it never creates another admission or
clears redemption/revocation. Stable redisplay needs a separate protected design.
NCBA payment QR generation is unrelated and is not called.
