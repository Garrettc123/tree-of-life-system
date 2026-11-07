# Authenticated business directives

The dispatcher keeps operational `/dispatch` events compatible. Business directives use
`event_type: business.directive` through `POST /directives` or `POST /dispatch`.
Both the operator header and exact-byte HMAC are required:

- `X-Operator-Token`: `GARCAR_OPERATOR_TOKEN`, at least 32 bytes.
- `X-Dispatch-Sig`: `sha256=` plus HMAC-SHA256 of the exact UTF-8 body using `DISPATCH_SECRET`.
- JSON: `directive_id` (8–100 URL-safe characters), `action`, `issued_at` (Unix seconds), `dry_run` (boolean, default true), and `event_type`.
- `issued_at` expires after five minutes; clock skew in the future is limited to 30 seconds.
- Identical retries return the existing durable receipt; changing any signed byte under the same ID returns 409.

`system_health` performs bounded GET probes of the worker's configured status endpoint,
the fixed Garcar homepage and public GitHub repository metadata. `revenue_readiness`
adds explicit missing-Stripe, missing-CRM and unverified-checkout blockers. Worker status
URL is configured only by the operator in `GARCAR_WORKER_STATUS_URL`. It is not accepted from request input.

Dry runs write a `planned` receipt without executing probes. A new ID with `dry_run=false`
runs the read-only task and records observations and blockers. Unsupported actions,
including outbound and payment actions, persist `blocked` receipts. Arbitrary commands,
URLs, deployments and money movement are not exposed. No model-generated completion is used.

`GET /operator/status`, `GET /directives`, `GET /directives/{id}` and existing `/events`
require the operator token. Receipt status is `running`, `planned`, `completed`, `blocked`,
`failed` or `interrupted`. Completed means the check ran; examine observations and blockers
to assess health. Process interruption does not imply success or automatically replay work.

Receipts use the existing SQLite path `GARCAR_EVENT_DB_PATH` on the dispatcher's persistent
volume. Operate one dispatcher process/replica per SQLite volume. Export receipt results
before changing storage. No secrets are stored in receipts or source.
