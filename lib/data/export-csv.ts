import type { Group, Expense, Member, Settlement } from './types';
import { isNativePlatform } from '../native/platform';

/**
 * Escapes a CSV cell according to RFC 4180 rules.
 */
function escapeCsvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formats minor units (cents/paisa) into major decimal units (e.g. 1250 -> "12.50").
 */
function formatAmountDecimal(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

/**
 * Generates an RFC 4180-compliant CSV string representing the complete group ledger.
 */
export function generateGroupCsv(
  group: Group,
  expenses: Expense[],
  members: Member[],
  settlements: Settlement[] = []
): string {
  const memberMap = new Map<string, string>();
  for (const m of members) {
    memberMap.set(m.id, m.displayName);
  }

  const rows: string[][] = [];

  // Header
  rows.push([
    'Date',
    'Type',
    'Description',
    'Category',
    'Amount',
    'Currency',
    'Paid By',
    'Split Breakdown',
    'Notes',
    'Status',
  ]);

  // Sort expenses by date descending
  const sortedExpenses = [...expenses].sort((a, b) => {
    const da = a.expenseDate || a.createdAt || '';
    const db = b.expenseDate || b.createdAt || '';
    return db.localeCompare(da);
  });

  for (const exp of sortedExpenses) {
    // Who paid
    const payingSplits = (exp.splits || []).filter((s) => s.paidMinor > 0);
    const payersStr = payingSplits
      .map((s) => `${memberMap.get(s.memberId) || 'Unknown'} (${formatAmountDecimal(s.paidMinor)})`)
      .join('; ');

    // Who owes
    const owingSplits = (exp.splits || []).filter((s) => s.owedMinor > 0);
    const owedStr = owingSplits
      .map((s) => `${memberMap.get(s.memberId) || 'Unknown'}: ${formatAmountDecimal(s.owedMinor)}`)
      .join('; ');

    rows.push([
      exp.expenseDate || exp.createdAt?.split('T')[0] || '',
      'Expense',
      exp.title,
      exp.category || 'General',
      formatAmountDecimal(exp.amountMinor),
      exp.currency,
      payersStr,
      owedStr,
      exp.notes || '',
      exp.deletedAt ? 'Deleted' : 'Active',
    ]);
  }

  // Settlements
  const sortedSettlements = [...settlements].sort((a, b) => {
    const da = a.settledOn || a.createdAt || '';
    const db = b.settledOn || b.createdAt || '';
    return db.localeCompare(da);
  });

  for (const st of sortedSettlements) {
    const fromName = memberMap.get(st.fromMemberId) || 'Unknown';
    const toName = memberMap.get(st.toMemberId) || 'Unknown';

    rows.push([
      st.settledOn || st.createdAt?.split('T')[0] || '',
      'Settlement',
      `${fromName} paid ${toName}`,
      'Settlement',
      formatAmountDecimal(st.amountMinor),
      group.currency,
      fromName,
      `To: ${toName}`,
      st.note || '',
      st.deletedAt ? 'Deleted' : 'Completed',
    ]);
  }

  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

/**
 * Downloads or shares the CSV file natively or via web download.
 */
export async function exportAndShareGroupCsv(
  group: Group,
  expenses: Expense[],
  members: Member[],
  settlements: Settlement[] = []
): Promise<void> {
  const csvContent = generateGroupCsv(group, expenses, members, settlements);
  const safeGroupName = group.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${safeGroupName}_ledger_${new Date().toISOString().split('T')[0]}.csv`;

  if (isNativePlatform()) {
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');

      // Write file locally in Cache directory
      const writeResult = await Filesystem.writeFile({
        path: filename,
        data: csvContent,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });

      // Share using native share sheet
      await Share.share({
        title: `${group.name} Ledger Export`,
        text: `Exported ledger for ${group.name}`,
        url: writeResult.uri,
        dialogTitle: `Share ${filename}`,
      });
      return;
    } catch {
      // Fallback to web download if native share fails
    }
  }

  // Web fallback: trigger client-side file download
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
