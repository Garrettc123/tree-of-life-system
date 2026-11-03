# Worker startup validation — 2026-11-03 UTC

The worker's synthesis syntax repair exposed two more startup blockers: the
startup configuration selected `0.0.0.0` while the unauthenticated gRPC guard
correctly requires loopback, and optional Kafka attempted an unconfigured local
broker before starting gRPC. Startup now defaults to `127.0.0.1` for gRPC and
skips Kafka only when no brokers are configured and Kafka is optional.

Explicit remote gRPC binding retains its existing opt-in guard. Required Kafka
without brokers fails closed. Configured Kafka uses the supplied timeouts and a
bounded startup retry setting. Partial startup and shutdown close Kafka, gRPC,
executor timers and the health listener. The actual ephemeral gRPC port is
reported, and owned client channels are closed.

Validation completed locally:

- 17 Jest suites, **103 passed / 0 failed**, on Node **20.20.2** and **24.22.1**.
- Real loopback HTTP readiness and gRPC GetStatus/ExecuteTask calls.
- Real three-agent ReWOO health observation and rejection of `send_invoice`.
- Optional/required Kafka behavior and cleanup after a later startup failure.
- A credential-free `node agents/startup.js` subprocess with
  `GRPC_TEST_ONCE=true`, ephemeral ports and loopback HTTP exited **0** after
  reporting three configured read-only handlers and closing its resources.
- Three stale baseline assertions now match the actual rejection contracts and
  declared runtime dependencies. No execution gate was relaxed.

Reproduce with `npm ci --ignore-scripts --no-audit --no-fund` followed by
`npm test -- --runInBand`. The new PR workflow runs the same suite on Node 20 for
all PR base branches. Compact evidence and source fingerprints are in
`validation/worker-startup-20261103.json`.

This evidence covers the local runtime. Docker builds, a real Kafka connection,
durable Supabase startup and the repaired Railway deployment have not been
verified. Optional Kafka is reported unavailable, and durable storage stays
disabled unless explicitly configured. The registered handlers remain read-only;
readiness does not certify financial or customer-facing work.
