// lib/sync/notifications-fanout.ts
// Domain fanout, preference filtering and dead-token pruning utilities for push dispatch
// Specification Baseline: Technical Specification v1.0 Section 5.4, NFR-06, D-14 & T-2.6.1

export interface NotificationPrefRecord {
  user_id: string;
  group_id: string | null;
  expense_added: boolean;
  settlement_added: boolean;
  muted_until: string | null;
}

/**
 * Checks if an FCM HTTP v1 error indicates a dead / invalid device token that should be pruned.
 */
export function isDeadFcmError(status?: number, errorText?: string): boolean {
  if (status === 404) return true;
  if (!errorText) return false;
  const lower = errorText.toLowerCase();
  return (
    lower.includes('unregistered') ||
    lower.includes('registration-token-not-registered') ||
    lower.includes('invalid_argument') ||
    lower.includes('bad_registration')
  );
}

/**
 * Filters recipient user IDs based on their notification preferences and active muted_until status.
 */
export function filterRecipientsByPrefs(
  candidateUserIds: string[],
  prefsRows: NotificationPrefRecord[],
  eventType: 'expense_added' | 'settlement_added' | 'payment_reminder',
  nowIso = new Date().toISOString()
): string[] {
  const nowDate = new Date(nowIso);

  return candidateUserIds.filter((userId) => {
    const groupPref = prefsRows.find((p) => p.user_id === userId && p.group_id !== null);
    const globalPref = prefsRows.find((p) => p.user_id === userId && p.group_id === null);

    // 1. Check if muted either at group level or globally
    if (groupPref?.muted_until && new Date(groupPref.muted_until) > nowDate) {
      return false;
    }
    if (globalPref?.muted_until && new Date(globalPref.muted_until) > nowDate) {
      return false;
    }

    // 2. Check event preference (group level overrides global level)
    if (eventType === 'expense_added') {
      if (groupPref && groupPref.expense_added === false) return false;
      if (!groupPref && globalPref && globalPref.expense_added === false) return false;
    } else if (eventType === 'settlement_added') {
      if (groupPref && groupPref.settlement_added === false) return false;
      if (!groupPref && globalPref && globalPref.settlement_added === false) return false;
    }

    return true;
  });
}

/**
 * Formats FCM title, body and route for a new expense notification.
 */
export function formatExpenseNotification(
  groupName: string,
  expenseTitle: string,
  groupId: string,
  expenseId: string
): { title: string; body: string; route: string } {
  return {
    title: `${groupName}: New Expense`,
    body: expenseTitle || 'New expense added',
    route: `/group?id=${groupId}&expenseId=${expenseId}`,
  };
}

/**
 * Formats FCM title, body and route for a settlement notification.
 */
export function formatSettlementNotification(
  groupName: string,
  fromName: string,
  toName: string,
  amountFormatted: string,
  groupId: string
): { title: string; body: string; route: string } {
  return {
    title: `${groupName}: Settlement`,
    body: `${fromName} paid ${toName} ${amountFormatted}`.trim(),
    route: `/group?id=${groupId}`,
  };
}

/**
 * Formats FCM title, body and route for a friend payment reminder push notification.
 */
export function formatPaymentReminderNotification(
  senderName: string,
  recipientName: string,
  amountFormatted: string,
  customMessage?: string
): { title: string; body: string; route: string } {
  return {
    title: `Clearcut: Payment Reminder from ${senderName || 'a friend'}`,
    body:
      customMessage ||
      `Hey ${recipientName}! Friendly reminder to settle up ${amountFormatted} on Clearcut.`,
    route: '/friends',
  };
}

/**
 * Validates the secret header against the configured webhook secret.
 */
export function validateWebhookSecret(
  expectedSecret?: string,
  providedHeaderSecret?: string | null
): boolean {
  if (!expectedSecret) return true; // If not configured in dev, bypass
  return providedHeaderSecret === expectedSecret;
}
