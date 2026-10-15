# Sync Engine & Offline Resilience
 
Clearcut operates on an **online-first architecture with offline resilience**. All state modifications write directly to Supabase when connected, while seamlessly queueing mutations locally when offline without state drift or data loss.

---

## 1. Sync Lifecycle & States

```
                ┌─────────────────────────────────┐
                │          User Mutation          │
                └────────────────┬────────────────┘
                                 │
                     [ Is Device Online? ]
                    /                     \
                YES                        NO
                /                            \
   ┌───────────────────────┐       ┌───────────────────────┐
   │ Direct Supabase Write │       │ Enqueue Mutation      │
   │ (upsert_expense_v1)   │       │ into LocalStore / IDB │
   └───────────┬───────────┘       └───────────┬───────────┘
               │                               │
        [ Success? ]                Toast: "Saved locally — 
        /          \                will sync when online."
     YES            NO                         │
      │              │                         │
Update Local    Enqueue & Retry                │
 Cache           when online                   │
      │                                        │
      │         ┌──────────────────────────────┘
      │         │ [ Network Restored ]
      │         ▼
   ┌───────────────────────┐
   │ Drain Mutation Queue  │
   │ Push to Supabase RPCs │
   └───────────┬───────────┘
               ▼
   ┌───────────────────────┐
   │ Pull Fresh Changes    │
   │ Reconcile Local Cache │
   └───────────────────────┘
```

---

## 2. Key Modules

### `lib/data/repository.ts` (`DomainRepository`)
The central coordinator for all domain actions (expenses, settlements, groups, members):
- Checks connectivity via `isDeviceOnline()`.
- Executes direct Supabase write when connected.
- Automatically falls back to local queue and shows a neo-brutalist toast when offline.

### `lib/sync/push.ts`
- Processes pending client mutations stored in the local queue FIFO.
- Sends payloads with client mutation IDs for idempotent execution.
- Removes completed mutations via `queue.markSynced(mutationId)`.

### `lib/sync/pull.ts`
- Calls `pull_changes_v1` on Supabase with a high-water mark timestamp `since`.
- Performs **full refresh parity** (`fullRefresh = true` when manually triggered by the `🔄 REFRESH` button).
- Automatically prunes local entities (groups, expenses, settlements) that have been hard-deleted on the server.

### `lib/sync/merge.ts`
- Resolves conflicts between server and client versions.
- If version conflict `PT409` occurs, applies three-way merge rules preserving the highest-version non-conflicting fields.

---

## 3. UI Indicators (`components/SyncBadge.tsx`)

- **`🔄 REFRESH`** (Default / Connected): Manual one-tap sync pulling fresh data from all tables.
- **`SYNCING...`** (Animated Spin): Active background push drain or pull reconciliation.
- **`✓ SYNCED`** (Green confirmation): Flashes for 2 seconds upon successful synchronization.
- **`OFFLINE`**: Alerts user that mutations will be held locally until reconnecting.
