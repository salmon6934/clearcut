import { describe, it, expect } from 'vitest';
import { generateGroupCsv } from '../../lib/data/export-csv';
import type { Group, Expense, Member, Settlement } from '../../lib/data/types';

describe('CSV Ledger Export (T-2.10.1)', () => {
  const mockGroup: Group = {
    id: 'grp-1',
    name: 'Goa Trip "2026"',
    currency: 'INR',
    type: 'trip',
    inviteCode: 'ABC123',
    createdBy: 'usr-1',
    version: 1,
  };

  const mockMembers: Member[] = [
    { id: 'm-1', groupId: 'grp-1', userId: 'usr-1', displayName: 'Alice', role: 'owner' },
    { id: 'm-2', groupId: 'grp-1', userId: 'usr-2', displayName: 'Bob "The Builder"', role: 'member' },
    { id: 'm-3', groupId: 'grp-1', userId: null, displayName: 'Charlie, The Guest', role: 'member' },
  ];

  const mockExpenses: Expense[] = [
    {
      id: 'exp-1',
      groupId: 'grp-1',
      title: 'Dinner at Beach Shack, Goa',
      notes: 'Includes drinks & tip\nLine 2 notes',
      amountMinor: 300050, // 3000.50 INR
      currency: 'INR',
      category: 'food',
      expenseDate: '2026-10-10',
      splitType: 'equal',
      splits: [
        { memberId: 'm-1', paidMinor: 300050, owedMinor: 100017 },
        { memberId: 'm-2', paidMinor: 0, owedMinor: 100017 },
        { memberId: 'm-3', paidMinor: 0, owedMinor: 100016 },
      ],
      createdBy: 'm-1',
      version: 1,
    },
  ];

  const mockSettlements: Settlement[] = [
    {
      id: 'set-1',
      groupId: 'grp-1',
      fromMemberId: 'm-2',
      toMemberId: 'm-1',
      amountMinor: 100017,
      settledOn: '2026-10-11',
      note: 'UPI Payment',
      createdBy: 'm-2',
    },
  ];

  it('generates an RFC 4180 compliant CSV header and rows', () => {
    const csv = generateGroupCsv(mockGroup, mockExpenses, mockMembers, mockSettlements);

    // Verify header line
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Date,Type,Description,Category,Amount,Currency,Paid By,Split Breakdown,Notes,Status');

    // Check expense line with correct decimal formatting
    expect(csv).toContain('3000.50');
    expect(csv).toContain('INR');
    expect(csv).toContain('Dinner at Beach Shack, Goa');
    expect(csv).toContain('Alice (3000.50)');
  });

  it('escapes quotes, commas, and multiline notes properly', () => {
    const csv = generateGroupCsv(mockGroup, mockExpenses, mockMembers, mockSettlements);

    // Charlie's name contains a comma and Bob's name has quotes, ensuring escaped output
    expect(csv).toContain('Charlie, The Guest: 1000.16');
    expect(csv).toContain('Bob ""The Builder""');

    // Notes contain commas and line breaks, so it should be surrounded by quotes
    expect(csv).toContain('"Includes drinks & tip\nLine 2 notes"');
  });

  it('includes settlements in ledger breakdown', () => {
    const csv = generateGroupCsv(mockGroup, mockExpenses, mockMembers, mockSettlements);

    expect(csv).toContain('Settlement');
    expect(csv).toContain('1000.17');
    expect(csv).toContain('UPI Payment');
  });
});
