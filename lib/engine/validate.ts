import { EngineError } from './errors';
import { MAX_AMOUNT_MINOR } from './money';
import type { Expense } from '../data/types';

export function validateExpense(expense: Expense): void {
  if (!expense) {
    throw new EngineError('VALIDATION_FAILED', 'Expense object required');
  }

  // Amount validation
  if (
    !Number.isInteger(expense.amountMinor) ||
    expense.amountMinor <= 0 ||
    expense.amountMinor > MAX_AMOUNT_MINOR
  ) {
    throw new EngineError(
      'EXPENSE_INVALID_AMOUNT',
      `Expense amount must be integer between 1 and ${MAX_AMOUNT_MINOR}, got: ${expense.amountMinor}`
    );
  }

  // Title validation
  if (!expense.title || expense.title.trim().length === 0 || expense.title.length > 120) {
    throw new EngineError('VALIDATION_FAILED', 'Expense title must be 1 to 120 characters');
  }

  // Currency validation
  if (!expense.currency || !/^[A-Z]{3}$/.test(expense.currency)) {
    throw new EngineError('EXPENSE_CURRENCY_MISMATCH', `Invalid currency format: ${expense.currency}`);
  }

  // Splits validation
  if (!expense.splits || expense.splits.length === 0) {
    throw new EngineError('EXPENSE_INVALID_SPLIT', 'Expense must have at least one split');
  }

  let totalPaid = 0;
  let totalOwed = 0;
  let payerCount = 0;
  let participantCount = 0;

  const seenMembers = new Set<string>();

  for (const split of expense.splits) {
    if (!split.memberId) {
      throw new EngineError('VALIDATION_FAILED', 'Split memberId is required');
    }

    if (seenMembers.has(split.memberId)) {
      throw new EngineError('EXPENSE_INVALID_SPLIT', `Duplicate member in splits: ${split.memberId}`);
    }
    seenMembers.add(split.memberId);

    if (!Number.isInteger(split.paidMinor) || split.paidMinor < 0) {
      throw new EngineError('EXPENSE_INVALID_SPLIT', `Invalid paidMinor: ${split.paidMinor}`);
    }
    if (!Number.isInteger(split.owedMinor) || split.owedMinor < 0) {
      throw new EngineError('EXPENSE_INVALID_SPLIT', `Invalid owedMinor: ${split.owedMinor}`);
    }

    if (split.paidMinor > 0) payerCount++;
    if (split.owedMinor > 0) participantCount++;

    totalPaid += split.paidMinor;
    totalOwed += split.owedMinor;
  }

  if (payerCount === 0) {
    throw new EngineError('EXPENSE_INVALID_SPLIT', 'Expense must have at least one payer with paidMinor > 0');
  }

  if (participantCount === 0) {
    throw new EngineError('EXPENSE_INVALID_SPLIT', 'Expense must have at least one participant with owedMinor > 0');
  }

  // Enforce Invariant I2: Sum(paid_minor) == amount_minor == Sum(owed_minor)
  if (totalPaid !== expense.amountMinor || totalOwed !== expense.amountMinor) {
    throw new EngineError(
      'EXPENSE_INVALID_SPLIT',
      `Invariant I2 violated: sum(paid)=${totalPaid}, sum(owed)=${totalOwed}, amount=${expense.amountMinor}`
    );
  }
}
