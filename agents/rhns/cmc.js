/**
 * RHNS CMC — Metacognitive Controller
 * Only continue | escalate | commit | abort.
 * Money, outbound reputation, and CRM writes require commit.
 */

const crypto = require('crypto');

const DECISIONS = Object.freeze(['continue', 'escalate', 'commit', 'abort']);

const DEFAULTS = Object.freeze({
  commitConfidence: 0.72,
  maxContradictions: 2,
  stallLimit: 3,
});

function hashProof(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function decide(input = {}) {
  const confidence = Number(input.confidence ?? 0);
  const contradictions = Number(input.contradictions ?? 0);
  const stalls = Number(input.stalls ?? 0);
  const policyFail = Boolean(input.policyFail);
  const sideEffect = Boolean(input.sideEffect);
  const testCard4242 = Boolean(input.testCard4242);

  if (policyFail || testCard4242 || contradictions >= DEFAULTS.maxContradictions) {
    return {
      decision: 'abort',
      reason: testCard4242 ? 'live_mode_test_card_forbidden' : 'contradiction_or_policy',
      proof_hash: hashProof({ input, decision: 'abort' }),
    };
  }

  if (stalls >= DEFAULTS.stallLimit || (sideEffect && confidence < DEFAULTS.commitConfidence)) {
    return {
      decision: sideEffect ? 'escalate' : 'continue',
      reason: stalls >= DEFAULTS.stallLimit ? 'stall_limit' : 'confidence_below_commit',
      proof_hash: hashProof({ input, decision: 'escalate' }),
    };
  }

  if (sideEffect && confidence >= DEFAULTS.commitConfidence) {
    return {
      decision: 'commit',
      reason: 'confidence_and_constraints_ok',
      proof_hash: hashProof({ input, decision: 'commit' }),
    };
  }

  return {
    decision: 'continue',
    reason: 'more_reasoning',
    proof_hash: hashProof({ input, decision: 'continue' }),
  };
}

function assertAllowed(decision) {
  if (!DECISIONS.includes(decision)) {
    throw new Error(`illegal CMC decision: ${decision}`);
  }
}

module.exports = { DECISIONS, DEFAULTS, decide, hashProof, assertAllowed };
