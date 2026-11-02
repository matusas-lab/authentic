/**
 * src/models/transaction_source_sms.ts
 *
 * Strict TypeScript translation of `TransactionSourceSms`.
 * Preserves Dart nullability semantics, constructor defaults, and serialization rules.
 *
 * Source: app/lib/models/transaction_source_sms.dart
 */

// ─── 1. Domain Model ─────────────────────────────────────────────────────────

/**
 * Domain entity representing an SMS message that sourced a transaction.
 *
 * Preserves Dart type semantics:
 * - Dart `String`  -> TypeScript `string` (required)
 * - Dart `String?` -> TypeScript `string | null` (not optional, not undefined)
 * - Dart `DateTime?` -> TypeScript `Date | null`
 */
export interface TransactionSourceSms {
  readonly transactionReference: string;
  readonly body: string;
  readonly senderAddress: string | null;
  readonly receivedAt: Date | null;
  readonly messageId: string | null;
}

// ─── 2. JSON Serialization Contract ──────────────────────────────────────────

/**
 * Serialized JSON shape matching Dart's `toJson()`.
 * Fields are conditionally omitted when null in the source entity.
 */
export type TransactionSourceSmsJson = {
  transactionReference: string;
  body: string;
  senderAddress?: string;
  receivedAt?: string;
  messageId?: string;
};

// ─── 3. Private Parsing & Normalization Helpers ──────────────────────────────

/**
 * Mirrors Dart `_normalizedText(dynamic value)`:
 * Converts value to string and trims it. Returns `null` if null or empty.
 */
function normalizedText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length === 0 ? null : normalized;
}

/**
 * Parses `receivedAt` string into a `Date` object.
 * Mirrors Dart `receivedAt == null || receivedAt.isEmpty ? null : DateTime.tryParse(receivedAt)`.
 */
function parseReceivedAt(value: unknown): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const str = String(value).trim();
  if (str.length === 0) {
    return null;
  }
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// ─── 4. Constructor / Factory Functions ──────────────────────────────────────

export interface CreateTransactionSourceSmsParams {
  transactionReference: string;
  body: string;
  senderAddress?: string | null;
  receivedAt?: Date | null;
  messageId?: string | null;
}

/**
 * Constructs an immutable `TransactionSourceSms` instance.
 * Mirrors Dart's `const TransactionSourceSms({ ... })` constructor.
 */
export function createTransactionSourceSms(
  params: CreateTransactionSourceSmsParams,
): TransactionSourceSms {
  return Object.freeze({
    transactionReference: params.transactionReference,
    body: params.body,
    senderAddress: params.senderAddress ?? null,
    receivedAt: params.receivedAt ?? null,
    messageId: params.messageId ?? null,
  });
}

/**
 * Parses a raw JSON/record into a `TransactionSourceSms` entity.
 *
 * Mirrors Dart:
 * ```dart
 * factory TransactionSourceSms.fromJson(Map<String, dynamic> json) {
 *   final receivedAt = json['receivedAt']?.toString().trim();
 *   return TransactionSourceSms(
 *     transactionReference: json['transactionReference']?.toString().trim() ?? '',
 *     body: json['body']?.toString() ?? '',
 *     senderAddress: _normalizedText(json['senderAddress']),
 *     receivedAt: receivedAt == null || receivedAt.isEmpty
 *         ? null
 *         : DateTime.tryParse(receivedAt),
 *     messageId: _normalizedText(json['messageId']),
 *   );
 * }
 * ```
 */
export function transactionSourceSmsFromJson(
  json: Record<string, unknown>,
): TransactionSourceSms {
  const rawRef = json["transactionReference"];
  const transactionReference =
    rawRef === null || rawRef === undefined ? "" : String(rawRef).trim();

  const rawBody = json["body"];
  const body = rawBody === null || rawBody === undefined ? "" : String(rawBody);

  return Object.freeze({
    transactionReference,
    body,
    senderAddress: normalizedText(json["senderAddress"]),
    receivedAt: parseReceivedAt(json["receivedAt"]),
    messageId: normalizedText(json["messageId"]),
  });
}

// ─── 5. Serializers ──────────────────────────────────────────────────────────

/**
 * Serializes `TransactionSourceSms` into a JSON-compatible object.
 * Strictly preserves Dart's conditional key omission for null values.
 *
 * Mirrors Dart:
 * ```dart
 * Map<String, dynamic> toJson() => {
 *   'transactionReference': transactionReference,
 *   'body': body,
 *   if (senderAddress != null) 'senderAddress': senderAddress,
 *   if (receivedAt != null) 'receivedAt': receivedAt!.toIso8601String(),
 *   if (messageId != null) 'messageId': messageId,
 * };
 * ```
 */
export function transactionSourceSmsToJson(
  source: TransactionSourceSms,
): TransactionSourceSmsJson {
  return {
    transactionReference: source.transactionReference,
    body: source.body,
    ...(source.senderAddress !== null && { senderAddress: source.senderAddress }),
    ...(source.receivedAt !== null && { receivedAt: source.receivedAt.toISOString() }),
    ...(source.messageId !== null && { messageId: source.messageId }),
  };
}

/**
 * Serializes for database persistence.
 *
 * Per Rule 9.2: Dart's `toDb()` delegates directly to `toJson()`, so the TypeScript
 * equivalent delegates to `transactionSourceSmsToJson` without inventing ad-hoc schema mappings.
 *
 * Mirrors Dart:
 * ```dart
 * Map<String, dynamic> toDb() => toJson();
 * ```
 */
export function transactionSourceSmsToDb(
  source: TransactionSourceSms,
): TransactionSourceSmsJson {
  return transactionSourceSmsToJson(source);
}
