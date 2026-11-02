/**
 * transaction-duplicate-detector.ts
 *
 * Pure duplicate detection utilities for SMS-parsed transactions.
 *
 * Responsibilities:
 *   - Real-time duplicate check (hasExactAmountAndBalanceDuplicate)
 *   - Dashen Bank account suffix building for dedup (buildDashenDeduplicationSuffixes)
 *   - Batch dedup planning with keeper selection and field merging
 *     (buildExactAmountAndBalanceDeduplicationPlans)
 *
 * Zero side effects — all functions are pure (no storage reads/writes).
 *
 * Mirrors: app/lib/utils/transaction_duplicate_detector.dart
 */

import { Transaction } from "../models/transaction";

// ─── Constants ────────────────────────────────────────────────────────────────

export const DASHEN_CANONICAL_MASK_PATTERN = 3;
export const DASHEN_LEGACY_MASK_PATTERN = 4;
export const DASHEN_DEDUPLICATION_WINDOW_MS = 10 * 60 * 60 * 1000; // 10 hours

// ─── Types ────────────────────────────────────────────────────────────────────

export type TransactionDeduplicationPlan = {
  /** The transaction to keep */
  keeper: Transaction;
  /** The keeper with fields merged from duplicates */
  mergedKeeper: Transaction;
  /** Transactions to delete */
  duplicates: Transaction[];
  /** Convenience: reference strings of duplicates */
  duplicateReferences: string[];
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if an existing transaction already matches the given
 * amount + balance + (optionally) account number for the same bank and type.
 *
 * Used for real-time Dashen duplicate detection during SMS parsing.
 *
 * Mirrors: `hasExactAmountAndBalanceDuplicate()`
 */
export function hasExactAmountAndBalanceDuplicate(params: {
  bankId: number;
  type: string;
  amount: number;
  currentBalance: string | null | undefined;
  accountNumber: string | null | undefined;
  existingTransactions: Transaction[];
}): boolean {
  const {
    bankId,
    type,
    amount,
    currentBalance,
    accountNumber,
    existingTransactions,
  } = params;

  const normalizedType = type.trim().toUpperCase();
  const normalizedAccount = _normalizeAccount(accountNumber);
  const normalizedBalance = _parseBalance(currentBalance);
  if (normalizedBalance === null) return false;

  for (const transaction of existingTransactions) {
    if (transaction.bankId !== bankId) continue;
    if ((transaction.type ?? "").trim().toUpperCase() !== normalizedType)
      continue;
    if (Math.abs(transaction.amount - amount) > 0.0001) continue;

    const existingBalance = _parseBalance(transaction.currentBalance);
    if (
      existingBalance === null ||
      Math.abs(existingBalance - normalizedBalance) > 0.0001
    ) {
      continue;
    }

    // No account to match — amount + balance match is sufficient
    if (normalizedAccount === null) return true;

    if (_normalizeAccount(transaction.accountNumber) === normalizedAccount) {
      return true;
    }
  }

  return false;
}

/**
 * Builds the set of account suffixes used to match Dashen transactions
 * across canonical (3-digit) and legacy (4-digit) mask patterns.
 *
 * Mirrors: `buildDashenDeduplicationSuffixes()`
 */
export function buildDashenDeduplicationSuffixes(params: {
  accountNumbers: Iterable<string>;
  transactionAccountNumbers?: Iterable<string | null | undefined>;
}): Set<string> {
  const { accountNumbers, transactionAccountNumbers = [] } = params;

  const normalizedAccounts = [...accountNumbers]
    .map(_normalizeAccount)
    .filter((a): a is string => a !== null);

  const suffixes = new Set<string>();

  if (normalizedAccounts.length > 0) {
    // Count how many accounts share the same canonical suffix
    const canonicalCounts = new Map<string, number>();
    for (const account of normalizedAccounts) {
      const canonicalSuffix = _accountSuffix(
        account,
        DASHEN_CANONICAL_MASK_PATTERN,
      );
      if (canonicalSuffix === null) continue;
      canonicalCounts.set(
        canonicalSuffix,
        (canonicalCounts.get(canonicalSuffix) ?? 0) + 1,
      );
    }

    // Only allow canonical fallback when there's a single account (no ambiguity)
    const allowCanonicalFallback = normalizedAccounts.length === 1;

    for (const account of normalizedAccounts) {
      const legacySuffix = _accountSuffix(account, DASHEN_LEGACY_MASK_PATTERN);
      if (legacySuffix !== null) suffixes.add(legacySuffix);

      const canonicalSuffix = _accountSuffix(
        account,
        DASHEN_CANONICAL_MASK_PATTERN,
      );
      if (canonicalSuffix === null) continue;
      if (
        allowCanonicalFallback ||
        canonicalCounts.get(canonicalSuffix) === 1
      ) {
        suffixes.add(canonicalSuffix);
      }
    }
  }

  if (suffixes.size > 0) return suffixes;

  // Fallback: derive suffixes from transaction account numbers
  for (const accountNumber of transactionAccountNumbers) {
    const canonicalSuffix = _accountSuffix(
      accountNumber,
      DASHEN_CANONICAL_MASK_PATTERN,
    );
    if (canonicalSuffix !== null) suffixes.add(canonicalSuffix);

    const legacySuffix = _accountSuffix(
      accountNumber,
      DASHEN_LEGACY_MASK_PATTERN,
    );
    if (legacySuffix !== null) suffixes.add(legacySuffix);
  }

  return suffixes;
}

/**
 * Groups transactions by (amount + balance + account) and builds
 * deduplication plans: one keeper per cluster, with fields merged
 * from all duplicates, and a list of references to delete.
 *
 * Mirrors: `buildExactAmountAndBalanceDeduplicationPlans()`
 */
export function buildExactAmountAndBalanceDeduplicationPlans(params: {
  bankId: number;
  type: string;
  transactions: Iterable<Transaction>;
  accountSuffix?: string | null;
  matchTransactionsWithoutAccountNumber?: boolean;
}): TransactionDeduplicationPlan[] {
  const {
    bankId,
    type,
    transactions,
    accountSuffix,
    matchTransactionsWithoutAccountNumber = false,
  } = params;

  const normalizedType = type.trim().toUpperCase();
  const normalizedSuffix = _normalizeAccount(accountSuffix);

  // Group by (accountKey | amount | balance)
  const groupedTransactions = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    if (transaction.bankId !== bankId) continue;
    if ((transaction.type ?? "").trim().toUpperCase() !== normalizedType)
      continue;

    const normalizedBalance = _parseBalance(transaction.currentBalance);
    if (normalizedBalance === null) continue;

    const normalizedAccount = _normalizeAccount(transaction.accountNumber);

    if (normalizedSuffix !== null) {
      if (normalizedAccount === null) {
        if (!matchTransactionsWithoutAccountNumber) continue;
      } else if (!normalizedAccount.endsWith(normalizedSuffix)) {
        continue;
      }
    }

    const accountKey = normalizedSuffix ?? normalizedAccount ?? "";
    const groupKey = [
      accountKey,
      transaction.amount.toFixed(4),
      normalizedBalance.toFixed(4),
    ].join("|");

    const group = groupedTransactions.get(groupKey);
    if (group) {
      group.push(transaction);
    } else {
      groupedTransactions.set(groupKey, [transaction]);
    }
  }

  const plans: TransactionDeduplicationPlan[] = [];

  for (const group of groupedTransactions.values()) {
    const duplicateClusters = _clusterDuplicateCandidates(group);

    for (const cluster of duplicateClusters) {
      if (cluster.length < 2) continue;

      const keeper = _selectKeeper(cluster);
      const mergedKeeper = _mergeTransactions(keeper, cluster);
      const duplicates = cluster.filter(
        (t) => t.reference !== keeper.reference,
      );
      if (duplicates.length === 0) continue;

      plans.push({
        keeper,
        mergedKeeper,
        duplicates,
        duplicateReferences: duplicates.map((t) => t.reference),
      });
    }
  }

  return plans;
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Groups a flat list of transactions into time-window clusters.
 * Transactions within `DASHEN_DEDUPLICATION_WINDOW_MS` of the cluster
 * start time are considered the same cluster.
 *
 * Mirrors: `_clusterDuplicateCandidates()`
 */
function _clusterDuplicateCandidates(
  transactions: Transaction[],
): Transaction[][] {
  if (transactions.length < 2) return [];

  const sorted = [...transactions].sort(
    (a, b) => _sortTime(a).getTime() - _sortTime(b).getTime(),
  );

  const clusters: Transaction[][] = [];
  let currentCluster: Transaction[] = [];
  let clusterStartTime: Date | null = null;

  for (const transaction of sorted) {
    const transactionTime = _parseTime(transaction.time);

    if (currentCluster.length === 0) {
      currentCluster = [transaction];
      clusterStartTime = transactionTime;
      continue;
    }

    const isSameCluster =
      clusterStartTime === null ||
      transactionTime === null ||
      Math.abs(transactionTime.getTime() - clusterStartTime.getTime()) <=
        DASHEN_DEDUPLICATION_WINDOW_MS;

    if (isSameCluster) {
      currentCluster.push(transaction);
      if (clusterStartTime === null) clusterStartTime = transactionTime;
    } else {
      clusters.push(currentCluster);
      currentCluster = [transaction];
      clusterStartTime = transactionTime;
    }
  }

  if (currentCluster.length > 0) clusters.push(currentCluster);

  return clusters;
}

/**
 * Picks the richest (most detailed) transaction from a cluster to keep.
 * Mirrors: `_selectKeeper()`
 */
function _selectKeeper(transactions: Transaction[]): Transaction {
  let keeper = transactions[0];
  for (const candidate of transactions.slice(1)) {
    if (_compareTransactionRichness(candidate, keeper) > 0) {
      keeper = candidate;
    }
  }
  return keeper;
}

/**
 * Returns positive if `left` is richer than `right`, negative if less rich, 0 if equal.
 * Richness is determined by: detail score → populated field count → text length → recency → reference.
 *
 * Mirrors: `_compareTransactionRichness()`
 */
function _compareTransactionRichness(
  left: Transaction,
  right: Transaction,
): number {
  const scoreDiff = _detailScore(left) - _detailScore(right);
  if (scoreDiff !== 0) return scoreDiff;

  const populatedFieldsDiff =
    _populatedFieldCount(left) - _populatedFieldCount(right);
  if (populatedFieldsDiff !== 0) return populatedFieldsDiff;

  const textLengthDiff = _textDataLength(left) - _textDataLength(right);
  if (textLengthDiff !== 0) return textLengthDiff;

  const leftTime = _parseTime(left.time);
  const rightTime = _parseTime(right.time);
  if (leftTime !== null && rightTime !== null) {
    return leftTime.getTime() - rightTime.getTime();
  }
  if (leftTime !== null) return 1;
  if (rightTime !== null) return -1;

  return right.reference.localeCompare(left.reference);
}

function _detailScore(transaction: Transaction): number {
  let score = 0;
  if (_hasText(transaction.receiver)) score += 5;
  if (_hasText(transaction.creditor)) score += 5;
  if (_hasValue(transaction.vat)) score += 4;
  if (_hasValue(transaction.serviceCharge)) score += 4;
  if (_hasText(transaction.transactionLink)) score += 2;
  if (_hasText(transaction.accountNumber)) score += 2;
  if (_hasText(transaction.currentBalance)) score += 2;
  if (_hasText(transaction.status)) score += 1;
  if (_hasText(transaction.time)) score += 1;
  if (transaction.categoryId != null) score += 2;
  return score;
}

function _populatedFieldCount(transaction: Transaction): number {
  let count = 0;
  if (_hasText(transaction.receiver)) count++;
  if (_hasText(transaction.creditor)) count++;
  if (_hasText(transaction.transactionLink)) count++;
  if (_hasText(transaction.accountNumber)) count++;
  if (_hasText(transaction.currentBalance)) count++;
  if (_hasText(transaction.status)) count++;
  if (_hasText(transaction.time)) count++;
  if (_hasValue(transaction.vat)) count++;
  if (_hasValue(transaction.serviceCharge)) count++;
  if (transaction.categoryId != null) count++;
  return count;
}

function _textDataLength(transaction: Transaction): number {
  return [
    transaction.receiver,
    transaction.creditor,
    transaction.transactionLink,
    transaction.accountNumber,
    transaction.currentBalance,
    transaction.status,
    transaction.time,
  ].reduce<number>((sum, value) => sum + (value?.trim().length ?? 0), 0);
}

/**
 * Merges fields from all cluster members into the keeper.
 * Always picks the longer/richer value for text fields.
 * Accumulates category IDs from all duplicates.
 *
 * Mirrors: `_mergeTransactions()`
 */
function _mergeTransactions(
  keeper: Transaction,
  transactions: Transaction[],
): Transaction {
  let merged = { ...keeper };

  for (const transaction of transactions) {
    if (transaction.reference === keeper.reference) continue;

    // Merge category IDs (deduplicated union)
    const keeperIds: number[] = merged.selectedCategoryIds ?? [];
    const candidateIds: number[] = transaction.selectedCategoryIds ?? [];
    const mergedCategoryIds = [
      ...keeperIds,
      ...candidateIds.filter((id) => !keeperIds.includes(id)),
    ];

    merged = {
      ...merged,
      creditor: _pickBetterText(merged.creditor, transaction.creditor),
      receiver: _pickBetterText(merged.receiver, transaction.receiver),
      time: _pickBetterText(merged.time, transaction.time),
      status: _pickBetterText(merged.status, transaction.status),
      currentBalance: _pickBetterText(
        merged.currentBalance,
        transaction.currentBalance,
      ),
      transactionLink: _pickBetterText(
        merged.transactionLink,
        transaction.transactionLink,
      ),
      accountNumber: _pickBetterText(
        merged.accountNumber,
        transaction.accountNumber,
      ),
      categoryId: merged.categoryId ?? transaction.categoryId,
      selectedCategoryIds: mergedCategoryIds,
      profileId: merged.profileId ?? transaction.profileId,
      serviceCharge: _pickBetterNumber(
        merged.serviceCharge,
        transaction.serviceCharge,
      ),
      vat: _pickBetterNumber(merged.vat, transaction.vat),
      sourceType: _pickBetterText(merged.sourceType, transaction.sourceType),
      sourceMessageId: _pickBetterText(
        merged.sourceMessageId,
        transaction.sourceMessageId,
      ),
      sourceFingerprint: _pickBetterText(
        merged.sourceFingerprint,
        transaction.sourceFingerprint,
      ),
    };
  }

  return merged;
}

// ─── Micro Utilities ──────────────────────────────────────────────────────────

function _parseBalance(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const cleaned = raw.trim().replace(/,/g, "");
  if (!cleaned) return null;
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

function _parseTime(raw: string | null | undefined): Date | null {
  if (!_hasText(raw)) return null;
  const parsed = new Date(raw!.trim());
  return isNaN(parsed.getTime()) ? null : parsed;
}

function _sortTime(transaction: Transaction): Date {
  return _parseTime(transaction.time) ?? new Date(0);
}

function _normalizeAccount(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const cleaned = raw.trim();
  return cleaned || null;
}

function _accountSuffix(
  raw: string | null | undefined,
  maskPattern: number,
): string | null {
  const normalized = _normalizeAccount(raw);
  if (normalized === null) return null;
  if (maskPattern > 0 && normalized.length > maskPattern) {
    return normalized.substring(normalized.length - maskPattern);
  }
  return normalized;
}

function _pickBetterText(
  current: string | null | undefined,
  candidate: string | null | undefined,
): string | null | undefined {
  if (!_hasText(current)) return candidate;
  if (!_hasText(candidate)) return current;
  return candidate!.trim().length > current!.trim().length
    ? candidate
    : current;
}

function _pickBetterNumber(
  current: number | null | undefined,
  candidate: number | null | undefined,
): number | null | undefined {
  if (!_hasValue(current)) return candidate;
  if (!_hasValue(candidate)) return current;
  return Math.abs(candidate!) - Math.abs(current!) > 0.0001
    ? candidate
    : current;
}

function _hasText(value: string | null | undefined): boolean {
  return value != null && value.trim().length > 0;
}

function _hasValue(value: number | null | undefined): boolean {
  return value != null && Math.abs(value) > 0.0001;
}
