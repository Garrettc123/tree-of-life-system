'use strict';


const SupabaseRhnsStore = require('../agents/core/supabase-rhns-store');

describe('startup durable-storage gate', () => {
  const originalEnv = {};
  const keys = ['RHNS_DURABLE_STORE_ENABLED', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RHNS_TENANT_ID'];
  let logs;

  beforeEach(() => {
    for (const key of keys) originalEnv[key] = process.env[key];
    logs = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const key of keys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    jest.restoreAllMocks();
  });

  test('keeps durable storage disabled by default and performs no storage calls', async () => {
    delete process.env.RHNS_DURABLE_STORE_ENABLED;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.RHNS_TENANT_ID;
    const StartupSequence = require('../agents/startup');
    const startup = new StartupSequence();
    await expect(startup.initializeDurableStore()).resolves.toEqual({ enabled: false, mode: 'disabled' });
    expect(startup.durableStore).toBeNull();
  });

  test('fails closed when enabled but any required server configuration is missing', async () => {
    process.env.RHNS_DURABLE_STORE_ENABLED = 'true';
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.RHNS_TENANT_ID;
    const StartupSequence = require('../agents/startup');
    const startup = new StartupSequence();
    await expect(startup.initializeDurableStore()).rejects.toThrow(/SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RHNS_TENANT_ID/);
    expect(startup.durableStore).toBeNull();
  });

  test('checks storage and records an initialization audit event without exposing credentials', async () => {
    process.env.RHNS_DURABLE_STORE_ENABLED = 'true';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'unit-test-only-secret';
    process.env.RHNS_TENANT_ID = '11111111-1111-4111-8111-111111111111';
    const healthCheck = jest.spyOn(SupabaseRhnsStore.prototype, 'healthCheck')
      .mockResolvedValue({ ok: true, storage: 'supabase-rest', tables: ['rhns_action_approvals', 'rhns_proposals'] });
    const appendEvent = jest.spyOn(SupabaseRhnsStore.prototype, 'appendEvent').mockResolvedValue({ id: 'evidence-1' });
    const StartupSequence = require('../agents/startup');
    const startup = new StartupSequence();

    await expect(startup.initializeDurableStore()).resolves.toMatchObject({
      enabled: true,
      mode: 'supabase-rest',
      tables: ['rhns_action_approvals', 'rhns_proposals'],
    });
    expect(healthCheck).toHaveBeenCalledTimes(1);
    expect(appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'rhns.runtime.storage.initialized' }),
      process.env.RHNS_TENANT_ID,
    );
    expect(JSON.stringify(appendEvent.mock.calls)).not.toContain('unit-test-only-secret');
    expect(startup.durableStore).toBeInstanceOf(SupabaseRhnsStore);
  });
});
