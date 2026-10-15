# Contributing Guidelines

Thank you for contributing to Clearcut! Please read these guidelines to keep the codebase clean, robust, and aligned with our architectural invariants.

---

## 1. Core Engineering Invariants

Every contribution **must** adhere to these invariants without exception:
1. **Never use floats for currency**: Always use `bigint` minor units (cents, paise).
2. **Zero-Sum conservation**: Every split and group balance calculation must mathematically sum to zero.
3. **Idempotency**: All mutations must support replay without duplicate effects.
4. **Offline Resilience**: Features modifying state must support graceful offline queueing and eventual synchronization.

---

## 2. Development Workflow

1. **Create a Feature Branch**:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. **Implement Changes & Write Tests**:
   - Every new engine or data logic change must be accompanied by tests in `tests/`.
   - Prefer property-based generative tests (`fast-check`) for arithmetic and distribution algorithms.
3. **Run Verification**:
   ```bash
   npx tsc --noEmit
   npm test
   npm run build
   ```
4. **Commit with Conventional Messages**:
   - `feat: add offline search caching`
   - `fix: resolve split distribution remainder bug`
   - `docs: update sync engine diagram`
5. **Open a Pull Request**:
   - Provide a clear summary of what changed and what manual or automated tests were executed.

---

## 3. UI & Design System Standards

Clearcut uses a **Neo-Brutalist** design language:
- Solid high-contrast borders: `border-2 border-black` / `border-4 border-black`.
- Hard drop shadows: `shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`.
- High-saturation accents: Lemon Lime (`#ccff00`), Cyber Cyan (`#00e5ff`), Vivid Amber (`#ffd600`).
- Tactile feedback: Trigger native haptics on primary buttons via `lib/native/haptics.ts`.
