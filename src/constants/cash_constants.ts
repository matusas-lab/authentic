/**
 * Cash Account Domain Constants & Reference Builders
 * Functional TypeScript (No classes, Hermes friendly)
 */

export const CASH_CONSTANTS = {
  BANK_ID: 100,
  BANK_NAME: "Cash",
  BANK_SHORT_NAME: "Cash",
  BANK_IMAGE: "assets/images/cash.png",
  BANK_COLORS: Object.freeze(["#0f766e", "#14b8a6"]) as readonly string[],
  DEFAULT_ACCOUNT_NUMBER: "CASH",
  DEFAULT_ACCOUNT_HOLDER_NAME: "Cash Wallet",
  ATM_REFERENCE_PREFIX: "cash_atm_",
  MANUAL_REFERENCE_PREFIX: "cash_manual_",
} as const;

/**
 * Builds a unique reference for cash withdrawals at an ATM.
 * e.g., "cash_atm_FT24010199"
 */
export function buildAtmReference(bankReference: string): string {
  return `${CASH_CONSTANTS.ATM_REFERENCE_PREFIX}${bankReference}`;
}

/**
 * Builds a unique reference for manual cash transactions using microsecond timestamp.
 */
export function buildManualReference(micros: number): string {
  return `${CASH_CONSTANTS.MANUAL_REFERENCE_PREFIX}${micros}`;
}
