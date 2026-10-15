# Splitwise Clone — How It Works + Integration Guide

## 1. Core Mental Model

Splitwise is **not** a payment processor. It's a **balance ledger**. Every expense creates a set of debts between people; the app just tracks who owes whom, and periodically suggests the minimum number of payments to zero everyone out. Money never actually moves inside Splitwise (except Splitwise Pay in some regions) — it's pure bookkeeping.

Everything reduces to one core object: **an expense split into signed shares.**

```
expense.amount = sum(paid_by[i].amount)   // who fronted the money
expense.amount = sum(owed_by[i].amount)   // who's responsible for it
```

For each participant, `net_contribution = paid - owed`. Positive = they're owed money. Negative = they owe money. Sum across all participants in an expense is always 0.

---

## 2. Data Model

Five entities cover ~95% of Splitwise's functionality:

| Entity | Purpose |
|---|---|
| **Group** | A trip, household, or event. Has members. |
| **Member** | A user's membership in a group (allows non-registered "placeholder" people). |
| **Expense** | A single transaction: amount, currency, description, category, date, who paid. |
| **Split** (aka ExpenseUser) | Per-participant row: `paid_share` and `owed_share` for that expense. |
| **Settlement** | A direct payment record between two members (reduces balance, isn't an expense). |

Everything else (comments, receipts, activity feed, notifications) is secondary.

---

## 3. Split Types

When creating an expense, the payer(s) and the split method are chosen independently.

1. **Equal** — `amount / n` per person (handle remainder pennies by giving them to the first N people, don't just round).
2. **Exact amounts** — user manually enters each person's share; must sum to total.
3. **Percentages** — each person gets a %; must sum to 100.
4. **Shares** — like percentages but with weights (e.g., "2 shares" for a couple vs "1 share" for a solo person). `person_owed = total * (their_shares / sum_of_all_shares)`.
5. **Adjustment / +/-** — start from equal split, then let specific people add/subtract a fixed amount (e.g., "Alice doesn't drink, remove $20 from her share, redistribute equally among the rest").
6. **Itemized** (advanced, not in v1) — line-item receipt splitting where each item is assigned to specific people, then tax/tip prorated proportionally.

For a trip planner, **Equal, Exact, and Shares** cover almost every real use case. Percentages/Adjustment are nice-to-haves.

---

## 4. Balance Calculation

Two levels:

**A. Pairwise balance between two people (within a group)**
For every expense, if the split is more than 2 people, you still resolve it into pairwise debts. Simplest approach: treat each person's `net = paid - owed` for that expense, then distribute their surplus/deficit against the group.

**B. Simplified approach used in practice (net balance method):**
```
For each member m in group:
  net_balance[m] = sum over all expenses of (m.paid_share - m.owed_share)
                   + sum over all settlements involving m (with sign)
```
This gives one number per person: positive = owed money, negative = owes money. This is enough to render "You owe Alex ₹500" style summaries — you don't need pairwise ledgers stored explicitly, you can *derive* them.

To show "who owes whom" pairwise (not just net), Splitwise actually does track it at a finer grain OR reconstructs it via the simplification algorithm below, run at read-time or cached.

---

## 5. Debt Simplification Algorithm (the clever part)

This is Splitwise's signature feature: instead of "Alice owes Bob $10, Bob owes Charlie $10, Charlie owes Alice $5," it collapses chains into the minimum number of transactions.

**Problem:** given net balances per person (some positive/creditors, some negative/debtors), find the minimum set of transactions that settles everyone to zero.

**Greedy algorithm (what Splitwise uses conceptually):**

```typescript
type Balance = { userId: string; amount: number }; // +ve = owed, -ve = owes

function simplifyDebts(balances: Balance[]): { from: string; to: string; amount: number }[] {
  const creditors = balances.filter(b => b.amount > 0).map(b => ({ ...b })).sort((a,b) => b.amount - a.amount);
  const debtors   = balances.filter(b => b.amount < 0).map(b => ({ ...b, amount: -b.amount })).sort((a,b) => b.amount - a.amount);

  const transactions: { from: string; to: string; amount: number }[] = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const settled = Math.min(debtor.amount, creditor.amount);

    transactions.push({ from: debtor.userId, to: creditor.userId, amount: Math.round(settled * 100) / 100 });

    debtor.amount -= settled;
    creditor.amount -= settled;

    if (debtor.amount < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }

  return transactions;
}
```

This greedy approach isn't always the mathematically minimal number of transactions (that's an NP-hard variant of subset-sum), but it's what Splitwise uses in practice — it's simple, fast, and produces near-optimal results (at most `n-1` transactions for `n` people).

**Important:** run this **per-group**, not globally, unless you want cross-group netting (Splitwise added "friends across groups" netting later — skip this for v1).

---

## 6. Settlements

A settlement is just an expense-like record with only two people and no "split" — it directly adjusts two balances.

```
settlement: { from_user, to_user, amount, group_id, date, note }
```
When recorded, it's included in the `net_balance` calculation above with sign: `from_user.net += amount`, `to_user.net -= amount` (since from_user paid, they now owe less / are owed more, and to_user received, so they owe more / are owed less — get the sign convention consistent with your expense splits).

Settlements can be **manual** (mark as paid, no real money moves) or **integrated** (webhook from a payment provider like Razorpay/UPI/Stripe marks it automatically) — for a trip planner, manual is enough for v1.

---

## 7. Activity Feed / Audit Trail

Every mutation (expense added, edited, deleted, settlement recorded, member added) gets logged as an immutable activity row:
```
activity: { id, group_id, actor_id, type, payload_json, created_at }
```
This powers the "Alex added 'Dinner at Cafe X' — ₹1200" feed and lets you support edit history / undo.

---

## 8. Edge Cases to Handle

- **Editing/deleting an expense** — recompute balances; don't just delete the row, soft-delete + log to activity feed so history isn't lost.
- **Rounding** — always work in integer minor units (paise/cents) internally, never floats. Distribute remainder cents to the first N participants in a deterministic order.
- **Currency** — if your trip planner supports multi-currency trips, either (a) lock a trip to one currency (simplest, recommended for v1), or (b) store `fx_rate_to_base` on each expense and settle in a base currency.
- **Removing a member mid-trip** — either block if they have a non-zero balance, or auto-settle/transfer their balance.
- **Partial settlements** — a settlement of ₹300 against a ₹500 debt just reduces net_balance; no special handling needed since it's the same ledger entry type.

---

## 9. Suggested Schema (Drizzle + Postgres/Supabase)

Fits your existing `trips → runs`-style hierarchy (`projects → runs → flags` in CascadeGuard) — here it's `trips → expenses → splits`.

```typescript
import { pgTable, uuid, text, numeric, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";

export const splitTypeEnum = pgEnum("split_type", ["equal", "exact", "percentage", "shares"]);
export const activityTypeEnum = pgEnum("activity_type", ["expense_added", "expense_edited", "expense_deleted", "settlement_added", "member_added"]);

export const tripMembers = pgTable("trip_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  tripId: uuid("trip_id").notNull().references(() => trips.id),
  userId: uuid("user_id").references(() => users.id), // nullable = placeholder/guest
  displayName: text("display_name").notNull(),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const expenses = pgTable("expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  tripId: uuid("trip_id").notNull().references(() => trips.id),
  description: text("description").notNull(),
  amountMinor: integer("amount_minor").notNull(), // store in paise/cents
  currency: text("currency").notNull().default("INR"),
  splitType: splitTypeEnum("split_type").notNull().default("equal"),
  category: text("category"),
  createdBy: uuid("created_by").notNull().references(() => tripMembers.id),
  expenseDate: timestamp("expense_date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // soft delete
});

export const expenseSplits = pgTable("expense_splits", {
  id: uuid("id").defaultRandom().primaryKey(),
  expenseId: uuid("expense_id").notNull().references(() => expenses.id),
  memberId: uuid("member_id").notNull().references(() => tripMembers.id),
  paidMinor: integer("paid_minor").notNull().default(0),
  owedMinor: integer("owed_minor").notNull().default(0),
});

export const settlements = pgTable("settlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  tripId: uuid("trip_id").notNull().references(() => trips.id),
  fromMemberId: uuid("from_member_id").notNull().references(() => tripMembers.id),
  toMemberId: uuid("to_member_id").notNull().references(() => tripMembers.id),
  amountMinor: integer("amount_minor").notNull(),
  note: text("note"),
  settledAt: timestamp("settled_at").defaultNow(),
});

export const activityLog = pgTable("activity_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  tripId: uuid("trip_id").notNull().references(() => trips.id),
  actorMemberId: uuid("actor_member_id").notNull().references(() => tripMembers.id),
  type: activityTypeEnum("type").notNull(),
  payload: text("payload"), // JSON string
  createdAt: timestamp("created_at").defaultNow(),
});
```

---

## 10. API Surface (minimal v1)

```
POST   /trips/:tripId/expenses          create expense + splits (one transaction)
PATCH  /trips/:tripId/expenses/:id      edit (soft-delete old, log activity)
DELETE /trips/:tripId/expenses/:id      soft delete
GET    /trips/:tripId/balances          compute net_balance per member (server-side aggregation)
GET    /trips/:tripId/balances/simplified   run simplifyDebts() on the balances
POST   /trips/:tripId/settlements       record a payment
GET    /trips/:tripId/activity          paginated feed
```

`GET /balances` should be a single SQL aggregation:
```sql
SELECT member_id, SUM(paid_minor) - SUM(owed_minor) AS net_minor
FROM expense_splits
JOIN expenses ON expenses.id = expense_splits.expense_id
WHERE expenses.trip_id = $1 AND expenses.deleted_at IS NULL
GROUP BY member_id
```
Then merge in settlements with correct sign, then run `simplifyDebts()` on the result in application code.

---

## 11. Build Order (fastest path to a working feature)

1. Schema + migrations (above).
2. Create expense with **equal split only** — get the core flow working end-to-end.
3. Balance query + display ("You owe / You are owed").
4. Add Exact and Shares split types to the expense form.
5. Debt simplification + "Settle up" UI.
6. Settlements + activity feed.
7. Polish: categories, edit/delete, receipt photo upload.

This ordering gets you a demo-able feature after step 3, which is worth doing before adding split-type complexity.
