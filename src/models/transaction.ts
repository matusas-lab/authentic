export type TransactionType = "CREDIT" | "DEBIT";

export type TransactionStatus = "PENDING" | "CLEARED" | "SYNCED";

/**
 * Core immutable domain entity representing a financial transaction.
 */
export interface Transaction {
  amount: number;
  reference: string;
  creditor?: string | null;
  receiver?: string | null;
  note?: string | null;
  time?: string | null; // ISO 8601 string
  status?: TransactionStatus | string | null;
  currentBalance?: string | null;
  bankId?: number | null;
  type?: TransactionType | string | null;
  transactionLink?: string | null;
  accountNumber?: string | null;
  categoryId?: number | null;
  categoryIds?: number[] | null;
  selectedCategoryIds?: number[] | null;
  profileId?: number | null;
  serviceCharge?: number | null;
  vat?: number | null;
  sourceType?: string | null;
  sourceMessageId?: string | null;
  sourceFingerprint?: string | null;
}
/**
 * Inherits all fields directly from Transaction.
 */
export interface CreateTransactionProps extends Transaction { }
/**
 * Inherits all Transaction fields as optional and adds explicit clear flags.
 */
export interface CopyTransactionWithProps extends Partial<Transaction> {
  clearCategoryId?: boolean;
  clearCategoryIds?: boolean;
  clearNote?: boolean;
}

export interface NormalizeCategoryIdsProps {
  ids?: number[] | null;
  primaryCategoryId?: number | null;
}

export interface ResolvePrimaryCategoryIdProps {
  categoryId?: number | null;
  categoryIds?: number[] | null;
}

// ---------------------------------------------------------------------------
// Category ID Normalization & Resolution Helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes an array of category IDs, placing the primary category first,
 * removing non-positive IDs, and deduplicating entries.
 */
export function normalizeCategoryIds({
  ids,
  primaryCategoryId,
}: NormalizeCategoryIdsProps): number[] | null {
  const ordered: number[] = [];

  const addId = (value?: number | null): void => {
    if (value == null || value <= 0 || ordered.includes(value)) {
      return;
    }
    ordered.push(value);
  };

  addId(primaryCategoryId);

  if (ids) {
    for (const id of ids) {
      addId(id);
    }
  }

  return ordered.length === 0 ? null : ordered;
}

/**
 * Resolves the primary category ID from explicit categoryId or falls back to
 * the first valid entry in categoryIds.
 */
export function resolvePrimaryCategoryId({
  categoryId,
  categoryIds,
}: ResolvePrimaryCategoryIdProps): number | null {
  if (categoryId != null && categoryId > 0) {
    return categoryId;
  }

  const normalized = normalizeCategoryIds({
    ...(categoryIds !== undefined && { ids: categoryIds }),
  });
  if (!normalized || normalized.length === 0) {
    return null;
  }

  return normalized[0];
}

/**
 * Decodes category IDs from raw SQLite/JSON values (can be an Array, JSON string, or comma-separated string).
 */
export function decodeCategoryIds(raw: unknown): number[] | null {
  if (raw == null) {
    return null;
  }

  if (Array.isArray(raw)) {
    const parsed = raw
      .map((item) => {
        if (typeof item === "number")
          return Number.isFinite(item) ? Math.trunc(item) : null;
        if (typeof item === "string") {
          const val = Number.parseInt(item.trim(), 10);
          return Number.isNaN(val) ? null : val;
        }
        return null;
      })
      .filter((val): val is number => val !== null);

    return parsed.length === 0 ? null : parsed;
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    try {
      const decoded = JSON.parse(trimmed);
      return decodeCategoryIds(decoded);
    } catch {
      // Fallback to comma-separated string: "1, 2, 3"
      const parsed = trimmed
        .split(",")
        .map((segment) => {
          const val = Number.parseInt(segment.trim(), 10);
          return Number.isNaN(val) ? null : val;
        })
        .filter((val): val is number => val !== null);

      return parsed.length === 0 ? null : parsed;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Transaction Accessors & Query Helpers
// ---------------------------------------------------------------------------

/**
 * Returns all selected category IDs as an array, ensuring the primary category is included.
 */
export function getSelectedCategoryIds(transaction: Transaction): number[] {
  const normalized = normalizeCategoryIds({
    ...(transaction.categoryIds !== undefined && { ids: transaction.categoryIds }),
    ...(transaction.categoryId !== undefined && { primaryCategoryId: transaction.categoryId }),
  });

  return normalized ?? [];
}

/**
 * Checks whether the transaction is tagged with a given category ID.
 */
export function transactionIncludesCategory(
  transaction: Transaction,
  categoryId?: number | null,
): boolean {
  if (categoryId == null) {
    return false;
  }
  return getSelectedCategoryIds(transaction).includes(categoryId);
}

// ---------------------------------------------------------------------------
// Factory, Serialization & Immutability
// ---------------------------------------------------------------------------

/**
 * Creates a validated, frozen Transaction domain entity.
 */
export function createTransaction({
  amount,
  reference,
  creditor,
  receiver,
  note,
  time,
  status,
  currentBalance,
  bankId,
  type,
  transactionLink,
  accountNumber,
  categoryId,
  categoryIds,
  profileId,
  serviceCharge,
  vat,
  sourceType,
  sourceMessageId,
  sourceFingerprint,
}: CreateTransactionProps): Transaction {
  const resolvedPrimary = resolvePrimaryCategoryId({
    ...(categoryId !== undefined && { categoryId }),
    ...(categoryIds !== undefined && { categoryIds }),
  });

  const normalizedCategoryIds = normalizeCategoryIds({
    ...(categoryIds !== undefined && { ids: categoryIds }),
    primaryCategoryId: resolvedPrimary,
  });

  return Object.freeze({
    amount: amount,
    reference: reference,
    creditor: creditor ?? null,
    receiver: receiver ?? null,
    note: note ?? null,
    time: time ?? null,
    status: status ?? null,
    currentBalance: currentBalance ?? null,
    bankId: bankId ?? null,
    type: type ?? null,
    transactionLink: transactionLink ?? null,
    accountNumber: accountNumber ?? null,
    categoryId: resolvedPrimary,
    categoryIds: normalizedCategoryIds,
    profileId: profileId ?? null,
    serviceCharge: serviceCharge ?? null,
    vat: vat ?? null,
    sourceType: sourceType ?? null,
    sourceMessageId: sourceMessageId ?? null,
    sourceFingerprint: sourceFingerprint ?? null,
  });
}

/**
 * Parses raw JSON / SQLite map data into a Transaction domain entity.
 */
export function createTransactionFromJson(
  json: Record<string, unknown>,
): Transaction {
  const toDouble = (v: unknown): number => {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0.0;
    if (typeof v === "string") {
      const parsed = Number.parseFloat(v);
      return Number.isNaN(parsed) ? 0.0 : parsed;
    }
    return 0.0;
  };

  const toInt = (v: unknown): number | null => {
    if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : null;
    if (typeof v === "string") {
      const parsed = Number.parseInt(v.trim(), 10);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  };

  return createTransaction({
    amount: toDouble(json.amount),
    reference: typeof json.reference === "string" ? json.reference : "",
    creditor: typeof json.creditor === "string" ? json.creditor : null,
    receiver: typeof json.receiver === "string" ? json.receiver : null,
    note: typeof json.note === "string" ? json.note : null,
    time: typeof json.time === "string" ? json.time : null,
    status:
      typeof json.status === "string"
        ? (json.status as TransactionStatus)
        : null,
    currentBalance:
      json.currentBalance != null ? String(json.currentBalance) : null,
    bankId: toInt(json.bankId),
    type: typeof json.type === "string" ? (json.type as TransactionType) : null,
    transactionLink:
      typeof json.transactionLink === "string" ? json.transactionLink : null,
    accountNumber:
      typeof json.accountNumber === "string" ? json.accountNumber : null,
    categoryId: toInt(json.categoryId),
    categoryIds: decodeCategoryIds(json.categoryIds),
    profileId: toInt(json.profileId),
    serviceCharge:
      json.serviceCharge != null ? toDouble(json.serviceCharge) : null,
    vat: json.vat != null ? toDouble(json.vat) : null,
    sourceType: json.sourceType != null ? String(json.sourceType) : null,
    sourceMessageId:
      json.sourceMessageId != null ? String(json.sourceMessageId) : null,
    sourceFingerprint:
      json.sourceFingerprint != null ? String(json.sourceFingerprint) : null,
  });
}

/**
 * Converts a Transaction entity into a standard JSON/SQLite dictionary.
 */
export function transactionToJson(
  transaction: Transaction,
): Record<string, unknown> {
  const {
    amount,
    reference,
    creditor,
    receiver,
    note,
    time,
    status,
    currentBalance,
    bankId,
    type,
    transactionLink,
    accountNumber,
    categoryId,
  } = transaction;
  const selectedCategories = getSelectedCategoryIds(transaction);

  const json: Record<string, unknown> = {
    amount: amount,
    reference: reference,
    creditor: creditor,
    receiver: receiver,
    note: note,
    time: time,
    status: status,
    currentBalance: currentBalance,
    bankId: bankId,
    type: type,
    transactionLink: transactionLink,
    accountNumber: accountNumber,
    categoryId: categoryId,
    categoryIds:
      selectedCategories.length > 0 ? Array.from(selectedCategories) : null,
  };

  if (transaction.profileId != null) json.profileId = transaction.profileId;
  if (transaction.serviceCharge != null)
    json.serviceCharge = transaction.serviceCharge;
  if (transaction.vat != null) json.vat = transaction.vat;
  if (transaction.sourceType != null) json.sourceType = transaction.sourceType;
  if (transaction.sourceMessageId != null)
    json.sourceMessageId = transaction.sourceMessageId;
  if (transaction.sourceFingerprint != null)
    json.sourceFingerprint = transaction.sourceFingerprint;

  return json;
}

/**
 * Copies a transaction while safely reconciling primary and multi-category dependencies.
   Pure copy function returning an updated Transaction with changes applied.
*/

export function copyTransactionWith(
  transaction: Transaction,
  {
    clearCategoryId,
    clearCategoryIds,
    clearNote,
    categoryId,
    categoryIds,
    ...updates
  }: CopyTransactionWithProps,
): Transaction {
  let nextCategoryId: number | null | undefined;
  let nextCategoryIds: number[] | null | undefined;

  // 1. Explicit clearing
  if (clearCategoryId || clearCategoryIds) {
    nextCategoryId = null;
    nextCategoryIds = null;
  }
  // 2. Category list updated: check if old primary is still selected
  else if (categoryIds !== undefined) {
    const normalizedIds = normalizeCategoryIds({ ids: categoryIds });
    const currentPrimaryStillSelected =
      categoryId === undefined &&
      transaction.categoryId != null &&
      (normalizedIds?.includes(transaction.categoryId) ?? false);

    const preferredPrimary =
      categoryId !== undefined
        ? categoryId
        : currentPrimaryStillSelected
          ? transaction.categoryId
          : null;

    nextCategoryId = resolvePrimaryCategoryId({
      ...(preferredPrimary !== undefined && { categoryId: preferredPrimary }),
      categoryIds: normalizedIds,
    });

    nextCategoryIds = normalizeCategoryIds({
      ids: normalizedIds,
      primaryCategoryId: nextCategoryId,
    });
  }
  // 3. Only single categoryId updated
  else if (categoryId !== undefined) {
    nextCategoryId = resolvePrimaryCategoryId({
      categoryId,
      categoryIds: [],
    });

    nextCategoryIds = normalizeCategoryIds({
      ids: categoryId != null ? [categoryId] : null,
      primaryCategoryId: nextCategoryId,
    });
  }
  // 4. Categories untouched
  else {
    nextCategoryId = transaction.categoryId;
    nextCategoryIds = transaction.categoryIds;
  }

  // Spread the rest of the fields cleanly without repeating 15 lines of code.
  // Strip undefined values from `updates` before spreading: under
  // exactOptionalPropertyTypes, Partial<T> fields typed as `string | null | undefined`
  // are incompatible with the target's `string | null` optional properties.
  const definedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined),
  ) as Omit<typeof updates, never>;

  return createTransaction({
    ...transaction,
    ...definedUpdates,
    note: clearNote
      ? null
      : updates.note !== undefined
        ? updates.note
        : (transaction.note ?? null),
    categoryId: nextCategoryId ?? null,
    categoryIds: nextCategoryIds ?? null,
  });
}
