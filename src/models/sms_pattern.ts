/**
 * sms_pattern.ts
 *
 * Value object representing a single SMS regex pattern entry.
 *
 * Used by:
 *   - sms-config.service.ts  — loads, caches, and persists patterns
 *   - pattern-parser.ts      — matches incoming SMS against regex
 *
 * Mirrors: app/lib/models/sms_pattern.dart
 */

// ─── Type ─────────────────────────────────────────────────────────────────────

export type SmsPattern = {
  /** Identifies the bank this pattern belongs to. e.g. 1, 2, 3 */
  bankId: number;
  /** SMS sender ID string. e.g. "CBE", "telebirr" */
  senderId: string;
  /** Regex string used to match the SMS body */
  regex: string;
  /** Transaction direction: "CREDIT" or "DEBIT" */
  type: string;
  /** Human-readable label for debugging. e.g. "CBE Debit with Service Charge" */
  description: string;
  /** Whether a transaction reference number is required to match */
  refRequired?: boolean | null;
  /** Whether the pattern expects an account number in the SMS */
  hasAccount?: boolean | null;
};

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Constructs an SmsPattern from a raw JSON object.
 * Applies safe defaults for optional fields.
 *
 * Mirrors: `SmsPattern.fromJson()`
 *
 * Used by sms-config.service.ts when parsing patterns from:
 *   - the remote endpoint
 *   - the bundled sms_patterns.json asset
 *   - the MMKV cache (via setArrayAsync/getArrayAsync)
 */
export function parseSmsPattern(json: Record<string, unknown>): SmsPattern {
  return {
    bankId: json["bankId"] as number,
    senderId: json["senderId"] as string,
    regex: json["regex"] as string,
    type: json["type"] as string,
    description: (json["description"] as string) ?? "",
    refRequired:
      json["refRequired"] == null ? null : (json["refRequired"] as boolean),
    hasAccount:
      json["hasAccount"] == null ? null : (json["hasAccount"] as boolean),
  };
}

// ─── Serializer ───────────────────────────────────────────────────────────────

/**
 * Serializes an SmsPattern back to a plain object.
 * Used when writing to MMKV or sending over the wire.
 *
 * Mirrors: `SmsPattern.toJson()`
 */
export function smsPatternToJson(pattern: SmsPattern): Record<string, unknown> {
  return {
    bankId: pattern.bankId,
    senderId: pattern.senderId,
    regex: pattern.regex,
    type: pattern.type,
    description: pattern.description,
    refRequired: pattern.refRequired,
    hasAccount: pattern.hasAccount,
  };
}
