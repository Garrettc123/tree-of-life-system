/**
 * Optional boot hook. Startup can call attachMars(handles).
 * Does not replace AgentService on :50051.
 */
const RhnsMeshGateway = require('./mesh-gateway');
const { MarsOrgan } = require('../mars');

async function attachMars(handles = {}) {
  const bindMesh = process.env.RHNS_BIND_MESH !== 'false';
  let mesh = null;
  if (bindMesh) {
    try {
      mesh = new RhnsMeshGateway({
        host: process.env.RHNS_HOST || '127.0.0.1',
        port: parseInt(process.env.RHNS_PORT || '50052', 10),
      });
      await mesh.startServer();
    } catch (error) {
      mesh = null;
      handles.rhnsMeshError = error.message;
    }
  }
  const organ = new MarsOrgan();
  const attach = organ.attach([
    'core.identity',
    'core.events',
    'core.audit',
    'rhns.cmc',
    'rhns.rgt',
    'rhns.mesh',
  ]);
  return { mesh, organ, attach };
}

module.exports = { attachMars };
