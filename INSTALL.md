# npm install — Tree of Life + MARS + TITAN

Node **>= 20** and npm **>= 10** required (`package.json` engines).

## 1. Clone and install

```bash
git clone https://github.com/Garrettc123/tree-of-life-system.git
cd tree-of-life-system

node -v    # expect v20+
npm -v     # expect 10+

npm install
```

If npm reports peer-dependency conflicts:

```bash
npm install --legacy-peer-deps
```

That installs the runtime used by RHNS mesh and startup:

- `@grpc/grpc-js`
- `@grpc/proto-loader`
- `dotenv`
- `kafkajs`
- `uuid`

Dev tools (Jest, ESLint, Prettier, nodemon) come from `devDependencies` in the same `npm install`.

## 2. Optional agents subpackage

`agents/` has its own `package.json` for the older planning agents. Only needed if you run `agents/index.js`.

```bash
cd agents
npm install
# or
npm install --legacy-peer-deps
cd ..
```

Do not put secrets in the repo. Copy env locally:

```bash
cp .env.example .env
# edit .env on your machine only
```

## 3. Verify install

```bash
npm test -- tests/mars-rhns.test.js
npm test -- tests/titan.test.js
node scripts/install-mars.js
node scripts/titan-activate.js
```

Expected: tests pass, TITAN report `state: healthy` or `degraded` if mesh unbound, `booked_cash_usd: 0`.

RHNS mesh needs `@grpc/grpc-js` from step 1. Without it, TITAN marks `rhns.mesh` **degraded** and still runs MARS.

## 4. Boot

```bash
npm start
# or
npm run startup
```

- AgentService gRPC: `:50051`
- RHNS AgentMesh: `:50052` (`RHNS_BIND_MESH=false` skips bind)

Kafka is optional. Leave `KAFKA_REQUIRED` unset unless brokers are up.

## 5. Sell scripts after install

```bash
node scripts/titan-activate.js
node scripts/titan-activate.js "DFW multi-agent RHNS buyer"
```

Unnamed shop link: https://buy.stripe.com/3cI00j7YV0hQgDp8BR43S2v  
Autonomy / MARS: https://buy.stripe.com/4gM7sL6UR3u29aX4lB43S2r

Cash is Stripe `paid=true` and last4 != 4242. `npm install` does not create a charge.
