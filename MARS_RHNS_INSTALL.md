# MARS × RHNS install on Tree of Life

Status: installed on branch `feature/mars-rhns-install` (TITAN stacks on `feature/titan-implement`).

## npm install

```bash
cd tree-of-life-system
npm install
# if peer conflicts:
npm install --legacy-peer-deps
```

Node >= 20, npm >= 10. Mesh bind needs `@grpc/grpc-js` from that install. Full steps: [INSTALL.md](INSTALL.md).

## What changed

Tree of Life already had hierarchical decision trees and an unbound `proto/rhns_mesh.proto`. This install binds RHNS as the reasoning substrate and snaps MARS on as a BioForge Revenue organ.

1. Commercial strategy tree over live SKUs (`LLA-47`, `AI-AUDIT-299`, `MARS-750`, `MARS-1500`, `ENT-AUDIT-3500`).
2. RHNS CMC gate on money hops. Live `4242` aborts.
3. AgentMesh bind on `:50052`.
4. Detach-safe ledger.
5. Walking skeleton: intake → enrich → branch → proposal → gated checkout intent → report.

## Run (after npm install)

```bash
npm test -- tests/mars-rhns.test.js
node scripts/install-mars.js
```

Optional mesh listen:

```js
const RhnsMeshGateway = require('./agents/rhns/mesh-gateway');
const mesh = new RhnsMeshGateway();
await mesh.startServer(); // 127.0.0.1:50052
```

## Monetize

Unnamed sell uses LLA-47. Autonomy / RHNS demand routes to MARS-750 or MARS-1500.

Cash is only a Stripe charge with `paid=true` and last4 != 4242. This install emits `checkout.intent`, not a live charge.

## Certification

`node scripts/install-mars.js` prints the six BioForge gates plus the revenue CMC proof gate.

## Detach

`organ.detach()` clears subscriptions, freezes writes, keeps ledger rows.
