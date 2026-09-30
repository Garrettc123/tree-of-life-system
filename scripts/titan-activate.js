#!/usr/bin/env node
/**
 * TITAN activation — in-process registry + MARS walking skeleton.
 * Does not ping missing Express routes. Does not invent cash.
 */

const Titan = require('../agents/titan/core');

function main() {
  const leadArg = process.argv.slice(2).join(' ');
  const lead = leadArg
    ? parseLead(leadArg)
    : {
        subject: 'Cleburne Comfort HVAC',
        vertical: 'hvac',
        need: 'lead leak-map after first response',
        budget: 80,
      };

  const titan = new Titan();
  const report = titan.activate(lead);
  console.log(JSON.stringify(report, null, 2));
  titan.detach();
  process.exit(report.state === 'healthy' || report.state === 'degraded' ? 0 : 2);
}

function parseLead(text) {
  const lower = text.toLowerCase();
  if (/mars|rhns|autonom|agent/.test(lower)) {
    return { subject: text, vertical: 'mars', need: text, budget: 1800 };
  }
  return { subject: text, vertical: 'trades', need: text, budget: 80 };
}

if (require.main === module) main();

module.exports = { main };
