#!/usr/bin/env node
'use strict';

/**
 * Garcar Release Bridge
 * Independent local release gate. It does not deploy, mutate Railway, write
 * secrets, or initiate business operations. It produces a machine-readable
 * evidence record for a human-reviewed deployment.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = process.cwd();
const evidenceDir = path.resolve(process.env.GARCAR_EVIDENCE_DIR || '.release-evidence');
const checks = [];
const run = (name, command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout || 20 * 60 * 1000,
    env: { ...process.env, ...(options.env || {}) },
  });
  const ok = result.status === 0;
  checks.push({
    name,
    ok,
    exit_code: result.status,
    // Do not store arbitrary command output; it may contain credentials.
    output_sha256: crypto.createHash('sha256')
      .update((result.stdout || '') + (result.stderr || '')).digest('hex'),
    error: result.error ? result.error.code || 'process_error' : undefined,
  });
  if (!ok) process.stderr.write('[FAIL] ' + name + '\n');
  else process.stdout.write('[PASS] ' + name + '\n');
  return ok;
};

function requireFile(file) {
  if (!fs.existsSync(path.join(root, file))) {
    checks.push({ name: 'file:' + file, ok: false, error: 'missing' });
    process.stderr.write('[FAIL] missing ' + file + '\n');
    return false;
  }
  return true;
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help')) {
    process.stdout.write('Usage: node scripts/garcar-release-bridge.mjs [--skip-container]\n');
    process.stdout.write('Runs local validation and writes hashed evidence. Never deploys.\n');
    return;
  }

  for (const file of [
    'package.json', 'package-lock.json', 'Dockerfile',
    'orchestrator/main.py', 'orchestrator/requirements.txt',
    'scripts/garcar-health-canary.js',
    'tests/garcar-health-canary.node-test.cjs',
  ]) requireFile(file);

  const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  const shaResult = git(['rev-parse', 'HEAD']);
  const sha = shaResult.status === 0 ? shaResult.stdout.trim() : null;
  const dirty = git(['status', '--porcelain']);
  const clean = dirty.status === 0 && dirty.stdout.trim() === '';
  checks.push({ name: 'git_worktree_clean', ok: clean });
  if (!clean) process.stderr.write('[FAIL] git worktree must be clean before release validation\n');

  const npmVersion = spawnSync('npm', ['--version'], { cwd: root, encoding: 'utf8' });
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const npmMajor = Number((npmVersion.stdout || '').trim().split('.')[0]);
  const versionsOk = nodeMajor >= 20 && npmMajor >= 10 && npmVersion.status === 0;
  checks.push({ name: 'runtime_versions_node20_npm10', ok: versionsOk });
  if (!versionsOk) process.stderr.write('[FAIL] Node >=20 and npm >=10 are required\\n');

  if (requireFile('package-lock.json')) {
    run('npm_ci', 'npm', ['ci'], { timeout: 30 * 60 * 1000 });
  }
  run('read_only_health_canary_tests', 'node', ['--test', 'tests/garcar-health-canary.node-test.cjs']);
  run('node_runtime_syntax', 'node', ['--check', 'agents/startup.js']);
  run('node_health_syntax', 'node', ['--check', 'agents/health-server.js']);

  const python = process.env.PYTHON || 'python3';
  const venv = fs.mkdtempSync(path.join(os.tmpdir(), 'garcar-release-venv-'));
  const venvPython = process.platform === 'win32'
    ? path.join(venv, 'Scripts', 'python.exe')
    : path.join(venv, 'bin', 'python');
  try {
    if (run('python_venv', python, ['-m', 'venv', venv])) {
      if (run('python_dependencies', venvPython, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', 'orchestrator/requirements.txt'], { timeout: 30 * 60 * 1000 })) {
        run('python_compile', venvPython, ['-m', 'compileall', '-q', 'orchestrator']);
        run('python_app_import', venvPython, ['-c', "import sys; sys.path.insert(0, 'orchestrator'); from main import app; assert app"], { env: { GARCAR_EVENT_DB_PATH: path.join(venv, 'release-check.sqlite3') } });
      }
    }
  } finally {
    fs.rmSync(venv, { recursive: true, force: true });
  }

  if (!args.has('--skip-container')) {
    const engine = spawnSync('docker', ['--version'], { cwd: root, encoding: 'utf8' }).status === 0
      ? 'docker'
      : (spawnSync('podman', ['--version'], { cwd: root, encoding: 'utf8' }).status === 0 ? 'podman' : null);
    if (!engine) checks.push({ name: 'container_image_build', ok: false, error: 'docker_or_podman_required' });
    else run('container_image_build', engine, ['build', '--pull=false', '-t', 'garcar-tree-of-life:release-check', '.'], { timeout: 45 * 60 * 1000 });
  } else {
    checks.push({ name: 'container_image_build', ok: false, skipped: true, error: 'explicitly_skipped' });
  }

  const passed = checks.every((c) => c.ok);
  const evidence = {
    schema: 'garcar.release-evidence.v1',
    repository: 'Garrettc123/tree-of-life-system',
    commit: sha,
    checked_at: new Date().toISOString(),
    runner: { platform: process.platform, node: process.version },
    passed,
    deploy_authorized: false,
    checks,
  };
  const canonical = JSON.stringify(evidence);
  evidence.sha256 = crypto.createHash('sha256').update(canonical).digest('hex');
  if (process.env.GARCAR_RELEASE_SIGNING_KEY) {
    evidence.hmac_sha256 = crypto.createHmac('sha256', process.env.GARCAR_RELEASE_SIGNING_KEY)
      .update(canonical).digest('hex');
    evidence.signature_type = 'HMAC-SHA256';
  } else {
    evidence.signature_type = 'unsigned-sha256-only';
  }

  fs.mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
  const out = path.join(evidenceDir, 'release-' + (sha || 'unknown') + '.json');
  fs.writeFileSync(out, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify({
    event: 'garcar.release_bridge.completed',
    passed,
    deploy_authorized: false,
    evidence_file: out,
    evidence_sha256: evidence.sha256,
    signature_type: evidence.signature_type,
  }) + '\n');
  if (!passed) process.exitCode = 1;
}

main();
