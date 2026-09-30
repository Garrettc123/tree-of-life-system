const Titan = require('../agents/titan/core');
const { probe } = require('../agents/titan/registry');

describe('TITAN registry', () => {
  test('probes only real files', () => {
    const systems = probe();
    expect(systems.length).toBeGreaterThanOrEqual(8);
    expect(systems.every((s) => s.id && s.family)).toBe(true);
    expect(systems.find((s) => s.id === 'mars.organ').state).toBe('healthy');
    expect(systems.find((s) => s.id === 'rhns.cmc').state).toBe('healthy');
  });
});

describe('TITAN activate', () => {
  test('activates and routes trades to LLA-47 without charging', () => {
    const titan = new Titan();
    const report = titan.activate({
      subject: 'Cleburne Comfort HVAC',
      vertical: 'hvac',
      need: 'lead leak-map',
      budget: 80,
    });
    expect(['healthy', 'degraded']).toContain(report.state);
    expect(report.booked_cash_usd).toBe(0);
    expect(report.walking_skeleton.sku).toBe('LLA-47');
    expect(report.walking_skeleton.charge).toBe(false);
    expect(titan.detach().state).toBe('dormant');
  });

  test('routes autonomy demand to MARS SKU after CMC commit', () => {
    const titan = new Titan();
    const report = titan.activate({
      subject: 'DFW autonomy buyer',
      vertical: 'mars',
      need: 'rhns multi-agent reasoning',
      budget: 2000,
    });
    expect(report.walking_skeleton.sku.startsWith('MARS')).toBe(true);
    expect(report.walking_skeleton.cmc).toBe('commit');
  });
});
