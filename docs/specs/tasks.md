# Project Implementation Master Tasks: Splitwise Clone

**Specification Baseline:** Splitwise Clone — Technical Specification v1.0 (10 Oct 2026)  
**Target Shell:** Next.js 15 Static Export (`output: 'export'`) + Capacitor 8 Native WebView (Android first, iOS second)  
**Backend:** Supabase (PostgreSQL, RLS, RPCs, Realtime, Edge Functions) + FCM HTTP v1  
**Core Invariants Enforced Across All Tasks:**
- **[I1]** Integer minor units only (no floating point arithmetic for currency).
- **[I2]** Per expense: $\sum \text{paid\_minor} = \text{amount\_minor} = \sum \text{owed\_minor}$.
- **[I3]** Per group: $\sum \text{member net balances} = 0$ at all times.
- **[I4]** Every mutation is idempotent via client-generated UUID (`client_mutation_id`).
- **[I5]** Write-local-first: UI updates synchronously; network sync is asynchronous.

---

## Task Management & Execution Guide

Each task includes:
- **ID & Title**: Direct trace to specification modules (`M1`–`M11`), user stories (`US-01`–`US-22`), architectural decisions (`D-01`–`D-18`), and edge cases (`EC-01`–`EC-24`).
- **Target Files**: Concrete workspace locations.
- **Prerequisites**: Clear dependency chain.
- **Detailed Scope**: Explicit actionable engineering requirements.
- **Acceptance Criteria**: Strict, testable verification conditions.
- **Progress Log Requirement**: At the end of every task, update PROGRESS.md with detailed records of the changes made, tests added/passed, and current architectural state.

---

## Phase 0: Technical De-Risking Spikes

Spikes are time-boxed explorations (3–5 days) to validate critical architectural assumptions before writing production code.

- [x] **T-0.1: Static Export, Query-Param Routing & Android Shell Spike**
  - **Refs:** `[D-11]`, `[EC-22]`, `[R-05]`, `[R-15]`
  - **Files:** `next.config.js`, `capacitor.config.ts`, `app/group/page.tsx`, `lib/native/back-button.ts`
  - **Prerequisites:** None
  - **Scope:**
    1. Scaffold Next.js 15 static export with `output: 'export'`, `trailingSlash: true`, `images: { unoptimized: true }`.
    2. Add Capacitor 8 Android platform; set immutable origins: `androidScheme: 'https'`, `iosScheme: 'ionic'`.
    3. Verify query-param routing (`/group?id=123`) loads in Android WebView without 404 or white-screen.
    4. Implement and test Android hardware back-button listener (`App.addListener('backButton')`): modal close $\rightarrow$ `router.back()` $\rightarrow$ app minimize.
    5. Test deep-link scheme `splitapp://join?code=TEST` routing while app is closed vs running in background.
  - **Acceptance Criteria:** Query-param routing, back navigation, and deep-link handling function flawlessly on a physical Android device.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-0.2: Supabase RPC Concurrency & PT409 Mapping Spike**
  - **Refs:** `[D-01]`, `[D-07]`, `[D-09]`, `[US-21]`
  - **Files:** `supabase/migrations/0000_spike.sql`, `lib/supabase.ts`
  - **Prerequisites:** Supabase CLI local environment running
  - **Scope:**
    1. Create a prototype table with a `version` column and a test RPC `test_update_v1`.
    2. Verify raising custom SQLSTATE `PT409` with JSON error payload in `DETAIL` returns HTTP 409 in `supabase-js` v2.
    3. Verify transactional rollback occurs completely when an invariant or version check fails inside the RPC.
  - **Acceptance Criteria:** `supabase-js` receives an error object containing HTTP status 409 and deserialized JSON server snapshot from `error.details`.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-0.3: FCM Push Round-Trip to Physical Device Spike**
  - **Refs:** `[D-14]`, `[D-16]`, `[R-07]`, `[R-14]`, `[US-18]`
  - **Files:** `supabase/functions/notify-group/index.ts`, `lib/native/push.ts`
  - **Prerequisites:** Firebase Console project, Android google-services.json
  - **Scope:**
    1. Configure `@capacitor-firebase/messaging` plugin.
    2. Register token on a physical Android device; create native notification channel `expenses_channel`.
    3. Build a standalone Deno script to exchange Google Service Account credentials (RS256 via JOSE) for an OAuth2 token and dispatch an FCM HTTP v1 message.
    4. Test notification delivery across states: foreground (in-app toast), background (system tray), killed (system tray + cold-start deep-link).
  - **Acceptance Criteria:** Push delivery succeeds on physical Android device with deep-link navigation in all three app lifecycle states.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-0.4: WebView Storage Persistence & Scheme Spike**
  - **Refs:** `[D-15]`, `[EC-13]`, `[R-01]`, `[R-02]`, `[R-15]`
  - **Files:** `lib/data/storage-adapter.ts`
  - **Prerequisites:** T-0.1
  - **Scope:**
    1. Benchmark `localStorage` throughput on mobile WebView with 5 MB of mock ledger data.
    2. Verify storage persistence across app force-kills, background memory purges, and device restarts.
    3. Confirm origin stability: verify changing app versions with identical `androidScheme` and `iosScheme` preserves stored keys.
  - **Acceptance Criteria:** Storage limits, read/write latencies, and quota error behaviors are documented; origin persistence verified.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

---

## Phase 1: Foundation & MVP (Android Internal Build)

### 1.1 Project Setup, Build Pipeline & Native Shell

- [x] **T-1.1.1: Repository Scaffolding, Tooling & Linter Invariants**
  - **Refs:** `[I1]`, `[NFR-08]`, `[D-11]`, `[D-12]`
  - **Files:** `package.json`, `tsconfig.json`, `next.config.js`, `eslint.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`
  - **Prerequisites:** Phase 0 completion
  - **Scope:**
    1. Initialize Next.js 15 (React 19, TypeScript, Tailwind CSS) configured for static export (`output: 'export'`, `trailingSlash: true`, `images: { unoptimized: true }`).
    2. Configure ESLint with custom AST rule/ban: prohibit `parseFloat`, `.toFixed`, and `Number(...)` on identifiers matching `*minor*` or `*amount*` outside `lib/engine/money.ts`.
    3. Configure Prettier, strict TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`), and Vitest test runner.
    4. Setup Tailwind CSS with design tokens: custom color palette (HSL tailored, dark mode, high-contrast semantic badges for balances, safe-area utilities).
  - **Acceptance Criteria:** `npm run build && npm run lint && npm test` executes cleanly without errors.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-1.1.2: Capacitor 8 Android Shell & Native Plugin Configuration**
  - **Refs:** `[D-16]`, `[EC-22]`, `[5.6]`
  - **Files:** `capacitor.config.ts`, `android/app/build.gradle`, `lib/native/platform.ts`
  - **Prerequisites:** T-1.1.1
  - **Scope:**
    1. Initialize Capacitor 8 with bundle ID (placeholder `com.example.splitapp`), app name `Split`, webDir `out`.
    2. Pin native plugins: `@capacitor/app`, `@capacitor/haptics`, `@capacitor/local-notifications`, `@capacitor-firebase/messaging`.
    3. Set `server: { androidScheme: 'https', iosScheme: 'ionic' }` and `android: { allowMixedContent: false }`.
    4. Implement `lib/native/platform.ts`: safe runtime wrapper `isNativePlatform()` ensuring dynamic imports never crash web builds or Vitest.
  - **Acceptance Criteria:** Running `npm run build && npx cap sync android` builds the APK via Gradle successfully.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-1.1.3: Safe Area Layout & Hardware Navigation Shell**
  - **Refs:** `[EC-22]`, `[NFR-08]`, `[3.5]`
  - **Files:** `app/layout.tsx`, `app/globals.css`, `lib/native/back-button.ts`, `lib/native/haptics.ts`
  - **Prerequisites:** T-1.1.2
  - **Scope:**
    1. Define viewport safe-area CSS environment variables (`--sat`, `--sab`, `--sal`, `--sar`) with fallback zero values.
    2. Create Root Layout wrapping children in `<NativeProvider>` and safe-area containers.
    3. Implement `useHardwareBackButton`: maintain an internal navigation stack / modal registry. Tapping back dismisses the topmost active modal; if no modal is open, calls `router.back()`; if at `/`, invokes `App.minimizeApp()`.
    4. Implement `lib/native/haptics.ts`: wrap `@capacitor/haptics` with light tap on tab/button, success tap on save/settle, warning tap on conflict.
  - **Acceptance Criteria:** Hardware back button cleanly closes modals before navigating back or exiting; safe areas prevent notch/gesture-bar overlap on physical Android device.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

---

### 1.2 Pure TypeScript Money & Split Engine (`lib/engine`)

- [x] **T-1.2.1: Money Parser, Formatter & Currency Exponent Table**
  - **Refs:** `[I1]`, `[EC-01]`, `[EC-02]`, `[EC-03]`, `[3.4]`
  - **Files:** `lib/engine/money.ts`, `lib/engine/errors.ts`, `tests/engine/money.test.ts`
  - **Prerequisites:** T-1.1.1
  - **Scope:**
    1. Define currency exponent table: `{ INR: 2, USD: 2, EUR: 2, GBP: 2, JPY: 0, KWD: 3, AED: 2 }`, default 2.
    2. Implement `parseMoneyToMinor(text: string, currency: string): number | null`:
       - Strict decimal string parsing without IEEE-754 floating point.
       - Support `,` or `.` decimal separators based on exponent rules.
       - Disallow values $\le 0$, $> 10^{10}$ minor units (`MAX_AMOUNT_MINOR`), and non-numeric inputs.
    3. Implement `formatMinor(minor: number, currency: string, locale = 'en-IN'): string`:
       - Scale integer minor units by $10^{\text{exponent}}$.
       - Apply `en-IN` Lakh/Crore grouping for INR and standard grouping for other currencies.
    4. Implement `EngineError` class with stable error codes (`EXPENSE_INVALID_AMOUNT`, `EXPENSE_INVALID_SPLIT`, etc.).
  - **Acceptance Criteria:** Unit tests pass for INR (`1,250.75` $\rightarrow$ `125075`), JPY (`5000` $\rightarrow$ `5000`), KWD (`1.500` $\rightarrow$ `1500`), invalid formats return `null`.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-1.2.2: Deterministic Allocation & Core Split Algorithms**
  - **Refs:** `[I2]`, `[D-04]`, `[EC-24]`, `[US-05]`, `[US-06]`, `[US-07]`
  - **Files:** `lib/engine/split.ts`, `tests/engine/split.test.ts`
  - **Prerequisites:** T-1.2.1
  - **Scope:**
    1. Implement `allocate(totalMinor: number, weights: number[]): number[]`:
       - Largest-remainder method using `BigInt` to prevent integer overflow beyond $2^{53}$.
       - Deterministic tie-breaking: distribute remaining units according to caller participant sort order.
       - Guarantee $\sum \text{allocated} = \text{totalMinor}$ exactly.
    2. Implement `splitEqual(totalMinor: number, memberIds: string[]): Split[]`:
       - Sort memberIds ascending for deterministic remainder distribution.
       - Equal weights `weights = memberIds.map(() => 1)`.
    3. Implement exact split validation and builder: verify $\sum \text{owed\_minor} = \text{totalMinor}$.
    4. Implement multi-payer share builder: verify $\sum \text{paid\_minor} = \text{totalMinor}$, allowing non-participants to pay (`paid > 0`, `owed = 0`).
  - **Acceptance Criteria:** Golden vectors pass: 10000 minor split 3 ways yields `[3334, 3333, 3333]`; 1 minor split 3 ways yields `[1, 0, 0]`.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-1.2.3: Ledger Balances Computation & Invariant Verification**
  - **Refs:** `[I3]`, `[3.4]`, `[4.3]`, `[US-13]`
  - **Files:** `lib/engine/balances.ts`, `lib/engine/validate.ts`, `tests/engine/balances.test.ts`
  - **Prerequisites:** T-1.2.2
  - **Scope:**
    1. Implement `validateExpense(expense: Expense): void`:
       - Validate Invariant I2 ($\sum \text{paid\_minor} = \text{amount\_minor} = \sum \text{owed\_minor}$).
       - Check $\ge 1$ payer, $\ge 1$ participant, all values non-negative integers $\le 10^{10}$.
    2. Implement `computeBalances(expenses: Expense[], settlements: Settlement[]): Map<string, number>`:
       - Ignore soft-deleted expenses and settlements (`deletedAt != null`).
       - Formula: $\text{net}_i = \sum \text{paid}_i - \sum \text{owed}_i + \sum \text{settlements\_sent}_i - \sum \text{settlements\_received}_i$.
       - Enforce Invariant I3: $\sum \text{net} = 0$.
  - **Acceptance Criteria:** Zero net balance sum maintained across test sets; positive net indicates creditor, negative net indicates debtor.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-1.2.4: Deterministic Greedy Debt Simplification (`simplifyDebts`)**
  - **Refs:** `[3.4]`, `[US-14]`, `[R-11]`
  - **Files:** `lib/engine/simplify.ts`, `tests/engine/simplify.test.ts`
  - **Prerequisites:** T-1.2.3
  - **Scope:**
    1. Implement `simplifyDebts(balances: Map<string, number>, currency: string): SuggestedPayment[]`:
       - Separate members into debtors (`net < 0`) and creditors (`net > 0`).
       - Sort creditors by amount descending, then by `memberId` ascending (deterministic tie-break).
       - Sort debtors by absolute amount descending, then by `memberId` ascending.
       - Greedy loop: match maximum debtor with maximum creditor, transfer $\min(|D|, C)$, update nets, repeat.
    2. Guarantee total payments $\le N - 1$ where $N$ is count of non-zero balance members.
    3. Assert all resulting suggestions clear net balances completely to 0.
  - **Acceptance Criteria:** 4-person test (A: +15000, B: -5000, C: -5000, D: -5000) produces exactly 3 payments to A; circular debts net to 0 payments; output is byte-for-byte identical across repeated runs.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-1.2.5: Fast-Check Property Testing Suite for Engine Invariants**
  - **Refs:** `[NFR-02]`, `[NFR-09]`, `[I1]`, `[I2]`, `[I3]`
  - **Files:** `tests/engine/property.test.ts`
  - **Prerequisites:** T-1.2.4
  - **Scope:**
    1. Configure `fast-check` generator for random expenses ($1$ to $30$ members, amounts $1$ to $10^{10}$, random multi-payers and split configurations).
    2. Execute $\ge 10,000$ iterations verifying:
       - Invariant I1: No NaN, no floating point remainders.
       - Invariant I2: Expense conservation holds without exception.
       - Invariant I3: Group balance sum is strictly 0.
       - Simplification: Resulting payments always zero out balances in $\le N-1$ transactions.
    3. Benchmark performance: verify computing balances and simplification for 1,000 expenses $\times$ 12 members executes in $< 50\text{ ms}$ (NFR-02).
  - **Acceptance Criteria:** 10,000 random test iterations pass with 0 invariant violations; benchmark runtime $< 50\text{ ms}$.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

---

### 1.3 Supabase Core Database Schema, Migrations & RLS (`0001_core.sql`)

- [x] **T-1.3.1: PostgreSQL DDL Migration (`0001_core.sql`)**
  - **Refs:** `[4.2]`, `[4.4]`, `[D-02]`, `[D-05]`
  - **Files:** `supabase/migrations/0001_core.sql`
  - **Prerequisites:** Supabase CLI
  - **Scope:**
    1. Create tables with exact types, constraints, and defaults:
       - `profiles` (`id` references `auth.users`, `display_name`, `avatar_url`, `default_currency`).
       - `groups` (`id` uuid PK, `name`, `type`, `currency`, `invite_code`, `created_by`, `version`, `archived_at`, `deleted_at`).
       - `group_members` (`id` uuid PK, `group_id`, `user_id` nullable for placeholders, `display_name`, `role`, `joined_at`, `left_at`).
       - `expenses` (`id` uuid PK, `group_id`, `title`, `notes`, `amount_minor`, `currency`, `category`, `expense_date`, `split_type`, `version`, `client_mutation_id`, `deleted_at`).
       - `expense_splits` (`id` uuid PK, `expense_id`, `member_id`, `paid_minor`, `owed_minor`, `split_value`, unique `(expense_id, member_id)`).
       - `settlements` (`id` uuid PK, `group_id`, `from_member_id`, `to_member_id`, `amount_minor`, `method`, `note`, `settled_on`, `created_by`, `deleted_at`).
       - `activity_log` (`id` uuid PK, `group_id`, `actor_member_id`, `type`, `entity_id`, `payload`, `created_at`).
       - `device_tokens` (`id` uuid PK, `user_id`, `token` unique, `platform`, `app_version`).
       - `notification_prefs` (`user_id`, `group_id` nullable, `expense_added`, `settlement_added`, `reminders`, `muted_until`).
    2. Create unique indexes:
       - `group_members(group_id, user_id)` where `user_id is not null`.
       - `group_members(group_id, lower(display_name))` where `left_at is null`.
    3. Create performance and sync indexes:
       - `expenses(group_id, expense_date desc, id) where deleted_at is null`.
       - `expenses(group_id, updated_at)`.
       - `expense_splits(expense_id)`, `expense_splits(member_id)`.
       - `settlements(group_id, updated_at)`, `settlements(group_id) where deleted_at is null`.
       - `group_members(user_id) where left_at is null`.
       - `activity_log(group_id, created_at desc, id)`.
  - **Acceptance Criteria:** `supabase db reset` applies `0001_core.sql` cleanly with all tables, constraints, and indexes verified.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-1.3.2: Database Triggers, Invariant Constraint & Balances SQL View**
  - **Refs:** `[I2]`, `[I3]`, `[D-08]`, `[4.3]`
  - **Files:** `supabase/migrations/0002_triggers_and_functions.sql`
  - **Prerequisites:** T-1.3.1
  - **Scope:**
    1. Create trigger function `touch_updated_at`: sets `new.updated_at := clock_timestamp();` (ensuring commit-time server ordering). Attach `BEFORE INSERT OR UPDATE` to `groups`, `group_members`, `expenses`, `settlements`.
    2. Implement helper function `is_member(g uuid)` (`SECURITY DEFINER`, `search_path = public`): returns boolean indicating if `auth.uid()` is an active non-left member of group `g`.
    3. Create deferred constraint trigger on `expense_splits` and `expenses`:
       - Verify $\sum \text{paid\_minor} = \text{amount\_minor} = \sum \text{owed\_minor}$ for all modified non-deleted expenses at commit time; abort transaction on mismatch.
    4. Implement authoritative SQL balance calculation `group_balances(p_group uuid)`:
       - Returns `TABLE(member_id uuid, net_minor bigint)` matching client engine sign convention.
  - **Acceptance Criteria:** SQL tests confirm `clock_timestamp()` updates on touch; deferred trigger prevents inserting splits that do not sum to total expense amount.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-1.3.3: Row-Level Security (RLS) Policies & Data Isolation Tests**
  - **Refs:** `[NFR-07]`, `[D-01]`, `[4.3]`
  - **Files:** `supabase/migrations/0003_rls.sql`, `supabase/tests/rls/isolation.test.sql`
  - **Prerequisites:** T-1.3.2
  - **Scope:**
    1. Enable RLS on all tables: `profiles`, `groups`, `group_members`, `expenses`, `expense_splits`, `settlements`, `activity_log`, `device_tokens`, `notification_prefs`.
    2. Set `SELECT` policies: allow reads only if `is_member(group_id)` is true (and user's own profile/tokens/prefs).
    3. **Enforce no direct client write access:** `INSERT`, `UPDATE`, `DELETE` are disallowed for client roles (`anon`, `authenticated`). All writes must execute via `SECURITY DEFINER` RPC functions.
    4. Write pgTAP / SQL integration test suite verifying:
       - Non-member receives 0 rows when attempting `SELECT` on foreign groups, expenses, splits, settlements, or activity.
       - Removed member (`left_at is not null`) loses read privileges.
       - Direct `INSERT`/`UPDATE` queries from authenticated client role are rejected.
  - **Acceptance Criteria:** All RLS isolation tests pass; 100% data boundary security proven.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

---

### 1.4 Core RPC Functions (Transactional & Idempotent API)

- [x] **T-1.4.1: Group Creation, Placeholder Members & Join RPCs**
  - **Refs:** `[US-02]`, `[US-03]`, `[US-04]`, `[5.3]`
  - **Files:** `supabase/migrations/0004_rpc_groups.sql`, `supabase/tests/rpc_groups.test.sql`
  - **Prerequisites:** T-1.3.3
  - **Scope:**
    1. Implement `create_group_v1(p_group jsonb, p_owner_member_id uuid, p_mutation_id uuid)`:
       - Idempotent check on `p_mutation_id` / group `id`.
       - Generate server-side random 8-byte hexadecimal `invite_code`.
       - Create group row, create owner `group_members` row, write `group_created` activity log.
    2. Implement `add_placeholder_v1(p_member jsonb, p_mutation_id uuid)`:
       - Verify caller is active member; check unique name in group (raise `PT409 MEMBER_NAME_TAKEN` on duplicate).
       - Insert placeholder `group_members` (`user_id = null`), write `member_added` activity log.
    3. Implement `join_group_v1(p_code text, p_member_id uuid)`:
       - Rate-limit check ($> 10$ attempts/min/user $\rightarrow$ `PT429 RATE_LIMITED`).
       - Look up group by invite code (raise `PT404 INVITE_INVALID` if not found).
       - If user is already active member, return group and members idempotently.
       - If rejoining after leaving, clear `left_at`.
       - Otherwise create new membership row; log `member_added`.
  - **Acceptance Criteria:** SQL tests verify group creation, duplicate name rejection, idempotent re-joining, and activity log entry creation.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-1.4.2: Transactional Expense Upsert & Delete RPCs**
  - **Refs:** `[D-06]`, `[D-07]`, `[D-09]`, `[D-17]`, `[US-05]`, `[US-11]`, `[US-12]`, `[5.3]`
  - **Files:** `supabase/migrations/0005_rpc_expenses.sql`, `supabase/tests/rpc_expenses.test.sql`
  - **Prerequisites:** T-1.4.1
  - **Scope:**
    1. Implement `upsert_expense_v1(p_expense jsonb, p_base_version int, p_mutation_id uuid)`:
       - Validate `auth.uid()` and `is_member(group_id)`.
       - Check `p_expense.currency = group.currency` (raise `PT400 EXPENSE_CURRENCY_MISMATCH`).
       - Verify Invariant I2 ($\sum \text{paid} = \text{amount} = \sum \text{owed}$) and non-negative integers.
       - Idempotency check: if `client_mutation_id = p_mutation_id`, return existing aggregate with `replayed: true`.
       - If row exists: compare `p_base_version` to current `version`. If mismatch, raise `PT409 EXPENSE_CONFLICT` with current server row in `DETAIL`.
       - Upsert expense with `version = version + 1`, update `client_mutation_id = p_mutation_id`.
       - Atomically delete and re-insert `expense_splits`.
       - Write `activity_log` entry (`expense_added` or `expense_edited` with before/after diff).
       - Return aggregate `{ expense, splits, replayed }`.
    2. Implement `delete_expense_v1(p_expense_id uuid, p_base_version int, p_mutation_id uuid)`:
       - Soft-delete by setting `deleted_at = clock_timestamp()`.
       - Version check against `p_base_version`; write `expense_deleted` activity log.
       - No-op 200 return if already deleted.
  - **Acceptance Criteria:** Atomic upsert succeeds; invariant violations abort transaction; optimistic concurrency conflict raises `PT409`; idempotent replay returns 200 without duplicate rows.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-1.4.3: Settlements & Group Leave RPCs**
  - **Refs:** `[US-15]`, `[US-20]`, `[EC-20]`, `[5.3]`
  - **Files:** `supabase/migrations/0006_rpc_settlements.sql`, `supabase/tests/rpc_settlements.test.sql`
  - **Prerequisites:** T-1.4.2
  - **Scope:**
    1. Implement `upsert_settlement_v1(p_settlement jsonb, p_mutation_id uuid)`:
       - Verify both `from_member_id` and `to_member_id` are active members of group and `from != to`.
       - Verify `amount_minor > 0` and $\le 10^{10}$.
       - Insert row (`on conflict (id) do nothing` for idempotency); log `settlement_added`.
    2. Implement `delete_settlement_v1(p_settlement_id uuid, p_mutation_id uuid)`:
       - Soft-delete (`deleted_at = clock_timestamp()`); allowed only by creator, group admin, or owner.
    3. Implement `leave_group_v1(p_group_id uuid, p_member_id uuid)`:
       - Compute member net balance via `group_balances`.
       - If `net_minor != 0`, raise `PT409 MEMBER_HAS_BALANCE` with `net_minor` in `DETAIL`.
       - If caller is sole owner and other active members exist, raise `PT409 LAST_OWNER`.
       - Set `left_at = clock_timestamp()`; log `member_left`.
  - **Acceptance Criteria:** Non-zero balance blocks leaving; zero balance marks `left_at`; settlement soft-delete preserves append-only integrity.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-1.4.4: Pull Synchronization & Activity Feed RPCs**
  - **Refs:** `[D-08]`, `[US-16]`, `[5.3]`
  - **Files:** `supabase/migrations/0007_rpc_sync.sql`, `supabase/tests/rpc_sync.test.sql`
  - **Prerequisites:** T-1.4.3
  - **Scope:**
    1. Implement `pull_changes_v1(p_since jsonb, p_limit int default 500)`:
       - Accept cursor timestamps for `{ groups, members, expenses, settlements }`.
       - Fetch modified rows where `updated_at > cursor` belonging to caller's active groups.
       - Nest `expense_splits` inside returned expenses.
       - Limit results to `p_limit` per table; return `has_more` flags and `server_time`.
    2. Implement `list_activity_v1(p_group uuid, p_before jsonb, p_limit int default 30)`:
       - Keyset pagination on `(created_at, id)` descending.
  - **Acceptance Criteria:** Incremental pull returns only updated rows; deleted rows returned with `deleted_at` timestamp; keyset pagination pages activity without duplicates.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

---

### 1.5 Authentication & Profile Flow

- [x] **T-1.5.1: Supabase Client Configuration & User Bootstrap**
  - **Refs:** `[US-01]`, `[5.2]`
  - **Files:** `lib/supabase.ts`, `lib/auth.ts`, `supabase/migrations/0008_auth_trigger.sql`
  - **Prerequisites:** T-1.4.4
  - **Scope:**
    1. Configure `createClient` with storage key prefix, auto token refresh, and persistence options.
    2. Create database trigger `on_auth_user_created`: on insert into `auth.users`, create initial `profiles` row with default currency `INR` and display name from email.
    3. Implement session watcher: listen to `onAuthStateChange`; wire Capacitor `appStateChange` to resume auto-refresh in foreground and pause in background.
  - **Acceptance Criteria:** Sign-up generates profile row automatically; session persists across app restarts.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-1.5.2: Email OTP Sign-In Screen & First-Launch Experience**
  - **Refs:** `[US-01]`, `[EC-14]`, `[EC-15]`
  - **Files:** `app/auth/page.tsx`, `components/AuthForm.tsx`
  - **Prerequisites:** T-1.5.1
  - **Scope:**
    1. Build email OTP request screen: email input validation, 6-digit OTP code entry.
    2. Implement 30-second resend cooldown timer.
    3. Error handling: inline display for `AUTH_INVALID_CODE`, network failures, or rate limits.
    4. Profile onboarding prompt on first login: confirm/edit display name before entering dashboard.
  - **Acceptance Criteria:** Valid email receives OTP; verifying code redirects to dashboard `/`; wrong code shows inline error without clearing input.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

---

### 1.6 Local-First Storage Adapter, Local Store & Mutation Queue

- [x] **T-1.6.1: Namespaced Storage Adapter & Schema Migration Engine**
  - **Refs:** `[D-15]`, `[EC-13]`, `[EC-15]`, `[4.5]`
  - **Files:** `lib/data/storage-adapter.ts`, `lib/data/migrations.ts`, `tests/data/storage.test.ts`
  - **Prerequisites:** T-1.1.1
  - **Scope:**
    1. Define `StorageAdapter` interface: `getItem`, `setItem`, `removeItem`, `clear`, `keys`.
    2. Implement `LocalStorageAdapter` namespacing all keys by user ID: `sw:v1:{userId}:{key}`.
    3. Implement local migration runner: track `meta.schemaVersion`; execute forward-only migration steps on startup before any reads.
    4. Handle `QuotaExceededError`: catch storage full errors, trigger storage warning event, prevent data corruption.
    5. Implement sign-out namespace cleanup: wipe user namespace while preserving device-level configuration.
  - **Acceptance Criteria:** Switching accounts isolates data completely; storage quota errors are caught cleanly; unit tests verify namespaced key isolation.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-1.6.2: LocalStore Event-Emitter & Reactive Selectors**
  - **Refs:** `[3.5]`, `[4.5]`
  - **Files:** `lib/data/local-store.ts`, `lib/data/selectors.ts`, `tests/data/store.test.ts`
  - **Prerequisites:** T-1.6.1
  - **Scope:**
    1. Implement `LocalStore` maintaining in-memory cache of groups, members, expenses, settlements, and queue, backed by `StorageAdapter`.
    2. Provide synchronous read/write methods (`upsertGroup`, `upsertExpense`, `softDeleteExpense`, `upsertSettlement`, etc.).
    3. Implement pub/sub event emitter notifying subscribers on mutation.
    4. Implement memoized selectors using `useSyncExternalStore`:
       - `selectGroup(groupId)`
       - `selectGroupExpenses(groupId)` (filters out soft-deleted by default)
       - `selectGroupLedger(groupId)` (memoizes `computeBalances` and `simplifyDebts` indexed by revision counter)
       - `selectDashboardTotals()` (calculates net balances grouped by currency).
  - **Acceptance Criteria:** Local state updates synchronously ($< 10\text{ ms}$); subscribers trigger re-render on mutation; balance memoization avoids recalculation on unrelated renders.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-1.6.3: Mutation Queue with Compaction & Idempotency Keys**
  - **Refs:** `[I4]`, `[3.6]`, `[EC-09]`, `[EC-10]`
  - **Files:** `lib/data/queue.ts`, `tests/data/queue.test.ts`
  - **Prerequisites:** T-1.6.2
  - **Scope:**
    1. Implement `MutationQueue` persisting `MutationRecord` items to `StorageAdapter`.
    2. Enforce FIFO ordering with state transitions: `pending` $\rightarrow$ `inflight` $\rightarrow$ `synced` / `conflict` / `dead`.
    3. Assign client UUID `id` to each record, passed as `client_mutation_id` to Supabase.
    4. Implement queue compaction:
       - Consecutive `UPSERT_EXPENSE` on the same un-pushed entity merge into the latest payload.
       - `UPSERT` followed by `DELETE` of a never-synced local entity cancels both from queue.
    5. Provide queue inspection methods: `getPendingCount()`, `getDeadLetterItems()`, `clearDeadLetter(id)`.
  - **Acceptance Criteria:** Queued mutations survive app restart; compaction correctly eliminates redundant mutations; test suite covers queue lifecycles.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

---

### 1.7 Sync Engine (Push/Drain, Pull/Merge, Compaction, Lifecycle Triggers)

- [x] **T-1.7.1: Push Drain Engine with Error Classification**
  - **Refs:** `[D-10]`, `[EC-10]`, `[EC-11]`, `[3.6]`
  - **Files:** `lib/sync/push.ts`, `tests/sync/push.test.ts`
  - **Prerequisites:** T-1.6.3, T-1.4.2
  - **Scope:**
    1. Implement `drainQueue()`: acquire single in-flight lock; process `pending` records FIFO.
    2. Call corresponding RPC for each mutation type.
    3. Classification logic:
       - **2xx Success:** remove record from queue; update local entity `version` and set `_sync = 'synced'`.
       - **409 Conflict (`EXPENSE_CONFLICT`):** mark mutation `status = 'conflict'`, attach server snapshot from `DETAIL`, mark entity `_sync = 'conflict'`, continue drain for *other* entities.
       - **401 Unauthorized:** pause drain; trigger token refresh; resume if refreshed, stop if expired without discarding queue.
       - **Permanent 4xx (400, 403, 404):** mark mutation `status = 'dead'` with error code; mark entity `_sync = 'dead'`; continue queue for other entities.
       - **Network Error / 5xx / 429:** release lock; halt drain; schedule exponential backoff ($2\text{ s} \rightarrow \min(2^{\text{retry}} \times 2, 60\text{ s})$).
  - **Acceptance Criteria:** Poison mutation (400) dead-letters without stalling remaining queue; network outage triggers backoff; conflicts flag entity for resolution.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-1.7.2: Pull & Idempotent Merge Engine**
  - **Refs:** `[D-08]`, `[EC-12]`, `[3.6]`
  - **Files:** `lib/sync/pull.ts`, `lib/sync/merge.ts`, `tests/sync/pull.test.ts`
  - **Prerequisites:** T-1.7.1, T-1.4.4
  - **Scope:**
    1. Implement `pullChanges()`: read local cursors for groups, members, expenses, settlements.
    2. Call `pull_changes_v1`; loop while `has_more` is true.
    3. Compute new cursor = $\max(\text{updated\_at}) - 5\text{ seconds}$ (5-second overlap window to handle concurrent commits).
    4. Implement merge rules:
       - If local entity has active `pending` or `conflict` mutation: skip overwrite; if remote version $>$ baseVersion, mark conflict.
       - Otherwise accept remote row if `remote.version >= local.version`.
       - Tombstones (`deleted_at != null`): mark local entity deleted, remove from active lists, keep in store for restore/history.
  - **Acceptance Criteria:** Pull cleanly imports server data; pending local writes are never overwritten; 5-second overlap deduplicates idempotently.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-1.7.3: Sync Orchestrator & Lifecycle Triggers**
  - **Refs:** `[NFR-04]`, `[3.6]`, `[US-16]`
  - **Files:** `lib/sync/lifecycle.ts`, `components/SyncBadge.tsx`
  - **Prerequisites:** T-1.7.2
  - **Scope:**
    1. Implement sync triggers:
       - App startup after authentication.
       - Window `online` event.
       - Capacitor `appStateChange` to active.
       - Immediately following any successful local mutation kick (`sync.kick()`).
       - Manual pull-to-refresh on group screen.
    2. Build `SyncBadge` component:
       - Display sync state: "Synced" (check), "X pending" (clock), "Offline" (cloud-off), "Sync error / Conflict" (warning).
    3. Create Sync Issues diagnostics page (`app/settings/sync/page.tsx`): display dead-letter and conflict items with retry and discard actions.
  - **Acceptance Criteria:** Disconnecting and reconnecting network drains pending queue within 10 seconds (NFR-04); sync badge accurately reflects queue state.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

---

### 1.8 Client Domain Repository & Reactive State Layer

- [x] **T-1.8.1: Repository Command Layer**
  - **Refs:** `[I5]`, `[3.5]`
  - **Files:** `lib/data/repository.ts`, `lib/data/types.ts`
  - **Prerequisites:** T-1.6.3, T-1.7.3
  - **Scope:**
    1. Implement transactional command functions:
       - `createGroup(draft)`: generate UUID, validate, save local group + owner member with `_sync: 'pending'`, enqueue `CREATE_GROUP`, kick sync.
       - `addExpense(draft)`: allocate splits via engine, validate invariants via `validateExpense`, save local expense with `_sync: 'pending'`, enqueue `UPSERT_EXPENSE`, kick sync.
       - `deleteExpense(id)`: set `deletedAt = now()`, enqueue `DELETE_EXPENSE`, kick sync.
       - `addSettlement(draft)`: validate, save local settlement with `_sync: 'pending'`, enqueue `UPSERT_SETTLEMENT`, kick sync.
       - `addPlaceholderMember(groupId, name)`: generate UUID, check unique name locally, save member, enqueue `ADD_PLACEHOLDER`, kick sync.
    2. Ensure every command is synchronous locally, triggers haptics, and never awaits network response.
  - **Acceptance Criteria:** All domain writes execute synchronously in $< 50\text{ ms}$; entities immediately appear in local store with pending sync state.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

---

### 1.9 Core UI Components & Design System

- [x] **T-1.9.1: Balance & Settlement Visual Components**
  - **Refs:** `[NFR-08]`, `[US-13]`, `[US-14]`
  - **Files:** `components/BalanceSummary.tsx`, `components/SettleSuggestionList.tsx`, `components/SettleModal.tsx`
  - **Prerequisites:** T-1.2.4, T-1.8.1
  - **Scope:**
    1. Build `BalanceSummary`:
       - Perspective-aware group balance banner: "You are owed ₹X.XX" (green with $\uparrow$ icon), "You owe ₹X.XX" (orange/red with $\downarrow$ icon), "You are all settled up" (muted text).
       - Ensure accessibility: never convey balance meaning through color alone (use text prefixes and directional icons; WCAG 2.1 AA contrast).
    2. Build `SettleSuggestionList`:
       - Render minimal transactions derived from `simplifyDebts`.
       - "Settle up" button on each suggestion prefilling the Settle modal.
    3. Build `SettleModal`:
       - Inputs: Payer dropdown, Payee dropdown, Amount, Payment method tag (`cash`, `upi`, `bank`, `other`), optional note.
       - Validate amount $> 0$; warn if paying more than suggested balance.
  - **Acceptance Criteria:** Balances display accurately with perspective tags; tapping suggestion opens modal with fields prefilled; settlement submission updates balances immediately.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-1.9.2: Expense Entry & Split Editor Components**
  - **Refs:** `[US-05]`, `[US-06]`, `[US-07]`
  - **Files:** `components/ExpenseForm.tsx`, `components/SplitEditor.tsx`, `components/PayerEditor.tsx`
  - **Prerequisites:** T-1.2.2, T-1.8.1
  - **Scope:**
    1. Build `PayerEditor`:
       - Single-payer selector default.
       - Multi-payer toggle: per-payer amount inputs with live residual indicator ("₹X.XX remaining"). Disable save button until $\sum \text{paid} = \text{total}$.
    2. Build `SplitEditor` (Equal & Exact for Phase 1):
       - Equal split: participant checkboxes; shows computed per-person share with remainder distribution note.
       - Exact split: per-member exact amount inputs; live delta label ("₹X.XX left to allocate"); disable save button until delta $= 0$.
    3. Build `ExpenseForm`:
       - Inputs: Title, Amount, Date, Category icon picker, Notes.
       - Save button validation: validate via `validateExpense` before repository dispatch.
  - **Acceptance Criteria:** Save button strictly disabled when paid or owed sums do not equal total amount; live delta labels update instantaneously on keypress.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

---

### 1.10 Core Application Pages & Routing

- [x] **T-1.10.1: Dashboard & Group View Routes**
  - **Refs:** `[D-11]`, `[US-02]`, `[US-13]`
  - **Files:** `app/page.tsx`, `app/group/page.tsx`, `components/ExpenseRow.tsx`, `components/EmptyState.tsx`
  - **Prerequisites:** T-1.9.1, T-1.9.2
  - **Scope:**
    1. Build Dashboard (`app/page.tsx`):
       - Group list with active balances per group.
       - Top card: aggregated net balances broken down by currency (never sum different currencies).
       - FAB: "Create Group" modal.
    2. Build Group Detail (`app/group/page.tsx?id={groupId}`):
       - Tabs: Expenses, Balances, Members, Activity.
       - Expenses tab: chronological list grouped by month; `ExpenseRow` displaying title, date, payer, user's share, and sync state icon.
       - Balances tab: per-member breakdown (verifying $\sum \text{balances} = 0$) and suggested payments.
       - Pull-to-refresh integration.
  - **Acceptance Criteria:** Dashboard aggregates balances accurately; group page tabs toggle without network delay; query-param routing works smoothly.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-1.10.2: Expense Creation, Group Invite & Member Pages**
  - **Refs:** `[US-03]`, `[US-04]`, `[US-20]`, `[app/join/page.tsx]`
  - **Files:** `app/group/expense/page.tsx`, `app/group/members/page.tsx`, `app/join/page.tsx`
  - **Prerequisites:** T-1.10.1
  - **Scope:**
    1. Build Expense Entry Route (`app/group/expense/page.tsx?id={groupId}`): full-screen form hosting `ExpenseForm`.
    2. Build Members Route (`app/group/members/page.tsx?id={groupId}`):
       - List members with roles (`owner`, `admin`, `member`) and balance status.
       - Add placeholder member modal.
       - Invite section: show invite code and share button (show "Available once synced" if group is pending initial sync).
       - "Leave Group" action: trigger `leaveGroup`; show `MEMBER_HAS_BALANCE` modal if net $\ne 0$.
    3. Build Join Route (`app/join/page.tsx?code={code}`):
       - Confirm group details; join group via `joinGroup`; redirect to group on success.
       - Hold invite code in session if user is currently signed out.
  - **Acceptance Criteria:** Adding placeholder member immediately enables them in splits; leaving with non-zero balance is blocked with informative prompt; joining via code works online.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

---

### 1.11 Native Shell Integration & Deep Linking

- [x] **T-1.11.1: Deep Link Handler & Native Integration Polish**
  - **Refs:** `[5.4]`, `[US-03]`
  - **Files:** `lib/native/deeplink.ts`, `app/layout.tsx`
  - **Prerequisites:** T-1.10.2
  - **Scope:**
    1. Implement deep link listener using `App.addListener('appUrlOpen')`.
    2. Handle custom scheme `splitapp://join?code=XXXX`: extract code, route to `/join?code=XXXX`.
    3. Verify deep-link handling while app is closed (cold launch) and when app is in background.
  - **Acceptance Criteria:** Clicking a deep link opens the app and navigates directly to the Join confirmation screen.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

---

### 1.12 Phase 1 Integration, End-to-End Verification & Internal Build

- [x] **T-1.12.1: End-to-End Airplane-Mode Scenario & Verification Script**
  - **Refs:** `[NFR-01]`, `[NFR-03]`, `[NFR-04]`, `[US-16]`
  - **Files:** `tests/e2e/offline-scenario.spec.ts`
  - **Prerequisites:** All Phase 1 tasks
  - **Scope:**
    1. Automated Playwright and manual test script executing the critical offline-to-online cycle:
       - Enable Airplane Mode on Device A.
       - Create group, add placeholder member.
       - Create 3 expenses (equal, exact, multi-payer) and 1 settlement.
       - Verify local write-to-render latency $< 100\text{ ms}$ (NFR-01).
       - Verify UI shows 4 pending items with correct balances.
       - Force-kill the app; restart and verify cold-start load $< 2\text{ s}$ from local storage with no data loss (NFR-03).
       - Disable Airplane Mode.
       - Verify mutation queue drains completely within 10 seconds without duplicates (NFR-04).
       - Verify balances on Device B agree with Device A to the exact minor unit.
  - **Acceptance Criteria:** Full offline scenario passes without errors or data discrepancy; signed internal Android APK built and verified on two physical devices.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

---

## Phase 2: Core Polish & Depth

### 2.1 Advanced Split Types

- [x] **T-2.1.1: Percentage, Shares & Adjustment Split Engine**
  - **Refs:** `[US-08]`, `[US-09]`, `[US-10]`, `[3.4]`
  - **Files:** `lib/engine/split.ts`, `tests/engine/split-advanced.test.ts`
  - **Prerequisites:** Phase 1 completion
  - **Scope:**
    1. Implement `splitPercent(totalMinor: number, bps: number[]): Split[]`:
       - Require basis points sum to exactly $10,000\text{ bp}$ ($100.00\%$).
       - Distribute using `allocate(totalMinor, bps)`.
    2. Implement `splitShares(totalMinor: number, weights: number[]): Split[]`:
       - Support positive decimal weights up to 2 decimal places (convert to integer by multiplying by $100$).
       - Distribute using `allocate(totalMinor, integerWeights)`.
    3. Implement `splitAdjust(totalMinor: number, memberIds: string[], adjustments: number[]): Split[]`:
       - Calculate $\text{pool} = \text{totalMinor} - \sum \text{adjustments}$.
       - Split pool equally using `allocate`; add individual adjustments back; reject if any resulting share $< 0$.
  - **Acceptance Criteria:** Percentage split with $33.33\%, 33.33\%, 33.34\%$ on $10000$ minor sums to exactly $10000$; shares split $[2, 1, 1]$ yields $[5000, 2500, 2500]$.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-2.1.2: SplitEditor UI for Advanced Modes**
  - **Refs:** `[US-08]`, `[US-09]`, `[US-10]`
  - **Files:** `components/SplitEditor.tsx`
  - **Prerequisites:** T-2.1.1
  - **Scope:**
    1. Add split mode selector tabs: Equal, Exact, Percentage, Shares, Adjustment.
    2. Percentage mode: per-member percent inputs; live indicator showing percentage sum vs $100.00\%$.
    3. Shares mode: weight multipliers ($1\times, 2\times, \dots$); real-time computed minor share display.
    4. Adjustment mode: equal base with per-person $+/-$ amount inputs; live validation.
  - **Acceptance Criteria:** Switching split modes recalculates shares immediately; validation blocks saving if percentages $\ne 100\%$ or adjusted shares are negative.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

---

### 2.2 Expense Editing & Conflict Resolution

- [x] **T-2.2.1: Expense Editing & Optimistic Concurrency Engine**
  - **Refs:** `[D-06]`, `[D-07]`, `[US-11]`
  - **Files:** `lib/data/repository.ts`, `app/group/expense/page.tsx`
  - **Prerequisites:** Phase 1 completion
  - **Scope:**
    1. Add `editExpense(draft)` repository command:
       - Keep existing expense `id`; update local attributes and splits; set `_sync = 'pending'`.
       - Enqueue `UPSERT_EXPENSE` with `baseVersion = expense.version`.
    2. Prefill `ExpenseForm` in edit mode.
  - **Acceptance Criteria:** Editing expense updates local balances immediately; incremented version dispatched in mutation queue.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [x] **T-2.2.2: Conflict Resolution UI & Workflow**
  - **Refs:** `[US-21]`, `[EC-06]`, `[EC-17]`
  - **Files:** `components/ConflictResolutionSheet.tsx`, `lib/sync/merge.ts`
  - **Prerequisites:** T-2.2.1
  - **Scope:**
    1. Build `ConflictResolutionSheet` modal triggered when mutation returns `EXPENSE_CONFLICT` (HTTP 409).
    2. Display side-by-side comparison: "Your changes" vs "Server version" (title, amount, payers, splits).
    3. Action "Keep mine": re-enqueue mutation setting `baseVersion = serverVersion`.
    4. Action "Use theirs": discard local mutation and overwrite local entity with server snapshot.
    5. Handle tombstone conflict (entity deleted remotely while edited locally).
  - **Acceptance Criteria:** Conflict sheet appears upon 409; selecting "Use theirs" updates store without data loss; selecting "Keep mine" re-queues with updated base version.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

---

### 2.3 Deletion, Restore & Settlement Undo

- [x] **T-2.3.1: Expense Soft-Delete, 5-Second Undo Toast & Restore Filter**
  - **Refs:** `[US-12]`, `[EC-07]`
  - **Files:** `components/Toast.tsx`, `components/ExpenseRow.tsx`, `app/group/page.tsx`
  - **Prerequisites:** Phase 1 completion
  - **Scope:**
    1. Trigger `deleteExpense(id)` with 5-second undo toast: if "Undo" tapped within 5 seconds, cancel pending mutation and restore entity.
    2. Add "Deleted Expenses" filter in Group Expenses view.
    3. Implement `restoreExpense(id)`: call `restore_expense_v1` to clear `deleted_at`.
  - **Acceptance Criteria:** Deleted expense disappears from active list immediately; undo toast restores it; restore filter brings back soft-deleted expenses.
  - **Progress Log:** Completed & verified with 5-second animated undo toast (`components/Toast.tsx`), soft-delete visual indicator & restore button (`components/ExpenseRow.tsx`), `restoreExpense` repository command, active vs deleted toggle filter in `app/group/page.tsx`, and dedicated suite `tests/data/delete-restore.test.ts`.

- [x] **T-2.3.2: Settlement Undo (Soft-Delete)**
  - **Refs:** `[M6]`, `[EC-08]`
  - **Files:** `components/SettlementRow.tsx`, `lib/data/repository.ts`
  - **Prerequisites:** T-2.3.1
  - **Scope:**
    1. Implement `deleteSettlement(id)` repository command.
    2. Show delete action on settlement rows (restricted to creator, group admin, or owner).
    3. Soft-delete row locally; enqueue `DELETE_SETTLEMENT`; recompute balances immediately.
  - **Acceptance Criteria:** Undoing a settlement reverses its balance effect immediately.
  - **Progress Log:** Completed & verified with `deleteSettlement(id)` repository command, inline undo confirmation in `components/SettlementRow.tsx`, real-time balance reversal in `selectGroupLedger`, and settlement history section on `app/group/page.tsx`.

---

### 2.4 Pairwise Balances, Categories, Search & Group Archive

- [x] **T-2.4.1: Pairwise Balances Engine & Breakdown View**
  - **Refs:** `[3.4]`, `[US-13]`
  - **Files:** `lib/engine/balances.ts`, `components/PairwiseBreakdown.tsx`
  - **Prerequisites:** Phase 1 completion
  - **Scope:**
    1. Implement `computePairwise(expenses, settlements)`:
       - For each expense, compute $\text{net}_i = \text{paid}_i - \text{owed}_i$.
       - Allocate debtor debt across creditors proportionally to creditor net.
       - Sum edges per ordered pair, cancel opposing directions, subtract settlements.
    2. Assert pairwise sums reconcile exactly to net balances in test suite.
    3. Build `PairwiseBreakdown` component showing direct relationships: "Alice owes Bob ₹500".
  - **Acceptance Criteria:** Pairwise balances correctly reconcile to total net balances; UI visualizes direct debts accurately.
  - **Progress Log:** Completed & verified with two-pointer cumulative bipartite sweep algorithm in `lib/engine/balances.ts`, 100% net balance reconciliation in `tests/engine/pairwise.test.ts`, and interactive `components/PairwiseBreakdown.tsx` with simplified vs direct debt toggle and quick settle shortcuts.

- [x] **T-2.4.2: Expense Search, Category Filtering & Group Archival**
  - **Refs:** `[M2]`, `[M3]`
  - **Files:** `app/group/page.tsx`, `components/ExpenseFilters.tsx`
  - **Prerequisites:** T-2.4.1
  - **Scope:**
    1. Add text search on expense title and notes.
    2. Add category filter chips (Food, Transport, Utilities, Entertainment, Lodging, Other).
    3. Implement Group Archive: toggle `archived_at` on group; show read-only banner; hide from default dashboard view.
  - **Acceptance Criteria:** Filtering and search execute instantly over local dataset; archived groups are marked read-only.
  - **Progress Log:** Completed & verified with `components/ExpenseFilters.tsx`, `archiveGroup`/`unarchiveGroup` repository methods, read-only group banners, collapsible dashboard archived section, and `tests/data/archive-search.test.ts`.

---

### 2.5 Supabase Realtime Change Hints

- [x] **T-2.5.1: Realtime Subscription & Reconnect Backoff**
  - **Refs:** `[D-01]`, `[NFR-05]`, `[US-17]`, `[EC-16]`
  - **Files:** `lib/sync/realtime.ts`, `app/group/page.tsx`
  - **Prerequisites:** Phase 1 completion
  - **Scope:**
    1. Subscribe to `postgres_changes` on channel `group-realtime:{groupId}` for tables `expenses`, `settlements`, `group_members` with filter `group_id=eq.{groupId}`.
    2. Mount channel only when group screen is open; unsubscribe on unmount.
    3. Any received event triggers a debounced (300 ms) `pullChanges(groupId)` call (payloads are never trusted directly).
    4. Implement reconnection handler with backoff ($3\text{ s} \rightarrow 30\text{ s}$); expose connection state to `SyncBadge`.
  - **Acceptance Criteria:** Changes made on Device B reflect on Device A within 3 seconds (NFR-05); connection drop shows "Live updates off" badge.
  - **Progress Log:** Completed & verified with `GroupRealtimeManager` in `lib/sync/realtime.ts`, 300 ms debounce, 3s->30s exponential backoff, "Live" and "Live updates off" indicators in `components/SyncBadge.tsx`, and dedicated suite `tests/sync/realtime.test.ts`.

---

### 2.6 Server Push Notifications & Scheduled Reminders

- [x] **T-2.6.1: Edge Function `notify-group` Implementation**
  - **Refs:** `[D-14]`, `[NFR-06]`, `[5.4]`, `[R-14]`
  - **Files:** `supabase/functions/notify-group/index.ts`, `supabase/migrations/0009_webhook.sql`
  - **Prerequisites:** Phase 0 Spike T-0.3, Phase 1
  - **Scope:**
    1. Create database webhook on `INSERT` to `expenses` and `settlements` calling `notify-group`.
    2. Secure webhook via secret header `x-webhook-secret`.
    3. Implement recipient fan-out: resolve group members with registered `device_tokens`, excluding actor.
    4. Filter recipients by `notification_prefs` and active `muted_until` status.
    5. Exchange Google service account credentials for access token (RS256 via JOSE).
    6. Send FCM HTTP v1 notifications in parallel: title `'{Group}: New Expense'`, body `'{title}'`, data payload with route.
    7. Automatically prune dead tokens (HTTP 404 or `UNREGISTERED`).
  - **Acceptance Criteria:** Adding an expense delivers push notification to active members within 10 seconds (NFR-06); actor does not receive push; dead tokens are pruned.
  - **Progress Log:** Completed & verified with `supabase/migrations/0009_webhook.sql`, updated `supabase/functions/notify-group/index.ts` with webhook secret checking, preferences/muting filtering, parallel FCM HTTP v1 dispatch, dead-token pruning, and unit suite `tests/sync/notify-group.test.ts`.

- [x] **T-2.6.2: Client Push Handling, Channels & Weekly Reminder**
  - **Refs:** `[US-18]`, `[US-19]`, `[EC-18]`, `[EC-19]`
  - **Files:** `lib/native/push.ts`, `lib/native/notifications.ts`
  - **Prerequisites:** T-2.6.1
  - **Scope:**
    1. Register FCM token on auth login; store token in `device_tokens` table.
    2. Initialize Android channel `expenses_channel` with importance high.
    3. Push tap listener: deep-link to route specified in push data (with fallback to group root if entity not found).
    4. Implement US-19 weekly settle-up reminder using `@capacitor/local-notifications`: schedule repeating notification for Sundays 20:00 local time opening `/settle`; cancel on sign-out.
  - **Acceptance Criteria:** Tapping notification opens corresponding expense; weekly local notification is scheduled; unregister executes on logout.
  - **Progress Log:** Completed & verified with `lib/native/push.ts` (token registration, unregister on logout, channel setup, tap fallback routing), `lib/native/notifications.ts` (US-19 weekly Sunday 20:00 recurring reminder and cancellation), `lib/auth.ts` lifecycle hooks, `components/NativeProvider.tsx` listeners, and `tests/native/push-notifications.test.ts`.

---

### 2.7 Advanced Member & Group Management

- [x] **T-2.7.1: Member Removal, Role Management & Ownership Transfer**
  - **Refs:** `[US-20]`, `[5.2]`
  - **Files:** `supabase/migrations/0010_member_management.sql`, `app/group/members/page.tsx`
  - **Prerequisites:** Phase 1 completion
  - **Scope:**
    1. Implement `remove_member_v1(p_group_id, p_member_id)`: verify caller is owner/admin; require member net balance to be 0 (`PT409 MEMBER_HAS_BALANCE`).
    2. Role promotion: owner can promote member to admin.
    3. Ownership transfer: owner can transfer ownership to another member before leaving.
  - **Acceptance Criteria:** Non-zero balance blocks member removal; ownership transfer succeeds; sole owner cannot leave without transferring ownership.
  - **Progress Log:** Completed & verified with `supabase/migrations/0010_member_management.sql` (`remove_member_v1`, `update_member_role_v1`, `transfer_group_ownership_v1`), domain repository methods, queue mutations, `app/group/members/page.tsx` UI modals, and `tests/data/member-management.test.ts`.

- [x] **T-2.7.2: Placeholder Member Claiming Flow**
  - **Refs:** `[US-04]`, `[R-17]`
  - **Files:** `supabase/migrations/0011_claim_placeholder.sql`, `app/join/page.tsx`
  - **Prerequisites:** T-2.7.1
  - **Scope:**
    1. Implement placeholder invite generation: create secure claim token tied to a specific placeholder `member_id`.
    2. Implement `claim_placeholder_v1(p_claim_token)`:
       - Link authenticated caller's `user_id` to existing placeholder `group_members` row.
       - Preserve historical splits and balances intact without modifying ledger history.
  - **Acceptance Criteria:** Claiming placeholder assigns history to user account without changing historical expense IDs or balances.
  - **Progress Log:** Completed & verified with `supabase/migrations/0011_claim_placeholder.sql` (`placeholder_claims` table, `generate_placeholder_claim_v1`, `claim_placeholder_v1`), claim link copy in `app/group/members/page.tsx`, claim processing in `app/join/page.tsx`, and `tests/data/member-management.test.ts`.

---

### 2.8 Google Native Sign-In & Universal Links

- [x] **T-2.8.1: Native Google Sign-In Integration**
  - **Refs:** `[US-01]`, `[R-08]`, `[5.2]`
  - **Files:** `lib/auth.ts`, `app/auth/page.tsx`
  - **Prerequisites:** Phase 1 completion
  - **Scope:**
    1. Integrate native Google Sign-In plugin (`@codetrix-studio/capacitor-google-auth`).
    2. Obtain Google ID token natively (avoiding in-WebView OAuth redirects).
    3. Authenticate with Supabase via `supabase.auth.signInWithIdToken({ provider: 'google', token })`.
  - **Acceptance Criteria:** One-tap Google Sign-In succeeds natively on Android device.
  - **Progress Log:** Completed & verified with `@codetrix-studio/capacitor-google-auth` plugin, `signInWithGoogle` in `lib/auth.ts` (native `GoogleAuth.signIn` + `supabase.auth.signInWithIdToken` and web fallback), `AuthForm` UI button with Google brand styling, and unit test in `tests/auth/auth.test.ts`.

- [x] **T-2.8.2: HTTPS Universal / App Links**
  - **Refs:** `[Q-05]`, `[5.4]`
  - **Files:** `android/app/src/main/AndroidManifest.xml`, `.well-known/assetlinks.json`
  - **Prerequisites:** T-2.8.1
  - **Scope:**
    1. Configure Android intent filters for verified domain `https://<domain>/join`.
    2. Deploy Digital Asset Links (`assetlinks.json`) with app SHA-256 fingerprint.
    3. Update `deeplink.ts` to handle universal link URLs.
  - **Acceptance Criteria:** Tapping HTTPS join link opens native app directly without browser redirect prompt.
  - **Progress Log:** Completed & verified with `autoVerify="true"` intent filters in `android/app/src/main/AndroidManifest.xml` for `https://clearcut.app/join` and `/group`, `.well-known/assetlinks.json` and `public/.well-known/assetlinks.json`, universal link parsing in `lib/native/deeplink.ts`, and test coverage in `tests/native/navigation.test.ts`.

---

### 2.9 Receipt Photo Capture & Storage

- [x] **T-2.9.1: Receipt Photo Capture, Compression & Private Storage**
  - **Refs:** `[M3]`, `[Q-09]`
  - **Files:** `lib/native/camera.ts`, `supabase/migrations/0012_receipts_storage.sql`, `components/ReceiptPicker.tsx`
  - **Prerequisites:** Phase 1 completion
  - **Scope:**
    1. Integrate `@capacitor/camera` to take photo or choose from gallery.
    2. Client-side image compression: resize and compress image to $\le 1.5\text{ MB}$ JPEG.
    3. Create private Supabase Storage bucket `receipts` with RLS allowing reads only to group members.
    4. Upload photo to bucket; attach `receipt_path` to expense record.
    5. Load receipt via short-lived signed URL.
  - **Acceptance Criteria:** Camera capture compresses image to $\le 1.5\text{ MB}$; uploaded receipt is viewable only by group members.
  - **Progress Log:** Completed & verified with `0012_receipts_storage.sql` (private bucket and RLS policies), updated `upsert_expense_v1`, `lib/native/camera.ts` (client compression, storage upload, signed URLs), `components/ReceiptPicker.tsx` integrated in `ExpenseForm`, and `tests/native/camera.test.ts`.

---

### 2.10 Data Export, Account Deletion & iOS TestFlight

- [x] **T-2.10.1: CSV Export of Group Ledger**
  - **Refs:** `[M11]`
  - **Files:** `lib/data/export-csv.ts`, `app/group/page.tsx`
  - **Prerequisites:** Phase 1 completion
  - **Scope:**
    1. Implement client-side CSV generator: format date, title, category, amount, currency, payer, and owed breakdown.
    2. Provide download/share trigger via native share sheet or web download.
  - **Acceptance Criteria:** Exported CSV opens cleanly in Excel/Sheets with matching figures and correct currency formatting.
  - **Progress Log:** Completed & verified with RFC 4180 compliant `lib/data/export-csv.ts`, native share via `@capacitor/share` and web download fallback, CSV header button in `app/group/page.tsx`, and `tests/data/export-csv.test.ts`.

- [x] **T-2.10.2: Account Deletion (Apple Review & GDPR Compliance)**
  - **Refs:** `[US-22]`, `[4.1]`, `[5.3]`
  - **Files:** `supabase/migrations/0013_delete_account.sql`, `app/settings/page.tsx`
  - **Prerequisites:** Phase 1 completion
  - **Scope:**
    1. Implement `delete_account_v1()` RPC:
       - Nullify `user_id` on all `group_members` rows belonging to user, retaining their `display_name` (converts memberships into placeholder-style members to preserve Invariant I3).
       - Delete device tokens, notification preferences, and profile row.
    2. Delete authentication user via Supabase Admin / Edge Function.
    3. Wipe local device namespace and navigate to auth screen.
  - **Acceptance Criteria:** Deleting account preserves historical group ledgers and balance sums while anonymizing user identity; local data wiped.
  - **Progress Log:** Completed & verified with `0013_delete_account.sql` (`delete_account_v1` RPC, relaxed foreign keys), `deleteAccount()` in `lib/auth.ts`, `app/settings/page.tsx` Danger Zone deletion flow with confirmation modal, and `tests/auth/delete-account.test.ts`.

- [x] **T-2.10.3: iOS Platform Setup & TestFlight Build**
  - **Refs:** `[5.6]`, `[Q-12]`
  - **Files:** `ios/App/Podfile`, `ios/App/App/Info.plist`, `capacitor.config.ts`
  - **Prerequisites:** All Phase 2 tasks
  - **Scope:**
    1. Add Capacitor iOS platform (`npx cap add ios`).
    2. Configure APNs capabilities and push credentials in Apple Developer portal.
    3. Verify safe-area insets (`contentInset: 'always'`) and avoid double-padding with CSS safe-area variables.
    4. Run full test suite on iOS simulator and physical device.
    5. Archive and deploy build to Apple TestFlight.
  - **Acceptance Criteria:** TestFlight build installs and executes all user stories (US-01 through US-22) cleanly on iOS.
  - **Progress Log:** Completed & verified with `@capacitor/ios` platform addition, privacy permissions (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`) and URL schemes in `ios/App/App/Info.plist`, safe area `contentInset: 'always'` in `capacitor.config.ts`, synchronized across all 8 Capacitor plugins via `npx cap sync`.

---

## Phase 3: Scale, Hardening & Production Readiness

### 3.1 Storage Architecture Upgrade

- [ ] **T-3.1.1: IndexedDB / SQLite Storage Adapter Migration**
  - **Refs:** `[D-15]`, `[EC-13]`, `[R-01]`, `[R-02]`
  - **Files:** `lib/data/storage-adapter.ts`, `lib/data/idb-adapter.ts`, `lib/data/sqlite-adapter.ts`
  - **Prerequisites:** Phase 2 completion
  - **Scope:**
    1. Implement `IDBStorageAdapter` (web/testing) and `@capacitor-community/sqlite` adapter (native mobile).
    2. Partition storage per group to avoid monolithic payload parsing.
    3. Implement zero-downtime data migration: on first boot, read existing `LocalStorageAdapter` entries, write to SQLite/IndexedDB, verify checksum, and delete old keys.
  - **Acceptance Criteria:** Storage capacity exceeds 50 MB without jank; seamless migration from `localStorage` verified with 0 data loss.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

---

### 3.2 Integrity Monitoring & Production Drift Check

- [ ] **T-3.2.1: Automated Ledger Integrity Verification Job & Client Drift Reporting**
  - **Refs:** `[I2]`, `[I3]`, `[D-18]`
  - **Files:** `supabase/functions/ledger-integrity/index.ts`, `lib/sync/pull.ts`
  - **Prerequisites:** Phase 2 completion
  - **Scope:**
    1. Create scheduled cron Edge Function `ledger-integrity`: runs nightly; asserts $\sum \text{net\_minor} = 0$ and Invariant I2 for every group in database; alerts on discrepancy.
    2. Implement client balance drift detection: compute local balance hash; compare with server hash on pull; if mismatch detected, trigger sampled telemetry event and force complete group resync.
  - **Acceptance Criteria:** Cron function executes and validates all database groups; client hash mismatch cleanly initiates full resync.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

---

### 3.3 Telemetry, Observability & Performance Profiling

- [ ] **T-3.3.1: Privacy-Preserving Telemetry & Sync Metrics**
  - **Refs:** `[2.3]`, `[7.3]`
  - **Files:** `lib/telemetry.ts`
  - **Prerequisites:** Phase 2 completion
  - **Scope:**
    1. Implement privacy-preserving telemetry client: strictly ban logging user names, emails, transaction titles, or amounts.
    2. Track sync health metrics: queue depth, drain latency, conflict count, dead-letter rate, pull payload duration.
    3. Integrate crash reporting with breadcrumbs (navigation, sync trigger, network transitions).
  - **Acceptance Criteria:** Telemetry payloads audited; 0 PII or financial amounts emitted; sync failure trends observable.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

- [ ] **T-3.3.2: High-Volume Performance Profiling & Virtualization**
  - **Refs:** `[NFR-02]`, `[Q-09]`
  - **Files:** `components/ExpenseList.tsx`, `tests/performance/fixtures.ts`
  - **Prerequisites:** Phase 2 completion
  - **Scope:**
    1. Generate test fixture: 10 groups, 5,000 expenses, 30 members.
    2. Implement windowed/virtualized list rendering for group expenses using `@tanstack/react-virtual`.
    3. Profile balance computation and verify $< 50\text{ ms}$ execution time for large datasets.
  - **Acceptance Criteria:** Scrolling 5,000 expenses maintains 60 fps on mid-range Android device; balance calculation remains $< 50\text{ ms}$.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

---

### 3.4 Security & App Store Compliance Audits

- [ ] **T-3.4.1: Security Review & Store Compliance Checklist**
  - **Refs:** `[NFR-07]`, `[R-06]`, `[R-13]`
  - **Files:** `SECURITY.md`, `app/settings/about/page.tsx`
  - **Prerequisites:** All Phase 1, 2, and 3 tasks
  - **Scope:**
    1. Audit all `SECURITY DEFINER` Postgres functions: ensure explicit `SET search_path = public` and rigorous `auth.uid()` checks.
    2. Complete Google Play Data Safety form and Apple Privacy Nutrition Labels.
    3. Verify WCAG 2.1 AA accessibility (touch targets $\ge 44\text{ pt}$, screen reader labels on balances and delta indicators).
    4. Implement remote config minimum app version check to deprecate legacy clients if breaking changes occur.
  - **Acceptance Criteria:** Automated penetration tests pass; store privacy declarations complete; accessibility audit passes with 0 violations.
  - **Progress Log:** Update PROGRESS.md with details of what was done and verified.

---

## Verification & Quality Gates Checklist

### Invariant & Golden Vector Verification

- [ ] **Golden Vector 1:** Equal split $100.00$ ($10000$ paise) among 3 members $\rightarrow$ `[3334, 3333, 3333]` (sum $= 10000$).
- [ ] **Golden Vector 2:** Tiny amount $0.01$ ($1$ paisa) among 3 members $\rightarrow$ `[1, 0, 0]` (sum $= 1$).
- [x] **Golden Vector 3:** Percentage split $33.33\%, 33.33\%, 33.34\%$ on $10000$ minor $\rightarrow$ `[3333, 3333, 3334]` (sum $= 10000$).
- [x] **Golden Vector 4:** Shares split $[2, 1, 1]$ on $10000$ minor $\rightarrow$ `[5000, 2500, 2500]` (sum $= 10000$).
- [ ] **Golden Vector 5:** Multi-payer $60.00$ and $40.00$ on $100.00$ expense $\rightarrow$ `paid_minor = [6000, 4000]`.
- [ ] **Golden Vector 6:** JPY currency exponent 0: $¥5,000$ $\rightarrow$ `5000` minor units.
- [ ] **Golden Vector 7:** Circular debt resolution: A owes B $50$, B owes C $50$, C owes A $50$ $\rightarrow$ nets to $0$ suggested payments.
- [ ] **Golden Vector 8:** Debt simplification: 4-member web (A: $+150$, B: $-50$, C: $-50$, D: $-50$) $\rightarrow$ exactly 3 payments to A.

### Definition of Done (DoD) per Story & Task

1. **Invariants:** I1 (integer-only money), I2 (expense conservation), I3 (group balance zero-sum) mathematically verified.
2. **Offline-First:** All mutations execute and render locally first ($< 100\text{ ms}$); background sync occurs without data loss.
3. **Idempotency:** Client UUID attached to all writes; duplicate submissions result in no-op 200 responses.
4. **Data Isolation:** RLS policies tested to ensure non-members cannot read or modify foreign group records.
5. **Platform Parity:** Verified on physical Android and iOS devices across online, airplane mode, and transition states.

---

## Traceability Cross-Reference Index

| Requirement / Decision | Covering Tasks |
| :--- | :--- |
| **US-01** (Sign In & Profile) | `T-1.5.1`, `T-1.5.2`, `T-2.8.1` |
| **US-02** (Create Group) | `T-1.4.1`, `T-1.8.1`, `T-1.10.1` |
| **US-03** (Join by Invite) | `T-1.4.1`, `T-1.10.2`, `T-1.11.1`, `T-2.8.2` |
| **US-04** (Placeholder Member) | `T-1.4.1`, `T-1.10.2`, `T-2.7.2` |
| **US-05** (Equal Split Expense) | `T-1.2.2`, `T-1.4.2`, `T-1.9.2`, `T-1.10.2` |
| **US-06** (Exact Split Expense) | `T-1.2.2`, `T-1.9.2` |
| **US-07** (Multi-Payer Expense) | `T-1.2.2`, `T-1.9.2` |
| **US-08** (Percentage Split) | `T-2.1.1`, `T-2.1.2` |
| **US-09** (Shares Split) | `T-2.1.1`, `T-2.1.2` |
| **US-10** (Adjustment Split) | `T-2.1.1`, `T-2.1.2` |
| **US-11** (Edit Expense) | `T-1.4.2`, `T-2.2.1` |
| **US-12** (Delete & Restore) | `T-1.4.2`, `T-2.3.1` |
| **US-13** (View Balances) | `T-1.2.3`, `T-1.3.2`, `T-1.9.1`, `T-1.10.1`, `T-2.4.1` |
| **US-14** (Settle-Up Suggestions) | `T-1.2.4`, `T-1.9.1` |
| **US-15** (Record Settlement) | `T-1.4.3`, `T-1.8.1`, `T-1.9.1` |
| **US-16** (Offline End-to-End) | `T-1.6.1`, `T-1.6.2`, `T-1.6.3`, `T-1.7.1`, `T-1.7.2`, `T-1.12.1` |
| **US-17** (Realtime Updates) | `T-2.5.1` |
| **US-18** (Push Notification) | `T-0.3`, `T-2.6.1`, `T-2.6.2` |
| **US-19** (Weekly Reminder) | `T-2.6.2` |
| **US-20** (Leave Group) | `T-1.4.3`, `T-1.10.2`, `T-2.7.1` |
| **US-21** (Edit Conflict Resolution)| `T-0.2`, `T-1.7.1`, `T-2.2.2` |
| **US-22** (Account Deletion) | `T-2.10.2` |
| **EC-01..24** (Edge Cases) | Distributed across engine (`T-1.2.*`), RPCs (`T-1.4.*`), sync (`T-1.7.*`), and UI (`T-1.9.*`) |
| **D-01..18** (Architecture Decisions)| Integrated throughout all corresponding technical specifications |
