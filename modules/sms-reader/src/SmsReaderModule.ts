// modules/sms-reader/src/SmsReaderModule.ts
import { NativeModule, requireNativeModule } from "expo";
import {
  DEFAULT_SMS_COLUMNS,
  GetInboxSmsOptions,
  OrderBy,
  SmsColumn,
  SmsFilter,
  SmsMessage,
  Sort
} from "./SmsReader.types";

declare class NativeSmsReaderModule extends NativeModule<{}> {
  getInboxSms(options?: Record<string, any>): Promise<SmsMessage[]>;
}

const NativeModuleInstance =
  requireNativeModule<NativeSmsReaderModule>("SmsReader");

// Capture the raw native method directly so it is never shadowed or recursively invoked
const nativeGetInboxSms = (options?: Record<string, any>) =>
  NativeModuleInstance.getInboxSms(options);

/**
 * Query SMS Inbox,
 *
 * Parameters:
 * - `options` (optional): `GetInboxSmsOptions` with `columns`, `filter`, and `sortOrder`.
 *
 * Example:
 * ```ts
 * const messages = await getInboxSms({
 *   columns: [
 *     SmsColumn.ID,
 *     SmsColumn.ADDRESS,
 *     SmsColumn.BODY,
 *     SmsColumn.DATE,
 *     SmsColumn.SUBSCRIPTION_ID,
 *   ],
 *   filter: SmsFilter.where(SmsColumn.DATE).greaterThanOrEqualTo(lowerBound)
 *     .and(SmsColumn.DATE).lessThanOrEqualTo(upperBound),
 *   sortOrder: [new OrderBy(SmsColumn.DATE, Sort.DESC)],
 * });
 * ```
 */
export async function getInboxSms(
  optionsOrLimit?: GetInboxSmsOptions | number | null,
  sinceTimestamp?: number | null,
): Promise<SmsMessage[]> {
  // Support legacy positional signature getInboxSms(limit, sinceTimestamp)
  if (typeof optionsOrLimit === "number" || sinceTimestamp != null) {
    const limit =
      typeof optionsOrLimit === "number" ? optionsOrLimit : undefined;
    const filter =
      sinceTimestamp != null && sinceTimestamp > 0
        ? SmsFilter.where(SmsColumn.DATE).greaterThanOrEqualTo(sinceTimestamp)
        : undefined;

    return getInboxSms({
      columns: DEFAULT_SMS_COLUMNS,
      filter,
      sortOrder: [new OrderBy(SmsColumn.DATE, Sort.DESC)],
      limit,
    });
  }

  const options = optionsOrLimit ?? {};

  // Normalize columns
  const columns =
    options.columns && options.columns.length > 0
      ? options.columns.map((c) => (typeof c === "string" ? c : String(c)))
      : DEFAULT_SMS_COLUMNS;

  // Normalize filter / selection
  let selection: string | undefined;
  let selectionArgs: string[] | undefined;

  if (options.filter) {
    if (options.filter instanceof SmsFilter) {
      selection = options.filter.selection;
      selectionArgs = options.filter.selectionArgs;
    } else if (
      typeof options.filter === "object" &&
      "selection" in options.filter
    ) {
      selection = options.filter.selection;
      selectionArgs = options.filter.selectionArgs.map(String);
    }
  }

  // Normalize sortOrder
  let sortOrder: string | undefined;
  if (options.sortOrder) {
    if (Array.isArray(options.sortOrder)) {
      sortOrder = options.sortOrder
        .map((o) => (o instanceof OrderBy ? o.value : String(o)))
        .join(", ");
    } else {
      sortOrder = String(options.sortOrder);
    }
  }

  const rawPayload: Record<string, any> = {
    columns,
    ...(selection ? { selection } : {}),
    ...(selectionArgs ? { selectionArgs } : {}),
    ...(sortOrder ? { sortOrder } : {}),
    ...(options.limit ? { limit: options.limit } : {}),
    ...(options.box ? { box: options.box } : {}),
  };

  const results = await nativeGetInboxSms(rawPayload);
  return results ?? [];
}

// Module export object for backward compatibility
const SmsReaderModule = {
  getInboxSms,
  SmsColumn,
  DEFAULT_SMS_COLUMNS,
  SmsFilter,
  OrderBy,
  Sort,
};

export default SmsReaderModule;
export * from "./SmsReader.types";
