# STK initiation local implementation

POST JSON {order_id, idempotency_key} with verified customer JWT and allowed
Origin. No financial/provider/status fields are accepted. Service-only claim
RPC checks ownership, locks the order, snapshots amount/merchant, and durably
marks submission before NCBA. Active/uncertain attempts block alternate keys.
Replay never resends. Acceptance is pending, not payment success. A lost
response leaves submitted/unknown state for reconciliation.

All NCBA networking defaults to disabled. Sandbox host, Basic Auth credentials,
AccountNo mapping, token POST and acceptance code require bank confirmation and
explicit sandbox approval. No production mode exists. See
../../NCBA_INTEGRATION.md. No migrations executed or deployment.


Readiness revision: the claim RPC receives server-only p_allow_new. Disabled
networking permits existing authorized attempt lookup but no new attempt/charge.
Replay precedes payment-window/Paid checks, while customer access remains required.
Scope-key advisory locks cover cross-order conflicts. The revised signature is
claim_ncba_attempt(uuid,uuid,text,text,text,text,boolean); deploy only with its
matching reviewed migration. See ../../STAGING_RUNBOOK.md.
