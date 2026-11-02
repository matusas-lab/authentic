import { SmsPattern } from "@/models/sms_pattern";
import { Transaction } from "@/models/transaction";

export interface ExtractTransactionLinkProps {
  readonly messageBody: string;
  readonly pattern: SmsPattern;
  readonly reference?: string | null;
}

export interface InferTransactionLinkProps {
  readonly bankId?: number | null;
  readonly reference?: string | null;
}

// Regex matching HTTP/HTTPS URLs within text
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

// Trailing punctuation characters commonly attached at the end of sentences in SMS
const TRAILING_PUNCTUATION_REGEX = /[\].,;:)\s]+$/;

/**
 * Natively trims whitespace and returns null if the string is empty.
 */
export function normalizeReference(reference?: string | null): string | null {
  const trimmed = reference?.trim();
  return trimmed || null;
}

/**
 * Natively validates and normalizes an HTTP/HTTPS URL using standard WHATWG URL APIs.
 */
export function normalizeHttpUrl(rawUrl?: string | null): string | null {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return null;

  const cleaned = trimmed.replace(TRAILING_PUNCTUATION_REGEX, "");

  // Native WHATWG URL validation method (returns boolean without throwing)
  if (!URL.canParse(cleaned)) {
    return null;
  }

  const url = new URL(cleaned);

  // Native protocol check (native WHATWG protocol is always lowercase and ends with ':')
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  return url.href;
}

/**
 * Evaluates whether the SMS message body or pattern description contains receipt markers.
 */
function looksLikeReceiptMessage(
  messageBody: string,
  pattern: SmsPattern,
): boolean {
  const normalized =
    `${pattern.description ?? ""} ${pattern.regex} ${messageBody}`.toLowerCase();
  return (
    normalized.includes("receipt") ||
    normalized.includes("branchreceipt") ||
    normalized.includes("?trx=") ||
    normalized.includes("?id=") ||
    normalized.includes("share.zemenbank.com/rt/")
  );
}

/**
 * Synthesizes known receipt URLs for specific banks based on bankId and reference ID.
 */
export function inferTransactionLink({
  bankId,
  reference,
}: InferTransactionLinkProps): string | null {
  const normalizedRef = normalizeReference(reference);
  if (!normalizedRef || bankId == null) {
    return null;
  }

  switch (bankId) {
    case 1:
      // Commercial Bank of Ethiopia (CBE)
      return `https://apps.cbe.come.et:100/?id=${encodeURIComponent(normalizedRef)}`;
    case 5:
      // Zemen Bank
      return `https://share.zemenbank.com/rt/${encodeURIComponent(normalizedRef)}/pdf`;
    default:
      return null;
  }
}

/**
 * Extracts a sanitized transaction receipt URL from an SMS message body,
 * or falls back to inferring the URL from known bank patterns.
 */
export function extractTransactionLinkFromMessage({
  messageBody,
  pattern,
  reference,
}: ExtractTransactionLinkProps): string | null {
  const normalizedRef = normalizeReference(reference)?.toLowerCase();

  const rawMatches = messageBody.match(URL_PATTERN) ?? [];
  const urls: string[] = [];

  for (const raw of rawMatches) {
    const normalized = normalizeHttpUrl(raw);
    if (normalized) {
      urls.push(normalized);
    }
  }

  if (urls.length > 0) {
    // 1. If any extracted URL contains the reference ID, prioritize it
    if (normalizedRef) {
      for (const url of urls) {
        if (url.toLowerCase().includes(normalizedRef)) {
          return url;
        }
      }
    }

    // 2. If exactly one URL is present or the message matches receipt indicators, pick the last URL
    if (urls.length === 1 || looksLikeReceiptMessage(messageBody, pattern)) {
      return urls[urls.length - 1];
    }
  }

  // 3. Fallback to inferring the transaction link from bank configuration
  return inferTransactionLink({
    bankId: pattern.bankId,
    reference,
  });
}

/**
 * Resolves a reference link for an existing transaction.
 * Uses the saved link if valid; otherwise reconstructs it dynamically.
 */
export function resolveReferenceLink(transaction: Transaction): string | null {
  const persistedLink = normalizeHttpUrl(transaction.transactionLink);
  if (persistedLink) {
    return persistedLink;
  }

  return inferTransactionLink({
    bankId: transaction.bankId,
    reference: transaction.reference,
  });
}
