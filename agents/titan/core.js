/**
 * TITAN — Total Autonomous Intelligence Network
 * Governance organ over MARS + RHNS. Honest status only.
 */

const { probe } = require('./registry');
const MarsOrgan = require('../mars/organ');

class Titan {
  constructor(opts = {}) {
    this.id = 'titan-governance';
    this.state = 'dormant';
    this.mars = opts.mars || new MarsOrgan();
    this.lastReport = null;
  }

  activate(lead) {
    const systems = probe();
    const blocked = systems.filter((s) => s.state === 'blocked');
    if (blocked.length) {
      this.state = 'blocked';
      this.lastReport = this.report(systems, null);
      return this.lastReport;
    }

    const ports = ['core.identity', 'core.events', 'core.audit', 'rhns.cmc', 'rhns.rgt', 'rhns.mesh'];
    const attached = this.mars.attach(ports);
    if (attached.state !== 'healthy') {
      this.state = 'blocked';
      this.lastReport = this.report(systems, null, attached);
      return this.lastReport;
    }

    const run = lead
      ? this.mars.run(lead)
      : this.mars.simulate({
          subject: 'unnamed',
          vertical: 'trades',
          need: 'lead leak-map',
          budget: 80,
        });

    this.state = run.cmc && run.cmc.decision === 'abort' ? 'blocked' : 'healthy';
    this.lastReport = this.report(systems, run, attached);
    return this.lastReport;
  }

  detach() {
    const retained = this.mars.detach();
    this.state = 'dormant';
    return { state: this.state, mars: retained };
  }

  report(systems, run, attach) {
    const healthy = systems.filter((s) => s.state === 'healthy').length;
    return {
      organ: this.id,
      name: 'TITAN',
      expansion: 'Total Autonomous Intelligence Network',
      state: this.state,
      booked_cash_usd: 0,
      claim: 'TITAN supervises MARS. Cash remains $0 until Stripe paid=true last4!=4242.',
      systems: {
        total: systems.length,
        healthy,
        blocked: systems.filter((s) => s.state === 'blocked').map((s) => s.id),
        degraded: systems.filter((s) => s.state === 'degraded').map((s) => s.id),
        records: systems,
      },
      mars_attach: attach || null,
      walking_skeleton: run
        ? {
            sku: run.event && run.event.sku,
            cmc: run.cmc && run.cmc.decision,
            proof_hash: run.cmc && run.cmc.proof_hash,
            payment_link: run.event && run.event.payment_link,
            charge: run.checkout_intent ? run.checkout_intent.charge : false,
          }
        : null,
      default_wedge: 'LLA-47',
      live_links: {
        'LLA-47': 'https://buy.stripe.com/3cI00j7YV0hQgDp8BR43S2v',
        'MARS-750': 'https://buy.stripe.com/4gM7sL6UR3u29aX4lB43S2r',
        'MARS-1500': 'https://buy.stripe.com/7sY4gz1Ax3u20Er6tJ43S2s',
      },
    };
  }
}

module.exports = Titan;
