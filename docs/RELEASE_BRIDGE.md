# Garcar Release Bridge

## Purpose

This is an independent release-validation path for environments where GitHub Actions cannot start jobs. It runs on a developer workstation, Linux host, or Termux environment with Node.js, npm, Python 3, and Docker or Podman.

It does **not** deploy, write cloud secrets, start agents, send messages, or initiate payments. A passing result is build evidence, not production certification.

## Run

From a clean checkout of the exact release branch:

```bash
git status --short
node scripts/garcar-release-bridge.mjs
```

The bridge:
1. Requires a clean Git working tree and records the exact commit.
2. Installs the lockfile-defined Node dependencies with `npm ci`.
3. Runs the read-only health-canary tests.
4. Syntax-checks the Node service entry points.
5. Creates a temporary Python virtual environment, installs the orchestrator requirements, compiles the Python source, and imports the FastAPI application.
6. Builds both production images with Docker or Podman: the root Node worker/scheduler image and the nested Python orchestrator web image.
7. Writes a restricted-permission JSON evidence file under `.release-evidence/`.

The bridge does not save raw command output because build output can contain credentials. It records pass/fail, exit status, and output digests only.

## Signing evidence

Set `GARCAR_RELEASE_SIGNING_KEY` in the runner's secret manager to HMAC-sign the evidence. Do not put the key in the repository, command line, chat, or evidence file. Without it, the bridge emits an unsigned SHA-256 evidence digest and labels it accordingly. An unsigned record is not a trusted release attestation.

## Release rules

- A failed check blocks release.
- `--skip-container` is diagnostic only and always leaves the overall gate failed.
- A passing local gate does not bypass review, branch protection, operator step-up, secret verification, or a controlled canary.
- Deployment remains a separate operator action in Railway after reviewing the exact commit and evidence.
- Do not enable global agent execution or live payment handling during the initial canary.
- Run the existing read-only health canary against the deployed service after deployment; require healthy responses before expanding traffic.

## Termux note

Termux can run Node and Python checks. Docker/Podman is usually unavailable on an Android handset; therefore a Termux run without a container engine cannot pass the full release gate. Run the complete gate on a Linux host or container-capable runner instead.
