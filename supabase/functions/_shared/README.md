# Shared backend utilities

payment.ts implements bounded JSON parsing, verified Supabase customer identity,
service-only RPC calls, safe responses, origin checks, hashing and runtime settings.
ncba.ts implements gated Basic/Bearer provider requests and authenticated JSON
merchant notification parsing. Distributed rate limits, staff redemption and
delivery workers remain separate activation prerequisites. New helpers emit no
request bodies or credential logs. See supabase/NCBA_INTEGRATION.md.

A provider adapter may implement only the NCBA contracts confirmed by official documentation. Keep privileged clients and credentials server-side. Do not trust browser-supplied actor identity or financial fields. Avoid logging credentials, full callback bodies, personal data, or ticket access tokens. Database transactions must enforce issuance and redemption invariants rather than relying on process-local locks.
