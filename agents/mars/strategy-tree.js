/**
 * Tree of Life strategy tree over live commercial SKUs.
 * Unprecedented binding: hierarchical decision branches + RHNS layers + cash SKUs.
 */

const SKUS = Object.freeze([
  {
    sku: 'LLA-47',
    kind: 'one-time',
    amount: 47,
    url: 'https://buy.stripe.com/3cI00j7YV0hQgDp8BR43S2v',
    fit: ['hvac', 'roofing', 'plumbing', 'trades', 'leak-map'],
  },
  {
    sku: 'AI-AUDIT-299',
    kind: 'one-time',
    amount: 299,
    url: 'https://buy.stripe.com/14A5kD3IF9Sqdrd05l43S2l',
    fit: ['audit', 'ops', 'agency', 'multi-location'],
  },
  {
    sku: 'MARS-750',
    kind: 'sub',
    amount: 750,
    url: 'https://buy.stripe.com/4gM7sL6UR3u29aX4lB43S2r',
    fit: ['autonomy', 'mars', 'reasoning', 'enterprise-starter'],
  },
  {
    sku: 'MARS-1500',
    kind: 'sub',
    amount: 1500,
    url: 'https://buy.stripe.com/7sY4gz1Ax3u20Er6tJ43S2s',
    fit: ['autonomy', 'mars', 'growth', 'multi-agent'],
  },
  {
    sku: 'ENT-AUDIT-3500',
    kind: 'one-time',
    amount: 3500,
    url: 'https://buy.stripe.com/4gMfZh1Ax2pYbj5dWb43S2t',
    fit: ['enterprise', 'board', 'compliance'],
  },
]);

function scoreSku(lead, sku) {
  const text = `${lead.vertical || ''} ${lead.need || ''} ${lead.notes || ''}`.toLowerCase();
  let score = 0.35;
  for (const tag of sku.fit) {
    if (text.includes(tag)) score += 0.12;
  }
  if (lead.budget && lead.budget >= sku.amount) score += 0.1;
  if (lead.budget && lead.budget < sku.amount * 0.4) score -= 0.2;
  if (sku.sku.startsWith('MARS') && /mars|rhns|autonom|agent/.test(text)) score += 0.15;
  return Math.max(0, Math.min(0.97, Number(score.toFixed(3))));
}

function branch(lead = {}) {
  const nodes = SKUS.map((sku) => {
    const confidence = scoreSku(lead, sku);
    return {
      id: `branch-${sku.sku}`,
      layer: 'NAVIGATION',
      sku: sku.sku,
      amount: sku.amount,
      url: sku.url,
      kind: sku.kind,
      confidence,
      expected_value_usd: sku.amount,
      claim: `${sku.sku} is the best live SKU for ${lead.subject || lead.vertical || 'unnamed lead'}`,
    };
  }).sort((a, b) => b.confidence - a.confidence);

  const winner = nodes[0];
  return {
    root: 'tree-of-life.commercial',
    lead: {
      subject: lead.subject || null,
      vertical: lead.vertical || null,
    },
    branches: nodes,
    selected: winner,
    contradictions: winner && winner.confidence < 0.4 ? 1 : 0,
  };
}

module.exports = { SKUS, scoreSku, branch };
