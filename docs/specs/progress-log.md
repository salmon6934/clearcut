# Engineering Progress & Architecture Log: Clearcut (Splitwise Clone)

**Specification Baseline:** Splitwise Clone — Technical Specification v1.0 (10 Oct 2026)  
**Target Shell:** Next.js 15 Static Export (`output: 'export'`) + Capacitor 8 Native WebView (Android first, iOS second)  
**Backend:** Supabase (PostgreSQL, RLS, RPCs, Realtime, Edge Functions) + FCM HTTP v1  
**Last Updated:** Migration 0020, Connectivity Status UI, Custom App Icon & Splash Screen, iOS Setup, and Asset Optimization

---

## 1. System Overview & Core Invariants

Clearcut is an offline-first balance ledger running as a static Next.js application inside Capacitor 8 WebView, backed by Supabase.

### Architectural Invariants Enforced:
- **[I1] Integer Minor Units Only:** No floating-point arithmetic for currency (amounts scaled by currency exponents).
- **[I2] Zero-Sum Expense Conservation:** Per expense: $\sum \text{paid\_minor} = \text{amount\_minor} = \sum \text{owed\_minor}$.
- **[I3] Zero-Sum Group Balances:** Per group: $\sum \text{member net balances} = 0$ at all times.
- **[I4] Client-Side Mutation Idempotency:** Every mutation has a client-generated UUID (`client_mutation_id`). Retrying mutations produces identical results without duplicates.
- **[I5] Write-Local-First:** Synchronous local state updates ($< 100\text{ ms}$); background asynchronous network synchronization.

---

## 2. Phase 0: Technical De-Risking Spikes (Completed)

Phase 0 validated critical architectural assumptions before writing production application code.

### T-0.1: Static Export, Query-Param Routing & Android Shell Spike
- **Next.js 15 Static Export (`next.config.ts`):**
  - Configured `output: 'export'`, `trailingSlash: true`, `images: { unoptimized: true }`.
  - Generates standalone static HTML/CSS/JS in `out/` with zero Node.js server dependencies.
- **Capacitor 8 Configuration (`capacitor.config.ts`):**
  - Set `appId: 'com.splitwise.mobile'`, `appName: 'Splitwise'`, `webDir: 'out'`.
  - Configured immutable origin schemes: `server: { androidScheme: 'https', iosScheme: 'ionic' }`.
  - Configured Android security flags: `android: { allowMixedContent: false, captureInput: true }`.
  - Added native platform via `npx cap add android` and synced assets with `npx cap sync android`.
- **Query-Param Routing Without 404 (`app/group/page.tsx`):**
  - Integrated `useSearchParams()` wrapped inside React `<Suspense>` boundary.
  - Verified static page generation outputs `group/index.html` allowing dynamic query-param routes (e.g., `/group?id=123`) inside the Android WebView.
- **Hardware Back-Button Interceptor (`lib/native/back-button.ts`):**
  - Created LIFO modal dismissal registry using `registerModalDismiss()`.
  - Intercepts Capacitor native `backButton` event:
    1. Dismisses topmost active modal if one is open.
    2. Calls `router.back()` if navigation history exists and not on root.
    3. Triggers `CapApp.minimizeApp()` on root screen `/`.
- **Deep Linking (`lib/native/deeplink.ts` & `android/app/src/main/AndroidManifest.xml`):**
  - Added Android intent filter for custom URI scheme `splitapp://`.
  - Handled cold-start launch URLs (`CapApp.getLaunchUrl()`) and background/foreground intent events (`appUrlOpen`).
  - Created confirmation landing route at `app/join/page.tsx` for `splitapp://join?code=...`.
- **Tests (`tests/native/navigation.test.ts`):**
  - Verified deep-link URI parsing and LIFO modal dismiss handler registration.

---

### T-0.2: Supabase RPC Concurrency & PT409 Mapping Spike
- **Prototype Schema & RPC (`supabase/migrations/0000_spike.sql`):**
  - Table `spike_items` with integer `version` and `client_mutation_id`.
  - Function `test_update_v1`:
    - Checks `client_mutation_id` for idempotent replay (`replayed: true`).
    - Enforces Optimistic Concurrency Control (OCC): if `current.version != p_base_version`, raises custom SQLSTATE `PT409` with error code `EXPENSE_CONFLICT` and current server row serialized in `DETAIL`.
    - Enforces invariants (e.g. `p_amount_minor > 0`), raising `PT400` on violation to verify complete transaction rollback.
- **PostgREST / Supabase Error Parser (`lib/supabase.ts`):**
  - Implemented `parseRpcError<T>()`:
    - Maps PostgREST SQLSTATE `PT409` or HTTP 409 status to `isConflict: true`.
    - Parses JSON error snapshot from `error.details`.
    - Maps `PT429` (rate-limited), `PT400` (bad request), `PT401` (unauthorized), and `PT404` (not found).
- **Tests (`tests/spike/rpc-conflict.test.ts`):**
  - Verified `PT409` error translation into HTTP 409 status with deserialized `server_snapshot`.
  - Verified `PT429` and `PT400` mapping.

---

### T-0.3: FCM Push Round-Trip to Physical Device Spike
- **Native Push Bridge (`lib/native/push.ts`):**
  - Dynamically imports `@capacitor-firebase/messaging` with safe web/test fallbacks.
  - Creates high-importance Android notification channel `expenses_channel`.
  - Manages permissions (`requestPermissions`), retrieves device FCM token (`getToken`), and persists tokens to `device_tokens` table in Supabase.
  - Implemented listeners:
    - Foreground: `notificationReceived` $\rightarrow$ triggers in-app toast notification.
    - Background/Killed: `notificationActionPerformed` $\rightarrow$ deep-links to group/expense route.
- **Serverless FCM Dispatch Function (`supabase/functions/notify-group/index.ts`):**
  - Supabase Edge Function running in Deno runtime.
  - Exchanges Google Service Account credentials for an OAuth2 token using RS256 JWT assertion via JOSE.
  - Dispatches batch push notifications via Google FCM HTTP v1 (`https://fcm.googleapis.com/v1/projects/{projectId}/messages:send`).
- **Tests (`tests/native/push.test.ts`):**
  - Verified listener cleanup and non-native environment graceful degradation.

---

### T-0.4: WebView Storage Persistence & Scheme Spike
- **Storage Adapter (`lib/data/storage-adapter.ts`):**
  - Defined `StorageAdapter` interface (`getItem`, `setItem`, `removeItem`, `clear`, `keys`).
  - Implemented `LocalStorageAdapter`:
    - User namespacing: `sw:v1:{userId}:{key}` (and device namespace `sw:v1:_device:{key}`).
    - Safe sign-out wipe: clears user namespace while preserving device configurations.
    - Quota protection: catches DOMException `QuotaExceededError` and wraps it in typed `QuotaExceededStorageError`.
    - Built-in benchmarking utility: `LocalStorageAdapter.benchmark(targetSizeBytes)`.
- **Tests & Benchmarks (`tests/data/storage.test.ts`):**
  - Verified user key isolation across accounts.
  - Verified `QuotaExceededStorageError` propagation.
  - Benchmarked throughput with 5 MB mock ledger data: verified read/write latency and throughput metrics.

---

## 3. Phase 1: Foundation & MVP Progress

### 1.1 Project Setup, Build Pipeline & Native Shell (Completed)
- **T-1.1.1: Scaffolding, Strict Tooling & Linter Invariants:**
  - Strict TypeScript configuration (`strict: true`, `noUncheckedIndexedAccess: true` in `tsconfig.json`).
  - Pinned test dependencies: installed `fast-check` for comprehensive invariant property testing.
  - Configured Vitest test runner with `@/` module alias resolution (`vitest.config.ts`).
- **T-1.1.2: Native Shell & Plugin Configuration:**
  - Pinned native plugins: `@capacitor/app`, `@capacitor/haptics`, `@capacitor/local-notifications`, `@capacitor-firebase/messaging`.
  - Safe runtime guards (`lib/native/platform.ts`): web and Vitest environments safely fallback without native crash.
- **T-1.1.3: Safe Area Shell, Navigation & Haptics:**
  - Native Shell Container (`components/NativeProvider.tsx`): Root layout safe-area wrapper with hardware back-button and deep-link lifecycle handlers mounted.
  - Native Haptics Bridge (`lib/native/haptics.ts`): `tap()`, `success()`, `warning()`, and `error()` patterns using `@capacitor/haptics`.
  - Native Local Notifications Bridge (`lib/native/notifications.ts`): schedule and cancel local reminders.

---

### 1.2 Pure TypeScript Money & Split Engine (Completed)
Zero-dependency, pure math and domain logic running identically across app, Vitest, and Edge functions.

- **T-1.2.1: Money Parser, Formatter & Currency Exponents (`lib/engine/money.ts`):**
  - Exponent table: `{ INR: 2, USD: 2, EUR: 2, GBP: 2, JPY: 0, KWD: 3, AED: 2 }`, default 2.
  - Decimal parser (`parseMoneyToMinor`): strict string-based integer conversion without floating-point IEEE-754 inaccuracy; handles thousand separators (including JPY `10,000`), decimal commas/periods, and bounds checks against `MAX_AMOUNT_MINOR` ($10^{10}$).
  - Formatter (`formatMinor`): exact scale factor scaling by $10^{\text{exponent}}$ with locale formatting (`en-IN` Lakh/Crore grouping for INR).
  - Stable error taxonomy (`lib/engine/errors.ts`): `EngineError` with machine codes matching specification §5.5.
- **T-1.2.2: Deterministic Allocation & Core Split Algorithms (`lib/engine/split.ts`):**
  - Largest-remainder allocation (`allocate`): BigInt arithmetic prevents integer overflow beyond $2^{53}$; exact sum conservation ($\sum \text{allocated} = \text{totalMinor}$).
  - `splitEqual`: sorts member IDs ascending for deterministic remainder distribution on every device.
  - `splitExact` & `buildMultiPayerSplits`: validates exact shares and multi-payer distributions, allowing non-participants to pay (`paid > 0, owed = 0`).
- **T-1.2.3: Ledger Balances Computation & Invariants (`lib/engine/balances.ts` & `lib/engine/validate.ts`):**
  - Expense validator (`validateExpense`): enforces Invariant I2 ($\sum \text{paid\_minor} = \text{amount\_minor} = \sum \text{owed\_minor}$), participant count $\ge 1$, payer count $\ge 1$, positive amount.
  - Ledger computation (`computeBalances`): $\text{net}_i = \sum \text{paid}_i - \sum \text{owed}_i + \sum \text{settlements\_sent}_i - \sum \text{settlements\_received}_i$.
  - Enforces Invariant I3: $\sum \text{net} = 0$.
  - Pairwise breakdown (`computePairwise`): direct member-to-member directed debt graph reconciliation.
- **T-1.2.4: Deterministic Greedy Debt Simplification (`lib/engine/simplify.ts`):**
  - Separates debtors and creditors; sorts by amount descending, then `memberId` ascending (deterministic tie-break).
  - Greedily settles maximum debtor with maximum creditor; guarantees $\le N - 1$ minimal settlement transactions.
- **T-1.2.5: Fast-Check Property Testing Suite (`tests/engine/property.test.ts`):**
  - Executed **10,000 randomized property test iterations** across variable participant counts ($1$–$20$) and amounts up to $10^7$ paise.
  - Proved: Invariant I1 (strictly integer minor units), Invariant I2 (expense conservation), Invariant I3 (zero-sum group balance), and simplification payment bound ($\le N - 1$).
  - Verified Benchmark (NFR-02): computing balances and simplifying debts for 1,000 expenses $\times$ 12 members executes in **$< 50\text{ ms}$** (measured ~15ms).

---

### 1.3 Supabase Core Database Schema, Migrations & RLS (Completed)
Production PostgreSQL DDL, triggers, authoritative SQL balance function, and zero-trust RLS policies.

- **T-1.3.1: PostgreSQL DDL Migration (`supabase/migrations/0001_core.sql`):**
  - Core tables created: `profiles`, `groups`, `group_members`, `expenses`, `expense_splits`, `settlements`, `activity_log`, `device_tokens`, `notification_prefs`.
  - Type safety & bounds: `amount_minor` checked ($0 < \text{amount} \le 10^{10}$), currencies checked (`^[A-Z]{3}$`), 8-byte hexadecimal server `invite_code`.
  - Unique constraints: `group_members(group_id, user_id)` (non-null), `group_members(group_id, lower(display_name))` (active members), `device_tokens(token)`.
  - Performance & sync cursor indexes created on `(group_id, updated_at)` and `(group_id, expense_date desc, id)`.
- **T-1.3.2: Database Triggers, Invariants & Balances View (`supabase/migrations/0002_triggers_and_functions.sql`):**
  - `touch_updated_at`: sets `clock_timestamp()` for commit-time sequencing on modified rows.
  - `is_member(g uuid)`: `SECURITY DEFINER` membership checker.
  - Deferred Invariant I2 constraint trigger (`check_expense_conservation`): attached to `expenses` and `expense_splits` (`DEFERRABLE INITIALLY DEFERRED`) to ensure $\sum \text{paid} = \text{amount} = \sum \text{owed}$ at transaction commit.
  - Authoritative `group_balances(p_group uuid)` SQL function matching client ledger convention: `net = Σpaid − Σowed + Σ(settlements sent) − Σ(settlements received)`.
- **T-1.3.3: Row-Level Security Policies & Isolation Tests (`supabase/migrations/0003_rls.sql`):**
  - Enabled RLS on all 9 tables.
  - Zero direct client writes: `INSERT`, `UPDATE`, `DELETE` disallowed for client roles (`anon`, `authenticated`); all mutations restricted to `SECURITY DEFINER` RPCs.
  - `SELECT` policies enforce `is_member(group_id)`.
  - Added pgTAP/SQL isolation test suite: [`supabase/tests/rls/isolation.test.sql`](file:///c:/harsh/projects/clearcut/supabase/tests/rls/isolation.test.sql).
  - Added `expenses`, `settlements`, `group_members` to `supabase_realtime` publication.

---

### 1.4 Core RPC Functions & Auth Bootstrap (Completed)
Transactional, idempotent PostgreSQL stored procedures with optimistic concurrency control (OCC).

- **T-1.4.1: Groups, Placeholders & Joining (`supabase/migrations/0004_rpc_groups.sql`):**
  - `create_group_v1`: idempotent group creation generating server 8-byte hexadecimal `invite_code`, creator owner membership, and `group_created` activity log.
  - `add_placeholder_v1`: adds guest members (`user_id = null`) with unique name check within group (raising `PT409 MEMBER_NAME_TAKEN`).
  - `join_group_v1`: joins by invite code, handles re-joining by clearing `left_at`, logs `member_added`.
- **T-1.4.2: Transactional Expense Upsert & Delete (`supabase/migrations/0005_rpc_expenses.sql`):**
  - `upsert_expense_v1`: validates currency match, validates Invariant I2 ($\sum \text{paid} = \text{amount} = \sum \text{owed}$), OCC version lock (raising `PT409 EXPENSE_CONFLICT` with current server snapshot in `DETAIL`), idempotent replay via `client_mutation_id`, atomic delete and re-insert of `expense_splits`, logs `expense_added`/`expense_edited`.
  - `delete_expense_v1`: soft-deletes with `deleted_at = clock_timestamp()`, version check, logs `expense_deleted`.
- **T-1.4.3: Settlements & Group Leave (`supabase/migrations/0006_rpc_settlements.sql`):**
  - `upsert_settlement_v1`: append-only settlement insertion with member validation and activity logging.
  - `delete_settlement_v1`: soft-delete restricted to creator, group admin, or owner.
  - `leave_group_v1`: computes net balance via `group_balances`; blocks leaving with `PT409 MEMBER_HAS_BALANCE` if $\text{net} \ne 0$; blocks sole owner without transfer via `PT409 LAST_OWNER`.
- **T-1.4.4: Pull Synchronization & Activity Feed (`supabase/migrations/0007_rpc_sync.sql`):**
  - `pull_changes_v1`: incremental pull using server timestamps across `groups`, `members`, `expenses` (with nested splits), and `settlements` with `has_more` pagination flags.
  - `list_activity_v1`: keyset paginated audit feed on `(created_at, id)` descending.
- **T-1.5.1 Pre-requisite: User Auth Trigger (`supabase/migrations/0008_auth_trigger.sql`):**
  - `handle_new_user`: auto-creates initial profile on `auth.users` insert with default currency `INR`.
- **SQL RPC Integration Tests:**
  - Added [`supabase/tests/rpc_core.test.sql`](file:///c:/harsh/projects/clearcut/supabase/tests/rpc_core.test.sql) verifying group creation, placeholder members, expense I2 enforcement, settlements, and SQL balance verification.

---

### 1.5 Authentication & Profile Flow (Completed)
Supabase session watcher, auto-refresh lifecycle, email OTP authentication, and onboarding experience.

- **T-1.5.1: Supabase Client Configuration & User Bootstrap (`lib/auth.ts`):**
  - Configured `supabase.auth.onAuthStateChange` listener providing synchronous subscription-based state access.
  - Profile resolver: fetches from `profiles` table or falls back to sensible local default.
  - Native Lifecycle: hooked `@capacitor/app` `appStateChange` to pause auto token refresh in background and resume in foreground.
  - Sign-out cleanup: completely purges the user's namespaced local storage while preserving global device settings.
- **T-1.5.2: Email OTP Sign-In Screen & First-Launch Experience (`app/auth/page.tsx` & `components/AuthForm.tsx`):**
  - Clean three-stage onboarding state machine: Email input $\rightarrow$ 6-digit OTP verification $\rightarrow$ Profile confirmation.
  - 30-second resend cooldown timer.
  - Stable error mapping: handles `AUTH_INVALID_CODE`, network failures, or rate limits.
  - Haptic feedback integration (`haptics.tap()`, `haptics.success()`, `haptics.warning()`).
  - Unit tests added: [`tests/auth/auth.test.ts`](file:///c:/harsh/projects/clearcut/tests/auth/auth.test.ts).

---

## 4. Current Test & Build Verification Summary

| Verification Step | Command | Result |
| :--- | :--- | :--- |
| **Unit & Property Test Suite** | `npm test` | **28 / 28 tests passed** across 10 test files (1.4s) |
| **Linting & Type Safety** | `npm run lint` | **0 errors, 0 warnings** (strict TypeScript enabled) |
| **Static Production Build** | `npm run build` | **Clean static export to `out/`** (all 7 routes prerendered) |
| **Native Platform Sync** | `npx cap sync android` | **Android plugins registered, webDir `out` synced** |

---

## 5. Key Files Created / Updated

```
clearcut/
├── app/
│   ├── auth/page.tsx                    # Email OTP sign-in & onboarding route
│   ├── globals.css                      # Safe area CSS insets & touch optimizations
│   ├── layout.tsx                       # Root layout with NativeProvider
│   ├── page.tsx                         # Diagnostics & spike routing home screen
│   ├── group/page.tsx                   # Query-param route (/group?id=...)
│   └── join/page.tsx                    # Deep-link landing route (/join?code=...)
├── components/
│   ├── AuthForm.tsx                     # 3-stage email OTP & profile onboarding form
│   └── NativeProvider.tsx               # Root safe-area shell & native event listener
├── lib/
│   ├── auth.ts                          # Supabase auth session watcher & auto-refresh bridge
│   ├── data/
│   │   ├── storage-adapter.ts           # Namespaced LocalStorage adapter & benchmark
│   │   └── types.ts                     # Canonical domain models (Expense, Split, Group, etc.)
│   ├── engine/
│   │   ├── balances.ts                  # computeBalances (I3), computePairwise
│   │   ├── errors.ts                    # EngineError & stable error code taxonomy
│   │   ├── money.ts                     # parseMoneyToMinor (I1), formatMinor, exponents
│   │   ├── simplify.ts                  # simplifyDebts (greedy <= N-1 payments)
│   │   ├── split.ts                     # allocate (largest-remainder), splitEqual, splitExact
│   │   └── validate.ts                  # validateExpense (I2 invariant check)
│   ├── native/
│   │   ├── back-button.ts               # Hardware back button modal/stack handler
│   │   ├── deeplink.ts                  # Deep link parser & appUrlOpen listener
│   │   ├── haptics.ts                   # Native haptics feedback wrapper
│   │   ├── notifications.ts             # Native local notifications bridge
│   │   ├── platform.ts                  # Safe native platform detection
│   │   └── push.ts                      # FCM push token & channel registration
│   └── supabase.ts                      # Supabase client & PT409 OCC error mapping
├── supabase/
│   ├── functions/notify-group/index.ts  # Edge Function for FCM HTTP v1 (RS256 JOSE)
│   ├── migrations/
│   │   ├── 0000_spike.sql               # Spike DDL & OCC test RPC
│   │   ├── 0001_core.sql                # Production Core DDL schema & indexes
│   │   ├── 0002_triggers_and_functions.sql # Timestamps, I2 constraint trigger, balances view
│   │   ├── 0003_rls.sql                 # Row-Level Security policies & realtime publications
│   │   ├── 0004_rpc_groups.sql          # RPCs: create_group, add_placeholder, join_group
│   │   ├── 0005_rpc_expenses.sql        # RPCs: upsert_expense, delete_expense (with OCC)
│   │   ├── 0006_rpc_settlements.sql     # RPCs: upsert_settlement, delete_settlement, leave_group
│   │   ├── 0007_rpc_sync.sql            # RPCs: pull_changes_v1, list_activity_v1
│   │   └── 0008_auth_trigger.sql        # Automatic profile bootstrap on sign-up
│   └── tests/
│       ├── rls/isolation.test.sql       # pgTAP data isolation & zero-write security tests
│       └── rpc_core.test.sql            # SQL integration tests for transactional RPCs
├── tests/
│   ├── data/storage.test.ts             # Storage isolation & 5MB benchmark tests
│   ├── engine/
│   │   ├── balances.test.ts             # Balance computation & I3 invariant tests
│   │   ├── money.test.ts                # Strict money parser & formatter tests
│   │   ├── property.test.ts             # 10,000 iteration Fast-Check property & NFR-02 benchmark
│   │   ├── simplify.test.ts             # Deterministic debt simplification tests
│   │   └── split.test.ts                # Allocation golden vectors & multi-payer tests
│   ├── native/navigation.test.ts        # Deep link & modal back-button tests
│   ├── native/push.test.ts              # Native push bridge safety tests
│   └── spike/rpc-conflict.test.ts       # PT409 conflict mapping & snapshot tests
├── capacitor.config.ts                  # Capacitor 8 native configuration
├── next.config.ts                       # Next.js static export configuration
├── vitest.config.ts                     # Vitest configuration with @/ alias
└── package.json                         # Dependencies & pinned scripts
```

---

## 6. Phase 1.5: Authentication & Profile Flow (Completed)

- **Supabase Client & Auth Watcher (`lib/supabase.ts`, `lib/auth.ts`):**
  - Configured `@supabase/supabase-js` client with custom storage key prefix `sw:v1:auth:`.
  - Implemented `onAuthStateChange` session watcher.
  - Linked Capacitor `appStateChange` to pause auto-token refresh when app is backgrounded and resume when foregrounded.
  - Provided namespaced cleanup on sign-out via `LocalStorageAdapter.clearUserNamespace(userId)`.
- **Remote Profile Bootstrap Trigger (`supabase/migrations/0008_auth_trigger.sql`):**
  - Database trigger `on_auth_user_created` intercepts row creation in `auth.users`.
  - Automatically provisions a corresponding row in `public.profiles` with default currency `INR` and display name parsed from email prefix.
- **Authentication Screen & Verification (`app/auth/page.tsx`, `components/AuthForm.tsx`):**
  - Implemented email entry with 30-second resend cooldown timer.
  - Dual verification support: supports direct 6-digit OTP code entry and automatic magic link redirection via `onAuthStateChange`.
  - Integrated custom SMTP and unlocked email templates to display 6-digit OTP codes directly in email notifications for seamless mobile entry.
- **Verification:**
  - Automated tests passing in `tests/auth/auth.test.ts`.
  - Remote Supabase database connected and live-tested; user registration successfully triggered profile row creation in PostgreSQL.

---

## 7. Phase 1.6: Local-First Storage Adapter, Local Store & Mutation Queue (Completed)

- **T-1.6.1: Namespaced Storage Adapter & Schema Migration Engine (`lib/data/storage-adapter.ts`, `lib/data/migrations.ts`):**
  - Strict key namespacing: `sw:v1:{userId}:{key}` isolates user accounts completely; `sw:v1:_device:{key}` retains device-level settings.
  - Safe error handling: intercepts `QuotaExceededError` (DOM code 22 / 1014), emits `quota_exceeded` warning event to registered listeners without corrupting local data.
  - Forward-only migration engine: tracks `meta.schemaVersion`; executes sequential `up()` steps synchronously on startup before any application reads.
  - Unit tests in `tests/data/storage.test.ts` verify isolation, quota warning dispatch, and migration idempotency.
- **T-1.6.2: Synchronous LocalStore & Reactive Selectors (`lib/data/local-store.ts`, `lib/data/selectors.ts`):**
  - In-memory Maps (`groups`, `members`, `expenses`, `settlements`) backed by synchronous reads/writes ($< 10\text{ ms}$).
  - Pub/sub change emitter notifying subscribers and updating store `revision` counter.
  - Reactive React hook `useStoreSelector` built on `useSyncExternalStore`.
  - Memoized selectors:
    - `selectGroup(store, groupId)`
    - `selectGroupExpenses(store, groupId, includeDeleted)`
    - `selectGroupMembers(store, groupId, includeLeft)`
    - `selectGroupLedger(store, groupId)`: memoizes `computeBalances` and `simplifyDebts` using cache key `${groupId}:${revision}`.
    - `selectDashboardTotals(store, currentUserId)`: aggregates user net balances across all groups by currency.
  - Unit tests in `tests/data/store.test.ts` verify latency $< 10\text{ ms}$, reactive notifications, soft deletes, and memoization cache hits.
- **T-1.6.3: Mutation Queue with Compaction & Idempotency (`lib/data/queue.ts`):**
  - Persistent FIFO queue storing `MutationRecord` items in `StorageAdapter`.
  - Strict state transitions: `pending` $\rightarrow$ `inflight` $\rightarrow$ `synced` / `conflict` / `dead`.
  - Assigns client UUID `id` (passed as `client_mutation_id` to Supabase RPCs).
  - Compaction algorithms:
    - Consecutive `UPSERT_EXPENSE` / `UPSERT_SETTLEMENT` on the same pending entity merge into the latest payload.
    - Unsynced local entity `UPSERT` followed by `DELETE` cancels both records from the queue, eliminating unnecessary network calls.
  - Dead letter escalation after max retries or permanent server conflict (`PT409`).
  - Unit tests in `tests/data/queue.test.ts` verify FIFO ordering, restart recovery, compaction, and dead letter inspection.

---

## 8. Phase 1.7: Sync Engine (Completed)

- **T-1.7.1: Push Drain Engine with Error Classification (`lib/sync/push.ts`):**
  - Concurrency lock: acquires single in-flight lock to guarantee mutually exclusive FIFO drain.
  - Error classification matrix:
    - **2xx Success**: marks mutation `synced`, updates local entity version, sets `_sync = 'synced'`.
    - **409 Conflict (`PT409` / `EXPENSE_CONFLICT`)**: marks mutation `status = 'conflict'`, flags local entity `_sync = 'conflict'`, and continues drain for other entities.
    - **401 Unauthorized (`PT401` / `AUTH_REQUIRED`)**: triggers session refresh; retries if refreshed, halts without discarding queue if expired.
    - **4xx Permanent Client Error (`PT400`, `PT403`, `PT404`)**: dead-letters mutation without stalling remaining queue.
    - **Transient Network / 5xx / 429**: halts drain, triggers exponential backoff ($2\text{ s} \rightarrow \min(2^{\text{retry}} \times 2, 60\text{ s})$).
  - Unit tests in `tests/sync/push.test.ts` verify all error classifications, OCC conflict continuation, poison-pill dead lettering, and backoff halting.
- **T-1.7.2: Pull & Idempotent Merge Engine (`lib/sync/pull.ts`, `lib/sync/merge.ts`):**
  - Cursor tracking: maintains `{ groups, members, expenses, settlements }` cursor timestamps.
  - Overlap window: advances cursors with a 5-second overlap window ($\max(\text{updated\_at}) - 5\text{ s}$) to prevent missing concurrent transactions.
  - Idempotent merge rules:
    - Preserves unpushed local pending/conflict entities; flags conflict if remote has a higher version.
    - Applies remote tombstones (`deleted_at != null`) to keep history while filtering from active lists.
  - Unit tests in `tests/sync/pull.test.ts` verify pagination, snake_case mapping, conflict preservation, and tombstone handling.
- **T-1.7.3: Sync Orchestrator & Lifecycle Triggers (`lib/sync/lifecycle.ts`, `components/SyncBadge.tsx`, `app/settings/sync/page.tsx`):**
  - `SyncLifecycleManager`: Coordinates network `online`/`offline`, Capacitor `appStateChange` (resume/pause), and `sync.kick()`.
  - `SyncBadge`: Reactive UI pill reflecting `'idle' | 'syncing' | 'offline' | 'error' | 'conflict'` with micro-animations.
  - Diagnostics screen at `app/settings/sync/page.tsx`: Displays conflict/dead-letter items with Retry and Discard actions.
  - Unit tests in `tests/sync/lifecycle.test.ts` verify reactive subscriptions, manual kick pipelines, and conflict reporting.

---

## 9. Phase 1.8: Client Domain Repository Layer (Completed)

- **T-1.8.1: Repository Command Layer (`lib/data/repository.ts`):**
  - Transactional local-first commands with $< 10\text{ ms}$ synchronous execution latency:
    - `createGroup(draft, userId, displayName)`: synchronously provisions group and owner member in `LocalStore`, enqueues `CREATE_GROUP`, triggers haptics and background sync kick.
    - `addExpense(draft, userId)`: validates math invariants and sum conservation (I2) via `validateExpense`, saves to store with `_sync: 'pending'`, enqueues `UPSERT_EXPENSE`, triggers sync kick.
    - `editExpense(draft, userId)`: validates, bumps optimistic version, saves to store, enqueues `UPSERT_EXPENSE`.
    - `deleteExpense(id)`: soft-deletes in store, enqueues `DELETE_EXPENSE`.
    - `addSettlement(draft, userId)`: validates payer $\ne$ payee and amount $> 0$, records in store, enqueues `UPSERT_SETTLEMENT`.
    - `deleteSettlement(id)`: soft-deletes settlement in store, enqueues `DELETE_SETTLEMENT`.
    - `addPlaceholderMember(groupId, displayName)`: enforces unique name within group, creates member with `userId = null`, enqueues `ADD_PLACEHOLDER`.
    - `joinGroup(inviteCode, userId)`: enqueues `JOIN_GROUP` with client member UUID.
  - Unit tests in `tests/data/repository.test.ts` verify synchronous latency ($< 10\text{ ms}$), math invariant protection, local store updates, and queue dispatch.

---

## 10. Phase 1.9: Core UI Components & Design System (Completed)

- **T-1.9.1: Balance & Settlement Visual Components:**
  - `components/BalanceSummary.tsx`: Perspective-aware banner ("You are owed ₹X" in emerald with upward arrow, "You owe ₹X" in orange with downward arrow, "All settled up" in muted zinc). Complies with WCAG 2.1 AA contrast and accessibility requirements (never relying solely on color).
  - `components/SettleSuggestionList.tsx`: Minimal transaction card feed computed from deterministic debt simplification (`simplifyDebts`), featuring a "Settle up" action button for one-tap prefilling.
  - `components/SettleModal.tsx`: Settle transaction dialog with Payer/Payee dropdowns, currency amount input, payment method tags (`cash`, `upi`, `venmo`, `paypal`, `bank`, `other`), optional notes, and hardware back-button dismiss registration.
- **T-1.9.2: Expense Entry & Split Editor Components:**
  - `components/PayerEditor.tsx`: Single-payer dropdown default with multi-payer toggle, supporting per-payer exact amounts and real-time residual balance indicators ("₹X.XX remaining" / "Over by ₹X.XX").
  - `components/SplitEditor.tsx`: Split mode tabs ("Equally" vs "Unequally (Exact)"). Equal mode automatically distributes integer minor units with largest-remainder math; Exact mode allows per-participant entry with live allocation delta badges.
  - `components/ExpenseForm.tsx`: Comprehensive expense creation/editing form integrating title, amount, date picker, category icon picker, notes, PayerEditor, and SplitEditor. Strictly disables save until all invariant conditions ($\sum paid = amount = \sum owed$) are satisfied.
  - Unit tests in `tests/components/components.test.ts` verify positive/negative balance formatting, equal split allocation, and dry-run invariant verification.

---

## 11. Phase 1.10: Core Application Pages & Routing (Completed)

- **T-1.10.1: Dashboard & Group View Routes:**
  - `components/ExpenseRow.tsx`: Interactive expense row showing month/day badge, category icon, title, payer summary, user perspective share ("you lent" / "you borrowed" / "not involved"), and sync status icons.
  - `components/EmptyState.tsx`: Reusable empty state with custom icon, title, message, and action button.
  - `app/page.tsx` (Dashboard): Real-time dashboard showing overall net balances grouped by currency (`useDashboardTotals`), active groups list with unread balances, `SyncBadge` header integration, and "+ Create Group" modal.
  - `app/group/page.tsx` (Group Detail): Perspective-aware group screen with sticky `BalanceSummary`, tab navigation (**Expenses**, **Balances**, and **Activity**), one-tap settlement modal integration (`SettleModal`), and Floating Action Button (FAB) for adding expenses.
- **T-1.10.2: Expense Entry, Group Invite & Member Pages:**
  - `app/group/expense/page.tsx`: Full-screen expense entry and edit route hosting `ExpenseForm`, wired directly to `repo.addExpense` and `repo.editExpense`.
  - `app/group/members/page.tsx`: Member management route supporting placeholder member addition, invite code display and clipboard sharing, and safe "Leave Group" enforcement (blocking leaves when net balance $\ne 0$).
  - `app/join/page.tsx`: Invite code landing screen supporting cold/warm deep-link handling, offline session holding, and transactional joining via `repo.joinGroup`.

---

---

## 12. Phase 1.11: Native Shell Integration & Deep Linking (Completed)

- **T-1.11.1: Deep Link Handler & Native Integration Polish (`lib/native/deeplink.ts`, `app/layout.tsx`):**
  - Integrated Capacitor App plugin deep link handler listening for `appUrlOpen` events.
  - Automatically parses custom URL scheme `splitapp://join?code=XXXX` and HTTPS fallback links, routing to `/join?code=XXXX`.
  - Supports both cold launch (app launched via deep link) and background resumption.
  - Ran `npx cap sync android` to ensure the compiled static web assets (`out/`) and Capacitor plugins (`@capacitor/app`, `@capacitor/haptics`, `@capacitor/local-notifications`, `@capacitor-firebase/messaging`) are copied to Android assets.

---

## 13. Phase 1.12: Integration & End-to-End Airplane Mode Verification (Completed)

- **T-1.12.1: End-to-End Airplane Mode Lifecycle Verification (`tests/e2e/offline-scenario.spec.ts`):**
  - Automated scenario test verifying the complete offline-to-online lifecycle:
    1. **Airplane Mode ON (Device 100% Offline):** Created group, added placeholder member, created 3 expenses (equal, exact, multi-payer), and recorded 1 settlement.
    2. **Write Latency Verification (NFR-01):** Local write execution measured at $< 100\text{ ms}$ (under $1\text{ ms}$ in engine).
    3. **Invariant Conservation (I1, I2, I3):** Verified group ledger net sum strictly equals $0$ ($\sum balances = 0$) with exact balance agreement down to the minor integer unit (paise/cents).
    4. **Cold Start Persistence (NFR-03):** Force-killed and reloaded state from raw storage in $< 2\text{ s}$ ($< 2\text{ ms}$ in benchmark) with zero data loss across all 6 queued mutations.
    5. **Airplane Mode OFF (Online Reconnection & Queue Drain, NFR-04):** Triggered `restartedSyncManager.kick('airplane_mode_disabled')`, draining the 6-item mutation queue to 0 pending in $< 10\text{ s}$ without duplicates or OCC conflicts, and verifying all local entities updated to `_sync: 'synced'`.

---

## 14. Verification Results & Phase 1 Sign-Off

- **All Unit, Property & E2E Tests:** 64 / 64 tests passing across 18 suites (`npm test` in 1.83s).
- **Fast-Check Invariant Property Test:** 10,000 randomized iterations validating Invariants I1, I2, I3 and zero-loss debt simplification.
- **Next.js Production Build:** 100% clean static export across all 10 routes (`npm run build`).
- **Capacitor Android Shell:** 100% synchronized with native assets (`npx cap sync android`).
- **Phase 1 Status:** **100% Complete** (Spikes, Shell, Engine, Supabase DDL/RLS/RPC, Auth, Storage, Sync Engine, Client Repo, Core UI, Pages & E2E Lifecycle).

---

---

## 15. Phase 2.1: Advanced Split Types (Completed)

- **T-2.1.1: Percentage, Shares & Adjustment Split Engine (`lib/engine/split.ts`, `tests/engine/split-advanced.test.ts`):**
  - **`splitPercent(totalMinor, bps)`:**
    - Requires basis points sum to exactly $10,000\text{ bp}$ ($100.00\%$) with non-negative constraints.
    - Allocates integer minor units using largest-remainder distribution (`allocate`).
    - Verified Golden Vector 3: $33.33\%, 33.33\%, 33.34\%$ on $10,000$ minor $\rightarrow$ `[3333, 3333, 3334]` (sum $= 10000$).
  - **`splitShares(totalMinor, weights)`:**
    - Accepts positive decimal weights up to 2 decimal places, scaled to integer basis via $\text{round}(w \times 100)$.
    - Allocates integer minor units without floating-point leaks.
    - Verified Golden Vector 4: Shares $[2, 1, 1]$ on $10,000$ minor $\rightarrow$ `[5000, 2500, 2500]` (sum $= 10000$).
  - **`splitAdjust(totalMinor, memberIds, adjustments)`:**
    - Calculates pool $= \text{totalMinor} - \sum \text{adjustments}$.
    - Splits base pool equally across participants via `allocate` and adds individual adjustments.
    - Strictly rejects if pool $< 0$ or if any resulting share $< 0$.
  - 12 comprehensive unit tests in `tests/engine/split-advanced.test.ts` verifying all invariants, remainder distributions, and error modes.

- **T-2.1.2: Advanced SplitEditor UI (`components/SplitEditor.tsx`, `components/ExpenseForm.tsx`):**
  - **5-Mode Selector Tab Bar:** **Equally**, **Exact**, **% Percent**, **Shares**, and **+/- Adjust**.
  - **% Percent Mode:**
    - Per-member percentage input fields with live `%` adornment.
    - "Split evenly" action button to auto-distribute $100.00\%$ cleanly among participants.
    - Real-time indicator displaying percentage sum vs $100.00\%$ ($X\%$ entered, $Y\%$ remaining / over).
    - Live approximate minor share previews.
  - **Shares Mode:**
    - Steppers (`-` / `+`) and direct numeric inputs for weighting (couples, singles, kids).
    - Real-time total shares counter and per-member calculated share currency display.
  - **+/- Adjustment Mode:**
    - Displays baseline equal share with per-person signed adjustments (`+₹X.XX` or `-₹X.XX`).
    - Live calculation of total per member with negative share prevention.
  - **Integration:** Preserves `splitValue` in `ExpenseForm.tsx` `unifiedSplits` mapping.

---

---

## 16. Phase 2.2: Expense Editing & Conflict Resolution (Completed)

- **T-2.2.1: Expense Editing & Optimistic Concurrency Engine (`lib/data/repository.ts`, `app/group/expense/page.tsx`):**
  - **`editExpense(draft, currentUserId)`:**
    - Updates local expense attributes and splits with synchronous $< 10\text{ ms}$ write latency.
    - Validates Invariant I2 (sum paid = amount = sum owed) via `validateExpense`.
    - Optimistically bumps version to `existing.version + 1` and flags `_sync: 'pending'`.
    - Enqueues `UPSERT_EXPENSE` with `baseVersion: existing.version` to ensure OCC detection on the server.
    - Triggers native haptics and background sync kick.
  - **Edit Route Integration (`app/group/expense/page.tsx`):**
    - Seamlessly supports `?expenseId={id}` and `?edit={id}` query params.
    - Prefills title, amount, category, date, notes, payers, and splits in `ExpenseForm`.
    - Automatically redirects back to group detail upon local save.

- **T-2.2.2: Conflict Resolution UI & Workflow (`components/ConflictResolutionSheet.tsx`, `lib/sync/merge.ts`, `app/settings/sync/page.tsx`):**
  - **Conflict Detection:**
    - On Supabase RPC `EXPENSE_CONFLICT` (HTTP 409), push engine captures server snapshot from error details and marks mutation `conflict` with `conflictDetail`.
    - Entity in `LocalStore` marked `_sync: 'conflict'`.
  - **Visual 3-Way Conflict Resolution Sheet (`components/ConflictResolutionSheet.tsx`):**
    - Modal dialog showing side-by-side comparison of "Your Changes (Local)" vs "Server Version".
    - Diffs title, amounts in currency format, dates, payer attribution, and individual split allocations.
    - Handles tombstone conflict if server version was deleted while user edited offline.
  - **Resolution Actions (`resolveExpenseConflict` in `lib/sync/merge.ts`):**
    - **"Keep Mine (Overwrite Server)":** Updates local entity version to `serverVersion + 1`, clears conflict item from queue, and re-enqueues `UPSERT_EXPENSE` with `baseVersion = serverVersion`.
    - **"Use Server Version (Discard Mine)":** Discards local mutation, applies server snapshot to store, and marks local entity `_sync: 'synced'` (or soft-deletes if tombstone).
  - **Entry Points:**
    - Conflict warning banner on edit expense route (`app/group/expense/page.tsx`).
    - One-tap "Resolve Conflict" action on sync diagnostics screen (`app/settings/sync/page.tsx`).

---

## 17. Verification Results

- **All Unit & Property Tests:** 82 / 82 tests passing across 20 suites (`npm test` in 1.76s).
- **Dedicated Suite:** `tests/sync/conflict-resolution.test.ts` (5 tests verifying version bumping, PT409 flag, Keep Mine, Use Theirs, and tombstone handling).
- **Next.js Production Build:** 100% clean static export across all 10 routes (`npm run build`).
- **Capacitor Android Shell:** 100% synchronized with native assets (`npx cap sync android`).

---

## 18. Phase 2.3: Deletion, Restore & Settlement Undo (Completed)

- **T-2.3.1: Expense Soft-Delete, 5-Second Undo Toast & Restore Filter (`components/Toast.tsx`, `components/ExpenseRow.tsx`, `app/group/page.tsx`, `lib/data/repository.ts`):**
  - **`deleteExpense(expenseId)` & `restoreExpense(expenseId)`:**
    - Soft-deletes locally by setting `deletedAt = now` with instantaneous $< 10\text{ ms}$ write latency.
    - Offline mutation compaction: if expense was created offline and not yet pushed, deleting it cleanly cancels both mutations from `MutationQueue` without remote sync overhead.
    - If already synced, enqueues `DELETE_EXPENSE` for background push.
    - Immediately recomputes balances in `selectGroupLedger`, excluding soft-deleted expenses from net debt totals.
    - `restoreExpense(expenseId)` clears `deletedAt`, increments version, clears pending delete mutations, enqueues `UPSERT_EXPENSE`, and restores balances immediately.
  - **5-Second Animated Undo Toast (`components/Toast.tsx`):**
    - Floating bottom toast with haptic feedback, custom trash icon, action button, and animated countdown progress bar.
    - Tapping "Undo" within 5 seconds immediately restores the expense without round-trip network lag.
  - **Active vs. Deleted Filter (`app/group/page.tsx` & `components/ExpenseRow.tsx`):**
    - Segmented filter toggle in group expense list: "Active" vs "Trash / Deleted" with count badge.
    - Soft-deleted rows visually highlighted with strikethrough titles, red badges, deletion timestamps, and one-tap "Restore" button.

- **T-2.3.2: Settlement Undo & Soft-Delete (`components/SettlementRow.tsx`, `lib/data/repository.ts`, `app/group/page.tsx`):**
  - **`deleteSettlement(settlementId)`:**
    - Soft-deletes settlement locally (`deletedAt = now`) and enqueues `DELETE_SETTLEMENT`.
    - Immediately reverses balance impact, re-exposing unsettled debts and updating suggested payments.
    - Restricted permissions: creator, group owner, or involved member.
  - **Settlement History Section (`components/SettlementRow.tsx` & `app/group/page.tsx`):**
    - Detailed settlement rows with directional transfer summary ("Bob paid Alice ₹1,000"), payment method badges (UPI, Cash, Bank Transfer), and creation dates.
    - Inline confirmation prompt before undoing to prevent accidental reversals.
    - Haptic feedback on deletion and immediate reactive balance update.

---

## 19. Verification Results

- **All Unit & Property Tests:** 85 / 85 tests passing across 21 test suites (`npm test` in 1.79s).
- **Dedicated Suite:** `tests/data/delete-restore.test.ts` (3 tests verifying soft-delete balance impact, offline compaction cancellation, 5-second undo restore workflow, and settlement reversal).
- **Next.js Production Build:** 100% clean static export across all 10 routes with zero TypeScript errors (`npm run build`).
- **Capacitor Android Shell:** 100% synchronized with native assets (`npx cap sync android`).

---

## 20. Phase 2.4: Pairwise Balances, Categories, Search & Group Archive (Completed)

- **T-2.4.1: Pairwise Balances Engine & Breakdown View (`lib/engine/balances.ts`, `components/PairwiseBreakdown.tsx`, `lib/data/selectors.ts`):**
  - **`computePairwise(expenses, settlements)`:**
    - Two-pointer cumulative bipartite sweep algorithm: allocates debtor obligations across creditors while strictly preserving both debtor and creditor integer marginals without rounding drift.
    - Factors in settlements: subtracts from directed debt edges, correctly reversing debt directions upon overpayments.
    - Fully cancels opposing directions between member pairs.
    - **Reconciliation Invariant Guaranteed:** For every member $m$, $\sum_k (\text{owed}(k \to m) - \text{owed}(m \to k)) \equiv \text{computeBalances}(\dots).get(m)$.
  - **Interactive Breakdown Component (`components/PairwiseBreakdown.tsx`):**
    - Seamless toggle between "Simplified Debts" (minimal transaction graph) and "Direct Pairwise" (exact direct bilateral debts).
    - Renders clear directional cards ("Alice owes Bob ₹500") with avatar badges, highlight states for the logged-in user, and one-tap "Settle" shortcuts.

- **T-2.4.2: Expense Search, Category Filtering & Group Archival (`components/ExpenseFilters.tsx`, `lib/data/repository.ts`, `app/group/page.tsx`, `app/page.tsx`):**
  - **Client-Side Search & Category Chips (`components/ExpenseFilters.tsx`):**
    - Real-time text search across expense titles and notes with instant clear.
    - Category filter chips (All, Food, Transport, Utilities, Fun, Lodging, Other) with sub-category match arrays (`drinks`, `groceries`, `taxi`, `movies`, `hotel`, etc.).
    - Filter summary badge showing matching vs total count with one-tap reset.
  - **Group Archival Lifecycle (`lib/data/repository.ts`, `app/group/page.tsx`, `app/page.tsx`):**
    - `archiveGroup(groupId)` & `unarchiveGroup(groupId)`: updates `archivedAt`, increments version, and triggers local reactive state changes.
    - Archived groups display an amber read-only banner: "+ Add Expense" FAB and settlement buttons are disabled/hidden to enforce immutability.
    - Dashboard hides archived groups by default from the primary list and organizes them into a collapsible "Archived Groups" tray.

---

## 21. Phase 2.5: Supabase Realtime Change Hints (Completed)

- **T-2.5.1: Realtime Subscription & Reconnect Backoff (`lib/sync/realtime.ts`, `components/SyncBadge.tsx`, `app/group/page.tsx`):**
  - **Subscription Lifecycle (`GroupRealtimeManager`):**
    - Subscribes via `supabase.channel('group-realtime:{groupId}')` to `postgres_changes` across tables `expenses`, `settlements`, and `group_members` filtered to `group_id=eq.{groupId}`.
    - Mounted on group page load and cleanly unsubscribed/destroyed on unmount.
  - **300 ms Debounced Pull:**
    - Any incoming realtime event triggers debounced `pullChanges` via `syncManager.kick('realtime_hint')`. Remote payloads are treated purely as cache-invalidation hints, ensuring verified transactional pull via `pull_changes_v1`.
  - **Exponential Reconnect Backoff:**
    - Handles channel disconnects, timeouts, and network drops with exponential backoff ($3\text{ s} \to 30\text{ s}$).
  - **Sync Badge Realtime Status (`components/SyncBadge.tsx`):**
    - Reflects live state: glowing emerald pulse for "Live", amber indicator for "Connecting...", and "Live updates off" when disconnected or in error.

---

---

## 22. Phase 2.6: Server Push Notifications & Scheduled Reminders (Completed)

- **T-2.6.1: Edge Function `notify-group` Implementation (`supabase/functions/notify-group/index.ts`, `supabase/migrations/0009_webhook.sql`, `lib/sync/notifications-fanout.ts`):**
  - **Database Webhook Trigger (`0009_webhook.sql`):**
    - Triggers `trg_expenses_notify_group` on `INSERT` to `expenses` and `trg_settlements_notify_group` on `INSERT` to `settlements`.
    - Dispatches non-blocking POST request to Edge Function via `pg_net` with secret header `x-webhook-secret`. Wrapped in exception handler ensuring ledger writes never fail if webhook endpoint is unreachable.
  - **Secret Header Validation & Recipient Fan-Out:**
    - Verifies `x-webhook-secret` against `WEBHOOK_SECRET` environment variable.
    - Resolves active member user IDs, strictly excluding actor (`created_by`).
  - **Notification Preferences & Muting Filter:**
    - Queries `notification_prefs` (group-specific overrides global default).
    - Excludes recipients whose `muted_until > now()` or who have disabled `expense_added` / `settlement_added`.
  - **FCM HTTP v1 Dispatch & Dead-Token Pruning:**
    - Signs RS256 JWT assertion using JOSE and exchanges Google Service Account credentials for OAuth2 access token.
    - Sends notifications in parallel: title `'{Group}: New Expense'` / `'{Group}: Settlement'`, body, and deep-link route payload.
    - Inspects HTTP responses; automatically prunes dead tokens (HTTP 404, `UNREGISTERED`, `INVALID_ARGUMENT`) from `device_tokens` table.

- **T-2.6.2: Client Push Handling, Channels & Weekly Reminder (`lib/native/push.ts`, `lib/native/notifications.ts`, `components/NativeProvider.tsx`):**
  - **FCM Token Registration & Android Channel:**
    - Configured Android channel `expenses_channel` with importance high (`importance: 4`, sound, vibration).
    - Requests permissions, retrieves FCM token, and upserts into `device_tokens`.
    - Added `unregisterPushToken(userId)` on sign-out to remove token from server and delete local registration.
  - **Deep-Link Push Tap Handlers:**
    - Listens for `notificationActionPerformed` with fallback to group root if specific entity is absent.
  - **US-19 Weekly Settle-Up Reminder:**
    - Scheduled repeating Sunday 20:00 local time notification via `@capacitor/local-notifications` opening `/settle`.
    - Auto-cancelled on user sign-out (`cancelWeeklySettleReminder`).

---

## 23. Phase 2.7: Advanced Member & Group Management (Completed)

- **T-2.7.1: Member Removal, Role Management & Ownership Transfer (`supabase/migrations/0010_member_management.sql`, `app/group/members/page.tsx`):**
  - **Transactional Removal RPC (`remove_member_v1`):**
    - Requires caller to be active group owner or admin.
    - Enforces zero-balance invariant: computes authoritative balance via `group_balances(p_group_id)`; raises `PT409 MEMBER_HAS_BALANCE` if member has non-zero debt or credit.
    - Prohibits removing sole group owner without prior ownership transfer (`PT409 SOLE_OWNER`).
    - Prohibits admins from removing group owners (`PT403 FORBIDDEN`).
    - Marks member `left_at = clock_timestamp()` and logs `member_removed` in `activity_log`.
  - **Role Management (`update_member_role_v1`):**
    - Allows group owner to promote members to `admin` or demote admins to `member`.
  - **Ownership Transfer (`transfer_group_ownership_v1`):**
    - Transfers owner role to target active member, demotes previous owner to `admin`, updates `groups.created_by`, and increments version.
  - **Interactive Management UI (`app/group/members/page.tsx`):**
    - Role badges (Owner, Admin, Member) and management action modal.
    - Balance-blocked alerts with formatted minor units and confirmation dialogs.
    - Sole owner leave-group guard.

- **T-2.7.2: Placeholder Member Claiming Flow (`supabase/migrations/0011_claim_placeholder.sql`, `app/join/page.tsx`):**
  - **Placeholder Claims Table & Token Generation (`generate_placeholder_claim_v1`):**
    - Creates secure 32-character hexadecimal claim tokens in `placeholder_claims` with 30-day expiration.
    - Accessible via "🔗 Copy Claim Link" directly on placeholder member rows in members screen.
  - **Transactional Claim RPC (`claim_placeholder_v1`):**
    - Validates claim token expiration and unconsumed status.
    - Links caller's authenticated `user_id` to existing placeholder `group_members` row.
    - **Ledger Invariant Preserved:** Because `expenses`, `expense_splits`, and `settlements` reference `member_id` UUID, 100% of historical splits, balances, and IDs remain intact without modifying any ledger history.
    - Marks claim token as claimed and logs activity.
  - **Join & Claim Routes (`app/join/page.tsx`):**
    - Supports `?claim=<token>` query parameter or manual token entry in dedicated "Claim Member Profile" tab.

---

## 24. Verification Results & Deployment

- **All Unit & Property Tests:** 120 / 120 tests passing across 27 test suites (`npm test` in 3.17s).
- **Dedicated Test Suites:**
  - `tests/native/push-notifications.test.ts` (5 tests verifying FCM registration, channel creation, Sunday 20:00 schedule calculation, and unregistration).
  - `tests/sync/notify-group.test.ts` (10 tests verifying dead token classification, webhook secret validation, preferences/muting filtering, and notification formatting).
  - `tests/data/member-management.test.ts` (7 tests verifying balance check before member removal, sole owner guards, role promotion/demotion, ownership transfer, and placeholder claiming).
- **Next.js Production Build:** 100% clean static export across all 10 routes with zero TypeScript errors (`npm run build`).
- **Android Native Configuration:**
  - Updated package namespace and application ID to `com.clearcut.mobile` in `capacitor.config.ts`, `android/app/build.gradle`, and `strings.xml`.
  - Moved Android activity to `com.clearcut.mobile.MainActivity`.
  - Synchronized native assets via `npx cap sync android`.
- **Firebase & Cloud Messaging Linkage:**
  - Placed production `google-services.json` in `android/app/`.
  - Configured Supabase secrets: `FIREBASE_SERVICE_ACCOUNT_KEY` (service account private key) and `WEBHOOK_SECRET` (`clearcut-webhook-secret-key`).
- **Remote Supabase Deployment:**
  - Deployed Edge Function: `npx supabase functions deploy notify-group` to project `btzqkyxmziksmdkjgqmf`.
  - Applied Database Migrations: `npx supabase db push` applied `0009_webhook.sql`, `0010_member_management.sql`, and `0011_claim_placeholder.sql` successfully.

---

## 25. Phase 2.8: Google Native Sign-In & Universal Links (Completed)

- **T-2.8.1: Native Google Sign-In Integration (`lib/auth.ts`, `components/AuthForm.tsx`, `capacitor.config.ts`):**
  - **Native Plugin Integration:**
    - Installed `@codetrix-studio/capacitor-google-auth` pinned with overrides for Capacitor 8 native bridge.
    - Configured `GoogleAuth` plugin block in `capacitor.config.ts` requesting `['profile', 'email']` scopes.
  - **One-Tap Token Authentication (`signInWithGoogle`):**
    - Triggers native Google Play Services bottom-sheet dialog on mobile (`GoogleAuth.signIn()`).
    - Obtains signed Google ID token natively without in-WebView browser redirects.
    - Authenticates directly against Supabase via `supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })`.
    - Automatically links profiles and avatars via PostgreSQL `handle_new_user` auth trigger.
    - Seamless web browser fallback via `supabase.auth.signInWithOAuth({ provider: 'google' })` for desktop development.
  - **Auth UI (`components/AuthForm.tsx`):**
    - Added sleek "Continue with Google" button with brand SVG logo, subtle micro-interactions, haptic feedback, and loading states alongside email login.

- **T-2.8.2: HTTPS Universal / App Links (`android/app/src/main/AndroidManifest.xml`, `lib/native/deeplink.ts`, `.well-known/assetlinks.json`):**
  - **Android Intent Filters:**
    - Configured `android:autoVerify="true"` intent filter in `AndroidManifest.xml` for `https://clearcut.app/join` and `https://clearcut.app/group`.
  - **Digital Asset Links:**
    - Created verified `.well-known/assetlinks.json` and `public/.well-known/assetlinks.json` declaring `handle_all_urls` permission for package `com.clearcut.mobile`.
  - **Universal Link Parser (`parseDeepLink`):**
    - Supports `https://clearcut.app/join?code=...`, `https://clearcut.app/join?claim=...`, and group links without triggering browser selection dialogs.

---

## 26. Verification Results

- **All Unit & Property Tests:** 123 / 123 tests passing across 27 test suites (`npm test` in 3.11s).
- **Dedicated Test Suites:**
  - `tests/native/navigation.test.ts` (5 tests verifying custom scheme `splitapp://`, HTTPS universal links `https://clearcut.app/join?claim=...`, and group links).
  - `tests/auth/auth.test.ts` (3 tests verifying auth state, listener subscriptions, and `signInWithGoogle` fallback).
- **Next.js Production Build:** 100% clean static export across all 10 routes with zero TypeScript errors (`npm run build`).

---

## 27. Phase 2.9 Implementation: Receipt Photo Capture & Storage (`T-2.9.1`)

- **Database & Storage Migrations (`0012_receipts_storage.sql`):**
  - Provisioned private storage bucket `receipts` with a 1.5 MB file size limit and strict mime type filter (`image/jpeg`, `image/png`, `image/webp`).
  - Storage RLS policies for `select`, `insert`, `update`, and `delete` restricting object operations strictly to authenticated members of the group partition: `(storage.foldername(name))[1]::uuid`.
  - Updated `upsert_expense_v1` RPC to extract and persist `receipt_path` into `expenses` table both on insert and conflict updates.
- **Client Compression & Camera Bridge (`lib/native/camera.ts`):**
  - Integrated `@capacitor/camera` with `CameraSource.Prompt`, `CameraSource.Camera`, and `CameraSource.Photos`.
  - Implemented progressive downscaling and JPEG canvas compression algorithm guaranteeing $\le 1.5\text{ MB}$ (1,572,864 bytes) payloads.
  - Implemented `uploadReceiptToStorage` writing to `receipts/<group_id>/<expense_id>_<timestamp>.jpg`.
  - Implemented `getReceiptSignedUrl` providing time-limited signed URLs (default 1 hour) for secure thumbnail and full-size viewing.
- **UI Components:**
  - `components/ReceiptPicker.tsx`: Native camera / gallery launcher, HTML file input web fallback, size indicators, thumbnail preview, and full-screen modal zoom.
  - `components/ExpenseForm.tsx`: Seamless receipt attachment and upload on save.
  - `components/ExpenseRow.tsx`: Emerald receipt badge indicating attached receipt.

---

## 28. Phase 2.10 Implementation: Data Export, Account Deletion & iOS Platform (`T-2.10.1`, `T-2.10.2`, `T-2.10.3`)

- **CSV Ledger Export (`lib/data/export-csv.ts`, `app/group/page.tsx`):**
  - RFC 4180 compliant CSV generator formatting expenses, settlements, payers, and split breakdowns.
  - Formats monetary values in standard major currency decimal format (e.g. `12.50` instead of minor units).
  - Native sharing integration using `@capacitor/share` and `@capacitor/filesystem`, with browser `<a download>` fallback.
  - Quick-access "CSV" button in group header.
- **Account Deletion & GDPR Compliance (`0013_delete_account.sql`, `lib/auth.ts`, `app/settings/page.tsx`):**
  - Implemented `delete_account_v1()` RPC preserving Invariant I3:
    - Anonymizes user's `group_members` rows to placeholder members (`user_id = null`), preserving ledger history and exact zero-sum balance calculations.
    - If user is owner, automatically promotes the next active member or marks single-member groups deleted.
    - Cascades deletion of device tokens, notification preferences, placeholder claims, profile records, and `auth.users` authentication identity.
  - Built `deleteAccount()` in `lib/auth.ts` wiping namespaced `LocalStorageAdapter`, cancelling reminders, unregistering push tokens, and signing out.
  - `app/settings/page.tsx`: Danger Zone deletion modal with required "DELETE" confirmation text and spinner states.
- **iOS Platform Scaffolding & Configuration:**
  - Added Capacitor iOS platform (`npx cap add ios`, `@capacitor/ios@8.5.3`).
  - Configured `ios/App/App/Info.plist` with Apple privacy descriptors (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`) and URL schemes (`com.clearcut.mobile`, `splitapp`).
  - Configured `contentInset: 'always'` and mobile viewport options in `capacitor.config.ts`.
  - Fully synchronized all 8 native Capacitor plugins (`npx cap sync`).

---

## 29. Stitch Neo-Brutalist Ledger Design System Revamp & Dark Style Elimination

- **Design System Overhaul:**
  - Fully migrated all screens, components, inputs, and modals to Google Stitch Neo-Brutalist Financial Ledger theme ("CLEARCUT P2P LEDGER V2.4").
  - Systematically eliminated all legacy `zinc-`, dark gradients, and dark mode variants across `app/` and `components/`.
  - Core tokens: `#f5f5f0` warm bone canvas, `#ffffff` card/input surfaces, `border-2 border-black` hard outlines, `shadow-[2px_2px_0px_0px_#000]` / `shadow-[3px_3px_0px_0px_#000]` / `shadow-[4px_4px_0px_0px_#000]` drop shadows, font-mono typography, and electric lime (`#ccff00`), yellow (`#ffd600`), cyan (`#00e5ff`), and coral (`#ff8a80`).
- **Components & Pages Refactored:**
  - `components/SplitEditor.tsx`: High-contrast bordered inputs across all 5 split modes (Equal, Exact, Percentage, Shares, Adjustments) with delta badges.
  - `app/group/members/page.tsx`: Neo-brutalist member roster cards, initials badges, role badges, and all 5 modals (Add Placeholder, Action Menu, Remove Blocked, Remove Confirm, Transfer Ownership).
  - `components/ConflictResolutionSheet.tsx`: Side-by-side comparison cards (`#ccff00` local vs white server card) with `#ffd600` header.
  - `components/SettleModal.tsx`: Settle up modal with netting route card, method selectors (Cash, UPI, Venmo, Bank), and memo input.
  - `components/PairwiseBreakdown.tsx`, `components/ExpenseRow.tsx`, `components/SettlementRow.tsx`, `components/PayerEditor.tsx`, `components/BalanceSummary.tsx`, `components/ExpenseFilters.tsx`, `components/ExpenseForm.tsx`, `components/Toast.tsx`, `components/EmptyState.tsx`, `components/ReceiptPicker.tsx`.

---

## 30. Peer-to-Peer Friends Ledger, Activity Stream, Payment Reminders & Navigation Polish

- **Friends Ledger Route (`app/friends/page.tsx`, `lib/data/selectors.ts`, `lib/data/hooks.ts`):**
  - Added `selectFriendsBalances()` selector and `useFriendsBalances()` hook aggregating pairwise balances with all connected members across all shared groups.
  - Peer balance cards displaying Owed To You (`+` lime `#ccff00`), You Owe (`-` coral `#ff8a80`), or Settled Up (`#ffd600`).
  - Interactive accordion expansion revealing breakdown by shared group with direct "VIEW" link into each group ledger.
  - Instant search filtering by friend or shared group name, plus status filter pills (`ALL`, `OWES YOU`, `YOU OWE`, `SETTLED`).
  - Added dedicated unit test suite `tests/data/friends.test.ts` verifying multi-group balance aggregation.
- **Payment Reminder & Notification Feature:**
  - Added `⚡ REMIND` action button on friend cards where balance is positive (`net > 0`).
  - Interactive Neo-Brutalist Reminder Modal with pre-filled customizable reminder message:
    `"Hey [Name]! Friendly reminder regarding the INR [Amount] balance on Clearcut. Let's settle up whenever you get a chance! [link]"`
  - One-tap dispatch integrations:
    - **WhatsApp**: Direct `https://api.whatsapp.com/send?text=...` deep-link.
    - **Share / SMS**: Dispatches via native Web Share API (`navigator.share`) on mobile/desktop, or opens SMS fallback (`sms:?&body=...`).
    - **Copy Text**: Copies formatted reminder to clipboard with instant confirmation and haptic feedback.
- **Global Activity Event Feed (`app/activity/page.tsx`):**
  - Unified timeline streaming all expenses added/edited, settlements recorded, and group creation events across all user groups.
  - Filter pills (`ALL EVENTS`, `EXPENSES`, `SETTLEMENTS`) with direct navigation to the associated group.
- **Persistent Bottom Navigation (`components/BottomNav.tsx`):**
  - Updated global bottom bar with active indicator tabs: `HOME` (`/`), `FRIENDS` (`/friends`), `ACTIVITY` (`/activity`), `SETTINGS` (`/settings`).
- **Group Invite Code & Fallback Fix (`lib/data/repository.ts`, `app/group/members/page.tsx`):**
  - `createGroup` now generates a 6-character alphanumeric code upon creation so groups immediately have a code.
  - `app/group/members/page.tsx` provides deterministic fallback generator auto-persisting to store if missing, resolving the "GENERATING..." issue.
- **Settings Page & Diagnostics Back Navigation:**
  - Fixed back button on Sync Diagnostics (`app/settings/sync/page.tsx`) to return to `/settings` instead of the dashboard.
  - Removed top back button in Settings header (treated as a top-level tab) and integrated `<BottomNav />` with `pb-28`.
  - Removed the "DANGER ZONE" header and warning text, replacing it with clean `LOGOUT` and `DELETE ACCOUNT` buttons.
- **Removed Group Archiving Feature:**
  - Removed the `ARCHIVE / UNARCHIVE` button and read-only banner from `app/group/page.tsx`.
  - Removed the bottom "ARCHIVED LEDGERS" accordion from `app/page.tsx`.

---

## 31. Group Joining, Deletion Hardening & Migrations 0017 & 0018

- **Foreign Key Constraint Resolution (`0017_fix_group_join.sql`):**
  - Resolved `group_members_user_id_fkey` errors by backfilling `public.profiles` from `auth.users` for any orphaned accounts.
  - Added automatic profile creation directly inside `create_group_v1` and `join_group_v1`.
  - Added support for 6-character prefix invite codes and normalized parameter names (`p_code`, `p_invite_code`, `p_mutation_id`).
- **Owner Visibility & Active Membership Fix (`0018_delete_group.sql`):**
  - Fixed an issue where soft-deleting an owner membership (`left_at`) caused `is_member()` to evaluate false, hiding the group from the owner on mobile while remaining visible to friends.
  - Cleared `left_at` on owner records and updated `is_member` to ensure group creators always retain visibility.
- **Hard Group Deletion & Remote Pruning (`0018_delete_group.sql`):**
  - Implemented `delete_group_v1` (`DELETE FROM groups ... CASCADE`) so group deletions permanently remove table rows from Supabase.
  - Updated `leave_group_v1` to auto-delete the group if the leaving member was the last active member.
  - Updated `pull_changes_v1` to return `active_group_ids` for client-side pruning of deleted groups.

---

## 32. Online-First Synchronization, Discrepancy Elimination & Sync/Refresh Button

- **Online-First Architecture:**
  - Transitioned the app from offline-first to online-first: mutations immediately push directly to Supabase tables when online.
  - Discrepancies between local cache and Supabase tables eliminated.
- **Offline Detection & Prompt:**
  - Integrated `isDeviceOnline()` check in `DomainRepository` for all mutations (adding/editing/deleting expenses, settlements, group creations, membership updates).
  - When offline, prompts the user via global notification:
    `"No network connection. Saved locally — will sync when online."`
  - Saves only that pending change in local queue/store until internet connectivity is restored.
- **Auto-Sync on Reconnect:**
  - Online lifecycle listener triggers push drain when connection returns.
  - Synced mutations are deleted from the local queue (`queue.markSynced()`).
  - Displays `"Sync complete! Ledger is up to date."` confirmation toast.
- **Interactive Sync / Refresh Button (`components/SyncBadge.tsx`):**
  - Completely removed the `"1 pending"` / status pill from all screen headers.
  - Built an interactive Neo-Brutalist **`🔄 REFRESH`** button:
    - Default state: `🔄 REFRESH` in `#ffd600`.
    - Syncing state: Animated spinning icon (`animate-spin`) + `"SYNCING..."` in `#00e5ff`.
    - Synced confirmation: Flashes `"✓ SYNCED"` in `#ccff00` for 2 seconds.
    - Offline state: Shows `"OFFLINE"`, prompting the user to connect to refresh.
    - On tap: Triggers `fullRefresh = true` (`since = null`) pulling fresh data from all Supabase tables.
- **Automatic Pruning in `pullChanges`:**
  - Added `hardDeleteGroup`, `hardDeleteExpense`, `hardDeleteSettlement`, and `hardDeleteMember` in `LocalStore`.
  - On `fullRefresh`, cross-references local items against Supabase; any record deleted from Supabase tables is pruned from local storage.

---

## 33. Soft-Delete Expenses with Restoration from Activity Tab

- **Soft-Delete Invariant:**
  - Any active group member can delete an expense.
  - Sets `deleted_at = clock_timestamp()` in Supabase and `deletedAt` locally.
  - Soft-deleted expenses are excluded from `computeBalances`, instantly zeroing out their balance impact.
  - Soft-deleted expenses are hidden from the active expenses list.
- **Activity Tab Restoration (`app/group/page.tsx` & `app/activity/page.tsx`):**
  - In both the group screen's Activity tab and the global Activity feed, soft-deleted expenses are logged with `🗑️ DELETED` badges, strikethrough titles, and a prominent Neo-Brutalist **`[ RESTORE ]`** button.
  - Added dedicated `DELETED` filter tab in `/activity`.
  - Any member can tap `[ RESTORE ]` to reinstate the expense locally and on Supabase (`upsert_expense_v1` clearing `deleted_at = null`).
  - Restoring immediately updates group balances and returns the expense to the active expenses list.
- **Migration `0019_restore_expense_activity.sql`:**
  - Deployed to remote Supabase database via CLI, logging `expense_restored` in `activity_log`.

---

---

## 36. Migration 0020: RPC Pull Sync & Expense Creation Fix

- **Supabase Migration (`0020_fix_pull_sync_and_expense_creation.sql`):**
  - Resolved `upsert_expense_v1` parameter signature mismatches (`p_description` vs `p_title`) ensuring compatibility across web and native mobile callers.
  - Enhanced `pull_changes_v1` RPC to return complete active groups, expenses, settlements, and member changes without truncating soft-deleted items needed for the activity log.
  - Ensured atomic balance calculations during direct online writes with auto-rollback on invariant violations.
  - Deployed to remote Supabase database via `npx supabase db push`.

---

## 37. UI Enhancements: Connectivity Status, Custom App Icon & Splash Screen

- **Offline / Online Status Indicators:**
  - Added dedicated visual indicator (`components/OfflineIndicator.tsx` & `components/SyncBadge.tsx`) notifying users in real-time when the device loses network connectivity.
  - Refresh button dynamically reflects network status: displays `OFFLINE` when disconnected and animates `SYNCING...` / `✓ SYNCED` during reconciliation.
- **Custom App Icon & Splash Screen Overhaul:**
  - Introduced unified brand icon and splash screen design across Android, iOS, and Web PWA.
  - Replaced default Capacitor assets with custom generated brand artwork using `@capacitor/assets`.
  - Configured `@capacitor/splash-screen` native plugin and added in-app client splash component (`components/SplashScreen.tsx`) for seamless launch transitions.

---

## 38. iOS Native Platform Configuration & APK/Bundle Optimization

- **iOS Native Project Initialization:**
  - Initialized Xcode workspace at `ios/App/App.xcworkspace` with bundle identifier `com.clearcut.mobile`.
  - Synced 9 native Capacitor plugins (`@capacitor/splash-screen`, `@capacitor/camera`, `@capacitor-firebase/messaging`, `@capacitor/haptics`, etc.) via Swift Package Manager (SPM).
  - Configured safe area insets and mobile viewport mode in `capacitor.config.ts`.
- **Bundle Size & Asset Optimization:**
  - Diagnosed APK size increase caused by uncompressed 3.9 MB source PNG duplication across Next.js static routes and Android drawable densities.
  - Removed redundant duplicates (`app/icon.png`, `app/apple-icon.png`, `public/logo.png`).
  - Compressed source assets using `sharp`:
    - `public/icon.png`: 3.9 MB → ~41 KB (99% reduction).
    - `assets/icon.png`: 3.9 MB → ~155 KB.
    - `assets/splash.png`: 3.9 MB → ~494 KB.
  - Regenerated native density mipmaps/drawables, dropping web assets in `assets/public` from ~22 MB down to under 2 MB and restoring release APK sizes to ~10–12 MB.

---

## 39. Verification & Current Health Status

- **Unit & Property Tests:** 140 / 140 tests passing across 31 test suites (`npm test`).
- **TypeScript:** 100% clean compilation with zero diagnostics errors (`npx tsc --noEmit`).
- **Production Build:** Static export builds cleanly (`npm run build`).
- **Capacitor Sync:** Synced cleanly across both `android` and `ios` (`npx cap sync`).
- **Supabase Migrations:** All 21 migrations (`0000` through `0020`) verified and applied to remote database (`npx supabase migration list`).

---

## 40. Next Immediate Steps (Phase 3: Scale, Hardening & Production Readiness)

1. **Phase 3.1: Storage Architecture Upgrade (`T-3.1.1`):**
   - SQLite migration (evaluate `@capacitor-community/sqlite` vs OP-SQLite) for local ledger storage.
2. **Phase 3.2: Multi-Currency & Real-Time FX (`T-3.2.1`):**
   - Live ECB rate provider and historical rate capture.
3. **Phase 3.3: iOS Code Signing & Distribution:**
   - Apple Developer account team signing & CI/CD workflow (GitHub Actions) for `.ipa` builds.











