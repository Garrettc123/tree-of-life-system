/**
 * MARS Revenue Organ — attachable BioForge part.
 * Walking skeleton: intake → enrich → branch → gate → intent (no live charge).
 */

const { randomUUID } = require('crypto');
const cmc = require('../rhns/cmc');
const { decompose } = require('../rhns/rgt');
const { branch } = require('./strategy-tree');
const Ledger = require('./ledger');

const HOPS = [
  'intake',
  'enrichment',
  'outreach',
  'proposal',
  'checkout',
  'crm',
  'fulfillment',
  'reporting',
];

class MarsOrgan {
  constructor(opts = {}) {
    this.id = 'mars-revenue';
    this.state = 'dormant';
    this.ledger = opts.ledger || new Ledger();
    this.attached = false;
    this.subscriptions = new Set();
  }

  validate(ports = []) {
    const required = ['core.identity', 'core.events', 'core.audit', 'rhns.cmc'];
    const missing = required.filter((p) => !ports.includes(p));
    return { ok: missing.length === 0, missing };
  }

  simulate(lead) {
    return this.run(lead, { dryRun: true });
  }

  attach(ports = []) {
    if (this.ledger.frozenWrites) {
      this.attached = false;
      this.state = 'blocked';
      return {
        state: this.state,
        organ: this.id,
        reason: 'ledger_frozen',
      };
    }
    const check = this.validate(ports);
    if (!check.ok) {
      this.state = 'blocked';
      return { state: this.state, missing: check.missing };
    }
    this.state = 'provisioning';
    this.attached = true;
    this.subscriptions.add('lead.captured');
    this.subscriptions.add('nwu.opportunity');
    this.state = 'healthy';
    return { state: this.state, organ: this.id };
  }

  deactivate() {
    this.subscriptions.clear();
    this.state = this.attached ? 'dormant' : this.state;
    return { state: this.state };
  }

  detach() {
    this.deactivate();
    this.ledger.freeze();
    this.attached = false;
    this.state = 'dormant';
    return {
      state: this.state,
      retained: this.ledger.export(),
      rollback: 'restore last certified schema version',
    };
  }

  opportunityEvent(lead, tree, gate) {
    return {
      id: `evt_${randomUUID()}`,
      type: 'revenue_opportunity',
      source_system: 'github',
      source_url: 'https://github.com/Garrettc123/tree-of-life-system',
      source_timestamp: new Date().toISOString(),
      subject: lead.subject || lead.company || 'unidentified lead',
      claim: tree.selected.claim,
      evidence_excerpt: `strategy-tree winner ${tree.selected.sku} confidence=${tree.selected.confidence}`,
      confidence: tree.selected.confidence,
      expected_value_usd: tree.selected.amount,
      risk_level: gate.decision === 'commit' ? 'recommend' : 'approval_required',
      recommended_action:
        gate.decision === 'commit'
          ? `Send approved live link for ${tree.selected.sku}`
          : `Hold offer. CMC=${gate.decision} (${gate.reason})`,
      owner: 'mars-revenue',
      verification_plan: 'Stripe charge paid=true and last4!=4242',
      status: gate.decision === 'commit' ? 'approved' : 'new',
      sku: tree.selected.sku,
      payment_link: gate.decision === 'commit' ? tree.selected.url : null,
    };
  }

  run(lead = {}, opts = {}) {
    if (!opts.dryRun && !this.attached) {
      throw new Error(`mars-revenue not attached (state=${this.state})`);
    }
    const treeGoals = decompose({
      goal: 'close_paid_loop',
      vertical: lead.vertical,
    });
    const tree = branch(lead);
    const sideEffect = !opts.dryRun;
    const gate = cmc.decide({
      confidence: tree.selected.confidence,
      contradictions: tree.contradictions,
      stalls: lead.stalls || 0,
      policyFail: Boolean(lead.policyFail),
      testCard4242: Boolean(lead.testCard4242),
      sideEffect,
    });

    const row = this.ledger.append({
      organ: this.id,
      hop: 'checkout',
      decision: gate.decision,
      reason: gate.reason,
      proof_hash: gate.proof_hash,
      sku: tree.selected.sku,
      state: gate.decision === 'commit' ? 'SEALED' : 'QUEUED',
    });

    const event = this.opportunityEvent(lead, tree, gate);
    const hopsTouched = HOPS.filter((h) =>
      ['intake', 'enrichment', 'proposal', 'checkout', 'reporting'].includes(h)
    );

    return {
      organ: this.id,
      state: this.state,
      dryRun: Boolean(opts.dryRun),
      rgt: treeGoals,
      tree,
      cmc: gate,
      ledger_row: row,
      event,
      hopsTouched,
      checkout_intent:
        gate.decision === 'commit' && !opts.dryRun
          ? {
              sku: tree.selected.sku,
              url: tree.selected.url,
              amount: tree.selected.amount,
              charge: false,
              note: 'Intent only. Cash is Stripe paid=true, never 4242.',
            }
          : null,
    };
  }
}

module.exports = MarsOrgan;
