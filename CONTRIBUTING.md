# Contributing to Tree of Life System

Thank you for your interest in contributing! This document describes the workflow, branching strategy, and coding standards for this project.

---

## Table of Contents
- [Getting Started](#getting-started)
- [Branching Strategy](#branching-strategy)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Running Tests](#running-tests)
- [Commit Message Format](#commit-message-format)

---

## Getting Started

1. **Fork** the repository and clone your fork locally.
2. Ensure you have **Node.js 20+** installed (use `.nvmrc` — run `nvm use`).
3. Install dependencies:
   ```bash
   npm ci
   ```
4. Copy the example env file and fill in your values:
   ```bash
   cp .env.example .env
   ```

---

## Branching Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Stable, production-ready code. Protected — requires CI pass + 1 review. |
| `develop` | Integration branch for feature work. |
| `feature/<name>` | New features. Branch from `develop`. |
| `fix/<name>` | Bug fixes. Branch from `main` for hotfixes, `develop` otherwise. |
| `chore/<name>` | Maintenance tasks (deps, CI, docs). |

**Never commit directly to `main`.**

---

## Pull Request Process

1. Branch from `develop` (or `main` for hotfixes).
2. Make your changes with tests.
3. Ensure all checks pass locally:
   ```bash
   npm run lint
   npm run format:check
   npm test
   ```
4. Open a PR against `develop` (or `main` for hotfixes).
5. Fill in the PR template completely.
6. Request at least **1 review** from a maintainer.
7. Address all review comments before merging.
8. Use **squash merge** to keep `main` history clean.

---

## Coding Standards

- **Language**: JavaScript (Node.js 20+), CommonJS modules (`require`/`module.exports`).
- **Linting**: ESLint v10 with the flat-config in `eslint.config.js`. Run `npm run lint:fix` to auto-fix.
- **Formatting**: Prettier with the config in `.prettierrc`. Run `npm run format` to auto-format.
- **Style rules** (enforced by ESLint):
  - `const`/`let` only — no `var`.
  - Single quotes for strings.
  - Semicolons required.
  - 2-space indentation.
  - Always use `===` (never `==`).
  - Always use curly braces for control flow.
- **No hardcoded secrets** — use environment variables. See `.env.example`.
- **Error handling**: always catch errors in async functions and either rethrow or log with context.

---

## Running Tests

```bash
# All tests
npm test

# With coverage report
npm run test:coverage

# Watch mode during development
npm run test:watch

# Integration tests only
npm run test:integration
```

Tests live in `tests/`:
- `tests/basic.test.js` — environment and package sanity checks
- `tests/unit/` — unit tests per module (mocked dependencies)
- `tests/integration/` — integration tests (mocked infrastructure)

---

## Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>
```

**Types**: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`

**Examples**:
```
feat(rewoo): add retry logic for failed plan steps
fix(kafka): handle disconnect timeout gracefully
docs(readme): update quickstart instructions
test(bootstrap): add integration tests for shutdown lifecycle
chore(deps): upgrade kafkajs to 2.3.0
```
