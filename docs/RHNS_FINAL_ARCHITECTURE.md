# Garcar RHNS — Final Architecture Baseline

**Status:** implementation target with partial code committed on the RHNS agent-runtime pull request. This document does not assert production deployment, complete integration, or passing CI.

## 1. System objective

Garcar RHNS (Recursive Hierarchical Neuro-Symbolic System) is a governed orchestration runtime. It converts goals into bounded tasks, delegates only to registered agents, records evidence, verifies outcomes, and places external side effects behind explicit policy and approval checks.

The design prioritizes correctness, recoverability, and evidence over agent count or unverified autonomy.

## 2. Required invariants

1. **Plan is not execution.** A task or proposal is never represented as completed work.
2. **Fail closed.** Unknown agents, invalid task contracts, policy violations, missing evidence, expired approvals, and ambiguous execution outcomes stop the affected operation.
3. **Approval binds to exact action.** Approval covers tenant, tool and version, target, arguments, artifact hash, expiry, and one-time consumption.
4. **No blind retries.** A timeout can mean the receiver completed work but the response was lost. Retry only operations explicitly declared idempotent/retry-safe.
5. **Evidence before claims.** Every status claim points to a durable event, provider response, test result, or artifact.
6. **Least privilege.** Agents receive only the tools and scopes needed for their assigned task.
7. **Bounded autonomy.** Depth, task count, tool calls, concurrency, runtime, and spend have explicit ceilings.
8. **Kill switch.** A central control must block new external actions while preserving diagnostics and audit reads.
9. **No silent degradation.** Partial provider coverage is surfaced as partial; missing data is not treated as a clean bill of health.
10. **Secrets stay out of source, logs, prompts, and evidence artifacts.**

## 3. Logical topology

```text
Operator / API
   |
Identity + tenant scope + budget + kill switch
   |
RHNS orchestrator / durable run state
   |-- planner and task DAG
   |-- neural proposal generation
   |-- symbolic policy and schema checks
   |-- registered specialist agents
   |-- evidence ledger and memory
   |
Independent verifier
   |
Exact-action approval gateway
   |
Execution adapters (disabled by default)
   |-- GitHub / source control
   |-- project management / knowledge
   |-- CRM / messaging
   |-- payments / hosting / infrastructure
   |
Provider receipts + reconciliation + audit ledger
```

## 4. Runtime contracts

### Run lifecycle

`created -> planning -> awaiting_approval -> executing -> verifying -> succeeded`

Terminal alternatives: `rejected`, `failed`, `cancelled`, and `unknown_outcome`.

Do not mark a run successful solely because a tool call returned HTTP 2xx. Verify the resulting state with a read-back or independent provider evidence.

### Task lifecycle

`proposed -> approved -> executing -> confirmed` (the persisted proposal record separately uses `draft_pending_review`).

Alternative states: `rejected`, `failed`, `unknown_outcome`, `cancelled`.

### Evidence record minimum fields

- Unique evidence ID and run/task IDs
- Tenant and actor identity
- Source/provider and source object identifier
- Observation time and retrieval time
- Evidence type and claim supported
- Artifact URI or sanitized payload
- Content hash and schema version
- Trust level and verifier result

Store secrets and raw credentials nowhere in the evidence payload. Apply retention and tenant isolation rules.

## 5. Neuro-symbolic division of labor

**Neural components** generate candidate plans, summarize context, draft artifacts, and propose next steps. Their outputs are untrusted until checked.

**Symbolic components** enforce schemas, permissions, budgets, dependencies, allowed transitions, tenant boundaries, and deterministic business rules.

**Verifier components** independently check acceptance criteria and provider read-back. The component that proposes an action must not be the only component that declares it successful.

## 6. Agent registration and delegation

Each registered agent declares:
- stable agent ID and version;
- capabilities and accepted input/output schemas;
- allowed tools and permission scopes;
- health/readiness state;
- resource limits and timeout;
- idempotency behavior;
- owner and evaluation suite.

The orchestrator rejects unregistered recipients. Assignment acknowledgement means only that the recipient accepted the assignment; it does not mean the task was executed or completed.

## 7. Approval and execution gateway

Before an external write:
1. Validate the action schema and policy.
2. Generate a canonical argument hash.
3. Persist a pending approval with tenant, actor, tool/version, target, arguments, artifact hash, expiry, and nonce.
4. Require an authenticated authorized operator.
5. Atomically transition pending to approved using compare-and-set.
6. At execution time, revalidate expiry, tenant, action hash, current policy, and kill-switch state.
7. Atomically consume the approval exactly once.
8. Execute with an idempotency key where supported.
9. Read back the provider state and write reconciliation evidence.

A production approval store must implement durable, transactional compare-and-set and atomic consume semantics. An in-memory or non-atomic store is not production-safe.

## 8. Durable state and event ledger

Use a transactional relational store as the authoritative state for runs, tasks, approvals, idempotency keys, evidence metadata, and outbox events. Use object storage for larger immutable artifacts and an optional vector/graph index for retrieval, never as the sole authority for execution state.

Recommended tables:
- `rhns_runs`
- `rhns_tasks`
- `rhns_agent_registry`
- `rhns_approvals`
- `rhns_evidence`
- `rhns_events`
- `rhns_idempotency_keys`
- `rhns_outbox`
- `rhns_reconciliation_results`

Use an outbox pattern to atomically persist state transitions and events. Consumers must deduplicate by event ID. Events should include schema version, run/task IDs, causation ID, correlation ID, timestamp, actor, and payload hash.

## 9. Memory model

- **Working memory:** current run context with strict size limits.
- **Episodic memory:** completed run timelines and evidence.
- **Semantic memory:** verified facts with provenance and freshness.
- **Procedural memory:** tested playbooks and tool instructions.
- **Artifact memory:** immutable drafts, diffs, reports, and output hashes.

Memory retrieval supplies context, not authority. Stale or conflicting facts must be surfaced and revalidated before external actions.

## 10. Observability and evaluation

Every run should expose status, task graph, provider calls, budget consumption, retries, approvals, evidence, verification results, and unresolved blockers.

Minimum metrics:
- success rate by verified outcome;
- unknown-outcome rate;
- policy-denial rate;
- approval wait time;
- duplicate-action prevention;
- retry and timeout rates;
- provider error rate;
- cost per verified task;
- evidence completeness;
- regression rate after agent/tool version changes.

Release gates must include contract tests, adversarial policy tests, approval replay/concurrency tests, provider sandbox tests, and failure-injection tests.

## 11. Security boundaries

- Authenticate all operator and service requests.
- Enforce tenant scope in every read and write.
- Use least-privilege tokens and secret injection.
- Treat repository text, web pages, emails, tickets, and retrieved memory as untrusted input, never as policy instructions.
- Redact secrets and personal data from logs.
- Require explicit budgets and allowlists for provider operations.
- Separate read-only diagnostic adapters from write-capable adapters.
- Record kill-switch activations and rejected operations.

## 12. Current implementation mapping

The current PR branch adds a first proposal-only layer:
- `agents/core/contracts.js`: task validation and canonical hashing.
- `agents/core/policy-engine.js`: proposal-only defaults and depth/task/tool-call budget checks.
- `agents/core/approval-gate.js`: exact-action approval contract requiring an atomic store adapter.
- `agents/core/supabase-rhns-store.js`: server-only Supabase REST adapter for durable approvals, idempotent proposal persistence, run/task lifecycle records, and the existing CRF event/evidence ledger. Approval and lifecycle transitions use single conditional database updates.
- `migrations/007_rhns_durable_store.sql`: tenant-scoped exact-action approval and proposal tables with RLS enabled and privileges restricted to `service_role`; applied to `garcar-crf` on 2026-10-29 and read-back verified.
- `migrations/008_rhns_run_task_ledger.sql`: tenant-scoped run/task state tables with constrained lifecycle states, tenant-consistent foreign key, RLS enabled, and privileges restricted to `service_role`; applied to `garcar-crf` on 2026-10-29 and read-back verified.
- `migrations/008_rhns_run_task_ledger.sql`: tenant-scoped run/task lifecycle tables with constrained states and row-level access restricted to `service_role`; applied to `garcar-crf` on 2026-10-29 and read-back verified.
- `agents/orchestration/rewoo-executor.js`: optional durable run/task transitions, task outcome reconciliation, synthesis evidence writes, and timeout cleanup. Persistence must succeed before the run continues.
- `agents/planning/proposal-agent.js`: proposal generation without external side effects.
- `agents/planning/index.js`: planner routing and rejection of unregistered recipients.
- `agents/core/mcp-coordinator.js`: conservative retry defaults and timeout cleanup.
- Regression tests for task contracts, routing, policy, and approval behavior.

The durable store and run/task ledgers are implemented and applied to the connected `garcar-crf` Supabase project. `agents/orchestration/rewoo-executor.js` writes run/task state and synthesis evidence when durable mode is enabled, and `agents/startup.js` injects that store into ReWOO. This is not a verified production rollout: `RHNS_DURABLE_STORE_ENABLED` remains false by default, no runtime secrets or tenant configuration were changed, and no external write adapter is attached. A complete run and its tasks are not created in one database transaction; each state transition is instead a conditional database update. Provider sandbox tests, a full successful test run, operator-identity integration, and deployment verification remain outstanding.

## 13. Implementation sequence

### Phase A — Runtime correctness
- Run the test suite and lint.
- Fix failing tests and align all task types with the contract.
- Verify agent registration, readiness, health, and bounded shutdown.
- Ensure timeouts yield `unknown_outcome` where completion is ambiguous.

### Phase B — Durable state
- Implement migrations and repository layer for runs, tasks, approvals, events, evidence, idempotency, and outbox.
- Add transactional state transitions and optimistic concurrency.
- Add redaction and tenant-isolation tests.

### Phase C — Read-only canary
- Connect read-only adapters first.
- Reconcile provider results against independent read-back evidence.
- Run bounded canaries and publish diagnostics without external writes.

### Phase D — Approved writes
- Implement execution gateway and per-provider allowlists.
- Connect exact-action approvals to the durable store.
- Enable one low-risk sandbox action, with idempotency and rollback/compensation.
- Require explicit operator approval before expanding action scope.

### Phase E — Controlled production
- Deploy only after CI, sandbox, security, recovery, and monitoring gates pass.
- Start with narrow scopes and low budgets.
- Expand based on measured verified outcomes, not agent count or planned capabilities.

## 14. Definition of done

The system is production-ready only when:
- all required tests pass in a verified CI run;
- approval races and replay attempts are rejected under concurrency;
- external writes are impossible without current exact-action approval;
- run/task/evidence state survives process restart;
- ambiguous provider outcomes are reconciled rather than blindly retried;
- kill switch blocks new external actions;
- credentials are least-privileged and never exposed in logs;
- health/readiness checks reflect real dependencies;
- a sandbox end-to-end run is verified from goal to provider read-back;
- operational limitations and recovery procedures are documented.

**Truth rule:** architecture written, code committed, test passing, provider connected, and production deployed are distinct states. Report each separately.
