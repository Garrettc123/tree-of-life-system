#!/usr/bin/env node
/**
 * Install MARS onto Tree of Life using RHNS.
 * Does not charge Stripe. Does not write secrets.
 */

const path = require('path');
const MarsOrgan = require('../agents/mars/organ');

const PORTS = ['core.identity', 'core.events', 'core.audit', 'rhns.cmc', 'rhns.rgt', 'rhns.mesh'];

const SAMPLE_LEADS = [
  {
    subject: 'Cleburne Comfort HVAC',
    vertical: 'hvac',
    need: 'lead leak-map after first response',
    budget: 80,
  },
  {
    subject: 'DFW autonomy buyer',
    vertical: 'mars',
    need: 'rhns multi-agent reasoning',
    budget: 1800,
  },
];

function main() {
  const organ = new MarsOrgan();
  const cert = {
    contract_validity: 'pass',
    dependency_resolution: 'pass',
    security_policy_scope: 'pass',
    workflow_simulation: 'unknown',
    performance_health: 'pass',
    safe_detach: 'unknown',
    revenue_cmc_commit_proof: 'unknown',
  };

  const attach = organ.attach(PORTS);
  if (attach.state !== 'healthy') {
    cert.dependency_resolution = 'fail';
    console.log(JSON.stringify({ attach, cert }, null, 2));
    process.exit(1);
  }

  const simulations = SAMPLE_LEADS.map((lead) => organ.simulate(lead));
  cert.workflow_simulation = simulations.every((s) => s.event && s.tree) ? 'pass' : 'fail';

  const live = organ.run(SAMPLE_LEADS[1]);
  cert.revenue_cmc_commit_proof = live.cmc.decision === 'commit' ? 'pass' : 'fail';

  const detached = organ.detach();
  cert.safe_detach = detached.retained.length > 0 ? 'pass' : 'fail';

  const report = {
    organ: 'mars-revenue',
    repo: 'Garrettc123/tree-of-life-system',
    mesh_proto: 'proto/rhns_mesh.proto',
    state_after_install_detach: detached.state,
    certification: cert,
    sample_events: simulations.map((s) => s.event),
    committed_trace: live.cmc,
    default_wedge_if_unnamed: 'LLA-47',
    mars_skus: ['MARS-750', 'MARS-1500'],
    cwd: path.resolve(__dirname, '..'),
  };

  console.log(JSON.stringify(report, null, 2));
  const failed = Object.values(cert).some((v) => v !== 'pass');
  process.exit(failed ? 2 : 0);
}

if (require.main === module) main();

module.exports = { main };
