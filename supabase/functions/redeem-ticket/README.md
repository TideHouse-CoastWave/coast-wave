# redeem-ticket (planned)

Authenticated staff boundary for validating a scanned ticket and admitting its holder. Verify staff role and event scope server-side. Strictly parse the QR payload and validate the ticket against trusted paid, issued, and non-revoked state.

Redeem atomically only while unused, with server timestamps and authenticated actor auditing. Concurrent gates must produce one successful admission and a clear already-used result for the other. A decoded QR or client-side list match is not verification. Never render decoded content as HTML.

Documentation only. Ticket model, role rules, legacy compatibility, and database transaction contract await review. No check-in changes are included.