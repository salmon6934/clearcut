# Testing & CI/CD Strategy

Clearcut employs a testing strategy emphasizing mathematical correctness, property-based invariants, and continuous integration.

---

## 1. Test Architecture

The test suite runs on **[Vitest](https://vitest.dev/)** with **[fast-check](https://fast-check.dev/)** for generative property testing.

```bash
# Run full test suite
npm test

# Run tests in watch mode
npx vitest

# Generate coverage report
npx vitest run --coverage
```

### Coverage Highlights:
- **140+ unit and property tests** across 31 suites.
- Execution speed: **< 2.5 seconds** for full suite execution.

---

## 2. Invariant & Property Tests (`tests/`)

- **Conservation of Amount (`tests/engine/split.test.ts`)**:
  Generates 1,000 randomized split amounts, currencies, and member counts to verify:
  $$\sum \text{owed\_minor} = \text{amount\_minor}$$
  Ensures no rounding penny is lost or duplicated across equal, percentage, and exact split methods.
- **Simplification Matrix (`tests/engine/settlement.test.ts`)**:
  Validates debt minimization algorithms ($N-1$ transaction reduction) while preserving individual net balances.
- **Idempotency & Concurrency (`tests/sync/lifecycle.test.ts`)**:
  Simulates rapid concurrent mutations, replay attacks, and network drops to verify optimistic locking and conflict resolution.

---

## 3. Continuous Integration Pipeline (GitHub Actions)

Recommended GitHub Actions workflow template (`.github/workflows/ci.yml`):

```yaml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npx tsc --noEmit

      - name: Run Tests
        run: npm test

      - name: Build Static Export
        run: npm run build
```
