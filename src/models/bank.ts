/**
 * Bank Domain Entity & Functional Utilities
 * Modern Functional TypeScript (No classes, Hermes engine friendly)
 */

export interface Bank {
  id: number;
  name: string;
  shortName: string;
  codes: string[];
  image: string;
  maskPattern: number | null;
  uniformMasking: boolean | null;
  simBased: boolean | null;
  colors: string[] | null;
}

export interface CreateBankParams {
  id: number;
  name: string;
  shortName: string;
  codes?: string[] | null;
  image: string;
  maskPattern?: number | null;
  uniformMasking?: boolean | null;
  simBased?: boolean | null;
  colors?: readonly string[] | null;
}

// ============================================================================
// Factory / Smart Constructor
// ============================================================================

/**
 * Creates an immutable Bank entity.
 */
export function createBank(params: CreateBankParams): Bank {
  return {
    id: params.id,
    name: params.name,
    shortName: params.shortName,
    codes: params.codes ? [...params.codes] : [],
    image: params.image,
    maskPattern: params.maskPattern ?? null,
    uniformMasking: params.uniformMasking ?? null,
    simBased: params.simBased ?? null,
    colors:
      params.colors && params.colors.length > 0 ? [...params.colors] : null,
  };
}

// ============================================================================
// Parsing & Serialization
// ============================================================================

/**
 * Parses raw JSON or database records into a typed Bank record.
 * Replaces Dart's Bank.fromJson()
 */
export function parseBank(json: Record<string, any>): Bank {
  const toInt = (val: unknown): number => {
    if (typeof val === "number") return Math.trunc(val);
    if (typeof val === "string") {
      const parsed = parseInt(val.trim(), 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  const toIntOrNull = (val: unknown): number | null => {
    if (val == null) return null;
    if (typeof val === "number") return Math.trunc(val);
    if (typeof val === "string") {
      const parsed = parseInt(val.trim(), 10);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  };

  const toBoolOrNull = (val: unknown): boolean | null => {
    if (typeof val === "boolean") return val;
    if (typeof val === "string") {
      const lower = val.trim().toLowerCase();
      if (lower === "true" || lower === "1") return true;
      if (lower === "false" || lower === "0") return false;
    }
    if (typeof val === "number") return val === 1;
    return null;
  };

  const toStringList = (val: unknown): string[] => {
    if (!Array.isArray(val)) return [];
    return val
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  };

  const rawColors = toStringList(json.colors);

  return createBank({
    id: toInt(json.id),
    name: json.name != null ? String(json.name) : "",
    shortName: json.shortName != null ? String(json.shortName) : "",
    codes: toStringList(json.codes),
    image: json.image != null ? String(json.image) : "",
    maskPattern: toIntOrNull(json.maskPattern),
    uniformMasking: toBoolOrNull(json.uniformMasking),
    simBased: toBoolOrNull(json.simBased),
    colors: rawColors.length > 0 ? rawColors : null,
  });
}

/**
 * Serializes a Bank record into a JSON object for storage or transmission.
 * Replaces Dart's bank.toJson()
 */
export function serializeBank(bank: Bank): Record<string, unknown> {
  return {
    id: bank.id,
    name: bank.name,
    shortName: bank.shortName,
    codes: Array.from(bank.codes),
    image: bank.image,
    maskPattern: bank.maskPattern,
    uniformMasking: bank.uniformMasking,
    simBased: bank.simBased,
    colors: bank.colors ? Array.from(bank.colors) : null,
  };
}

// ============================================================================
// Domain Utilities
// ============================================================================

/**
 * Checks if this bank matches an SMS sender address or USSD code (case-insensitive).
 */
// export function matchesBankCode(bank: Bank, code: string): boolean {
//   if (!code) return false;
//   const normalized = code.trim().toLowerCase();
//   return (
//     bank.shortName.toLowerCase() === normalized ||
//     bank.codes.some((c) => c.toLowerCase() === normalized)
//   );
// }

// /**
//  * Returns the primary brand color for the bank, with a fallback color.
//  */
// export function getPrimaryBankColor(
//   bank: Bank,
//   fallback: string = "#2563EB",
// ): string {
//   if (bank.colors && bank.colors.length > 0) {
//     return bank.colors[0];
//   }
//   return fallback;
// }

// /**
//  * Checks if the bank is a SIM-based mobile wallet (e.g. Telebirr, M-Pesa).
//  */
// export function isSimBasedBank(bank: Bank): boolean {
//   return Boolean(bank.simBased);
// }
