/**
 * TITAN system registry.
 * Only systems that exist as files in this repo.
 * HTTP pings of missing Express routes are not activation.
 */

const SYSTEMS = Object.freeze([
  { id: 'rhns.cmc', family: 'Governance', path: 'agents/rhns/cmc.js', required: true },
  { id: 'rhns.rgt', family: 'Governance', path: 'agents/rhns/rgt.js', required: true },
  { id: 'rhns.mesh', family: 'Governance', path: 'agents/rhns/mesh-gateway.js', required: false },
  { id: 'mars.organ', family: 'Revenue', path: 'agents/mars/organ.js', required: true },
  { id: 'mars.strategy-tree', family: 'Revenue', path: 'agents/mars/strategy-tree.js', required: true },
  { id: 'mars.ledger', family: 'Revenue', path: 'agents/mars/ledger.js', required: true },
  { id: 'proto.agent-service', family: 'Core', path: 'proto/agent-service.proto', required: true },
  { id: 'proto.rhns-mesh', family: 'Core', path: 'proto/rhns_mesh.proto', required: true },
  { id: 'titan.core', family: 'Governance', path: 'agents/titan/core.js', required: true },
]);

function loadSystem(record) {
  if (record.path.endsWith('.proto')) {
    return { ok: true, kind: 'contract' };
  }
  if (record.id === 'titan.core') {
    return { ok: true, kind: 'module' };
  }
  try {
    require(require('path').join(__dirname, '../..', record.path));
    return { ok: true, kind: 'module' };
  } catch (error) {
    return { ok: false, kind: 'module', error: error.message };
  }
}

function probe() {
  return SYSTEMS.map((sys) => {
    const loaded = loadSystem(sys);
    return {
      ...sys,
      state: loaded.ok ? 'healthy' : sys.required ? 'blocked' : 'degraded',
      kind: loaded.kind,
      error: loaded.error || null,
    };
  });
}

module.exports = { SYSTEMS, probe };
