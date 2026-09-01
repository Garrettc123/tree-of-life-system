# Event Spine Repository Onboarding

Use this checklist to link any repository to the shared event spine.

## Canonical Event Contract

- `event_type` (required): normalized taxonomy name (examples: `github.push`, `github.pr_opened`, `github.ci_success`)
- `source_system` (required): use `github-actions` for repo-emitted workflow events
- `trace_id` (required): deterministic run trace (`gh_<repository_id>_<run_id>_<attempt>`)
- `status` (optional): lifecycle summary (`success`, `failure`, `cancelled`, `open`, `closed`, `merged`)
- `repo` (required for `github.*`): full repository name (`owner/repo`)
- `branch` (required for `github.*`)
- `commit_sha` (required for `github.*`)
- `actor` (required for `github.*`)
- `run_url` (required for `github.*`)
- `payload` (optional object): event-specific details
- `X-Dispatch-Sig` (required when secret configured): `sha256=<hmac_sha256(body, DISPATCH_SECRET)>`

## Standard Workflow Pattern

1. Copy or call reusable workflow:
   - `/.github/workflows/event-spine-dispatch.yml`
2. Emit events for:
   - push → `github.push`
   - pull request actions → `github.pr_<action>`
   - workflow completion → `github.ci_<conclusion>`
3. Pass `DISPATCH_URL` and `DISPATCH_SECRET` as secrets to the reusable workflow.
4. Keep payload JSON compact and valid.

## Required Repo Configuration

- Repository Secret: `DISPATCH_URL` (dispatch base URL)
- Repository Secret: `DISPATCH_SECRET` (HMAC signing key)

If either secret is missing, dispatch is skipped safely (no unsigned fallback).

## Event Taxonomy Rules

- Lowercase only
- Dot-separated domains (`github.*`, `stripe.*`, `rhns.*`)
- Underscore separators inside event segments
- Examples:
  - `github.push`
  - `github.pr_opened`
  - `github.ci_failure`

## Receiver Validation Rules (Spine)

The spine rejects invalid events when:

- `event_type` is missing or malformed
- `source_system` is missing
- `payload` is not an object
- `github.*` events do not include required metadata (`repo`, `branch`, `commit_sha`, `actor`, `run_url`)
- signature is invalid when `DISPATCH_SECRET` is configured

## Cross-Repo Validation Checklist

- [ ] Push a test commit in each linked repository and confirm `github.push` appears in `/events`
- [ ] Open or synchronize a pull request and confirm `github.pr_*` events
- [ ] Complete one CI workflow and confirm `github.ci_*` events
- [ ] Verify signature acceptance (no 403) and proper routing status transitions (`pending` → `processed`)
- [ ] Confirm downstream consumers receive expected payloads
