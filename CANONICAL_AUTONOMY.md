# Canonical autonomy map — 2026-09-29

This file is the source of truth for what the autonomy stack **is**, not what tickets claim.

## Cash and secrets (unchanged by this branch)

- Booked cash: $0
- HubSpot pipeline: $1,495 diagnostics
- GAR-358 flywheel: `archive-engagement.yml` active, **0 runs**. Notion token still founder-only.
- NEXUS-AI-CORE PR #1 (GAR-486): last known mergeable_state=dirty

## Layers (do not collapse)

| Layer | Live surface | Not this layer |
|---|---|---|
| Transport | gRPC `AgentService` on `:50051` (`proto/agent-service.proto`) | JSON REST between agents |
| RHNS contract | `proto/rhns_mesh.proto` bound by `agents/rhns/mesh-gateway.js` on `:50052` | Claiming A2A/MCP federation |
| In-process bus | `agents/core/mcp-coordinator.js` EventEmitter | MCP-over-gRPC |
| Async fabric | Kafka topics if brokers exist; skipped if not | Required for unary ping |
| Orchestration | ReWOO three-stage + RuntimeAgent + MARS organ |
| Revenue | `modules/mars` organ, CMC-gated SKU tree | Invented booked charges |
| Proofs | GitHub commit/run hashes + CMC `proof_hash` | Invented 332-agent catalog |

## What the MARS × RHNS branch actually installed

1. Bound `AgentMesh` from `rhns_mesh.proto`.
2. Installed MARS as BioForge Revenue organ `mars-revenue`.
3. Strategy tree routes live SKUs only (LLA-47 / AI-AUDIT-299 / MARS-750 / MARS-1500 / ENT-AUDIT-3500).
4. CMC decisions are only `continue | escalate | commit | abort`.
5. Detach keeps ledger rows.
6. `npm test -- tests/mars-rhns.test.js` and `node scripts/install-mars.js`.

## What this branch did not fix

- Notion / Railway / SendGrid secrets
- Dirty GAR-486 PR
- Customer dashboard (GAR-329)
- Booked Stripe charge
- TLS / mTLS
- 50+ stale “Create README” Linear tickets

## Run

```bash
npm install
npm test -- tests/mars-rhns.test.js
node scripts/install-mars.js
node agents/startup.js   # stays up; SIGINT to stop
```
