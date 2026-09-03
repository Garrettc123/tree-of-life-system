# Canonical autonomy map — 2026-09-03

This file is the source of truth for what the autonomy stack **is**, not what tickets claim.

## Cash and secrets (unchanged by this branch)

- Booked cash: $0
- HubSpot pipeline: $1,495 diagnostics
- GAR-358 flywheel: `archive-engagement.yml` active, **0 runs**. Notion token still founder-only.
- NEXUS-AI-CORE PR #1 (GAR-486): open, mergeable_state=dirty

## Layers (do not collapse)

| Layer | Live surface | Not this layer |
|---|---|---|
| Transport | gRPC `AgentService` on `:50051` (`proto/agent-service.proto`) | JSON REST between agents |
| RHNS contract (next) | `proto/rhns_mesh.proto` — **not bound yet** | Claiming A2A/MCP federation |
| In-process bus | `agents/core/mcp-coordinator.js` EventEmitter | MCP-over-gRPC |
| Async fabric | Kafka topics if brokers exist; skipped if not | Required for unary ping |
| Orchestration | ReWOO three-stage + RuntimeAgent |
| Proofs | GitHub commit/run hashes | Invented 332-agent catalog |

## What this branch actually fixed

1. Added the missing proto the gateway already loaded.
2. RuntimeAgent implements `handleTask`, `createPlan`, `executeStep`, `synthesize`.
3. Gateway wraps inert stubs; stream unsubscribe uses `removeListener`.
4. Startup no longer `process.exit(0)` after “ready”.
5. Kafka down no longer aborts the mesh unless `KAFKA_REQUIRED=true`.
6. `npm run test:grpc` now points at a real file.

## What this branch did not fix

- Notion / Railway / SendGrid secrets
- Dirty GAR-486 PR
- Customer dashboard (GAR-329)
- Booked Stripe charge
- TLS / mTLS
- Binding `AgentMesh` from `rhns_mesh.proto`
- 50+ stale “Create README” Linear tickets

## Run

```bash
npm install
node scripts/test-grpc.js
node agents/startup.js   # stays up; SIGINT to stop
```
