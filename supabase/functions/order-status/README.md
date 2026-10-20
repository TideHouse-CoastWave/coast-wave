# Customer order status local implementation

POST {order_id} with verified Supabase customer JWT and allowed Origin.
Service-only RPC requires an unexpired order_customer_access binding and returns
order_id, committed payment_status, latest attempt_status and tickets_issued count. No PII, provider
notifications, or credentials are returned. CORS is not authorization.
New orders can establish ownership using create-customer-order; historical guest
orders require a separately reviewed ownership recovery flow.
