# Tree of Life System

**Status:** ACTIVE — MARS organ + RHNS mesh + TITAN governance

Hierarchical AI decision orchestration. RHNS is the reasoning substrate. MARS is the Revenue organ. TITAN is the Governance supervisor.

## npm install

```bash
git clone https://github.com/Garrettc123/tree-of-life-system.git
cd tree-of-life-system
git checkout feature/titan-implement   # until PR #146 merges
npm install
# if peer conflicts:
npm install --legacy-peer-deps
```

Node >= 20, npm >= 10. Full steps: [INSTALL.md](INSTALL.md).

```bash
npm test -- tests/mars-rhns.test.js
npm test -- tests/titan.test.js
node scripts/install-mars.js
node scripts/titan-activate.js
```

Live wedges: LLA-47 · AI-AUDIT-299 · MARS-750 · MARS-1500 · ENT-AUDIT-3500

See `MARS_RHNS_INSTALL.md` and `TITAN.md`.

## Commercial Licensing & Customization

- Enterprise License: Commercial licensing available.
- Custom Solutions: Contact Garrett Carroll.
- Sponsor: https://github.com/sponsors/Garrettc123

Built by Garrett Carroll, Founder, Zero-Human Enterprise.
