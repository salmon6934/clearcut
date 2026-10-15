# Splitwise Clone — Technical Specification

**Version 1.0 · 10 Oct 2026 · Build-ready draft for engineering review**

Source key: **R0** = `splitwise-clone-guide.md` (the concept) · **R1** = `splitwise_implementation_from_another_project.md` (ledger and money engine) · **R2** = `capacitor_native_webview.md` (mobile, offline, sync, notifications).

ID conventions: `US-xx` user story · `EC-xx` edge case · `D-xx` architecture decision · `NFR-xx` non-functional requirement.

## 1. System Overview & Scope

### 1.1 Architecture summary

The product is a **balance ledger, not a payment processor** (R0 §1). Every expense is a set of signed shares; balances and settle-up suggestions are always *derived* from the ledger, never stored. It ships as a **Next.js 15 static export running inside a Capacitor 8 WebView** on Android and iOS (R2), backed by **Supabase** (Postgres + RLS + Realtime + Edge Functions) (R2). The integer-only money engine, multi-payer model, append-only settlements and greedy debt simplification come from R1; the entity set, split-type scope, activity feed and build order come from R0.

```
Capacitor 8 shell (Android / iOS)
└─ WebView: Next.js 15 static export (React 19, Tailwind)
   ├─ UI: routes, components, modals
   ├─ Domain: lib/engine  (pure TS, integer money, zero I/O)
   ├─ Repository layer ─► LocalStore (adapter) + MutationQueue
   ├─ Sync: push (drain queue) · pull (cursor) · realtime (change hints)
   └─ Native bridge: lifecycle, back button, FCM, local notifications, haptics
                      │ HTTPS / WSS
Supabase: Auth · Postgres (RLS + RPC functions) · Realtime · Edge Functions ─► FCM HTTP v1
```

**Invariants (non-negotiable, enforced in client engine, RPC layer and tests):**

| ID | Invariant | Origin |
| --- | --- | --- |
| I1 | No floating point for money. Store and compute integer minor units; decimals exist only at render and input-parse time. | R1 §2 |
| I2 | Per expense: Σ paid\_minor = amount\_minor = Σ owed\_minor. | R1 §2 |
| I3 | Per group: Σ member net balances = 0 at all times. | R1 §2 |
| I4 | Every write is idempotent, keyed by a client-generated UUID, so a retried mutation can never duplicate. | R2 §2.2 |
| I5 | The UI never waits on the network for a write; local state changes first. | R2 §2.1 |

### 1.2 Core problem statement

People who share costs (a trip, a flat, a dinner series) lose track of who paid and who owes. Settling informally produces chains of small, circular debts and arguments over remainders. The product gives each group a **single trusted ledger** that (a) records expenses split any reasonable way, (b) shows each person one number — what they owe or are owed — and (c) proposes the **fewest payments** that zero everyone out. It must keep working on a train, abroad, or in a basement with no signal, because that is exactly when expenses happen.

### 1.3 Primary personas

| Persona | Description | Key needs |
| --- | --- | --- |
| **P1 Organizer** | Creates the group, usually fronts the largest costs, chases repayment. | Fast expense entry, clear 'who owes me', invite links, reminders. |
| **P2 Participant** | Registered member who occasionally pays and mostly owes. | One-glance balance, trust in the math, push alerts when added to an expense. |
| **P3 Guest** | Person without an account (a friend of a friend on the trip). Exists as a *placeholder member*. | Be includable in splits without signing up; optionally claim their history later. |
| **P4 Traveler on bad network** | Any of the above with intermittent signal. | Every action works offline and syncs without duplicates or lost data. |

### 1.4 Out of scope (explicit non-goals for v1)

- **Moving real money**: no UPI/Razorpay/Stripe/Venmo integration. Settlements are manually recorded (R0 §6). Payment method is a free-text tag only.
- **Multi-currency groups and FX conversion**: one currency per group (R0 §8 recommendation). Schema reserves room for later.
- **Itemized receipt splitting, receipt OCR, tax/tip proration** (R0 §3 item 6).
- **Cross-group / friend-level netting** and a global Friends tab (R0 §5).
- **In-app chat, comments, reactions.**
- **Web/PWA distribution and server-side rendering.** The web build exists only for development and E2E tests.
- **Recurring expenses, budgets, charts and analytics.**
- **Monetization, ads, subscription tiers.**
- **Viewer (read-only) role.** R1 mentions it but its own DDL omits it; roles are `owner | admin | member`.

### 1.5 Constraints and assumptions

- Android ships first, iOS second, from one codebase. Exact OS minimums follow Capacitor 8's requirements and must be confirmed at scaffold time.
- Default locale `en-IN`, default currency `INR`; the engine is currency-agnostic through an exponent table (see §3.4).
- No custom application server. Anything a Next.js Route Handler would do is a Postgres RPC or Edge Function (static export forbids server code — R2 §1.2).
- Team uses TypeScript throughout; the same `lib/engine` package is imported by app code, Vitest, and Edge Functions.

### 1.6 Non-functional requirements

| ID | Requirement | Target |
| --- | --- | --- |
| NFR-01 | Local write-to-render latency (save expense) | < 100 ms p95 on a mid-range Android |
| NFR-02 | Balance + simplify compute for 1,000 expenses × 12 members | < 50 ms |
| NFR-03 | Cold start to interactive from local data | < 2 s |
| NFR-04 | Queue drain after reconnect (≤ 20 mutations) | < 10 s on 4G |
| NFR-05 | Realtime change → visible in foreground | < 3 s p95 |
| NFR-06 | Push delivery after expense commit | < 10 s p95 |
| NFR-07 | Data isolation | A non-member can never read or write any group row (RLS-verified by automated tests) |
| NFR-08 | Accessibility | WCAG 2.1 AA contrast; balances never conveyed by color alone; 44 pt tap targets |
| NFR-09 | Money correctness | 0 invariant violations across property tests of ≥ 10,000 random expenses |

## 2. Core Functional Specifications

### 2.1 Module catalogue

| Module | Capabilities | Phase |
| --- | --- | --- |
| **M1 Auth & Profile** | Email one-time code sign-in; Google sign-in; profile name, avatar, default currency; sign-out wipes local namespace and unregisters push token; in-app account deletion | P1 (email), P2 (Google, deletion) |
| **M2 Groups & Members** | Create/rename/archive group with type (`trip`, `home`, `couple`, `other`); currency fixed at creation; invite code + deep link; placeholder members; roles; leave/remove with zero-balance rule; claim placeholder | P1 core, P2 rest |
| **M3 Expenses** | Create/edit/soft-delete/restore; title, amount, date, category, notes; single or multi-payer; search and filter; receipt photo | P1 core, P2 rest |
| **M4 Split Engine** | Equal, Exact (P1); Percentage, Shares, Adjustment (P2) | P1 / P2 |
| **M5 Balances** | Per-member net; perspective-aware summary; dashboard totals per currency; pairwise breakdown; simplified suggestions | P1 net, P2 pairwise |
| **M6 Settlements** | Record full or partial payment, prefilled from suggestions; payment-method tag; undo (soft-delete) | P1 record, P2 undo |
| **M7 Activity Feed** | Server-written immutable log, paginated | P1 |
| **M8 Offline & Sync** | Local-first store, mutation queue, push/pull sync, conflict handling, sync status UI | P1 |
| **M9 Realtime** | Foreground change hints per open group | P2 |
| **M10 Notifications** | FCM push (expense/settlement/reminder), local weekly reminder, per-group mute | P2 |
| **M11 Settings & Diagnostics** | Sync issues list, notification prefs, CSV export, about/version | P1 minimal, P2 full |

### 2.2 User stories and acceptance criteria

**US-01 Sign in** — *As a new or returning user I want to sign in with my email.*

- Given I am signed out, when I enter a valid email, then a 6-digit code is sent and the code field is shown with a 30 s resend cooldown.
- When I enter the correct code, then a session is stored, a `profiles` row exists, and I land on `/`.
- When the code is wrong or expired, then I see `AUTH_INVALID_CODE` inline and remain on the screen; no data is cleared.

**US-02 Create a group (works offline)**

- Given I am signed in (online or offline), when I submit a name (1–80 chars), type and currency, then the group appears in my list immediately and I am its `owner` member.
- Then a `CREATE_GROUP` mutation is queued; once synced the invite code appears on the group screen. Until then the invite action shows 'Available once synced'.
- Currency can be changed only while the group has zero expenses and zero settlements.

**US-03 Join by invite**

- Given a valid invite code or deep link `app://join?code=XXXX`, when I am signed in and confirm, then I become a `member`, the group syncs to my device and an activity row `member_added` is written.
- Invalid code → `INVITE_INVALID`. Already a member → navigate to the group, no duplicate row. If the link is opened while signed out, the code is held and replayed after sign-in.

**US-04 Add a placeholder member**

- Given I am owner/admin, when I add a name with no account, then a member with `user_id = null` is created and is selectable in splits and as payer.
- Names must be unique within the group, case-insensitive (`MEMBER_NAME_TAKEN`).

**US-05 Add an equal-split expense**

- Given group members A, B, C, an amount of ₹100.00 paid by A, equal split among all three, when I tap Save, then splits are owed `[3334, 3333, 3333]` paise and paid `[10000, 0, 0]`, I2 holds, the row shows in the list without waiting for the network, balances update, and one `UPSERT_EXPENSE` mutation is queued.
- Remainder minor units go to participants in ascending member sort order (see §3.4), deterministically on every device.
- A participant set of one (payer only) is allowed and nets to zero.

**US-06 Exact split**

- Given amount ₹500.00 and entered shares 200 / 200 / 50, when the sum ≠ total, then Save is disabled and a live label shows the delta ('₹50.00 left'). When the sum equals the total, Save enables.

**US-07 Multi-payer**

- Given a ₹100 dinner where A paid ₹60 and B paid ₹40, when Σ paid ≠ amount, Save is disabled with the delta. When equal, saved with `paid_minor` `[6000, 4000]`. A payer need not be a participant (paid for others: `paid > 0`, `owed = 0`).

**US-08 Percentage split (P2)**

- Percentages accept up to 2 decimals and are converted to integer **basis points**; they must sum to exactly 10,000 bp. Given 33.33 / 33.33 / 33.34 on 10000 minor, the owed shares sum exactly to 10000.

**US-09 Shares split (P2)**

- Given weights 2, 1, 1 on 10000 minor, owed is `[5000, 2500, 2500]`. Weights are positive numbers with up to 2 decimals; a weight of 0 means not a participant.

**US-10 Adjustment split (P2)**

- Given an equal baseline and per-person +/- adjustments (e.g. −₹20 for Alice), the engine removes the adjustment total from the pool, splits the remaining pool equally with the remainder rule, then adds adjustments back. Resulting shares must be ≥ 0.

**US-11 Edit an expense**

- Given any active member of the group, when I edit and save, then the server `version` increments, splits are replaced atomically, balances recompute, and an `expense_edited` activity row stores before/after snapshots.
- If someone else changed it first, the push returns `EXPENSE_CONFLICT` and I see a resolution sheet (US-21).

**US-12 Delete and restore an expense**

- When I delete, then it disappears from the list and balances immediately (soft delete, `deleted_at` set), `expense_deleted` is logged, and a 5 s undo toast is shown. Restore (P2) is available from a 'Deleted' filter within the group.

**US-13 See balances**

- Given the ledger, then the group header reads 'You are owed ₹35.00' (green, ↑ icon), 'You owe ₹50.00' (orange/red, ↓ icon) or 'You are all settled up' (muted). The per-member list sums to zero (I3).
- The dashboard shows totals per currency; amounts in different currencies are never added together.

**US-14 Settle-up suggestions**

- Given non-zero balances, then 'Suggested payments' lists the minimal transaction set from `simplifyDebts` (≤ N−1). Tapping one opens the Settle modal prefilled with from, to and amount.

**US-15 Record a settlement**

- Given the modal, when I confirm an amount > 0 (may be less than suggested: partial), then a settlement row is added locally and queued, balances shift accordingly, and an optional payment tag (Cash, UPI, Venmo, PayPal, Other) plus note are stored. Paying more than owed is allowed with a warning, since it reverses the debt.

**US-16 Offline end-to-end**

- Given airplane mode, when I add 3 expenses and 1 settlement, then all are visible, the header shows '4 pending', and balances reflect them.
- When connectivity returns, mutations drain FIFO and the badge clears. If the app is killed mid-drain, restart resumes with no duplicates (I4).

**US-17 Realtime updates (P2)**

- Given two devices with the same group open, when B adds an expense, then A's list and balances update within 3 s. Backgrounded devices catch up through pull on next foreground.

**US-18 Push on new expense (P2)**

- Given B has push enabled, when A adds an expense that includes B, then B receives '{Group}: New Expense' with the expense title; tapping deep-links to that expense. A does not receive their own notification. Muted groups and disabled categories are respected.

**US-19 Weekly settle-up reminder (P2)**

- Given the user enables reminders, then a repeating local notification fires Sundays 20:00 local time (R2 §4.3), opens `/settle`, and is cancelled on sign-out.

**US-20 Leave a group**

- Given my net balance is zero, when I leave, then my membership gets `left_at`, the group disappears from my list, and my historical splits remain. If my balance ≠ 0, show `MEMBER_HAS_BALANCE` with the amount and a 'Settle up first' action. The only owner must transfer ownership first.

**US-21 Resolve an edit conflict**

- Given a push is rejected with `EXPENSE_CONFLICT`, then the sync badge shows a warning, and the resolution sheet shows 'Mine' vs 'Theirs'. 'Keep mine' re-queues my edit against the new `version`; 'Use theirs' discards mine. Nothing is ever silently overwritten.

**US-22 Sign out and account deletion**

- On sign-out, if mutations are pending, warn and offer 'Sync now' first. On confirm, the push token row is deleted, the session cleared and the namespaced local data wiped (R2 §4.1).
- Account deletion (P2, required for iOS store review) anonymizes the profile: memberships become placeholder-style members keeping the display name, so other people's ledgers stay balanced (I3).

### 2.3 Edge cases, error handling and recovery

| ID | Case | Defined behavior | Recovery |
| --- | --- | --- | --- |
| EC-01 | Amount ≤ 0, > `MAX_AMOUNT_MINOR` (10^10), or non-numeric | Client blocks Save; RPC rejects `EXPENSE_INVALID_AMOUNT` | User corrects |
| EC-02 | Locale input like `12,5` or `1,250.75` | Parsed by a decimal-string parser (no `parseFloat`); ambiguous input shows a confirm | n/a |
| EC-03 | Currency has exponent 0 (JPY) or 3 (KWD) | All scaling comes from the exponent table, never a hard-coded 100 (fixes R1 `formatMoneyMinor`) | n/a |
| EC-04 | Expense currency ≠ group currency | Rejected `EXPENSE_CURRENCY_MISMATCH` | Edit currency |
| EC-05 | Participant is a member who has left | Hidden from pickers for new expenses; shown greyed in old ones | n/a |
| EC-06 | Edit offline, same expense edited elsewhere | Push returns 409 `EXPENSE_CONFLICT` with server snapshot | US-21 |
| EC-07 | Delete of an already-deleted expense | Idempotent success | n/a |
| EC-08 | Settlement exists for a later-deleted expense | Ledger entries are independent; balances stay consistent | n/a |
| EC-09 | App killed mid-drain | In-flight mutation stays queued until acked; resend is a no-op via `client_mutation_id` | Automatic |
| EC-10 | Poison mutation (permanent 4xx) | Marked `dead` after classification, queue continues with later independent items, item appears in Sync Issues | User retries or discards |
| EC-11 | Network or 5xx failure | Stop the drain, exponential backoff 2 s → 60 s cap, retry on `online` / foreground | Automatic |
| EC-12 | Device clock wrong | Sync cursors and ordering use server `updated_at` only; `expense_date` is user data | n/a |
| EC-13 | localStorage quota exceeded | Catch `QuotaExceededError`, block new writes with a clear 'Storage full' sheet, offer export and cleanup | P3: move to IndexedDB/SQLite adapter |
| EC-14 | Access token expired while offline | App stays usable on local data; queue paused until refresh succeeds | Auto-refresh on reconnect; if refresh token invalid, force sign-in **without wiping unsynced queue** |
| EC-15 | Second account signs in on same device | Storage keys are namespaced by user id; previous namespace is wiped on sign-out | n/a |
| EC-16 | Realtime socket drops | Status chip shows 'Live updates off'; reconnect with backoff 3 s → 30 s; pull on reconnect | Automatic |
| EC-17 | Pull returns a tombstone for an entity with a pending local edit | Entity flagged conflict; user chooses restore-mine or accept-delete | US-21 |
| EC-18 | Push permission denied | In-app banner explaining the benefit with an 'Open settings' action; never re-prompt more than once per session | User action |
| EC-19 | Notification tapped for an inaccessible or deleted entity | Fallback to the group screen, then to `/` | n/a |
| EC-20 | Leave/remove with non-zero balance | `MEMBER_HAS_BALANCE` | Settle first |
| EC-21 | Offline-created group not yet synced when user opens Invite | Disabled with explanation | Auto-enable after sync |
| EC-22 | Android back pressed with modal open, mid-route, at root | Close modal → `router.back()` → exit app (R2 §1.4) | n/a |
| EC-23 | Same invite code used by a signed-in existing member | Idempotent; navigates to the group | n/a |
| EC-24 | Rounding on tiny amounts (1 minor unit among 3) | Deterministic: first member by sort order gets it; other two owe 0 | n/a |

All user-visible errors carry a stable machine code (catalogue in §5.5) and a plain-language message; unexpected errors are logged to telemetry with the mutation id, never with amounts or names.

## 3. Technical Architecture & Patterns Carried Forward

### 3.1 Pattern adoption matrix

| Pattern | Source | Adopted as |
| --- | --- | --- |
| Integer minor units; conservation invariants | R1 §2, §4, §5 | `lib/engine/*`, DB `CHECK`s, property tests |
| Ledger-derived balances; no `is_settled` flags | R1 §6 | No stored balances. One SQL aggregation on the server (replaces R1's per-expense query loop, an N+1) and the same pure function on the client |
| Append-only settlements, partial payments | R0 §6, R1 §6 | `settlements` table; undo is a soft delete, never an edit |
| Greedy `simplifyDebts` (≤ N−1 payments) | R0 §5, R1 §7 | R1's integer version plus a deterministic tie-break |
| `paid_minor` / `owed_minor` per split row (multi-payer) | R0 §9, R1 §5 | `expense_splits` |
| Placeholder members (nullable user) | R0 §2, §9 | `group_members.user_id` nullable; **ledger keyed by member id** |
| Soft delete + immutable activity log | R0 §7–8, R1 §3 | `deleted_at` + `activity_log` |
| Stable error-code strings (`EXPENSE_INVALID_SPLIT`) | R1 §5 | Error catalogue in §5.5 |
| Perspective-aware balance UI; Settle modal prefill + partial pay | R1 §10 | Mobile components (§3.5) |
| Engine unit tests | R1 §11 | Vitest suite, extended with property tests |
| Static export, Capacitor config, safe-area CSS, hardware back hook, safe native-plugin loading | R2 §1 | Carried over with fixes listed in §3.2 |
| Write-local-first, client UUIDs, mutation queue | R2 §2 | Carried over, plus dead-letter, compaction, idempotency key |
| Online/foreground sync triggers; Realtime channel with reconnect | R2 §3 | Carried over; Realtime only *hints* a pull |
| FCM token lifecycle; Edge Function delivery; local scheduled reminders | R2 §4 | Carried over; delivery triggered by database webhook |
| Build order: schema → equal expense → balances → more splits → simplify → settlements | R0 §11 | Backbone of §6 phasing |

### 3.2 Decisions and deliberate deviations

The three references conflict or contain defects in places. Each row is a binding decision.

| ID | Topic | What the references say | Decision and reason |
| --- | --- | --- | --- |
| D-01 | Backend shape | R1: REST + custom WebSocket server. R2: static export + Supabase | **Supabase only.** Static export cannot host Route Handlers. R1's REST routes become Postgres RPCs; its WS events become Realtime hints |
| D-02 | Ledger identity | R1: `user_id`. R0: `member_id` with placeholders | **`member_id`.** Needed for guests (P3); a placeholder can later be claimed without rewriting history |
| D-03 | Split types | R1: equal/custom/percentage. R0: equal/exact/percentage/shares | Union: `equal, exact, percentage, shares` (+ adjustment as a UI mode that produces exact rows). MVP = equal + exact |
| D-04 | Rounding | R0/R1: remainder to first N, or absorbed by last | **Largest-remainder method**, ties by participant sort key. Equal split is the all-weights-1 case and still yields `[3334,3333,3333]` |
| D-05 | Delete flag | R1/R0 `deleted_at`; R2 `is_deleted` | `deleted_at` everywhere; tombstones sync as normal updates |
| D-06 | Edit semantics | R0: soft-delete old + create new | **In-place edit** with `version++` and before/after in the activity log. Replacing rows would change IDs and break offline sync |
| D-07 | Conflict policy | R2: last-write-wins on `updated_at` | **Optimistic concurrency on `version`.** LWW silently loses money edits. Local entities with pending mutations are never overwritten by pull |
| D-08 | Sync cursor | R2: stores client `now()` as last-sync | **Server `updated_at`** set by trigger with `clock_timestamp()`; client rewinds cursor 5 s and dedupes. Client clocks are untrusted |
| D-09 | Write atomicity | R2: upsert expense, delete splits, insert splits as three calls | **One RPC per aggregate** (`upsert_expense_v1`), transactional and idempotent |
| D-10 | Drain error handling | R2: `break` on any error | Classify: transient stops the drain; permanent 4xx goes to dead-letter and the drain continues |
| D-11 | Routing | R2 deep-links to `/groups/:id`, `/expenses/:id` | Static export cannot pre-render unknown IDs. Use **query-param routes** (`/group?id=`) and `trailingSlash: true` |
| D-12 | Roles | R1 prose: owner/member/viewer; DDL: owner/admin/member | \`owner |
| D-13 | Currency | R1: group and expense currency; formatter divides by 100 | One currency per group in v1; exponent table; formatter uses it |
| D-14 | Push trigger | R2: client calls the function fire-and-forget; invoked name `send-push` vs deployed `send-split-notification` | **Database Webhook** on `expenses`/`settlements` inserts calls one function `notify-group`. Works for offline-created items synced later; single name |
| D-15 | Local storage | R2: `localStorage`, keys unscoped | Keep `localStorage` behind a `StorageAdapter` interface; **keys namespaced by user id**; swap to IndexedDB/SQLite in Phase 3 without touching callers |
| D-16 | Push plugin config | R2 configures `PushNotifications` but ships `@capacitor-firebase/messaging` | Configure the plugin actually used (`FirebaseMessaging`), and **create the Android channel `expenses_channel` at startup**; R2's payload targets it but never creates it |
| D-17 | Server-written activity | R0: client logs mutations | Activity rows are written **inside the RPCs**, so offline clients cannot forge or omit them |
| D-18 | Derived balances offline | R1: server computes | The same pure engine runs locally; server `group_balances` is the authority and a dev-only drift check compares both |

### 3.3 Repository layout

```
app/                          Next.js App Router (output: 'export')
  layout.tsx                  providers, safe-area shell, back-button hook
  page.tsx                    dashboard: groups + per-currency totals
  auth/page.tsx   join/page.tsx (?code=)   settings/page.tsx   settings/sync/page.tsx
  group/page.tsx (?id=)       group/expense/page.tsx (?id=&expenseId=)
  group/settle/page.tsx       group/members/page.tsx   group/activity/page.tsx
components/                   BalanceSummary, ExpenseRow, ExpenseForm, SplitEditor, PayerEditor,
                              SettleSuggestionList, SettleModal, MemberList, ActivityFeed,
                              SyncBadge, Toast, EmptyState
lib/
  engine/    money.ts split.ts balances.ts simplify.ts validate.ts errors.ts   (pure, no I/O)
  data/      types.ts storage-adapter.ts local-store.ts queue.ts repository.ts selectors.ts
  sync/      push.ts pull.ts merge.ts realtime.ts lifecycle.ts
  native/    platform.ts back-button.ts deeplink.ts push.ts notifications.ts haptics.ts
  supabase.ts  auth.ts  telemetry.ts  config.ts
supabase/    migrations/  functions/notify-group/  tests/rls/
tests/       engine/ (Vitest + fast-check)  e2e/
```

### 3.4 Money and split engine (`lib/engine`)

Pure TypeScript, no imports from React, Supabase or Capacitor, so it runs in the app, Vitest and Edge Functions identically.

**Currency exponent table:** `{ INR:2, USD:2, EUR:2, GBP:2, JPY:0, KWD:3, ... }`; default 2; unknown ISO code is rejected at group creation.

| Function | Contract |
| --- | --- |
| `parseMoneyToMinor(text, ccy)` | Decimal-string parse, no floats. Returns integer or `null`. Accepts `,` or `.` as decimal; the last separator is decimal only if followed by ≤ exponent digits |
| `formatMinor(minor, ccy, locale)` | Display only; scale from exponent table; `en-IN` grouping for INR |
| `allocate(total, weights)` | Largest-remainder allocation; Σ result = total exactly |
| `splitEqual(total, ids)` | `allocate(total, ids.map(()=>1))` |
| `splitPercent(total, bps[])` | Requires Σ = 10000; `allocate(total, bps)` |
| `splitShares(total, weights[])` | Weights × 100, rounded to integers; `allocate` |
| `splitAdjust(total, ids, adj[])` | Pool = total − Σadj; equal-split pool; add adjustments; reject any result < 0 |
| `validateExpense(e)` | Checks I2, non-negative shares, ≥ 1 payer, ≥ 1 participant, currency, max amount |
| `computeBalances(expenses, splits, settlements)` | `Map<memberId, number>`; excludes soft-deleted rows; Σ = 0 |
| `computePairwise(...)` (P2) | See below |
| `simplifyDebts(balances, ccy)` | R1 algorithm; sort by amount desc then member id asc, so every device produces the same suggestions |

```ts
export function allocate(totalMinor: number, weights: number[]): number[] {
  const W = weights.reduce((a, b) => a + b, 0);
  if (!Number.isInteger(W) || W <= 0) throw new EngineError('EXPENSE_INVALID_SPLIT');
  const T = BigInt(totalMinor), BW = BigInt(W);          // BigInt: T*w can exceed 2^53
  const base = weights.map(w => (T * BigInt(w)) / BW);   // floor
  const rem  = weights.map(w => (T * BigInt(w)) % BW);
  const left = Number(T - base.reduce((a, b) => a + b, 0n));
  const order = weights.map((_, i) => i).filter(i => weights[i] > 0)
    .sort((a, b) => (rem[a] === rem[b] ? a - b : rem[a] > rem[b] ? -1 : 1));
  for (let k = 0; k < left; k++) base[order[k]] += 1n;
  return base.map(Number);
}
```

**Participant ordering:** callers pass participants sorted by member `id` ascending. This makes remainder placement identical on every device.

**Stored splits are authoritative.** `allocate` runs only at write time; the server validates invariants (I2, signs, membership, currency) but does not recompute allocations. Engine changes therefore never alter historical expenses.

**Pairwise derivation (P2).** For each active expense, compute `net_i = paid_i − owed_i`. Each debtor (`net < 0`) distributes `|net|` across creditors (`net > 0`) with `allocate` weighted by creditor net, producing directed edges. Sum edges per ordered pair, cancel opposing directions, then subtract settlements (`from → to`) from the matching edge. The result reconciles to `computeBalances` and is asserted in tests.

### 3.5 Client architecture and state flow

**Layers (one-way dependencies):** UI components → hooks/selectors → `Repository` (commands) → `LocalStore` + `MutationQueue` → `SyncEngine` → Supabase. The UI never calls Supabase for writes.

```ts
// lib/data/repository.ts — every write follows this shape
async function addExpense(draft: ExpenseDraft) {
  const exp = buildExpense(draft);               // crypto.randomUUID(), engine allocation
  validateExpense(exp);                          // throws EngineError with a stable code
  store.upsertExpense({ ...exp, _sync: 'pending' });      // 1. local, synchronous
  queue.enqueue({ type: 'UPSERT_EXPENSE', entityId: exp.id, groupId: exp.groupId,
                  payload: exp, baseVersion: null });     // 2. durable intent
  store.emit();                                  // 3. UI re-renders via useSyncExternalStore
  haptics.success(); sync.kick();                // 4. fire and forget
}
```

- **State store:** a small event-emitter store over `LocalStore`, consumed with `useSyncExternalStore`. No extra state library, matching R2's plain-React approach. Selectors (`selectGroupLedger(groupId)`) memoize `computeBalances` and `simplifyDebts` by a ledger revision counter.
- **Entity sync flags:** `_sync: 'synced' | 'pending' | 'conflict' | 'dead'`, shown as a subtle clock/warning icon on rows.
- **Provider tree:** `AuthProvider` → `StorageProvider` → `SyncProvider` (lifecycle, queue stats) → `NativeProvider` (back button, deep links, push listeners) → `ToastProvider` → route. `RealtimeProvider` mounts only on `/group`.
- **Optimistic rollback (from R1 §9):** because writes are local-first, 'rollback' means: if the server permanently rejects a mutation, mark the entity `dead`, show it in Sync Issues, and let the user discard (revert to last server version via pull) or fix and resubmit.
- **Native shell:** `isNativePlatform()` guard on every plugin import (R2 §1.4); safe-area CSS variables; `useHardwareBackButton`; haptics on save, delete and settle; `contentInset` and CSS safe-area padding must not both apply (verify on iOS to avoid double padding).

**Screen map:** Dashboard → Group (tabs: Expenses, Balances, Members, Activity) → Expense form (add/edit) · Settle (suggestions + modal) · Settings (profile, notifications, sync issues, export, delete account) · Join.

### 3.6 Sync engine specification

**Mutation record**

```ts
interface MutationRecord {
  id: string;                 // mutation uuid, sent as client_mutation_id
  type: 'CREATE_GROUP' | 'UPDATE_GROUP' | 'UPSERT_EXPENSE' | 'DELETE_EXPENSE' | 'RESTORE_EXPENSE'
      | 'UPSERT_SETTLEMENT' | 'DELETE_SETTLEMENT' | 'ADD_PLACEHOLDER' | 'LEAVE_GROUP';
  entityId: string; groupId: string;
  payload: unknown;
  baseVersion: number | null; // null = create
  createdAt: number;          // local ordering only
  retryCount: number;
  status: 'pending' | 'inflight' | 'conflict' | 'dead';
  lastError?: { code: string; message: string };
}
```

**Push (drain).** FIFO. Guard with a single in-flight lock. For each `pending` item call its RPC.

| Outcome | Action |
| --- | --- |
| 2xx | Remove from queue; apply returned `version` to the local entity; `_sync = 'synced'` |
| Network error, 5xx, 429 | Stop drain; backoff `min(2^retry × 2 s, 60 s)`; retry on `online`, foreground, or timer |
| 401 | Pause drain; attempt token refresh; resume. Never discard the queue |
| 409 `*_CONFLICT` | `status = conflict`; attach server snapshot; continue with later items for *other* entities |
| 400/403/404 (permanent) | `status = dead` with code; continue; later items for the same entity are also marked dead |

**Compaction:** consecutive `UPSERT_EXPENSE` for the same unsent entity collapse to the latest payload; `UPSERT` followed by `DELETE` of a never-synced entity cancels both.

**Pull.** Per-table cursors (`groups`, `members`, `expenses`, `settlements`) stored locally. Call `pull_changes_v1(since jsonb, limit int)`; server returns rows with `updated_at > cursor`, ordered ascending, capped at 500 per table, with `has_more` per table. Client sets `cursor = max(updated_at returned)` minus a 5 s overlap and repeats while `has_more`. Merging is idempotent.

**Merge rules**

1. Remote row with a *pending/conflict local mutation* for the same entity: skip the overwrite and, if remote `version` > mutation `baseVersion`, flag `conflict`.
2. Otherwise accept the remote if `remote.version >= local.version`.
3. Tombstones (`deleted_at` set) remove the entity from lists but are retained for restore and activity references.
4. A first-ever pull for a group is a full fetch (`since = epoch`).

**Triggers:** app mount after auth; `online` event; Capacitor `appStateChange` to active; after each successful drain; Realtime hint (debounced 300 ms); manual pull-to-refresh.

**Realtime.** One channel per open group, `postgres_changes` on `expenses`, `settlements`, `group_members` with `filter: group_id=eq.{id}`. Any event triggers a debounced pull for that group; payloads are never trusted as data (RLS and version rules apply via pull). Soft deletes make every change an UPDATE or INSERT, so no DELETE-filter limitation applies. Reconnect with backoff 3 s → 30 s; status exposed to `SyncBadge`.

## 4. Data Models & Schema Specifications

### 4.1 Entities and relationships

| Entity | Key relationships |
| --- | --- |
| `profiles` | 1:1 with `auth.users` |
| `groups` | created by a profile; has many members, expenses, settlements, activity |
| `group_members` | belongs to group; optionally linked to a profile (null = placeholder); **the ledger identity** |
| `expenses` | belongs to group; has many `expense_splits` |
| `expense_splits` | one row per member involved: `paid_minor`, `owed_minor`, optional `split_value` |
| `settlements` | belongs to group; `from_member_id` → `to_member_id` |
| `activity_log` | belongs to group; actor is a member; written only by RPCs |
| `device_tokens` | many per profile (one per device) |
| `notification_prefs` | per profile, optionally per group |

### 4.2 PostgreSQL DDL (migration `0001_core.sql`)

```sql
create extension if not exists pgcrypto;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text,
  default_currency char(3) not null default 'INR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table groups (
  id uuid primary key,                                   -- client-generated
  name text not null check (char_length(name) between 1 and 80),
  type text not null default 'trip' check (type in ('trip','home','couple','other')),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  invite_code varchar(16) not null unique default upper(encode(gen_random_bytes(8),'hex')),
  created_by uuid not null references profiles(id),
  version int not null default 1,
  archived_at timestamptz, deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table group_members (
  id uuid primary key,                                   -- client-generated
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid references profiles(id),                  -- null = placeholder
  display_name text not null check (char_length(display_name) between 1 and 60),
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index group_members_user_uq on group_members(group_id, user_id) where user_id is not null;
create unique index group_members_name_uq on group_members(group_id, lower(display_name)) where left_at is null;

create table expenses (
  id uuid primary key,                                   -- client-generated
  group_id uuid not null references groups(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  notes text check (char_length(notes) <= 1000),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 10000000000),
  currency char(3) not null,                             -- must equal groups.currency (RPC)
  category text,
  expense_date date not null,
  split_type text not null check (split_type in ('equal','exact','percentage','shares')),
  fx_rate_to_base numeric(18,8),                         -- reserved for multi-currency; null in v1
  receipt_path text,                                     -- storage object path (P2)
  created_by uuid not null references group_members(id),
  version int not null default 1,
  client_mutation_id uuid,                               -- idempotency key of last applied mutation
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  member_id uuid not null references group_members(id),
  paid_minor bigint not null default 0 check (paid_minor >= 0),
  owed_minor bigint not null default 0 check (owed_minor >= 0),
  split_value numeric(12,4),                             -- bps (percentage), weight (shares), adjustment (minor)
  unique (expense_id, member_id),
  check (paid_minor > 0 or owed_minor > 0)
);

create table settlements (
  id uuid primary key,                                   -- client-generated
  group_id uuid not null references groups(id) on delete cascade,
  from_member_id uuid not null references group_members(id),
  to_member_id uuid not null references group_members(id),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 10000000000),
  method text check (method in ('cash','upi','venmo','paypal','bank','other')),
  note text check (char_length(note) <= 280),
  settled_on date not null default current_date,
  created_by uuid not null references group_members(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_member_id <> to_member_id)
);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  actor_member_id uuid not null references group_members(id),
  type text not null check (type in ('group_created','member_added','member_left','member_removed',
    'expense_added','expense_edited','expense_deleted','expense_restored',
    'settlement_added','settlement_deleted')),
  entity_id uuid,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android','ios')),
  app_version text,
  updated_at timestamptz not null default now()
);

create table notification_prefs (
  user_id uuid not null references profiles(id) on delete cascade,
  group_id uuid references groups(id) on delete cascade,  -- null = global default
  expense_added boolean not null default true,
  settlement_added boolean not null default true,
  reminders boolean not null default true,
  muted_until timestamptz,
  unique (user_id, group_id)
);
```

### 4.3 Server-side functions, triggers and policies

```sql
-- touch_updated_at: BEFORE INSERT OR UPDATE on groups, group_members, expenses, settlements
--   new.updated_at := clock_timestamp();   -- not now(): ordering must follow commit-time clock

create function is_member(g uuid) returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from group_members
                 where group_id = g and user_id = auth.uid() and left_at is null) $$;

create function group_balances(p_group uuid)
returns table(member_id uuid, net_minor bigint) language sql stable security definer
set search_path = public as $$
  with e as (
    select s.member_id, sum(s.paid_minor - s.owed_minor) n
    from expense_splits s join expenses x on x.id = s.expense_id
    where x.group_id = p_group and x.deleted_at is null group by s.member_id),
  st as (
    select from_member_id m, sum(amount_minor) n from settlements
      where group_id = p_group and deleted_at is null group by 1
    union all
    select to_member_id, -sum(amount_minor) from settlements
      where group_id = p_group and deleted_at is null group by 1)
  select gm.id, coalesce(e.n,0) + coalesce((select sum(n) from st where st.m = gm.id),0)
  from group_members gm left join e on e.member_id = gm.id
  where gm.group_id = p_group and is_member(p_group) $$;
```

**Sign convention (single source of truth):** `net = Σpaid − Σowed + Σ(settlements sent) − Σ(settlements received)`. Positive = is owed money; negative = owes money.

**Deferred constraint trigger** on `expense_splits` and `expenses` (initially deferred): at commit, Σpaid = Σowed = `amount_minor` for every touched non-deleted expense, else abort. This is defense in depth behind the RPC check (I2).

**Row-level security**

- `groups`, `group_members`, `expenses`, `expense_splits`, `settlements`, `activity_log`: `SELECT` allowed when `is_member(group_id)` (splits via their expense's group). **No client `INSERT/UPDATE/DELETE` privileges**; all writes go through `SECURITY DEFINER` RPCs that set `search_path = public` and check `auth.uid()` themselves.
- `profiles`: select own row and rows of members sharing a group; update own row only.
- `device_tokens`, `notification_prefs`: full access to own rows only.
- Join by code is an RPC (`join_group_v1`), so non-members never need `SELECT` on `groups`.
- Realtime publication includes `expenses`, `settlements`, `group_members`; RLS applies to change delivery.

### 4.4 Indexes

| Index | Purpose |
| --- | --- |
| `expenses (group_id, expense_date desc, id) where deleted_at is null` | Group expense list, paginated |
| `expenses (group_id, updated_at)` | Pull cursor |
| `expense_splits (expense_id)` and `(member_id)` | Balance aggregation, member history |
| `settlements (group_id, updated_at)` and `(group_id) where deleted_at is null` | Pull cursor; balance aggregation |
| `group_members (user_id) where left_at is null` | 'My groups' lookup and `is_member` |
| `group_members (group_id, updated_at)`, `groups (updated_at)` | Pull cursors |
| `activity_log (group_id, created_at desc, id)` | Feed pagination |
| `device_tokens (user_id)` | Push fan-out |

### 4.5 Client-side data model (TypeScript)

```ts
type SyncState = 'synced' | 'pending' | 'conflict' | 'dead';
interface Group   { id; name; type; currency; inviteCode?: string; version: number; archivedAt?: string; _sync: SyncState }
interface Member  { id; groupId; userId: string | null; displayName; role: 'owner'|'admin'|'member'; leftAt?: string }
interface Split   { memberId; paidMinor: number; owedMinor: number; splitValue?: number }
interface Expense { id; groupId; title; notes?; amountMinor: number; currency; category?; expenseDate: string;
                    splitType: 'equal'|'exact'|'percentage'|'shares'; splits: Split[]; createdBy: string;
                    version: number; deletedAt?: string; updatedAt?: string; _sync: SyncState }
interface Settlement { id; groupId; fromMemberId; toMemberId; amountMinor: number; method?; note?; settledOn: string;
                       deletedAt?: string; updatedAt?: string; _sync: SyncState }
```

**Local storage keys:** `sw:v1:{userId}:{groups|members|expenses|settlements|queue|cursors|meta}`. A `meta.schemaVersion` integer drives forward-only local migrations run at startup, before any read.

### 4.6 Validation constraint matrix

| Rule | Client engine | RPC | DB |
| --- | --- | --- | --- |
| amount in (0, 10^10\] | ✓ | ✓ | `CHECK` |
| Σpaid = amount = Σowed | ✓ | ✓ | deferred trigger |
| every split member belongs to the group and is not `left` (for new expenses) | ✓ | ✓ | FK |
| currency = group currency | ✓ | ✓ | — |
| percentage Σ = 10000 bp; shares ≥ 1 positive weight | ✓ | ✓ (when `split_value` supplied) | — |
| settlement from ≠ to, amount > 0, both active members | ✓ | ✓ | `CHECK` + FK |
| name uniqueness among active members | ✓ | ✓ | unique index |
| at least one owner remains | ✓ | ✓ | — |

### 4.7 Migration considerations

- Migrations are numbered SQL files in `supabase/migrations`, applied by CI; no manual dashboard edits.
- **Mobile clients cannot be force-updated**, so RPCs are versioned (`*_v1`) and changes are additive. A breaking change ships as `*_v2` alongside `v1`, with `v1` retired only after a minimum-supported-app-version gate (Phase 3 remote config).
- Local schema changes bump `meta.schemaVersion` and run idempotent upgrade steps; on failure the app keeps the queue intact and refetches entity data from the server instead of wiping.
- Seed data and a fixture generator (10 groups, 1,000 expenses) support performance tests.

## 5. API & Interface Contracts

### 5.1 Conventions

- **Transport:** `supabase-js` v2. Reads use PostgREST `select` under RLS; **all writes use RPCs** (`POST /rest/v1/rpc/{name}`), each transactional and idempotent.
- **Auth header:** `Authorization: Bearer <access_token>` plus the project `apikey`. Every RPC starts with `if auth.uid() is null then raise ... 'AUTH_REQUIRED'`.
- **Errors:** RPCs raise with SQLSTATE `PT400/PT401/PT403/PT404/PT409/PT429` (PostgREST maps `PTnnn` to HTTP `nnn`), `MESSAGE` = stable app code from §5.5, `DETAIL` = JSON string with context (e.g. the server snapshot on conflict).
- **Naming and casing:** DB and RPC payloads `snake_case`; client domain objects `camelCase`; a single `mappers.ts` converts both ways. Money fields always end `_minor` / `Minor` and are integers.
- **Idempotency:** every mutating RPC takes `p_mutation_id uuid`. Replaying an applied mutation returns the stored result with `replayed: true` and HTTP 200.
- Payloads below are shown as TypeScript object literals.

**Mapping from R1's REST surface (and R0 §10) to this system**

| R0/R1 route | This system |
| --- | --- |
| `POST /groups/:id/expenses` | `rpc upsert_expense_v1` (create) |
| `PATCH /groups/:id/expenses/:eid` | `rpc upsert_expense_v1` (with `p_base_version`) |
| `DELETE /groups/:id/expenses/:eid` | `rpc delete_expense_v1` |
| `GET /groups/:id/balances` | `rpc group_balances` (authoritative) + local engine |
| `GET .../balances/simplified` | Client-side `simplifyDebts` over balances (no endpoint needed) |
| `POST /groups/:id/settlements` | `rpc upsert_settlement_v1` |
| `GET /groups/:id/activity` | `rpc list_activity_v1` (keyset pagination) |
| WS `expense:created/updated/deleted/settled` | Realtime `postgres_changes` hint → `pull_changes_v1` |

### 5.2 Authentication and authorization

**Sign-in flow**

1. Email: `supabase.auth.signInWithOtp({ email })` → user enters code → `supabase.auth.verifyOtp({ email, token, type: 'email' })`.
2. Google (P2): native Google sign-in plugin returns an ID token → `supabase.auth.signInWithIdToken({ provider: 'google', token })`. Browser redirect OAuth is avoided inside the WebView (see risk R-08).
3. An `after insert on auth.users` trigger creates the `profiles` row (display name from the email local part); the app prompts the user to confirm their name on first launch.
4. Session persists in WebView storage with `autoRefreshToken`. On Capacitor `appStateChange`, call `startAutoRefresh()` when active and `stopAutoRefresh()` when inactive.
5. Sign-out: `unregisterPushToken` → `supabase.auth.signOut()` → wipe namespace. If the refresh token is invalid but unsynced mutations exist, keep the namespace and ask the user to sign in again as the same account before anything is cleared (EC-14).

**Authorization matrix** (enforced in RPCs; RLS guards reads)

| Action | owner | admin | member | non-member |
| --- | --- | --- | --- | --- |
| Read group data | ✓ | ✓ | ✓ | ✗ |
| Add / edit / delete / restore expense | ✓ | ✓ | ✓ | ✗ |
| Record settlement (any two members) | ✓ | ✓ | ✓ | ✗ |
| Delete settlement | ✓ | ✓ | creator only | ✗ |
| Add placeholder member | ✓ | ✓ | ✓ (default; see Q-04) | ✗ |
| Rename group / change type / rotate invite | ✓ | ✓ | ✗ | ✗ |
| Remove member (zero balance) / promote to admin | ✓ | remove only | ✗ | ✗ |
| Archive or delete group; transfer ownership | ✓ | ✗ | ✗ | ✗ |
| Leave group (zero balance) | ✓ (after transfer) | ✓ | ✓ | — |

### 5.3 RPC contracts

**`create_group_v1`** — `{ p_group: { id, name, type, currency }, p_owner_member_id, p_mutation_id }` → `200 { group, member }` (`invite_code` generated server-side). Errors: `VALIDATION_FAILED`. Replay of same `id` by the same creator returns the existing row.

**`join_group_v1`** — `{ p_code, p_member_id }` → `200 { group, members[] }`. Errors: `INVITE_INVALID` (404), `RATE_LIMITED` (429: > 10 attempts/min/user). Already a member → 200 with existing membership. Rejoin after leaving clears `left_at`.

**`upsert_expense_v1`**

```ts
// request
{ p_expense: {
    id, group_id, title, notes: null, amount_minor: 10000, currency: 'INR',
    category: 'food', expense_date: '2026-10-10', split_type: 'exact',
    splits: [
      { member_id: mA, paid_minor: 6000, owed_minor: 2500, split_value: null },
      { member_id: mB, paid_minor: 4000, owed_minor: 2500, split_value: null },
      { member_id: mC, paid_minor: 0,    owed_minor: 5000, split_value: null } ] },
  p_base_version: null,        // null = create; integer = edit of that version
  p_mutation_id: '...' }
// 200 response
{ expense: { ...fields, version: 1, updated_at }, splits: [...], replayed: false }
```

Server steps (single transaction): authenticate and assert `is_member`; check currency = group currency; check Σpaid = Σowed = amount and all signs; check every `member_id` is in the group (and not left, for new expenses); if the row exists, compare `p_base_version` to `version` (mismatch → `PT409 EXPENSE_CONFLICT` with the server snapshot in `DETAIL`) and short-circuit if `client_mutation_id` already equals `p_mutation_id`; upsert expense with `version = version + 1`; delete and re-insert splits; write `activity_log` (`expense_added` or `expense_edited` with before/after); return the aggregate.

| Error | HTTP | When |
| --- | --- | --- |
| `EXPENSE_INVALID_AMOUNT` | 400 | amount ≤ 0 or > max |
| `EXPENSE_INVALID_SPLIT` | 400 | invariant I2 violated, negative share, zero participants |
| `EXPENSE_CURRENCY_MISMATCH` | 400 | currency ≠ group currency |
| `MEMBER_NOT_IN_GROUP` | 400 | a split member is foreign or has left |
| `EXPENSE_CONFLICT` | 409 | stale `p_base_version` |
| `FORBIDDEN` | 403 | caller is not an active member |

**`delete_expense_v1`** / **`restore_expense_v1`** — `{ p_expense_id, p_base_version, p_mutation_id }` → `200 { id, version, deleted_at }`. Deleting an already-deleted row is a 200 no-op.

**`upsert_settlement_v1`** — `{ p_settlement: { id, group_id, from_member_id, to_member_id, amount_minor, method, note, settled_on }, p_mutation_id }` → `200 { settlement }`. Errors: `SETTLEMENT_INVALID` (same member, amount ≤ 0, inactive member). Insert is `on conflict (id) do nothing`; settlements are never edited. **`delete_settlement_v1`** soft-deletes (creator/admin/owner).

**`add_placeholder_v1`** `{ p_member: { id, group_id, display_name }, p_mutation_id }` → `200 { member }`; `MEMBER_NAME_TAKEN` (409).

**`leave_group_v1`** / **`remove_member_v1`** `{ p_group_id, p_member_id }` → `200`; `MEMBER_HAS_BALANCE` (409, `DETAIL` carries `net_minor`), `LAST_OWNER` (409).

**`group_balances`** — `rpc({ p_group })` → `[{ member_id, net_minor }]`; Σ net = 0.

**`list_activity_v1`** — `{ p_group, p_before: { created_at, id } | null, p_limit: 30 }` → `{ items[], next: { created_at, id } | null }` (keyset pagination, newest first).

**`pull_changes_v1`**

```ts
// request
{ p_since: { groups: ts, members: ts, expenses: ts, settlements: ts }, p_limit: 500 }
// response (rows limited to groups the caller belongs to; expenses carry nested splits)
{ groups: [...], members: [...], expenses: [{ ...expense, splits: [...] }], settlements: [...],
  has_more: { groups: false, members: false, expenses: true, settlements: false },
  server_time: ts }
```

**`delete_account_v1`** (P2) — converts the caller's memberships into placeholder-style members (keeps `display_name`, nulls `user_id`), deletes tokens, prefs and profile, then removes the auth user (via Edge Function with service role).

### 5.4 Event and notification contracts

**Realtime channel:** `group-realtime:{groupId}`; tables `expenses`, `settlements`, `group_members`; filter `group_id=eq.{groupId}`; callback only signals 'something changed'. Status values `connected | connecting | disconnected` feed `SyncBadge` (R2 §3.3).

**Edge Function `notify-group`** (single function; replaces R2's two inconsistent names)

- **Trigger:** Supabase Database Webhook on `INSERT` into `expenses` and `settlements` (P2). Request carries a secret header `x-webhook-secret` (the function is deployed with JWT verification off, and rejects any call without the secret).
- **Input:** `{ type, table, record, old_record }`.
- **Logic:** resolve group and actor member; recipients = active members with a `user_id`, excluding the actor; drop users whose `notification_prefs` disable the kind or whose `muted_until` is in the future; load their `device_tokens`; send FCM HTTP v1 messages in parallel; delete tokens that return `UNREGISTERED` or 404; write a de-dup row (`entity_id`, `kind`, `user_id`) so webhook retries cannot double-notify.
- **Message:** `notification: { title: '{Group}: New Expense', body: '{title}' }` (no amounts on the lock screen), `data: { kind, groupId, entityId, route: '/group/expense?id={groupId}&expenseId={id}' }`, Android `channel_id: 'expenses_channel'`, APNs `sound: default`. Settlements use `/group/settle?id={groupId}`.
- **Output:** `200 { sent, failed, pruned }`.
- **Implementation note:** R2's `getGoogleOAuthToken` is a stub; implement the service-account JWT exchange (RS256 via a maintained Deno JOSE library) and cache the access token for its lifetime.

**Client push handling:** foreground → in-app toast and a pull; tap → `notificationActionPerformed` → `router.push(data.route)` with the fallback chain in EC-19. `createChannel({ id: 'expenses_channel', ... })` runs once at startup on Android.

**Deep links:** custom scheme `splitapp://join?code=XXXX` (P1); HTTPS universal/app links (P2, needs a domain). Handler: `App.addListener('appUrlOpen')`.

### 5.5 Error code catalogue

| Code | HTTP | Client behavior |
| --- | --- | --- |
| `AUTH_REQUIRED` | 401 | Pause queue, refresh token, else prompt sign-in |
| `AUTH_INVALID_CODE` | 400 | Inline error on code screen |
| `FORBIDDEN` | 403 | Mutation `dead`; explain 'you no longer have access' |
| `VALIDATION_FAILED` | 400 | Mutation `dead`; show field message |
| `INVITE_INVALID` | 404 | Toast; stay on Join |
| `GROUP_NOT_FOUND` | 404 | Remove group locally after pull confirms |
| `EXPENSE_INVALID_AMOUNT` / `EXPENSE_INVALID_SPLIT` / `EXPENSE_CURRENCY_MISMATCH` / `MEMBER_NOT_IN_GROUP` | 400 | Mutation `dead`; open form with the error |
| `EXPENSE_CONFLICT` | 409 | Mutation `conflict`; resolution sheet |
| `EXPENSE_NOT_FOUND` | 404 | Treated as success for deletes; `dead` for edits |
| `SETTLEMENT_INVALID` | 400 | `dead`; show message |
| `MEMBER_NAME_TAKEN` | 409 | Inline field error |
| `MEMBER_HAS_BALANCE` | 409 | Sheet with amount and 'Settle up' action |
| `LAST_OWNER` | 409 | Prompt to transfer ownership |
| `RATE_LIMITED` | 429 | Backoff; message after 3rd failure |

### 5.6 Native and build configuration

```ts
// next.config.js essentials (R2 §1.2 plus D-11)
{ output: 'export', trailingSlash: true, images: { unoptimized: true } }

// capacitor.config.ts (R2 §1.3, corrected per D-16)
{ appId: 'com.example.splitapp',   // placeholder; resolve Q-01 before store upload
  appName: 'Split',
  webDir: 'out',
  server: { androidScheme: 'https', iosScheme: 'ionic' },   // never change after first release: it changes the WebView origin and orphans local data
  plugins: {
    FirebaseMessaging: { presentationOptions: ['badge', 'sound', 'alert'] },
    LocalNotifications: { smallIcon: 'ic_stat_icon', iconColor: '#10B981' } },
  ios: { contentInset: 'always' }, android: { allowMixedContent: false } }
```

**Plugins (pin exact versions in the lockfile):** `@capacitor/app`, `@capacitor/haptics`, `@capacitor/local-notifications`, `@capacitor-firebase/messaging`, a native Google sign-in plugin (Q-02), `@capacitor/camera` (P2 receipts). Every dynamic import is behind `isNativePlatform()` and wrapped in try/catch so the web build and Vitest never crash (R2 §1.4).

## 6. Implementation Phasing (Step-by-Step Build Order)

Ordering follows R0 §11 (schema → equal split → balances → more split types → simplification → settlements → polish), with R2's local-first layer built in from the start because retrofitting it into a server-first app is far costlier than building it once.

### Phase 0 — De-risking spikes (3–5 days, throwaway code allowed)

1. Static export + Capacitor Android: query-param routing, back button, deep link `splitapp://join?code=` opening the right screen.
2. Supabase: RLS + `SECURITY DEFINER` RPC + `PT409` error mapping visible in `supabase-js`.
3. FCM round trip to a physical Android device, including a killed-app tap.
4. WebView storage persistence on a low-storage iOS device, and the `iosScheme` choice (origin fixed forever).

### Phase 1 — Foundation / MVP (critical path; Android internal build)

| Step | Deliverable | Depends on | Done when |
| --- | --- | --- | --- |
| 1.1 | Repo, CI, lint, Vitest + fast-check, Supabase local stack, Next export + Capacitor Android shell | Phase 0 | `npm run build && cap sync` yields an installable APK |
| 1.2 | **`lib/engine`**: money parse/format, `allocate`, equal + exact, `validateExpense`, `computeBalances`, `simplifyDebts`, golden vectors | 1.1 | All unit tests and 10,000-case property tests pass (NFR-09); R1's test suite included verbatim |
| 1.3 | Migration `0001_core.sql`: tables, triggers, `is_member`, `group_balances`, RLS | 1.1 | RLS test suite proves non-member isolation |
| 1.4 | Auth: email OTP, profile bootstrap, session handling | 1.3 | US-01 passes on device |
| 1.5 | RPCs: `create_group`, `join_group`, `upsert_expense`, `delete_expense`, `upsert_settlement`, `add_placeholder`, `pull_changes`, `list_activity` | 1.3 | Integration tests for every error code; idempotent replay verified |
| 1.6 | Data layer: `StorageAdapter`, `LocalStore`, queue, `Repository`, push/pull/merge, lifecycle triggers, `SyncBadge`, Sync Issues screen | 1.2, 1.5 | Sync simulation tests (drop, duplicate, reorder, kill mid-drain) pass |
| 1.7 | UI: dashboard, group (expenses, balances, members/invite, activity), expense form (equal, exact, multi-payer), suggestions + Settle modal | 1.6 | US-02 to US-07, US-13 to US-16, US-20 pass |
| 1.8 | Native polish: safe areas, back button, haptics, deep-link join, signed internal APK | 1.7 | Two physical devices complete the full scenario in airplane mode and online |

**Phase 1 exit criteria:** invariants I1–I5 verified by tests; no data loss across forced app kill and offline/online cycles; balances on two devices agree to the minor unit after sync; zero RLS leaks.

### Phase 2 — Core polish and depth

1. Split types: percentage (bp), shares, adjustment; `SplitEditor` live-delta UX (US-08 to US-10).
2. Edit with `version` conflict handling and the resolution sheet; delete/restore with undo (US-11, US-12, US-21).
3. Pairwise breakdown (§3.4), search and filters, categories, group archive.
4. Realtime channel with status chip (US-17).
5. Push: FCM registration, `notify-group` + webhook, `expenses_channel`, preferences and mute; weekly local reminder (US-18, US-19).
6. Member management: roles, remove, rotate invite, placeholder claim via per-placeholder invite link, ownership transfer.
7. Google sign-in; universal/app links.
8. Receipt photo capture, client compression, private Storage bucket, signed URLs.
9. CSV export; settlement undo; **account deletion** (US-22); iOS build and TestFlight.

**Exit:** all user stories US-01 to US-22 pass; store-review checklist complete for both platforms.

### Phase 3 — Scale and hardening

1. **Storage upgrade:** move `StorageAdapter` to IndexedDB or SQLite, partitioned per group, behind the same interface (EC-13, R-01, R-02).
2. **Integrity monitoring:** nightly job asserts Σ balances = 0 and I2 for every group; client dev-mode drift check promoted to a sampled production telemetry event (hash of local vs server balances) triggering full resync.
3. **Telemetry:** crash reporting; sync metrics (queue depth, drain latency, dead-letter rate, conflict rate, pull duration); no amounts or names in events.
4. **Rate limiting and abuse:** join attempts, mutation volume, invite rotation, payload size caps.
5. **Performance:** fixtures of 5,000 expenses × 30 members; virtualized lists; incremental balance updates; pull payload and index tuning.
6. **Reliability:** chaos tests for the queue; PITR backups and restore drill; remote-config minimum app version and RPC `v1` retirement process.
7. **Quality gates:** accessibility audit (NFR-08), device matrix E2E (web Playwright for logic, device farm for native), dependency audit, security review of every `SECURITY DEFINER` function.
8. **Optional:** multi-currency groups using `fx_rate_to_base`; itemized splitting.

### Cross-cutting test strategy

| Layer | Tooling | Must cover |
| --- | --- | --- |
| Engine | Vitest + fast-check | I1–I3 over random expenses; remainder determinism; JPY/KWD exponents; pairwise reconciles to balances; `simplifyDebts` clears all balances with ≤ N−1 payments |
| Database | pgTAP or SQL integration tests | Constraints, deferred trigger, every RPC error path, replay idempotency, **RLS as non-member, removed member, other group's member** |
| Sync | Simulated network layer | Drop, duplicate, reorder, 401 mid-drain, kill mid-drain, clock skew, pull paging with equal timestamps |
| UI | Component + Playwright | Perspective-aware copy, delta labels, a11y labels, offline badge |
| Device | Manual script + device farm | Airplane-mode scenario, push (foreground/background/killed), back button, deep links |

**Golden vectors (must exist before any UI work):** 10000÷3 → `[3334,3333,3333]`; 1÷3 → `[1,0,0]`; percentages `[3333,3333,3334]` bp of 10000; shares `[2,1,1]` of 10000 → `[5000,2500,2500]`; multi-payer 60/40 of 10000; JPY ¥5,000 → 5000; INR `1,250.75` → 125075; circular debts net to zero transactions; 4-person web (A +15000, B/C/D −5000) → 3 payments to A.

## 7. Open Questions & Technical Risks

### 7.1 Decisions needed before or early in Phase 1

Each has a recommended default so work can proceed if no answer arrives.

| ID | Question | Recommended default |
| --- | --- | --- |
| Q-01 | **Product name and bundle ID.** R2 uses 'Splitwise' and `com.splitwise.mobile`, which is another company's trademark and will fail store review or invite a takedown | Use a working name now; rename before any store upload |
| Q-02 | **Sign-in methods** for the target market (India): email OTP, Google, or phone OTP (SMS cost, DLT registration) | Email OTP + Google; evaluate phone OTP after launch |
| Q-03 | **Who may edit or delete any expense?** | Any active member (Splitwise parity), fully audited; revisit if abuse appears |
| Q-04 | Who may add placeholder members and record settlements between *other* people? | Any member for both; audited; admin-only toggle later |
| Q-05 | **Invite mechanism:** code + custom scheme only, or HTTPS universal links (needs a domain and verification files)? | Code + custom scheme in P1; universal links in P2 |
| Q-06 | Debt simplification always on, or a per-group toggle? | Always show suggestions; pairwise view available in P2 |
| Q-07 | Is single-currency-per-group acceptable for the first release (trips abroad often mix currencies)? | Yes for v1; `fx_rate_to_base` reserved |
| Q-08 | Account deletion effect on other people's ledgers | Anonymize into placeholder-style members, keep history |
| Q-09 | Size limits (members, expenses, receipt size) | 30 members, 5,000 expenses per group, receipts ≤ 1.5 MB after compression |
| Q-10 | Should a settlement lock or hide earlier expenses (as a 'settled' period)? | No; ledger stays continuous |
| Q-11 | Percent and share precision | 2 decimals, stored as bp / weight |
| Q-12 | iOS timing (Apple developer account, APNs key) | After Android internal release, within Phase 2 |
| Q-13 | Privacy/legal: data residency, privacy policy, store data-safety labels | Draft with Phase 2; Supabase region chosen near users |

### 7.2 Technical risks

| ID | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| R-01 | `localStorage` is \~5 MB, synchronous and parse-heavy; large groups cause jank or `QuotaExceededError` | High | Adapter interface from day one; per-group keys; storage-full UX (EC-13); SQLite/IndexedDB in Phase 3 |
| R-02 | WebView storage can be purged by the OS under pressure; unsynced local data would be lost | High | Drain aggressively on every trigger; show an age warning on old pending items; durable store in Phase 3; spike 4 |
| R-03 | Offline edit conflicts are confusing to users | Medium | Version-based detection, explicit resolution UI, no silent overwrites (D-07) |
| R-04 | Pull cursor misses rows committed late | Medium | 5 s overlap + idempotent merge + periodic full reconcile when balances hash mismatches |
| R-05 | Static export routing: `/group?id=` pages, WebView history and Android back interplay | Medium | Spike 1; E2E on device; `trailingSlash: true` |
| R-06 | RLS or `SECURITY DEFINER` mistake leaks another group's data | Critical | No direct write grants; automated cross-group tests in CI; mandatory review of each function |
| R-07 | Push reliability: Android 13 permission, OEM battery killers, APNs setup, token churn | Medium | Push is a hint, never the source of truth; pull on foreground; prune dead tokens |
| R-08 | Google OAuth in a WebView (redirect and custom-tab quirks) | Medium | Native sign-in + `signInWithIdToken`; email OTP as fallback |
| R-09 | Engine behavior differing across app versions in the wild | Medium | Stored splits authoritative; server enforces invariants only; versioned RPCs (§4.7) |
| R-10 | Realtime limits, cost or flakiness | Low | Realtime only hints; pull-on-foreground is the baseline |
| R-11 | Greedy simplification is not always the true minimum (NP-hard in general) | Low | Accepted (R0 §5); bound of N−1 payments documented in UI help |
| R-12 | Version drift among Next 15, React 19 and Capacitor 8 plugins | Medium | Phase 0 spike; exact pinning; scheduled upgrade windows |
| R-13 | Store policy: in-app account deletion, privacy labels, user-generated names | Medium | Account deletion in Phase 2; checklist per store |
| R-14 | R2's FCM Edge Function is partly stubbed (OAuth token exchange, send loop) | Medium | Implement fully (§5.4), integration-test with a real project |
| R-15 | `iosScheme` / `androidScheme` fixes the WebView origin permanently | High if changed late | Decide in Phase 0; document as immutable |
| R-16 | `pull_changes` with nested splits grows heavy for large histories | Low | Per-table caps, paging, covering indexes, Phase 3 profiling |
| R-17 | Placeholder claiming could attach history to the wrong person | Medium | Claim only via a link generated per placeholder and confirmed by an admin |

### 7.3 Definition of done (applies to every story)

- Acceptance criteria demonstrated on a physical device **in both online and airplane mode** where relevant.
- Engine and RPC changes ship with unit, property and error-path tests; no money arithmetic outside `lib/engine`.
- No floats on any money path (lint rule bans `parseFloat`, `toFixed` and `Number(...)` on money-named fields outside `formatMinor`).
- New tables or RPCs ship with RLS tests and an additive migration.
- All user-visible errors use catalogue codes and accessible messages; no color-only meaning.
- Telemetry contains no amounts, names or emails.
