/**
 * Bank Sender Matcher Utilities
 * 
 
 */

import { Bank } from "../models/bank";

// ============================================================================
// Method 1: normalizeBankSenderToken (lines 3–5)
// ============================================================================
export function normalizeBankSenderToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ============================================================================
// Internal Match Scoring Data & Helper (functional replacement of lines 57–84)
// ============================================================================
interface BankSenderMatch {
  readonly bank: Bank;
  readonly codeLength: number;
  readonly isExact: boolean;
  readonly startsAtBeginning: boolean;
  readonly unmatchedLength: number;
}

function isMatchBetterThan(
  candidate: BankSenderMatch,
  other?: BankSenderMatch | null,
): boolean {
  if (other == null) return true;
  if (candidate.isExact !== other.isExact) return candidate.isExact;
  if (candidate.codeLength !== other.codeLength) {
    return candidate.codeLength > other.codeLength;
  }
  if (candidate.startsAtBeginning !== other.startsAtBeginning) {
    return candidate.startsAtBeginning;
  }
  if (candidate.unmatchedLength !== other.unmatchedLength) {
    return candidate.unmatchedLength < other.unmatchedLength;
  }
  return false;
}

// ============================================================================
// Method 2: findBestBankForSenderAddress (lines 7–33)
// ============================================================================
export function findBestBankForSenderAddress(
  originatingAddress: string,
  banks: Iterable<Bank>,
): Bank | null {
  const normalizedAddress =
    originatingAddress == null
      ? ""
      : normalizeBankSenderToken(originatingAddress);
  if (normalizedAddress.length === 0) return null;

  let bestMatch: BankSenderMatch = "" as any;
  for (const bank of banks) {
    for (const code of bank.codes) {
      const normalizedCode = normalizeBankSenderToken(code);
      if (normalizedCode.length === 0) continue;

      const matchIndex = normalizedAddress.indexOf(normalizedCode);
      if (matchIndex < 0) continue;

      const match: BankSenderMatch = {
        bank: bank,
        codeLength: normalizedCode.length,
        isExact: normalizedAddress === normalizedCode,
        startsAtBeginning: matchIndex === 0,
        unmatchedLength: normalizedAddress.length - normalizedCode.length,
      };

      if (isMatchBetterThan(match, bestMatch)) {
        bestMatch = match;
      }
    }
  }

  return bestMatch?.bank;
}

// ============================================================================
// Method 3: senderAddressMatchesBank (lines 35–55)
// ============================================================================
export function senderAddressMatchesBank(
  bank: Bank,
  originatingAddress: string,
  { allBanks }: { allBanks?: Iterable<Bank> } = {},
): boolean {
  if (allBanks != null) {
    const bestMatch = findBestBankForSenderAddress(
      originatingAddress,
      allBanks,
    );
    if (bestMatch != null) return bestMatch.id === bank.id;
  }

  const normalizedAddress =
    originatingAddress == null
      ? ""
      : normalizeBankSenderToken(originatingAddress);
  if (normalizedAddress.length === 0) return false;

  for (const code of bank.codes) {
    const normalizedCode = normalizeBankSenderToken(code);
    if (normalizedCode.length === 0) continue;
    if (normalizedAddress.includes(normalizedCode)) return true;
  }
  return false;
}
