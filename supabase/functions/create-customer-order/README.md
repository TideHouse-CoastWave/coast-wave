# Authenticated customer order creation

POST the same six fields as create-order, including idempotency_key, with a
verified Supabase customer JWT and allowed Origin. Reuses existing input
normalization and create_pending_order_secure for authoritative pricing.

New service-only wrapper namespaces the public idempotency key by authenticated
user and assigns a random internal key for the existing RPC. Order creation and
ownership binding commit together. Replay cannot adopt an existing guest order,
change ownership or extend access expiration. No historical backfill occurs.
Existing checkout/create-order behavior is unchanged.

ORDER_MAX_QUANTITY defaults to 1. ORDER_RESERVATION_TTL_SECONDS must be explicitly
configured (60-86400) and limits new payment initiation, not inventory reservation.
CUSTOMER_ORDER_ACCESS_TTL_SECONDS is separately configured (60-31536000), must
cover the payment window, and should cover event ticket retrieval. These bounds
are application policy, not NCBA requirements. No endpoint extends access based
only on an ID. Configure both windows before staging use.
