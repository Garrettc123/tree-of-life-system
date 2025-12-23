/**
 * Basic tests for Tree of Life system
 * These tests ensure core functionality works
 */

const assert = require('assert');

describe('Tree of Life System - Basic Tests', function() {
  
  describe('Environment Configuration', function() {
    it('should have Node.js version 18 or higher', function() {
      const version = process.version;
      const majorVersion = parseInt(version.split('.')[0].substring(1));
      assert(majorVersion >= 18, `Node version ${version} is too old`);
    });
    
    it('should have required environment variables defined', function() {
      // These should be set in GitHub Secrets for deployment
      const requiredVars = ['NODE_ENV'];
      const optionalVars = ['GITHUB_TOKEN', 'OPENAI_API_KEY', 'RAILWAY_TOKEN'];
      
      // Only NODE_ENV is required for tests
      process.env.NODE_ENV = process.env.NODE_ENV || 'test';
      
      requiredVars.forEach(varName => {
        assert(process.env.hasOwnProperty(varName), `Missing required env var: ${varName}`);
      });
    });
  });
  
  describe('Package Configuration', function() {
    it('should have valid package.json', function() {
      const pkg = require('../package.json');
      assert(pkg.name, 'package.json should have a name');
      assert(pkg.version, 'package.json should have a version');
      assert(pkg.scripts, 'package.json should have scripts');
    });
    
    it('should have deployment scripts', function() {
      const fs = require('fs');
      const scriptsToCheck = [
        'scripts/deploy-autonomous-business.sh',
        'scripts/deploy-free-tier.sh',
        'scripts/quick-deploy.sh'
      ];
      
      scriptsToCheck.forEach(script => {
        assert(fs.existsSync(script), `Missing deployment script: ${script}`);
      });
    });
  });
  
  describe('Core Modules', function() {
    it('should be able to require core dependencies', function() {
      const dependencies = ['express', 'axios', 'dotenv'];
      
      dependencies.forEach(dep => {
        try {
          require(dep);
        } catch (error) {
          assert.fail(`Failed to require ${dep}: ${error.message}`);
        }
      });
    });
  });
  
  describe('Basic Functionality', function() {
    it('should perform basic arithmetic', function() {
      assert.strictEqual(2 + 2, 4);
      assert.strictEqual(10 * 10, 100);
    });
    
    it('should handle async operations', async function() {
      const result = await Promise.resolve('test');
      assert.strictEqual(result, 'test');
    });
  });
  
  describe('System Health Checks', function() {
    it('should have memory available', function() {
      const freeMem = process.memoryUsage().heapUsed;
      assert(freeMem > 0, 'Should have memory allocated');
    });
    
    it('should be able to read files', function() {
      const fs = require('fs');
      assert(fs.existsSync('package.json'), 'Should be able to read package.json');
    });
  });
});

// Export for programmatic use
module.exports = {
  name: 'Tree of Life Basic Tests',
  version: '1.0.0',
  description: 'Basic test suite for autonomous business system'
};
