#!/usr/bin/env node

/**
 * Legacy bootstrap entrypoint.
 *
 * Keep the historical `npm run bootstrap` command safe and consistent with
 * the canonical startup path. The former bootstrap registered mock agents
 * that reported every task successful without performing the requested work.
 */

const StartupSequence = require('./startup');

if (require.main === module) {
  const startup = new StartupSequence();
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    startup.log('SHUTDOWN', `Received ${signal}; closing runtime services`, 'info');
    try {
      await startup.shutdown();
      process.exitCode = 0;
    } catch (error) {
      console.error('Runtime shutdown failed:', error);
      process.exitCode = 1;
    }
  };

  startup.execute()
    .then(() => {
      process.on('SIGINT', () => void shutdown('SIGINT'));
      process.on('SIGTERM', () => void shutdown('SIGTERM'));
      if (startup.status !== 'ready') {
        console.warn('Runtime started in degraded mode; inspect /status and /ready.');
      }
    })
    .catch((error) => {
      startup.status = 'failed';
      console.error('Agent runtime bootstrap failed:', error);
      process.exitCode = 1;
      void startup.shutdown();
    });
}

module.exports = StartupSequence;
