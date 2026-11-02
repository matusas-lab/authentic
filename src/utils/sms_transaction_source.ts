/**
 * Represents the identity of an SMS that produced a transaction.
 *
 * Why this exists:
 * - Prevents the same SMS from creating duplicate transactions.
 * - Keeps track of the original SMS ID when Android provides one.
 * - Provides a fingerprint fallback when an SMS ID is unavailable.
 */

export interface SmsTransactionSource {
  sourceType: "sms";
  sourceMessageId?: string;
  sourceFingerprint?: string;
}

/**
 * Represents the minimum SMS data required to create a transaction source.
 *
 * Both realtime SMS and historical SMS should be normalized into this
 * shape before reaching the transaction layer.
 */
export interface SmsMessageForSource {
  id?: string | number;
  originatingAddress?: string;
  body?: string;
  timestamp?: number;
}

/**
 * Creates an SmsTransactionSource from a normalized SMS message.
 *
 * Main purpose:
 * - Extract the SMS ID.
 * - Generate a fingerprint from the bank, sender, and message body.
 *
 * This is useful when the same SMS can enter the app through different
 * ingestion paths, such as realtime and historical SMS reading.
 */
export function createSmsTransactionSource(
  message: SmsMessageForSource,
  bankId: number,
): SmsTransactionSource {
  return createSmsTransactionSourceFromParts({
    bankId,
    messageId: message.id,
    senderAddress: message.originatingAddress,
    body: message.body,
    dateMillis: message.timestamp,
  });
}

/**
 * Creates an SmsTransactionSource from individual SMS fields.
 *
 * Main purpose:
 * - Keep source creation independent from the SmsMessage object.
 * - Allows other parts of the application to create a source when they
 *   only have individual SMS fields.
 *
 * Note:
 * dateMillis is intentionally NOT used in the fingerprint.
 * Android's realtime broadcast timestamp and inbox timestamp can differ
 * even when they refer to the same SMS.
 */
export function createSmsTransactionSourceFromParts({
  bankId,
  messageId,
  senderAddress,
  body,
  dateMillis: _dateMillis,
}: {
  bankId: number;
  messageId?: string | number;
  senderAddress?: string;
  body?: string;
  dateMillis?: number;
}): SmsTransactionSource {
  return {
    sourceType: "sms",

    // Use the Android SMS ID when available.
    sourceMessageId:
      messageId !== undefined && messageId !== null
        ? String(messageId)
        : undefined,

    // Generate a fallback identity from the SMS contents.
    sourceFingerprint: buildSmsFingerprint({
      bankId,
      senderAddress,
      body,
    }),
  };
}

/**
 * Determines whether an SMS source has enough information to identify
 * the original SMS.
 *
 * Main purpose:
 * - A source is considered identifiable if either the Android SMS ID
 *   or the generated fingerprint exists.
 */
export function hasSmsSourceIdentity(source: SmsTransactionSource): boolean {
  return hasText(source.sourceMessageId) || hasText(source.sourceFingerprint);
}

/**
 * Converts an SmsTransactionSource into a JSON-safe object.
 *
 * Main purpose:
 * - Prepare the source for local persistence or sending to Supabase/API.
 * - Avoid storing empty identity fields.
 */
export function smsTransactionSourceToJson(
  source: SmsTransactionSource,
): Record<string, unknown> {
  const json: Record<string, unknown> = {};

  if (hasSmsSourceIdentity(source)) {
    json.sourceType = source.sourceType;
  }

  if (hasText(source.sourceMessageId)) {
    json.sourceMessageId = source.sourceMessageId;
  }

  if (hasText(source.sourceFingerprint)) {
    json.sourceFingerprint = source.sourceFingerprint;
  }

  return json;
}

/**
 * Builds a deterministic fingerprint for an SMS.
 *
 * Main purpose:
 * - Provides a stable identity when the Android SMS ID is unavailable.
 * - Allows realtime and historical versions of the same SMS to resolve
 *   to the same fingerprint.
 *
 * The timestamp is intentionally excluded because Android can report
 * different timestamps for the same SMS depending on the source.
 */
function buildSmsFingerprint({
  bankId,
  senderAddress,
  body,
}: {
  bankId: number;
  senderAddress?: string;
  body?: string;
}): string | undefined {
  // Normalize sender so "CBE", "cbe", and " CBE " become equivalent.
  const sender = senderAddress?.trim().toLowerCase();

  // Normalize whitespace in the SMS body.
  const normalizedBody = body?.trim().replace(/\s+/g, " ");

  // We cannot create a useful fingerprint without both sender and body.
  if (!hasText(sender) || !hasText(normalizedBody)) {
    return undefined;
  }

  // Include a version ("v2") so the fingerprint format can be changed
  // safely in the future without confusing old and new fingerprints.
  const fingerprintInput = `sms|v2|${bankId}|${sender}|${normalizedBody}`;

  return fnv1a64(fingerprintInput);
}

/**
 * Generates a 64-bit FNV-1a hash.
 *
 * Main purpose:
 * - Convert the normalized SMS identity string into a short,
 *   deterministic fingerprint.
 *
 * BigInt is used because JavaScript's Number type cannot safely represent
 * arbitrary 64-bit integers.
 */
function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;

  const prime = 0x100000001b3n;

  // Keep only the lower 64 bits after each multiplication.
  const mask = 0xffffffffffffffffn;

  const bytes = new TextEncoder().encode(value);

  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, "0");
}

/**
 * Checks whether a string contains meaningful text.
 *
 * Main purpose:
 * - Centralizes the null/empty/whitespace check used throughout
 *   this utility.
 */
function hasText(value?: string): boolean {
  return value !== undefined && value.trim().length > 0;
}
