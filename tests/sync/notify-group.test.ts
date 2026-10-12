import { describe, it, expect } from 'vitest';
import {
  isDeadFcmError,
  filterRecipientsByPrefs,
  formatExpenseNotification,
  formatSettlementNotification,
  validateWebhookSecret,
  NotificationPrefRecord,
} from '../../lib/sync/notifications-fanout';

describe('T-2.6.1: Edge Function notify-group & Fanout Logic', () => {
  describe('Dead Token Detection (pruning)', () => {
    it('identifies HTTP 404 as dead token', () => {
      expect(isDeadFcmError(404)).toBe(true);
    });

    it('identifies UNREGISTERED error as dead token', () => {
      expect(isDeadFcmError(200, 'Requested entity was not found: UNREGISTERED')).toBe(true);
      expect(isDeadFcmError(400, 'registration-token-not-registered')).toBe(true);
      expect(isDeadFcmError(400, 'The registration token is not a valid FCM registration token: INVALID_ARGUMENT')).toBe(true);
    });

    it('does not classify temporary server errors as dead tokens', () => {
      expect(isDeadFcmError(500, 'Internal server error')).toBe(false);
      expect(isDeadFcmError(503, 'Server Unavailable')).toBe(false);
      expect(isDeadFcmError(429, 'Quota exceeded')).toBe(false);
    });
  });

  describe('Webhook Secret Authentication', () => {
    it('accepts matching secret', () => {
      expect(validateWebhookSecret('secret-123', 'secret-123')).toBe(true);
    });

    it('rejects mismatching or missing secret', () => {
      expect(validateWebhookSecret('secret-123', 'wrong-secret')).toBe(false);
      expect(validateWebhookSecret('secret-123', null)).toBe(false);
    });

    it('bypasses when expected secret is empty/undefined', () => {
      expect(validateWebhookSecret(undefined, null)).toBe(true);
    });
  });

  describe('Notification Preferences & Muting Filter', () => {
    const candidateUsers = ['user-1', 'user-2', 'user-3', 'user-4'];
    const nowIso = '2026-10-12T12:00:00Z';

    const prefs: NotificationPrefRecord[] = [
      // user-1: muted until tomorrow globally
      {
        user_id: 'user-1',
        group_id: null,
        expense_added: true,
        settlement_added: true,
        muted_until: '2026-10-13T12:00:00Z',
      },
      // user-2: disabled expense notifications in this group
      {
        user_id: 'user-2',
        group_id: 'group-100',
        expense_added: false,
        settlement_added: true,
        muted_until: null,
      },
      // user-3: past mute date (should be eligible)
      {
        user_id: 'user-3',
        group_id: null,
        expense_added: true,
        settlement_added: true,
        muted_until: '2026-10-11T12:00:00Z',
      },
      // user-4: has no prefs row, default active
    ];

    it('filters out muted users and users with expense_added: false', () => {
      const eligible = filterRecipientsByPrefs(
        candidateUsers,
        prefs,
        'expense_added',
        nowIso
      );

      // user-1 is muted; user-2 disabled expense_added; user-3 and user-4 are eligible
      expect(eligible).toEqual(['user-3', 'user-4']);
    });

    it('allows user-2 for settlement_added because only expense_added was disabled', () => {
      const eligible = filterRecipientsByPrefs(
        candidateUsers,
        prefs,
        'settlement_added',
        nowIso
      );

      // user-1 is muted; user-2 has settlement_added: true; user-3 and user-4 eligible
      expect(eligible).toEqual(['user-2', 'user-3', 'user-4']);
    });
  });

  describe('Payload Formatting', () => {
    it('formats expense notification correctly with group name and route', () => {
      const payload = formatExpenseNotification('Goa Trip', 'Dinner at Fisherman Wharf', 'grp-1', 'exp-42');
      expect(payload.title).toBe('Goa Trip: New Expense');
      expect(payload.body).toBe('Dinner at Fisherman Wharf');
      expect(payload.route).toBe('/group?id=grp-1&expenseId=exp-42');
    });

    it('formats settlement notification correctly', () => {
      const payload = formatSettlementNotification('Flatmates', 'Alice', 'Bob', '₹1,500.00', 'grp-2');
      expect(payload.title).toBe('Flatmates: Settlement');
      expect(payload.body).toBe('Alice paid Bob ₹1,500.00');
      expect(payload.route).toBe('/group?id=grp-2');
    });
  });
});
