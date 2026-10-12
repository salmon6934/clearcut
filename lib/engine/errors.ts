export type EngineErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID_CODE'
  | 'FORBIDDEN'
  | 'VALIDATION_FAILED'
  | 'INVITE_INVALID'
  | 'GROUP_NOT_FOUND'
  | 'EXPENSE_NOT_FOUND'
  | 'EXPENSE_INVALID_AMOUNT'
  | 'EXPENSE_INVALID_SPLIT'
  | 'EXPENSE_CURRENCY_MISMATCH'
  | 'EXPENSE_CONFLICT'
  | 'SETTLEMENT_INVALID'
  | 'MEMBER_NOT_IN_GROUP'
  | 'MEMBER_NOT_FOUND'
  | 'MEMBER_NAME_TAKEN'
  | 'MEMBER_HAS_BALANCE'
  | 'LAST_OWNER'
  | 'SOLE_OWNER'
  | 'RATE_LIMITED';

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  readonly details?: unknown;

  constructor(code: EngineErrorCode, message?: string, details?: unknown) {
    super(message ?? code);
    this.name = 'EngineError';
    this.code = code;
    this.details = details;
  }
}
