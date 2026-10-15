# SPLITWISE CLONE: CAPACITOR WEBVIEW, OFFLINE-FIRST, BACKGROUND SYNC & NOTIFICATIONS ARCHITECTURE
> **Target Platforms:** Android & iOS  
> **Source Model Reference:** AVIEN (`waterrr`) Mobile Architecture  
> **Primary Technology Stack:** Next.js 15 (Static Export), React 19, Capacitor 8, Supabase (PostgreSQL, Realtime, Edge Functions), Firebase Cloud Messaging (FCM), `@capacitor/local-notifications`

---

## 1. Capacitor Native WebView Architecture (Android & iOS)

### 1.1 Architectural Overview
The application runs as a **single-page static web application** rendered directly inside Capacitor's native WebView (`WKWebView` on iOS, Chromium-based `WebView` on Android). There is no local Node.js server; all assets are loaded locally from the device's storage (`out/`), and all external communication is directed to Supabase or third-party APIs over HTTPS / WebSockets.

```
┌──────────────────────────────────────────────────────────────┐
│                    Mobile Device (Android / iOS)             │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                Capacitor 8 Native Host                 │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │                 Native WebView                   │  │  │
│  │  │  ┌────────────────────────────────────────────┐  │  │  │
│  │  │  │         Next.js 15 Static App              │  │  │  │
│  │  │  │        (HTML / JS / Tailwind CSS)          │  │  │  │
│  │  │  └────────────────────────────────────────────┘  │  │  │
│  │  └──────────────────────────▲───────────────────────┘  │  │
│  │                             │ JavaScript Bridge        │  │
│  │  ┌──────────────────────────▼───────────────────────┐  │  │
│  │  │               Capacitor Native Plugins           │  │  │
│  │  │   • @capacitor/app          (Lifecycle & Back)   │  │  │
│  │  │   • @capacitor-firebase/messaging  (FCM Push)    │  │  │
│  │  │   • @capacitor/local-notifications (Reminders)   │  │  │
│  │  │   • @capacitor/haptics      (Tactile feedback)   │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

### 1.2 Next.js Build Configuration for Static WebView Export
In `next.config.js`, Next.js must be configured with `output: 'export'` to generate raw HTML/CSS/JS without Node.js server dependencies. Server-side features (`getServerSideProps`, Route Handlers) are disallowed.

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true, // Native WebView cannot run Next.js image optimization server
  },
  webpack: (config) => {
    // Prevent build-time bundle errors for native Firebase / Capacitor plugins
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'firebase/messaging': false,
      'firebase/app': false,
    };
    return config;
  },
};

module.exports = nextConfig;
```

---

### 1.3 Capacitor Configuration (`capacitor.config.ts`)
```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.splitwise.mobile',
  appName: 'Splitwise',
  webDir: 'out', // Next.js static export destination directory
  server: {
    androidScheme: 'https', // Required for modern cookie / origin / secure storage behaviors
    iosScheme: 'ionic',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#10B981',
      sound: 'beep.wav',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  ios: {
    contentInset: 'always',
    scrollEnabled: true,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
};

export default config;
```

---

### 1.4 Mobile WebView UX & Native Platform Parity

#### Safe Area Handling (`app/globals.css`)
Notches, dynamic islands (iOS), and system gesture/navigation bars (Android) require explicit safe area CSS rules:
```css
:root {
  --sat: env(safe-area-inset-top, 0px);
  --sab: env(safe-area-inset-bottom, 0px);
  --sal: env(safe-area-inset-left, 0px);
  --sar: env(safe-area-inset-right, 0px);
}

html, body {
  /* Prevent white screen flashes on bounce scroll */
  overscroll-behavior-y: none;
  /* Disable 300ms double-tap delay and accidental web touch selections */
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  touch-action: manipulation;
  padding-top: var(--sat);
  padding-bottom: var(--sab);
}

/* Allow text selection only within specific form elements */
input, textarea, [contenteditable="true"] {
  -webkit-user-select: auto;
  user-select: auto;
}
```

#### Android Hardware Back Button Interceptor
On Android, pressing the system back button must navigate modals and internal routes rather than immediately exiting the app.
```typescript
// lib/native-back.ts
import { App as CapApp } from '@capacitor/app';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

export function useHardwareBackButton(isModalOpen: boolean, closeModal: () => void) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let listenerHandler: any;

    const setupListener = async () => {
      listenerHandler = await CapApp.addListener('backButton', ({ canGoBack }) => {
        if (isModalOpen) {
          closeModal();
        } else if (pathname !== '/' && canGoBack) {
          router.back();
        } else {
          // At root page: exit the application
          CapApp.exitApp();
        }
      });
    };

    setupListener();

    return () => {
      if (listenerHandler?.remove) {
        listenerHandler.remove();
      }
    };
  }, [isModalOpen, closeModal, pathname, router]);
}
```

#### Safe Native Plugin Loading Pattern
Capacitor plugins should be loaded conditionally to avoid crashing during web builds or standard browser testing:
```typescript
export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as any).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}
```

---

## 2. Offline-First Architecture

### 2.1 The "Write-Local-First" Strategy
In this architecture, **the user interface never waits for the network.**
1. Every write (creating an expense, editing a split, settling a debt) executes against local storage synchronously.
2. The UI state updates instantly (optimistic UI update).
3. The mutation is pushed to an offline queue.
4. Background synchronization processes the mutation to Supabase when network connectivity permits.

```
User Action (Tap "Save Expense")
      │
      ├───► 1. Save to localStorage immediately (Local-First)
      ├───► 2. Optimistically update React State (Zero UI Lag)
      └───► 3. Enqueue mutation to sync queue (Persistence guarantee)
                   │
                   ▼ (Async / Background)
             Supabase Upsert
```

---

### 2.2 Client-Side UUID Generation
Because records must be created offline without an active database connection, all IDs are generated on the client via `crypto.randomUUID()`:
- `expenses.id`
- `settlements.id`
- `groups.id`

This prevents reliance on auto-incrementing server sequences and allows referencing new records locally before they are acknowledged by the database.

---

### 2.3 Storage Layer (`lib/storage.ts`)
```typescript
import { Expense, Group, Settlement } from './types';

const STORAGE_KEYS = {
  EXPENSES: 'splitwise_expenses',
  GROUPS: 'splitwise_groups',
  SETTLEMENTS: 'splitwise_settlements',
  MUTATION_QUEUE: 'splitwise_mutation_queue',
  LAST_SYNC: 'splitwise_last_sync_timestamp',
};

export interface MutationRecord {
  id: string; // Unique mutation identifier
  type: 'UPSERT_EXPENSE' | 'DELETE_EXPENSE' | 'UPSERT_SETTLEMENT' | 'UPSERT_GROUP';
  payload: any;
  timestamp: number;
  retryCount: number;
}

export const LocalStore = {
  // Read operations
  getExpenses(): Expense[] {
    if (typeof window === 'undefined') return [];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EXPENSES);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  getGroups(): Group[] {
    if (typeof window === 'undefined') return [];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.GROUPS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  // Write operations
  saveExpense(expense: Expense): void {
    const expenses = LocalStore.getExpenses().filter((e) => e.id !== expense.id);
    expenses.unshift(expense);
    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
    
    // Add to mutation queue
    LocalStore.enqueueMutation({
      type: 'UPSERT_EXPENSE',
      payload: expense,
    });
  },

  removeExpense(id: string): void {
    const expenses = LocalStore.getExpenses().filter((e) => e.id !== id);
    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));

    LocalStore.enqueueMutation({
      type: 'DELETE_EXPENSE',
      payload: { id },
    });
  },

  // Mutation Queue
  getQueue(): MutationRecord[] {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.MUTATION_QUEUE) || '[]');
    } catch {
      return [];
    }
  },

  enqueueMutation(mutation: Omit<MutationRecord, 'id' | 'timestamp' | 'retryCount'>): void {
    const queue = LocalStore.getQueue();
    queue.push({
      ...mutation,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      retryCount: 0,
    });
    localStorage.setItem(STORAGE_KEYS.MUTATION_QUEUE, JSON.stringify(queue));
  },

  removeMutation(id: string): void {
    const queue = LocalStore.getQueue().filter((m) => m.id !== id);
    localStorage.setItem(STORAGE_KEYS.MUTATION_QUEUE, JSON.stringify(queue));
  },

  updateMutation(mutation: MutationRecord): void {
    const queue = LocalStore.getQueue().map((m) => (m.id === mutation.id ? mutation : m));
    localStorage.setItem(STORAGE_KEYS.MUTATION_QUEUE, JSON.stringify(queue));
  },
};
```

---

## 3. Background Sync & Real-Time Sync Architecture

### 3.1 Bidirectional Sync Engine (`lib/sync.ts`)

The sync engine handles two directions:
- **Upstream Push**: Draining the offline mutation queue to Supabase.
- **Downstream Pull**: Fetching new/updated records from Supabase and merging them into local storage.

```
                ┌──────────────────────────────────────┐
                │          App Mount / Online          │
                └──────────────────┬───────────────────┘
                                   │
                     ┌─────────────┴─────────────┐
                     ▼                           ▼
        ┌─────────────────────────┐ ┌─────────────────────────┐
        │ 1. Upstream Push Queue  │ │ 2. Downstream Pull Sync │
        │ Drain pending mutations │ │ Pull records where      │
        │ with exponential backoff│ │ updated_at > last_sync  │
        └────────────┬────────────┘ └────────────┬────────────┘
                     │                           │
                     ▼                           ▼
             Supabase Postgres             Merge with LWW
                                           (Last-Write-Wins)
```

#### Complete Sync Implementation
```typescript
import { supabase } from './supabase';
import { LocalStore, MutationRecord } from './storage';
import { Expense } from './types';

let isSyncing = false;

export async function processOfflineQueue(): Promise<void> {
  if (isSyncing || typeof window === 'undefined' || !navigator.onLine) return;
  isSyncing = true;

  try {
    const queue = LocalStore.getQueue();
    for (const item of queue) {
      try {
        if (item.type === 'UPSERT_EXPENSE') {
          const exp: Expense = item.payload;
          
          // 1. Upsert parent expense record
          const { error: expError } = await supabase.from('expenses').upsert({
            id: exp.id,
            group_id: exp.groupId || null,
            title: exp.title,
            description: exp.description || null,
            total_amount: exp.totalAmount, // Cent integer
            currency: exp.currency,
            category: exp.category,
            paid_by_user_id: exp.paidByUserId,
            date: exp.date,
            updated_at: new Date(item.timestamp).toISOString(),
          }, { onConflict: 'id' });

          if (expError) throw expError;

          // 2. Upsert splits
          if (exp.splits && exp.splits.length > 0) {
            const splitRows = exp.splits.map((s) => ({
              expense_id: exp.id,
              user_id: s.userId,
              amount: s.amount,
              split_type: s.splitType,
              split_value: s.splitValue ?? null,
            }));

            // Clear previous splits for this expense and rewrite
            await supabase.from('expense_splits').delete().eq('expense_id', exp.id);
            const { error: splitError } = await supabase.from('expense_splits').insert(splitRows);
            if (splitError) throw splitError;
          }
        } else if (item.type === 'DELETE_EXPENSE') {
          const { error } = await supabase.from('expenses').update({ is_deleted: true }).eq('id', item.payload.id);
          if (error) throw error;
        }

        // Successfully synced: remove from queue
        LocalStore.removeMutation(item.id);
      } catch (err) {
        console.error(`Failed to process mutation ${item.id}:`, err);
        item.retryCount += 1;
        LocalStore.updateMutation(item);
        // Break queue loop on network error to preserve execution order
        break;
      }
    }
  } finally {
    isSyncing = false;
  }
}

/**
 * Pulls remote changes from Supabase and merges them into localStorage.
 * Uses Last-Write-Wins (LWW) based on updated_at.
 */
export async function pullRemoteChanges(userId: string): Promise<void> {
  if (!navigator.onLine) return;

  const lastSync = localStorage.getItem('splitwise_last_sync_timestamp') || new Date(0).toISOString();

  // Fetch updated expenses
  const { data: remoteExpenses, error } = await supabase
    .from('expenses')
    .select(`
      id, group_id, title, description, total_amount, currency,
      category, paid_by_user_id, date, is_deleted, updated_at,
      expense_splits (user_id, amount, split_type, split_value)
    `)
    .gt('updated_at', lastSync);

  if (error || !remoteExpenses) return;

  const localExpenses = LocalStore.getExpenses();
  const localMap = new Map(localExpenses.map((e) => [e.id, e]));

  for (const remote of remoteExpenses) {
    if (remote.is_deleted) {
      localMap.delete(remote.id);
      continue;
    }

    const formatted: Expense = {
      id: remote.id,
      groupId: remote.group_id,
      title: remote.title,
      description: remote.description,
      totalAmount: remote.total_amount,
      currency: remote.currency,
      category: remote.category,
      paidByUserId: remote.paid_by_user_id,
      date: remote.date,
      splits: remote.expense_splits.map((s: any) => ({
        userId: s.user_id,
        amount: s.amount,
        splitType: s.split_type,
        splitValue: s.split_value,
      })),
      updatedAt: remote.updated_at,
    };

    const existing = localMap.get(remote.id);
    if (!existing || new Date(remote.updated_at) >= new Date(existing.updatedAt || 0)) {
      localMap.set(remote.id, formatted);
    }
  }

  localStorage.setItem('splitwise_expenses', JSON.stringify(Array.from(localMap.values())));
  localStorage.setItem('splitwise_last_sync_timestamp', new Date().toISOString());
}
```

---

### 3.2 Connectivity & Lifecycle Handlers
```typescript
// lib/sync-listener.ts
import { App as CapApp } from '@capacitor/app';
import { processOfflineQueue, pullRemoteChanges } from './sync';

export function setupSyncLifecycle(userId: string): () => void {
  const handleOnline = () => {
    processOfflineQueue().then(() => pullRemoteChanges(userId));
  };

  window.addEventListener('online', handleOnline);

  // Trigger sync when app returns from background to foreground
  let appStateListener: any;
  CapApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      processOfflineQueue().then(() => pullRemoteChanges(userId));
    }
  }).then((handle) => {
    appStateListener = handle;
  });

  return () => {
    window.removeEventListener('online', handleOnline);
    if (appStateListener?.remove) {
      appStateListener.remove();
    }
  };
}
```

---

### 3.3 Supabase Realtime Subscriptions (`lib/realtime.ts`)
While the app is actively in the foreground, changes made by other users (e.g. group members adding expenses) are streamed over WebSockets via Supabase Realtime.

```typescript
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type RealtimeStatus = 'connected' | 'disconnected' | 'connecting';

interface RealtimeOptions {
  groupId: string;
  onDataChanged: () => void;
  onStatusChange?: (status: RealtimeStatus) => void;
}

export function subscribeToGroupRealtime({
  groupId,
  onDataChanged,
  onStatusChange,
}: RealtimeOptions): () => void {
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  onStatusChange?.('connecting');

  const channel: RealtimeChannel = supabase
    .channel(`group-realtime:${groupId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'expenses',
        filter: `group_id=eq.${groupId}`,
      },
      () => {
        onDataChanged();
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'settlements',
        filter: `group_id=eq.${groupId}`,
      },
      () => {
        onDataChanged();
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        onStatusChange?.('connected');
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        onStatusChange?.('disconnected');
        // Auto-reconnect after 3 seconds
        reconnectTimeout = setTimeout(() => {
          channel.subscribe();
        }, 3000);
      }
    });

  return () => {
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    supabase.removeChannel(channel);
  };
}
```

---

## 4. Notification Services Architecture

The notification system uses two complementary services:
1. **Local Notifications** (`@capacitor/local-notifications`): Scheduled on-device reminders (e.g., monthly bill settlements, weekly expense reviews). Requires zero backend calls.
2. **Push Notifications via FCM** (`@capacitor-firebase/messaging`): Cross-device real-time alerts when other users add an expense, record a settlement, or send a debt reminder.

```
                     PUSH NOTIFICATIONS FLOW
User A creates expense / records settlement on their device
                       │
                       ▼
         Supabase Client Fire-and-Forget
      supabase.functions.invoke('send-push')
                       │
                       ▼
      Supabase Edge Function (Deno Runtime)
      • Validates caller auth
      • Queries device_tokens table for recipient(s)
      • Constructs FCM payload (Android channel + iOS APNs)
                       │
                       ▼
       Firebase Cloud Messaging (FCM HTTP v1)
                       │
                       ▼
   Delivered to Recipient Device (User B)
   • Foreground: UI toast / banner
   • Background / Killed: System notification tray
   • Tap Action: Deep-links to the expense or group
```

---

### 4.1 Push Notification Registration (`lib/push.ts`)
Manages device token acquisition, Android 13+ permission requests, and syncing tokens with Supabase.

```typescript
import { supabase } from './supabase';

export function isFCMAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const cap = (window as any).Capacitor;
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}

async function getFirebaseMessagingPlugin() {
  try {
    const mod = await import('@capacitor-firebase/messaging');
    const plugin = mod.FirebaseMessaging;
    return {
      getToken: () => plugin.getToken(),
      requestPermissions: () => plugin.requestPermissions(),
      addListener: (eventName: any, callback: any) => plugin.addListener(eventName, callback),
    };
  } catch {
    return null;
  }
}

/**
 * Registers device with FCM, requests permissions, and persists token to Supabase.
 */
export async function registerPushToken(userId: string): Promise<void> {
  const messaging = await getFirebaseMessagingPlugin();
  if (!messaging) return;

  // Request permissions (handles Android 13 POST_NOTIFICATIONS and iOS alert/sound/badge)
  const permResult = await messaging.requestPermissions();
  if (permResult.receive !== 'granted') {
    console.warn('[Push] Push notification permission denied');
    return;
  }

  // Retrieve FCM device token
  const { token } = await messaging.getToken();
  if (!token) return;

  // Upsert token in Supabase
  const platform = (window as any).Capacitor.getPlatform();
  await supabase.from('device_tokens').upsert(
    {
      user_id: userId,
      token,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'token' }
  );
}

/**
 * Deletes token on logout so subsequent user does not receive previous user's notifications.
 */
export async function unregisterPushToken(userId: string): Promise<void> {
  const messaging = await getFirebaseMessagingPlugin();
  if (!messaging) return;

  try {
    const { token } = await messaging.getToken();
    if (token) {
      await supabase.from('device_tokens').delete().eq('token', token);
    }
  } catch (err) {
    console.error('[Push] Failed to unregister push token:', err);
  }
}

/**
 * Listens for notification interaction (tapping the notification).
 */
export async function setupPushNotificationListeners(onNavigate: (route: string) => void) {
  const messaging = await getFirebaseMessagingPlugin();
  if (!messaging) return;

  await messaging.addListener('notificationActionPerformed', (event: any) => {
    const data = event.notification?.data;
    if (data?.route) {
      onNavigate(data.route);
    } else if (data?.groupId) {
      onNavigate(`/groups/${data.groupId}`);
    }
  });
}
```

---

### 4.2 Push Notification Delivery via Supabase Edge Function
Edge Function executed in Deno runtime on Supabase Cloud.

```typescript
// supabase/functions/send-split-notification/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const { expenseId, senderId, title, groupName } = await req.json();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // 1. Identify recipient IDs from expense splits excluding the creator
  const { data: splits } = await supabase
    .from('expense_splits')
    .select('user_id, amount')
    .eq('expense_id', expenseId)
    .neq('user_id', senderId);

  if (!splits || splits.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }));
  }

  const recipientIds = splits.map((s) => s.user_id);

  // 2. Fetch active FCM tokens for recipients
  const { data: tokens } = await supabase
    .from('device_tokens')
    .select('token, platform')
    .in('user_id', recipientIds);

  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }));
  }

  // 3. Construct cross-platform FCM HTTP v1 payload
  const fcmServiceAccount = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT_KEY')!);
  const accessToken = await getGoogleOAuthToken(fcmServiceAccount);

  const notifications = tokens.map((t) => ({
    message: {
      token: t.token,
      notification: {
        title: groupName ? `${groupName}: New Expense` : 'New Expense Added',
        body: title,
      },
      data: {
        expenseId,
        route: `/expenses/${expenseId}`,
      },
      android: {
        priority: 'high',
        notification: {
          channel_id: 'expenses_channel',
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            badge: 1,
            sound: 'default',
          },
        },
      },
    },
  }));

  // Send batch requests to https://fcm.googleapis.com/v1/projects/{projectId}/messages:send
  // ...
  return new Response(JSON.stringify({ success: true, count: tokens.length }));
});

async function getGoogleOAuthToken(serviceAccount: any): Promise<string> {
  // OAuth2 JWT exchange logic with Google Identity
  return 'access-token';
}
```

---

### 4.3 Scheduled Local Notifications (`lib/notifications.ts`)
Used for recurring local settlement nudges (e.g. every Sunday evening) without requiring server cron jobs:

```typescript
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export async function scheduleWeeklySettlementReminder(dayOfWeek: number = 0, hour: number = 20): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const { display } = await LocalNotifications.requestPermissions();
  if (display !== 'granted') return;

  // Cancel prior scheduled reminders
  await LocalNotifications.cancel({ notifications: [{ id: 101 }] });

  // Schedule weekly reminder
  await LocalNotifications.schedule({
    notifications: [
      {
        id: 101,
        title: 'Weekly Settle Up',
        body: 'Check your group balances and settle outstanding debts.',
        schedule: {
          on: {
            weekday: dayOfWeek, // 0 = Sunday
            hour,
            minute: 0,
          },
          repeats: true,
        },
        sound: 'beep.wav',
        extra: {
          route: '/settle',
        },
      },
    ],
  });
}
```

---

## 5. Architectural Implementation Checklist for Agent

To build this exact system, execute in the following sequence:

1. **Capacitor & WebView Setup**:
   - [ ] Set `output: 'export'` and `images: { unoptimized: true }` in `next.config.js`.
   - [ ] Configure `server.androidScheme: 'https'` and `server.iosScheme: 'ionic'` in `capacitor.config.ts`.
   - [ ] Add CSS safe area variables (`--sat`, `--sab`) in `app/globals.css`.
   - [ ] Implement hardware back button hook in `app/layout.tsx` using `@capacitor/app`.

2. **Offline-First Layer**:
   - [ ] Implement `lib/storage.ts` with `localStorage` helpers and an offline mutation queue (`MutationRecord[]`).
   - [ ] Ensure all entity mutations use client-generated `crypto.randomUUID()`.
   - [ ] Ensure UI updates occur immediately prior to network calls.

3. **Background Sync Engine**:
   - [ ] Implement `processOfflineQueue()` in `lib/sync.ts` with idempotent Supabase upserts (`onConflict: 'id'`).
   - [ ] Implement `pullRemoteChanges()` with Last-Write-Wins merge logic (`updated_at`).
   - [ ] Hook `window.addEventListener('online')` and `App.addListener('appStateChange')` in `app/layout.tsx`.
   - [ ] Implement foreground WebSockets in `lib/realtime.ts` with auto-reconnection.

4. **Notification System**:
   - [ ] Create `device_tokens` table in Supabase PostgreSQL (`user_id`, `token`, `platform`).
   - [ ] Implement FCM token registration and listener in `lib/push.ts`.
   - [ ] Create Supabase Edge Function to deliver push notifications via FCM HTTP v1 API.
   - [ ] Implement on-device scheduled reminders in `lib/notifications.ts` via `@capacitor/local-notifications`.
