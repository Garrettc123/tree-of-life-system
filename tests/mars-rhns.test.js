const cmc = require('../agents/rhns/cmc');
const { decompose } = require('../agents/rhns/rgt');
const { branch, SKUS } = require('../agents/mars/strategy-tree');
const MarsOrgan = require('../agents/mars/organ');
const Ledger = require('../agents/mars/ledger');

describe('RHNS CMC', () => {
  test('aborts live 4242', () => {
    const d = cmc.decide({ confidence: 0.99, sideEffect: true, testCard4242: true });
    expect(d.decision).toBe('abort');
    expect(d.reason).toBe('live_mode_test_card_forbidden');
  });

  test('commits high-confidence side effect', () => {
    const d = cmc.decide({ confidence: 0.86, contradictions: 0, sideEffect: true });
    expect(d.decision).toBe('commit');
  });

  test('escalates low-confidence money hop', () => {
    const d = cmc.decide({ confidence: 0.4, sideEffect: true });
    expect(d.decision).toBe('escalate');
  });
});

describe('Tree of Life commercial branches', () => {
  test('exposes live SKUs only', () => {
    expect(SKUS.map((s) => s.sku)).toEqual(
      expect.arrayContaining(['LLA-47', 'MARS-750', 'MARS-1500', 'AI-AUDIT-299', 'ENT-AUDIT-3500'])
    );
  });

  test('MARS need selects a MARS SKU', () => {
    const tree = branch({
      subject: 'DFW multi-agent shop',
      vertical: 'autonomy',
      need: 'mars rhns agents',
      budget: 2000,
    });
    expect(tree.selected.sku.startsWith('MARS')).toBe(true);
    expect(tree.selected.confidence).toBeGreaterThanOrEqual(0.72);
  });

  test('trades leak-map selects LLA-47', () => {
    const tree = branch({
      subject: 'Cleburne Comfort HVAC',
      vertical: 'hvac',
      need: 'lead leak-map after first response',
      budget: 80,
    });
    expect(tree.selected.sku).toBe('LLA-47');
  });
});

describe('MARS organ walking skeleton', () => {
  test('blocks attach without CMC port', () => {
    const organ = new MarsOrgan();
    const result = organ.attach(['core.identity']);
    expect(result.state).toBe('blocked');
  });

  test('attaches, runs, detaches, keeps ledger', () => {
    const organ = new MarsOrgan({ ledger: new Ledger() });
    const attached = organ.attach(['core.identity', 'core.events', 'core.audit', 'rhns.cmc']);
    expect(attached.state).toBe('healthy');

    const run = organ.run({
      subject: 'Grandview autonomy buyer',
      vertical: 'mars',
      need: 'rhns autonomous reasoning',
      budget: 2000,
    });
    expect(run.cmc.decision).toBe('commit');
    expect(run.event.type).toBe('revenue_opportunity');
    expect(run.checkout_intent.charge).toBe(false);
    expect(run.hopsTouched).toEqual(
      expect.arrayContaining(['intake', 'enrichment', 'proposal', 'checkout'])
    );

    const detached = organ.detach();
    expect(detached.state).toBe('dormant');
    expect(detached.retained.length).toBeGreaterThan(0);
    expect(detached.retained[0].retained_on_detach).toBe(true);
  });

  test('dry-run never emits checkout intent', () => {
    const organ = new MarsOrgan();
    organ.attach(['core.identity', 'core.events', 'core.audit', 'rhns.cmc']);
    const sim = organ.simulate({ vertical: 'mars', need: 'autonomy', budget: 900 });
    expect(sim.dryRun).toBe(true);
    expect(sim.checkout_intent).toBeNull();
  });
});

describe('RGT', () => {
  test('decomposes close_paid_loop with commit on checkout', () => {
    const tree = decompose({ goal: 'close_paid_loop', vertical: 'trades' });
    const checkout = tree.children.find((c) => c.hop === 'checkout');
    expect(checkout.commit).toBe(true);
    expect(checkout.layer).toBe('STANDARDS');
  });
});
