/**
 * RGT — Recursive Goal Tree for Tree-of-Life + MARS hops.
 * Decompose a commercial job. Do not invent a third planner.
 */

function decompose(job = {}) {
  const goal = job.goal || 'close_paid_loop';
  const vertical = job.vertical || 'trades';
  return {
    id: `rgt-${goal}`,
    goal,
    layer: 'REASON',
    children: [
      { id: 'perceive', hop: 'intake', layer: 'REASON' },
      { id: 'enrich', hop: 'enrichment', layer: 'HARMONY' },
      { id: 'branch', hop: 'navigation', layer: 'NAVIGATION', vertical },
      { id: 'offer', hop: 'proposal', layer: 'NAVIGATION' },
      { id: 'gate', hop: 'checkout', layer: 'STANDARDS', commit: true },
      { id: 'seal', hop: 'reporting', layer: 'STANDARDS' },
    ],
  };
}

module.exports = { decompose };
