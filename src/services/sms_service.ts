/**
 * sms_service.ts
 *
 * Line-by-line functional TypeScript translation of Total's sms_service.dart
 * Location: src/services/sms_service.ts
 * Original Dart file: app/lib/services/sms_service.dart
 *
 * ============================================================================
 * DART PACKAGE REPLACEMENTS & EXPO EQUIVALENTS:
 * ============================================================================
 * 1. `another_telephony` (Telephony.instance):
 *    - Real-time incoming SMS: Replaced with `expo-sms-listener` (https://github.com/MULERx/expo-sms-listener/tree/main).
 *    - Historical inbox messages: Replaced with custom Expo Module async function `getInboxMessages({ fromMs, toMs })`
 *      (bridges Android SmsReaderModule / ContentResolver).
 *
 * 2. `permission_handler` (Permission.sms):
 *    - In Expo / React Native: Replaced with `requestSmsPermissionAsync()` from `expo-sms-listener`
 *      or `PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS)` from `react-native`.
 *
 * 3. `shared_preferences` (SharedPreferences):
 *    - In React Native: Replaced with `react-native-mmkv-storage` (MMKVLoader),
 *      `expo-secure-store`, or local SQLite KV table settings.
 *
 * 4. `sqflite` (Database & Repositories):
 *    - In Expo: Replaced with `expo-sqlite` (openDatabaseSync, withExclusiveTransactionAsync).
 *    - All database and repository imports and execution methods are translated and
 *      commented out below with their full functional Expo / TypeScript equivalent.
 *
 * 5. `flutter/widgets` & `dart:ui`:
 *    - Headless background tasks use `AppRegistry.registerHeadlessTask("ExpoSmsListenerBackground", ...)`
 *      in the React Native / Expo bootstrap layer.
 * ============================================================================
 */

import { Platform } from "react-native";
import { CASH_CONSTANTS, buildAtmReference } from "../constants/cash_constants";
import { Bank } from "../models/bank";
import {
  Transaction,
  createTransaction,
  createTransactionFromJson,
} from "../models/transaction";
import {
  TransactionSourceSms,
  createTransactionSourceSms,
} from "../models/transaction_source_sms";
import {
  findBestBankForSenderAddress,
  normalizeBankSenderToken,
  senderAddressMatchesBank,
} from "../utils/bank_sender_matcher";
import { extractTransactionDetails } from "../utils/pattern_parser";
import {
  createSmsTransactionSourceFromParts,
  smsTransactionSourceToJson,
} from "../utils/sms_transaction_source";
import { hasExactAmountAndBalanceDuplicate } from "../utils/transaction_duplicate_detector";
import { getBanks } from "./bank_config_service";
import { cleanSmsText, debugSms, getPatterns } from "./sms_config_services";

// ============================================================================
// TRANSLATED REPOSITORY & DATABASE IMPORTS (COMMENTED OUT AS REQUESTED)
// ============================================================================
/*
import { TransactionRepository, createTransactionRepository } from "../repositories/transaction_repository";
import { AccountRepository, createAccountRepository } from "../repositories/account_repository";
import { FailedParseRepository, createFailedParseRepository } from "../repositories/failed_parse_repository";
import { CategoryRepository, createCategoryRepository } from "../repositories/category_repository";
import { TransactionSourceSmsRepository, createTransactionSourceSmsRepository } from "../repositories/transaction_source_sms_repository";
import { ProfileRepository, createProfileRepository } from "../repositories/profile_repository";
import { NotificationService } from "./notification_service";
import { NotificationSettingsService } from "./notification_settings_service";
import { FailedParseReviewService } from "./failed_parse_review_service";
import { BudgetAlertService } from "./budget_alert_service";
import { WidgetService } from "./widget_service";
import { BackgroundRefreshSignalService } from "./background_refresh_signal_service";
*/

// ============================================================================
// DOMAIN ENTITIES & INTERFACES (Self-contained representation for TS)
// ============================================================================

export interface Account {
  accountNumber: string;
  bank: number;
  balance: number;
  accountHolderName: string;
  settledBalance?: number | null;
  pendingCredit?: number | null;
  profileId?: number | null;
  smsSubscriptionId?: number | null;
  isDefault?: boolean;
}

export interface FailedParse {
  address: string;
  body: string;
  reason: string;
  timestamp: string;
  bankId?: number | null;
}

/**
 * Normalized shape for messages read via expo-sms-listener or historical inbox
 */
export interface InboxSmsMessage {
  id?: number | string | null;
  address?: string | null;
  body?: string | null;
  date?: number | null;
  subscriptionId?: number | null;
}

/**
 * Signature for the custom Expo Module historical inbox reader adapter
 */
export type GetInboxMessagesFn = (filter: {
  fromMs: number;
  toMs: number;
}) => Promise<InboxSmsMessage[]>;

// ============================================================================
// 1. enum ParseStatus (Dart lines 39-45)
// ============================================================================

export const ParseStatus = {
  success: "success",
  noBank: "noBank",
  noPattern: "noPattern",
  duplicate: "duplicate",
  unregisteredBank: "unregisteredBank",
} as const;

export type ParseStatus = (typeof ParseStatus)[keyof typeof ParseStatus];

// ============================================================================
// 2. class ParseResult (Dart lines 47-59)
// ============================================================================

export interface ParseResult {
  readonly status: ParseStatus;
  readonly transaction?: Transaction | null;
  readonly reason?: string | null;
  readonly isResolved: boolean;
}

export function createParseResult(params: {
  status: ParseStatus;
  transaction?: Transaction | null;
  reason?: string | null;
}): ParseResult {
  return {
    status: params.status,
    transaction: params.transaction ?? null,
    reason: params.reason ?? null,
    isResolved: params.status === ParseStatus.success,
  };
}

// ============================================================================
// 3. class TodaySmsSyncResult (Dart lines 61-81)
// ============================================================================

export interface TodaySmsSyncResult {
  readonly processed: number;
  readonly added: number;
  readonly duplicates: number;
  readonly noPattern: number;
  readonly skipped: number;
  readonly errors: number;
  readonly permissionDenied: boolean;
  readonly hasBankMessages: boolean;
}

export function createTodaySmsSyncResult(
  params: Partial<TodaySmsSyncResult> = {},
): TodaySmsSyncResult {
  const processed = params.processed ?? 0;
  return {
    processed,
    added: params.added ?? 0,
    duplicates: params.duplicates ?? 0,
    noPattern: params.noPattern ?? 0,
    skipped: params.skipped ?? 0,
    errors: params.errors ?? 0,
    permissionDenied: params.permissionDenied ?? false,
    hasBankMessages: processed > 0,
  };
}

// ============================================================================
// 4. Top-level function for background execution: onBackgroundMessage (Dart lines 83-128)
// ============================================================================

/**
 * Top-level background headless task entry point for SMS processing.
 * In React Native / Expo, this is called by AppRegistry.registerHeadlessTask.
 *
 * Mirrors Dart: `@pragma('vm:entry-point') onBackgroundMessage(SmsMessage message) async`
 */
export async function onBackgroundMessage(
  message: InboxSmsMessage,
  options?: {
    getInboxMessages?: GetInboxMessagesFn;
  },
): Promise<void> {
  try {
    // In React Native headless mode, bindings are initialized by the native bridge.
    // console.log("debug: BG: Handler started.");

    const address = message.address;
    // console.log(`debug: BG: Address: '${address}'`);

    const body = message.body;
    if (body == null) {
      // console.log("debug: BG: Body is null. Exiting.");
      return;
    }

    // console.log("debug: BG: Checking if relevant...");
    if (
      await isRelevantMessage(address, {
        allowRemoteBankFetch: false,
      })
    ) {
      // console.log("debug: BG: Message IS relevant. Processing...");
      const receivedAt = message.date == null ? null : new Date(message.date);

      const parsedMessageId =
        message.id != null
          ? typeof message.id === "number"
            ? message.id
            : parseInt(String(message.id), 10)
          : null;

      const transaction = await processMessage(body, address!, {
        notifyUser: true,
        messageDate: receivedAt,
        sourceMessageId: Number.isNaN(parsedMessageId) ? null : parsedMessageId,
        sourceSubscriptionId: message.subscriptionId ?? null,
        allowRemoteBankFetch: false,
        allowRemotePatternFetch: false,
        ...(options?.getInboxMessages
          ? { getInboxMessages: options.getInboxMessages }
          : {}),
      });

      if (transaction != null) {
        // === TRANSLATED SIGNAL CALL (COMMENTED OUT) ===
        // In Dart: BackgroundRefreshSignalService.notifyDataChanged();
        // In Expo / React Native: emit a device event or invalidate TanStack Query
        console.warn("debug: BG: Transaction created, notifying data changed");
      }
      // console.log("debug: BG: Processing finished.");
    } else {
      // console.log("debug: BG: Message NOT relevant.");
    }
  } catch (e) {
    // console.log(`debug: BG: CRITICAL ERROR: ${e}`);
  }
}

// ============================================================================
// 5. Functional Service State & Constants (Dart lines 130-151)
// ============================================================================

let _cachedBanks: Bank[] | null = null;
let _cachedBanksLoadedWithRemoteFetch = false;
let _transactionNotificationTurn: Promise<void> = Promise.resolve();

const _atmCashCutoffPrefPrefix = "atm_cash_transfer_cutoff_iso_profile_";
const _lastSmsCatchupPrefPrefix = "sms_last_catchup_epoch_ms_profile_";
const _dashenBankId = 4;
const _canonicalInboxLookupAttempts = 3;
const _canonicalInboxLookupDelayMs = 750;
const _canonicalInboxLookupWindowMs = 2 * 60 * 1000; // 2 minutes
const _canonicalInboxLookupFutureSlackMs = 15 * 1000; // 15 seconds

// In-memory preference store fallback (mirrors SharedPreferences)
const _memoryPreferences = new Map<string, string | number>();

// Callback for foreground-only UI updates (mirrors ValueChanged<Transaction>? onTransactionSaved)
let _onTransactionSavedCallback: ((transaction: Transaction) => void) | null =
  null;

// Active subscription handle for expo-sms-listener
let _smsListenerSubscription: { remove: () => void } | null = null;

// ============================================================================
// 6. registerIncomingSmsListener (Dart lines 153-158)
// ============================================================================

/**
 * Registers real-time incoming SMS listener using `expo-sms-listener`.
 *
 * Mirrors Dart: `void _registerIncomingSmsListener()`
 */
export function registerIncomingSmsListener(options?: {
  onTransactionSaved?: (transaction: Transaction) => void;
  getInboxMessages?: GetInboxMessagesFn;
}): () => void {
  if (options?.onTransactionSaved) {
    _onTransactionSavedCallback = options.onTransactionSaved;
  }

  // If already listening, remove previous subscription
  if (_smsListenerSubscription) {
    _smsListenerSubscription.remove();
    _smsListenerSubscription = null;
  }

  try {
    // Dynamic import/require of expo-sms-listener
    // https://github.com/MULERx/expo-sms-listener/tree/main
    const ExpoSmsListener = require("expo-sms-listener");
    const listener = ExpoSmsListener.default || ExpoSmsListener;

    _smsListenerSubscription = listener.addListener((msg: any) => {
      const inboxMsg: InboxSmsMessage = {
        id: msg.id ? parseInt(String(msg.id), 10) : null,
        address: msg.originatingAddress || msg.address,
        body: msg.body,
        date: msg.timestamp || msg.date || Date.now(),
        subscriptionId: msg.subscriptionId ?? null,
      };

      handleForegroundMessage(inboxMsg, {
        ...(_onTransactionSavedCallback
          ? { onTransactionSaved: _onTransactionSavedCallback }
          : {}),
        ...(options?.getInboxMessages
          ? { getInboxMessages: options.getInboxMessages }
          : {}),
      });
    });

    // console.log("debug: Incoming SMS listener registered via expo-sms-listener");
  } catch (error) {
    // console.log(`debug: Could not register expo-sms-listener: ${error}`);
  }

  return () => {
    if (_smsListenerSubscription) {
      _smsListenerSubscription.remove();
      _smsListenerSubscription = null;
    }
  };
}

// ============================================================================
// 7. init (Dart lines 160-176)
// ============================================================================

/**
 * Initializes SMS listener after verifying SMS permissions.
 *
 * Mirrors Dart: `Future<void> init() async`
 */
export async function init(options?: {
  onTransactionSaved?: (transaction: Transaction) => void;
  getInboxMessages?: GetInboxMessagesFn;
  checkPermission?: () => Promise<boolean>;
}): Promise<void> {
  // Check permission via injected checker or expo-sms-listener
  let isGranted = false;
  if (options?.checkPermission) {
    isGranted = await options.checkPermission();
  } else {
    try {
      const ExpoSmsListener = require("expo-sms-listener");
      if (typeof ExpoSmsListener.requestSmsPermissionAsync === "function") {
        const res = await ExpoSmsListener.requestSmsPermissionAsync();
        isGranted = Boolean(res?.granted);
      } else {
        // Fallback for Android PermissionsAndroid
        const { PermissionsAndroid } = require("react-native");
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
        );
        isGranted = Boolean(granted);
      }
    } catch {
      isGranted = true; // Attempt listener setup anyway
    }
  }

  if (isGranted) {
    registerIncomingSmsListener(options);

    // Run pending account ownership migration in background (unawaited)
    void (async () => {
      try {
        // === TRANSLATED SERVICE CALL (COMMENTED OUT) ===
        // In Dart: await AccountOwnershipService.instance.runPendingMigration();
        // In TypeScript: await runPendingAccountOwnershipMigration();
      } catch (error) {
        // console.log(`debug: Pending account ownership migration failed: ${error}`);
      }
    })();
  } else {
    // console.log("debug: SMS Permission denied");
  }
}

// ============================================================================
// 8. handleForegroundMessage (Dart lines 178-200)
// ============================================================================

/**
 * Handles incoming foreground SMS messages.
 *
 * Mirrors Dart: `void _handleForegroundMessage(SmsMessage message) async`
 */
export async function handleForegroundMessage(
  message: InboxSmsMessage,
  options?: {
    onTransactionSaved?: (transaction: Transaction) => void;
    getInboxMessages?: GetInboxMessagesFn;
  },
): Promise<void> {
  // console.log(`debug: Foreground message from ${message.address}: ${message.body}`);
  if (message.body == null) return;

  try {
    if (await isRelevantMessage(message.address)) {
      const receivedAt = message.date == null ? null : new Date(message.date);

      const parsedMessageId =
        message.id != null
          ? typeof message.id === "number"
            ? message.id
            : parseInt(String(message.id), 10)
          : null;

      const tx = await processMessage(message.body, message.address!, {
        notifyUser: true,
        messageDate: receivedAt,
        sourceMessageId: Number.isNaN(parsedMessageId) ? null : parsedMessageId,
        sourceSubscriptionId: message.subscriptionId ?? null,
        ...(options?.getInboxMessages
          ? { getInboxMessages: options.getInboxMessages }
          : {}),
      });

      if (tx != null) {
        const callback =
          options?.onTransactionSaved ?? _onTransactionSavedCallback;
        if (callback) {
          callback(tx);
        }
      }
    }
  } catch (e) {
    // console.log(`debug: Error processing foreground message: ${e}`);
  }
}

// ============================================================================
// 9. syncTodayBankSms (Dart lines 202-222)
// ============================================================================

/**
 * Scans today's inbox SMS messages from start of day up to current time.
 *
 * Mirrors Dart: `Future<TodaySmsSyncResult> syncTodayBankSms() async`
 */
export async function syncTodayBankSms(options?: {
  getInboxMessages?: GetInboxMessagesFn;
  checkSmsPermission?: () => Promise<boolean>;
}): Promise<TodaySmsSyncResult> {
  // Permission check
  let isGranted = true;
  if (options?.checkSmsPermission) {
    isGranted = await options.checkSmsPermission();
  }

  if (!isGranted) {
    return createTodaySmsSyncResult({ permissionDenied: true });
  }

  registerIncomingSmsListener(
    options?.getInboxMessages
      ? { getInboxMessages: options.getInboxMessages }
      : undefined,
  );
  await getAtmCashTransferCutoff();

  const scanEndedAt = new Date();
  const result = await syncBankSmsRange({
    start: startOfDay(scanEndedAt),
    includeStart: true,
    end: scanEndedAt,
    includeEnd: true,
    ...(options?.getInboxMessages
      ? { getInboxMessages: options.getInboxMessages }
      : {}),
  });

  if (!result.permissionDenied && result.errors === 0) {
    await setLastSmsCatchupAt(scanEndedAt);
  }

  return result;
}

// ============================================================================
// 10. syncMissedBankSmsSinceLastCatchup (Dart lines 224-255)
// ============================================================================

/**
 * Scans missed bank SMS since the last catch-up timestamp cursor.
 *
 * Mirrors Dart: `Future<TodaySmsSyncResult> syncMissedBankSmsSinceLastCatchup() async`
 */
export async function syncMissedBankSmsSinceLastCatchup(options?: {
  getInboxMessages?: GetInboxMessagesFn;
  checkSmsPermission?: () => Promise<boolean>;
}): Promise<TodaySmsSyncResult> {
  if (Platform.OS !== "android") {
    return createTodaySmsSyncResult();
  }

  let isGranted = true;
  if (options?.checkSmsPermission) {
    isGranted = await options.checkSmsPermission();
  }

  if (!isGranted) {
    return createTodaySmsSyncResult({ permissionDenied: true });
  }

  await getAtmCashTransferCutoff();

  const scanEndedAt = new Date();
  const todayStart = startOfDay(scanEndedAt);
  const lastCatchupAt = await getLastSmsCatchupAt();

  const hasCursor =
    lastCatchupAt != null &&
    lastCatchupAt.getTime() > todayStart.getTime() &&
    lastCatchupAt.getTime() <= scanEndedAt.getTime();

  const result = await syncBankSmsRange({
    start: hasCursor ? lastCatchupAt! : todayStart,
    includeStart: !hasCursor,
    end: scanEndedAt,
    includeEnd: true,
    ...(options?.getInboxMessages
      ? { getInboxMessages: options.getInboxMessages }
      : {}),
  });

  if (!result.permissionDenied && result.errors === 0) {
    await setLastSmsCatchupAt(scanEndedAt);
  }

  return result;
}

// ============================================================================
// 11. syncBankSmsRange (Dart lines 257-286)
// ============================================================================

/**
 * Queries inbox SMS within a timestamp range using the custom Expo module's
 * `getInboxMessages()` async function.
 *
 * Mirrors Dart: `Future<TodaySmsSyncResult> _syncBankSmsRange(...) async`
 */
export async function syncBankSmsRange({
  start,
  includeStart,
  end,
  includeEnd,
  getInboxMessages,
}: {
  start: Date;
  includeStart: boolean;
  end: Date;
  includeEnd: boolean;
  getInboxMessages?: GetInboxMessagesFn;
}): Promise<TodaySmsSyncResult> {
  const fromMs = start.getTime();
  const toMs = end.getTime();

  // Replaces Telephony.instance.getInboxSms with custom module's getInboxMessages()
  const rawMessages = getInboxMessages
    ? await getInboxMessages({ fromMs, toMs })
    : [];

  const filteredMessages = rawMessages.filter((message) => {
    const time = message.date ?? 0;
    const meetsStart = includeStart ? time >= fromMs : time > fromMs;
    const meetsEnd = includeEnd ? time <= toMs : time < toMs;
    return meetsStart && meetsEnd;
  });

  // Sort descending by date (OrderBy(SmsColumn.DATE, sort: Sort.DESC))
  filteredMessages.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));

  return processInboxMessages(
    filteredMessages,
    getInboxMessages ? { getInboxMessages } : undefined,
  );
}

// ============================================================================
// 12. processInboxMessages (Dart lines 288-356)
// ============================================================================

/**
 * Iterates through a list of inbox messages, checks bank relevance,
 * and passes each to processMessageInternal.
 *
 * Mirrors Dart: `Future<TodaySmsSyncResult> _processInboxMessages(List<SmsMessage> messages) async`
 */
export async function processInboxMessages(
  messages: InboxSmsMessage[],
  options?: {
    getInboxMessages?: GetInboxMessagesFn;
  },
): Promise<TodaySmsSyncResult> {
  let processed = 0;
  let added = 0;
  let duplicates = 0;
  let noPattern = 0;
  let skipped = 0;
  let errors = 0;

  for (const message of messages) {
    const body = message.body;
    const address = message.address;
    if (body == null || address == null) {
      skipped++;
      continue;
    }

    const bank = await getRelevantBank(address);
    if (bank == null) {
      skipped++;
      continue;
    }

    processed++;
    const messageDate = message.date != null ? new Date(message.date) : null;

    const parsedMessageId =
      message.id != null
        ? typeof message.id === "number"
          ? message.id
          : parseInt(String(message.id), 10)
        : null;

    try {
      const result = await processMessageInternal(body, address, {
        messageDate,
        sourceMessageId: Number.isNaN(parsedMessageId) ? null : parsedMessageId,
        sourceSubscriptionId: message.subscriptionId ?? null,
        notifyUser: false,
        recordFailure: false,
        ...(options?.getInboxMessages
          ? { getInboxMessages: options.getInboxMessages }
          : {}),
      });

      switch (result.status) {
        case ParseStatus.success:
          added++;
          break;
        case ParseStatus.duplicate:
          duplicates++;
          break;
        case ParseStatus.noPattern:
          noPattern++;
          break;
        case ParseStatus.noBank:
        case ParseStatus.unregisteredBank:
          skipped++;
          break;
      }
    } catch (e) {
      errors++;
      console.log(`debug: Error processing SMS: ${e}`);
    }
  }

  return createTodaySmsSyncResult({
    processed,
    added,
    duplicates,
    noPattern,
    skipped,
    errors,
  });
}

// ============================================================================
// 13. isRelevantMessage (Dart lines 358-369)
// ============================================================================

/**
 * Checks if the message address matches any of our known bank codes.
 *
 * Mirrors Dart: `static Future<bool> isRelevantMessage(...) async`
 */
export async function isRelevantMessage(
  address: string | null | undefined,
  options?: {
    allowRemoteBankFetch?: boolean;
  },
): Promise<boolean> {
  if (address == null) return false;
  const bank = await getRelevantBank(address, {
    allowRemoteFetch: options?.allowRemoteBankFetch ?? true,
  });
  return bank != null;
}

// ============================================================================
// 14. getRelevantBank (Dart lines 371-387)
// ============================================================================

/**
 * Identifies the bank associated with the sender address.
 *
 * Mirrors Dart: `static Future<Bank?> getRelevantBank(...) async`
 */
export async function getRelevantBank(
  address: string | null | undefined,
  options?: {
    allowRemoteFetch?: boolean;
  },
): Promise<Bank | null> {
  if (address == null) return null;

  const allowRemoteFetch = options?.allowRemoteFetch ?? true;

  // Fetch banks with caching
  if (
    _cachedBanks == null ||
    (allowRemoteFetch && !_cachedBanksLoadedWithRemoteFetch)
  ) {
    _cachedBanks = await getBanks({ allowRemoteFetch });
    _cachedBanksLoadedWithRemoteFetch = allowRemoteFetch;
  }

  return findBestBankForSenderAddress(address, _cachedBanks ?? []);
}

// ============================================================================
// 15. sanitizeAmount (Dart lines 389-415)
// ============================================================================

/**
 * Sanitizes numeric amount strings from SMS into floating-point numbers.
 *
 * Mirrors Dart: `static double sanitizeAmount(String? raw)`
 */
export function sanitizeAmount(raw: string | null | undefined): number {
  if (raw == null) return 0.0;

  let cleaned = raw.trim();

  // Remove all characters except digits and decimal points
  cleaned = cleaned.replace(/[^0-9.]/g, "");

  // If multiple dots exist, keep only the first valid decimal
  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    cleaned =
      cleaned.substring(0, firstDot + 1) +
      cleaned.substring(firstDot + 1).replace(/\./g, "");
  }

  // If the string ends with a dot, add a zero: "12." -> "12.0"
  if (cleaned.endsWith(".")) {
    cleaned = cleaned + "0";
  }

  if (cleaned.length === 0) return 0.0;

  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0.0 : parsed;
}

// ============================================================================
// 16. recordFailedParse (Dart lines 417-434)
// ============================================================================

/**
 * Persists an unparsed SMS into FailedParseRepository for debugging / reviews.
 *
 * Mirrors Dart: `static Future<void> _recordFailedParse(...) async`
 */
export async function recordFailedParse({
  address,
  body,
  reason,
  timestamp,
  bankId,
}: {
  address: string;
  body: string;
  reason: string;
  timestamp?: Date | null;
  bankId?: number | null;
}): Promise<void> {
  if (bankId != null && !(await hasRegisteredAccountForBank(bankId))) {
    return;
  }

  const failedRecord: FailedParse = {
    address,
    body,
    reason,
    timestamp: (timestamp ?? new Date()).toISOString(),
    bankId: bankId ?? null,
  };

  // === TRANSLATED REPOSITORY CALL (COMMENTED OUT) ===
  // In Dart:
  // await FailedParseRepository().add(FailedParse(address: address, body: body, reason: reason, timestamp: ...));
  // In Expo SQLite / Supabase Repository:
  // const failedParseRepo = createFailedParseRepository(db);
  // await failedParseRepo.add(failedRecord);
  // console.log(`debug: Failed parse recorded for ${address}: ${reason}`);
}

// ============================================================================
// 17. looksLikeTransactionMessage (Dart lines 436-489)
// ============================================================================

/**
 * Checks heuristics on message body to detect financial transactions.
 *
 * Mirrors Dart: `static bool _looksLikeTransactionMessage(String messageBody)`
 */
export function looksLikeTransactionMessage(messageBody: string): boolean {
  const normalized = messageBody.toLowerCase().replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return false;

  const transactionKeywords = [
    "debited",
    "credited",
    "deposit",
    "withdraw",
    "withdrawal",
    "transfer",
    "transferred",
    "payment",
    "paid",
    "purchase",
    "received",
    "sent",
    "spent",
    "cash out",
    "cashout",
    "atm",
    "trx",
    "txn",
    "transaction",
  ] as const;

  const supportingKeywords = [
    "balance",
    "amount",
    "amt",
    "available balance",
    "ref",
    "reference",
    "account",
    "ac",
    "a/c",
    "card",
    "merchant",
    "pos",
    "wallet",
    "etb",
    "birr",
    "br",
  ] as const;

  const hasTransactionKeyword = containsAny(normalized, transactionKeywords);
  const hasSupportingKeyword = containsAny(normalized, supportingKeywords);
  const hasMonetaryAmount =
    /(?:etb|birr|br)\s*\d|\d[\d,]*(?:\.\d{1,2})?\s*(?:etb|birr|br)/i.test(
      messageBody,
    );

  return hasTransactionKeyword && (hasSupportingKeyword || hasMonetaryAmount);
}

// ============================================================================
// 18. hasRegisteredAccountForBank (Dart lines 491-494)
// ============================================================================

/**
 * Checks whether user has added at least one account for the given bank ID.
 *
 * Mirrors Dart: `static Future<bool> _hasRegisteredAccountForBank(int bankId) async`
 */
export async function hasRegisteredAccountForBank(
  bankId: number,
): Promise<boolean> {
  // === TRANSLATED REPOSITORY METHOD (COMMENTED OUT) ===
  // In Dart:
  // final accounts = await AccountRepository().getAccounts();
  // return accounts.any((account) => account.bank == bankId);
  //
  // In Expo SQLite Repository:
  // const accountRepo = createAccountRepository(db);
  // const accounts = await accountRepo.getAccounts();
  // return accounts.some((a) => a.bank === bankId);

  // Default true to allow processing unless explicitly filtered by caller
  return true;
}

// ============================================================================
// 19. containsAny (Dart lines 496-501)
// ============================================================================

/**
 * Returns true if text contains any string in values.
 *
 * Mirrors Dart: `static bool _containsAny(String text, List<String> values)`
 */
export function containsAny(text: string, values: readonly string[]): boolean {
  for (const value of values) {
    if (text.includes(value)) return true;
  }
  return false;
}

// ============================================================================
// 20. normalizeSmsComparisonText (Dart lines 503-505)
// ============================================================================

/**
 * Normalizes text for comparing SMS bodies.
 *
 * Mirrors Dart: `static String _normalizeSmsComparisonText(String value)`
 */
export function normalizeSmsComparisonText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ============================================================================
// 21. smsComparisonTokens (Dart lines 507-512)
// ============================================================================

/**
 * Splits normalized SMS into alphanumeric tokens with length >= 2.
 *
 * Mirrors Dart: `static Set<String> _smsComparisonTokens(String value)`
 */
export function smsComparisonTokens(value: string): Set<string> {
  const tokens = normalizeSmsComparisonText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2);
  return new Set(tokens);
}

// ============================================================================
// 22. bodiesLookRelated (Dart lines 514-534)
// ============================================================================

/**
 * Heuristic comparison between original SMS and candidate inbox copy.
 *
 * Mirrors Dart: `static bool _bodiesLookRelated(String originalBody, String inboxBody)`
 */
export function bodiesLookRelated(
  originalBody: string,
  inboxBody: string,
): boolean {
  const original = normalizeSmsComparisonText(originalBody);
  const inbox = normalizeSmsComparisonText(inboxBody);
  if (original.length === 0 || inbox.length === 0) return false;
  if (original === inbox) return originalBody.trim() !== inboxBody.trim();
  if (inbox.includes(original) || original.includes(inbox)) return true;

  const originalTokens = smsComparisonTokens(originalBody);
  const inboxTokens = smsComparisonTokens(inboxBody);
  if (originalTokens.size === 0 || inboxTokens.size === 0) return false;

  let overlap = 0;
  for (const token of originalTokens) {
    if (inboxTokens.has(token)) overlap++;
  }

  const smallerSetSize =
    originalTokens.size < inboxTokens.size
      ? originalTokens.size
      : inboxTokens.size;

  return overlap / smallerSetSize >= 0.7;
}

// ============================================================================
// 23. canonicalInboxCandidateScore (Dart lines 536-575)
// ============================================================================

/**
 * Scores an inbox SMS candidate against an original broadcast SMS.
 *
 * Mirrors Dart: `static int _canonicalInboxCandidateScore(...)`
 */
export function canonicalInboxCandidateScore({
  message,
  originalSenderAddress,
  originalBody,
  anchor,
  bank,
  banks,
}: {
  message: InboxSmsMessage;
  originalSenderAddress: string;
  originalBody: string;
  anchor: Date;
  bank: Bank;
  banks: Bank[];
}): number {
  const body = message.body;
  const address = message.address;
  if (body == null || address == null) return -1;
  if (!bodiesLookRelated(originalBody, body)) return -1;

  const normalizedOriginalSender = normalizeBankSenderToken(
    originalSenderAddress,
  );
  const normalizedCandidateSender = normalizeBankSenderToken(address);
  const sameSender = normalizedCandidateSender === normalizedOriginalSender;
  const sameBank =
    sameSender || senderAddressMatchesBank(bank, address, { allBanks: banks });

  if (!sameBank) return -1;

  const messageTime = message.date == null ? anchor : new Date(message.date);
  const distanceMs = Math.abs(messageTime.getTime() - anchor.getTime());
  if (distanceMs > _canonicalInboxLookupWindowMs) return -1;

  let score = 0;
  if (sameSender) score += 40;
  if (looksLikeTransactionMessage(body)) score += 20;
  if (body.length > originalBody.length) score += 10;
  score += 20 - Math.round((distanceMs / _canonicalInboxLookupWindowMs) * 20);

  return score;
}

// ============================================================================
// 24. findCanonicalInboxCopy (Dart lines 577-628)
// ============================================================================

/**
 * Looks up canonical SMS inbox copy using `getInboxMessages()` async function.
 *
 * Mirrors Dart: `static Future<SmsMessage?> _findCanonicalInboxCopy(...) async`
 */
export async function findCanonicalInboxCopy({
  originalBody,
  senderAddress,
  messageDate,
  bank,
  banks,
  getInboxMessages,
}: {
  originalBody: string;
  senderAddress: string;
  messageDate: Date | null;
  bank: Bank;
  banks: Bank[];
  getInboxMessages?: GetInboxMessagesFn;
}): Promise<InboxSmsMessage | null> {
  const anchor = messageDate ?? new Date();
  const lowerBound = anchor.getTime() - _canonicalInboxLookupWindowMs;
  const upperBound = Date.now() + _canonicalInboxLookupFutureSlackMs;

  // Replaces Telephony.instance.getInboxSms with getInboxMessages() from custom Expo module
  const rawMessages = getInboxMessages
    ? await getInboxMessages({ fromMs: lowerBound, toMs: upperBound })
    : [];

  const messages = rawMessages.filter((m) => {
    const t = m.date ?? 0;
    return t >= lowerBound && t <= upperBound;
  });

  messages.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));

  let best: InboxSmsMessage | null = null;
  let bestScore = -1;

  for (const message of messages) {
    const score = canonicalInboxCandidateScore({
      message,
      originalSenderAddress: senderAddress,
      originalBody,
      anchor,
      bank,
      banks,
    });
    if (score > bestScore) {
      best = message;
      bestScore = score;
    }
  }

  return best;
}

// ============================================================================
// 25. retryCanonicalInboxCopy (Dart lines 630-684)
// ============================================================================

/**
 * Retries parse with canonical inbox SMS copy if first broadcast parse had no pattern.
 *
 * Mirrors Dart: `static Future<ParseResult?> _retryCanonicalInboxCopy(...) async`
 */
export async function retryCanonicalInboxCopy({
  originalBody,
  senderAddress,
  messageDate,
  bank,
  skipDashenExpenseDuplicates,
  skipAutoCategorization,
  allowRemoteBankFetch,
  allowRemotePatternFetch,
  getInboxMessages,
}: {
  originalBody: string;
  senderAddress: string;
  messageDate: Date | null;
  bank: Bank;
  skipDashenExpenseDuplicates: boolean;
  skipAutoCategorization: boolean;
  allowRemoteBankFetch: boolean;
  allowRemotePatternFetch: boolean;
  getInboxMessages?: GetInboxMessagesFn;
}): Promise<ParseResult | null> {
  // console.log(
  // "debug: Looking for canonical inbox copy before failed parse review",
  // );
  const banks = await getBanks({ allowRemoteFetch: allowRemoteBankFetch });

  for (let attempt = 0; attempt < _canonicalInboxLookupAttempts; attempt++) {
    await new Promise((resolve) =>
      setTimeout(resolve, _canonicalInboxLookupDelayMs),
    );

    const inboxMessage = await findCanonicalInboxCopy({
      originalBody,
      senderAddress,
      messageDate,
      bank,
      banks,
      ...(getInboxMessages ? { getInboxMessages } : {}),
    });

    if (inboxMessage?.body == null || inboxMessage?.address == null) {
      continue;
    }

    console.log("debug: Retrying parse with canonical inbox SMS copy");
    const inboxDate =
      inboxMessage.date == null ? messageDate : new Date(inboxMessage.date);

    const parsedId =
      inboxMessage.id != null
        ? typeof inboxMessage.id === "number"
          ? inboxMessage.id
          : parseInt(String(inboxMessage.id), 10)
        : null;

    const result = await processMessageInternal(
      inboxMessage.body,
      inboxMessage.address,
      {
        messageDate: inboxDate,
        sourceMessageId: Number.isNaN(parsedId) ? null : parsedId,
        sourceSubscriptionId: inboxMessage.subscriptionId ?? null,
        notifyUser: false,
        skipDashenExpenseDuplicates,
        skipAutoCategorization,
        allowRemoteBankFetch,
        allowRemotePatternFetch,
        recordFailure: false,
        ...(getInboxMessages ? { getInboxMessages } : {}),
      },
    );

    if (
      result.status === ParseStatus.success ||
      result.status === ParseStatus.duplicate
    ) {
      return result;
    }
  }

  return null;
}

// ============================================================================
// 26. bankById (Dart lines 686-691)
// ============================================================================

/**
 * Finds a bank by its unique integer identifier.
 *
 * Mirrors Dart: `static Bank? _bankById(List<Bank> banks, int bankId)`
 */
export function bankById(banks: readonly Bank[], bankId: number): Bank | null {
  for (const bank of banks) {
    if (bank.id === bankId) return bank;
  }
  return null;
}

// ============================================================================
// 27. saveUpdatedAccountBalance (Dart lines 693-710)
// ============================================================================

/**
 * Updates an account's balance in storage.
 *
 * Mirrors Dart: `static Future<void> _saveUpdatedAccountBalance(...) async`
 */
export async function saveUpdatedAccountBalance(
  account: Account,
  newBalance: number,
): Promise<void> {
  const updated: Account = {
    ...account,
    balance: newBalance,
  };

  // === TRANSLATED REPOSITORY METHOD (COMMENTED OUT) ===
  // In Dart:
  // await accRepo.saveAccount(updated);
  //
  // In Expo SQLite Repository:
  // const accountRepo = createAccountRepository(db);
  // await accountRepo.saveAccount(updated);

  // console.log(`debug: Account balance updated for ${account.accountHolderName}: ${newBalance}`);
}

// ============================================================================
// 28. isAtmWithdrawal (Dart lines 712-728)
// ============================================================================

/**
 * Detects whether extracted transaction details represent an ATM cash withdrawal.
 *
 * Mirrors Dart: `static bool _isAtmWithdrawal(Map<String, dynamic> details, String messageBody)`
 */
export function isAtmWithdrawal(
  details: Record<string, unknown>,
  messageBody: string,
): boolean {
  const type = String(details["type"] ?? "").toUpperCase();
  if (type !== "DEBIT") return false;

  const description =
    typeof details["patternDescription"] === "string"
      ? (details["patternDescription"] as string).toLowerCase()
      : null;

  if (description != null && description.includes("atm")) {
    return true;
  }

  const normalizedBody = messageBody.toLowerCase();
  return normalizedBody.includes("atm") && normalizedBody.includes("withdraw");
}

// ============================================================================
// 29. ensureCashAccount (Dart lines 730-743)
// ============================================================================

/**
 * Ensures a local cash wallet account exists in storage.
 *
 * Mirrors Dart: `static Future<void> _ensureCashAccount() async`
 */
export async function ensureCashAccount(): Promise<void> {
  // === TRANSLATED REPOSITORY METHOD (COMMENTED OUT) ===
  // In Dart:
  // final accountRepo = AccountRepository();
  // final accounts = await accountRepo.getAccounts();
  // final hasCash = accounts.any((a) => a.bank == CashConstants.bankId);
  // if (hasCash) return;
  // final cashAccount = Account(accountNumber: CashConstants.defaultAccountNumber, bank: CashConstants.bankId, balance: 0.0, accountHolderName: CashConstants.defaultAccountHolderName);
  // await accountRepo.saveAccount(cashAccount);
  // console.log("debug: Ensured cash account exists");
}

// ============================================================================
// 30. createCashTransactionForAtmWithdrawal (Dart lines 745-782)
// ============================================================================

/**
 * Automatically creates a CREDIT cash transaction when money is withdrawn from an ATM.
 *
 * Mirrors Dart: `static Future<void> _createCashTransactionForAtmWithdrawal(...) async`
 */
export async function createCashTransactionForAtmWithdrawal(
  withdrawal: Transaction,
  existingTransactions: readonly Transaction[],
): Promise<void> {
  const bankId = withdrawal.bankId;
  if (bankId == null || bankId === CASH_CONSTANTS.BANK_ID) return;

  if (await isWithdrawalBeforeCashCutoff(withdrawal)) {
    // console.log(
    //   `debug: Skipping historical ATM cash transfer for ${withdrawal.reference}`,
    // );
    return;
  }

  const cashReference = buildAtmReference(withdrawal.reference);
  if (existingTransactions.some((t) => t.reference === cashReference)) {
    return;
  }

  await ensureCashAccount();
  const currentCashBalance =
    await currentCashWalletBalance(existingTransactions);

  const cashTransaction = createTransaction({
    amount: withdrawal.amount,
    reference: cashReference,
    creditor: "ATM withdrawal",
    time: withdrawal.time ?? new Date().toISOString(),
    bankId: CASH_CONSTANTS.BANK_ID,
    type: "CREDIT",
    currentBalance: (currentCashBalance + withdrawal.amount).toFixed(2),
    transactionLink: withdrawal.reference,
    accountNumber: CASH_CONSTANTS.DEFAULT_ACCOUNT_NUMBER,
  });

  // === TRANSLATED REPOSITORY METHOD (COMMENTED OUT) ===
  // In Dart:
  // await TransactionRepository().saveTransaction(cashTransaction);
  // In Expo SQLite Repository:
  // const txRepo = createTransactionRepository(db);
  // await txRepo.saveTransaction(cashTransaction);

  // console.log(`debug: Cash transaction created for ATM withdrawal: ${cashReference}`);
}

// ============================================================================
// 31. currentCashWalletBalance (Dart lines 784-802)
// ============================================================================

/**
 * Calculates current cash wallet balance from accounts base + transactions delta.
 *
 * Mirrors Dart: `static Future<double> _currentCashWalletBalance(...) async`
 */
export async function currentCashWalletBalance(
  existingTransactions: readonly Transaction[],
): Promise<number> {
  // === TRANSLATED REPOSITORY METHOD (COMMENTED OUT) ===
  // In Dart:
  // final accounts = await AccountRepository().getAccounts();
  // final accountBase = accounts.where((a) => a.bank == CashConstants.bankId).fold(0.0, (s, a) => s + a.balance);
  const accountBase = 0.0;

  const txDelta = existingTransactions
    .filter((t) => t.bankId === CASH_CONSTANTS.BANK_ID)
    .reduce((sum, transaction) => {
      if (transaction.type === "DEBIT") return sum - transaction.amount;
      if (transaction.type === "CREDIT") return sum + transaction.amount;
      return sum;
    }, 0.0);

  return accountBase + txDelta;
}

// ============================================================================
// 32. isWithdrawalBeforeCashCutoff (Dart lines 804-810)
// ============================================================================

/**
 * Checks whether an ATM withdrawal occurred before the profile cutoff date.
 *
 * Mirrors Dart: `static Future<bool> _isWithdrawalBeforeCashCutoff(Transaction withdrawal) async`
 */
export async function isWithdrawalBeforeCashCutoff(
  withdrawal: Transaction,
): Promise<boolean> {
  if (!withdrawal.time) return false;
  const withdrawalTime = new Date(withdrawal.time);
  if (Number.isNaN(withdrawalTime.getTime())) return false;

  const cutoff = await getAtmCashTransferCutoff();
  return withdrawalTime.getTime() < cutoff.getTime();
}

// ============================================================================
// 33. getAtmCashTransferCutoff (Dart lines 812-833)
// ============================================================================

/**
 * Resolves the ATM cash cutoff timestamp for the active profile.
 *
 * Mirrors Dart: `static Future<DateTime> _getAtmCashTransferCutoff() async`
 */
export async function getAtmCashTransferCutoff(): Promise<Date> {
  // === TRANSLATED PREFERENCES / REPOSITORY CALL (COMMENTED OUT) ===
  // In Dart:
  // final profileRepo = ProfileRepository();
  // final activeProfileId = await profileRepo.getActiveProfileId();
  // final key = '$_atmCashCutoffPrefPrefix${activeProfileId ?? "default"}';
  // final prefs = await SharedPreferences.getInstance();
  // const existingIso = prefs.getString(key);
  // ...
  const key = `${_atmCashCutoffPrefPrefix}default`;
  const existingIso = _memoryPreferences.get(key);

  if (typeof existingIso === "string") {
    const parsed = new Date(existingIso);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const cutoff = new Date();
  _memoryPreferences.set(key, cutoff.toISOString());
  await cleanupHistoricalAtmCashTransactions(cutoff);
  return cutoff;
}

// ============================================================================
// 34. startOfDay (Dart lines 835-837)
// ============================================================================

/**
 * Returns midnight (00:00:00.000) for a given date.
 *
 * Mirrors Dart: `static DateTime _startOfDay(DateTime date)`
 */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// ============================================================================
// 35. getLastSmsCatchupAt (Dart lines 839-844)
// ============================================================================

/**
 * Reads the last SMS catchup timestamp from persistent storage.
 *
 * Mirrors Dart: `static Future<DateTime?> _getLastSmsCatchupAt() async`
 */
export async function getLastSmsCatchupAt(): Promise<Date | null> {
  // === TRANSLATED PREFERENCE CALL (COMMENTED OUT) ===
  // In Dart:
  // final prefs = await SharedPreferences.getInstance();
  // final raw = prefs.getInt(await _lastSmsCatchupPrefKey());
  const key = await lastSmsCatchupPrefKey();
  const raw = _memoryPreferences.get(key);

  if (typeof raw === "number") {
    return new Date(raw);
  }
  return null;
}

// ============================================================================
// 36. setLastSmsCatchupAt (Dart lines 846-852)
// ============================================================================

/**
 * Persists the last SMS catchup timestamp into persistent storage.
 *
 * Mirrors Dart: `static Future<void> _setLastSmsCatchupAt(DateTime time) async`
 */
export async function setLastSmsCatchupAt(time: Date): Promise<void> {
  // === TRANSLATED PREFERENCE CALL (COMMENTED OUT) ===
  // In Dart:
  // final prefs = await SharedPreferences.getInstance();
  // await prefs.setInt(await _lastSmsCatchupPrefKey(), time.millisecondsSinceEpoch);
  const key = await lastSmsCatchupPrefKey();
  _memoryPreferences.set(key, time.getTime());
}

// ============================================================================
// 37. lastSmsCatchupPrefKey (Dart lines 854-860)
// ============================================================================

/**
 * Generates the storage key for SMS catchup cursor based on active profile.
 *
 * Mirrors Dart: `static Future<String> _lastSmsCatchupPrefKey() async`
 */
export async function lastSmsCatchupPrefKey(): Promise<string> {
  // === TRANSLATED REPOSITORY CALL (COMMENTED OUT) ===
  // In Dart:
  // final profileRepo = ProfileRepository();
  // final activeProfileId = await profileRepo.getActiveProfileId();
  // return activeProfileId != null ? '$_lastSmsCatchupPrefPrefix$activeProfileId' : '${_lastSmsCatchupPrefPrefix}default';
  return `${_lastSmsCatchupPrefPrefix}default`;
}

// ============================================================================
// 38. cleanupHistoricalAtmCashTransactions (Dart lines 862-885)
// ============================================================================

/**
 * Deletes historical ATM cash transactions created prior to the cutoff date.
 *
 * Mirrors Dart: `static Future<void> _cleanupHistoricalAtmCashTransactions(DateTime cutoff) async`
 */
export async function cleanupHistoricalAtmCashTransactions(
  cutoff: Date,
): Promise<void> {
  // === TRANSLATED REPOSITORY METHOD (COMMENTED OUT) ===
  // In Dart:
  // final txRepo = TransactionRepository();
  // final transactions = await txRepo.getTransactions();
  // final staleReferences = transactions.where((transaction) {
  //   if (transaction.bankId != CashConstants.bankId) return false;
  //   if (!transaction.reference.startsWith(CashConstants.atmReferencePrefix)) return false;
  //   final txTime = DateTime.tryParse(transaction.time ?? '');
  //   if (txTime == null) return false;
  //   return txTime.isBefore(cutoff);
  // }).map((t) => t.reference).toList();
  // if (staleReferences.isEmpty) return;
  // await txRepo.deleteTransactionsByReferences(staleReferences);
  // console.log(`debug: Historical ATM cash cleanup executed for cutoff ${cutoff.toISOString()}`);
}

// ============================================================================
// 39. isDashenExactDuplicate (Dart lines 887-906)
// ============================================================================

/**
 * Checks for Dashen Bank exact duplicate transaction by amount and balance.
 *
 * Mirrors Dart: `static bool _isDashenExactDuplicate(...)`
 */
export function isDashenExactDuplicate(
  details: Record<string, unknown>,
  existingTransactions: readonly Transaction[],
): boolean {
  const bankId = details["bankId"];
  const type = String(details["type"] ?? "").toUpperCase();
  const amount = details["amount"];

  if (bankId !== _dashenBankId || typeof amount !== "number") {
    return false;
  }

  return hasExactAmountAndBalanceDuplicate({
    bankId,
    type,
    amount,
    currentBalance:
      details["currentBalance"] != null
        ? String(details["currentBalance"])
        : undefined,
    accountNumber:
      details["accountNumber"] != null
        ? String(details["accountNumber"])
        : undefined,
    existingTransactions: [...existingTransactions],
  });
}

// ============================================================================
// 40. findSmsSourceDuplicate (Dart lines 908-944)
// ============================================================================

/**
 * Finds an existing transaction linked to the same SMS source ID or fingerprint.
 *
 * Mirrors Dart: `static Transaction? _findSmsSourceDuplicate(...)`
 */
export function findSmsSourceDuplicate(
  details: Record<string, unknown>,
  existingTransactions: readonly Transaction[],
): Transaction | null {
  const sourceType =
    typeof details["sourceType"] === "string"
      ? (details["sourceType"] as string).trim()
      : null;

  if (sourceType !== "sms") return null;

  const sourceMessageId =
    typeof details["sourceMessageId"] === "string"
      ? (details["sourceMessageId"] as string).trim()
      : null;

  const sourceFingerprint =
    typeof details["sourceFingerprint"] === "string"
      ? (details["sourceFingerprint"] as string).trim()
      : null;

  const hasMessageId = sourceMessageId != null && sourceMessageId.length > 0;
  const hasFingerprint =
    sourceFingerprint != null && sourceFingerprint.length > 0;

  if (!hasMessageId && !hasFingerprint) return null;

  for (const transaction of existingTransactions) {
    if (transaction.sourceType !== "sms") continue;

    if (hasFingerprint && transaction.sourceFingerprint === sourceFingerprint) {
      return transaction;
    }

    if (!hasMessageId || transaction.sourceMessageId !== sourceMessageId) {
      continue;
    }

    const existingFingerprint = transaction.sourceFingerprint?.trim();
    if (
      !hasFingerprint ||
      existingFingerprint == null ||
      existingFingerprint.length === 0 ||
      existingFingerprint === sourceFingerprint
    ) {
      return transaction;
    }
  }

  return null;
}

// ============================================================================
// 41. captureTransactionSourceSms (Dart lines 946-970)
// ============================================================================

/**
 * Persists the raw SMS and originating metadata associated with a transaction.
 *
 * Mirrors Dart: `static Future<void> _captureTransactionSourceSms(...) async`
 */
export async function captureTransactionSourceSms({
  transactionReference,
  body,
  senderAddress,
  receivedAt,
  messageId,
}: {
  transactionReference: string;
  body: string;
  senderAddress: string;
  receivedAt?: Date | null;
  messageId?: number | string | null;
}): Promise<void> {
  const reference = transactionReference.trim();
  if (reference.length === 0 || body.trim().length === 0) return;

  const record: TransactionSourceSms = createTransactionSourceSms({
    transactionReference: reference,
    body,
    senderAddress: senderAddress.trim(),
    receivedAt: receivedAt ?? null,
    messageId: messageId != null ? String(messageId) : null,
  });

  // === TRANSLATED REPOSITORY METHOD (COMMENTED OUT) ===
  // In Dart:
  // await TransactionSourceSmsRepository().upsert(TransactionSourceSms(...));
  // In Expo SQLite Repository:
  // const sourceSmsRepo = createTransactionSourceSmsRepository(db);
  // await sourceSmsRepo.upsert(record);

  // console.log(`debug: Captured source SMS for ${reference}`);
}

// ============================================================================
// 42. showTransactionNotificationUnlessSelfTransfer (Dart lines 972-984)
// ============================================================================

/**
 * Serial queue wrapper to prevent racing notifications for the same transaction.
 *
 * Mirrors Dart: `static Future<void> _showTransactionNotificationUnlessSelfTransfer(...) async`
 */
export async function showTransactionNotificationUnlessSelfTransfer(
  transaction: Transaction,
): Promise<void> {
  const previousTurn = _transactionNotificationTurn;
  let resolveCurrentTurn: () => void;
  const currentTurn = new Promise<void>((resolve) => {
    resolveCurrentTurn = resolve;
  });

  _transactionNotificationTurn = currentTurn;

  try {
    await previousTurn;
    await showTransactionNotificationUnlessSelfTransferNow(transaction);
  } finally {
    resolveCurrentTurn!();
  }
}

// ============================================================================
// 43. showTransactionNotificationUnlessSelfTransferNow (Dart lines 986-1029)
// ============================================================================

/**
 * Displays user notification after verifying this is not a self-transfer between own accounts.
 *
 * Mirrors Dart: `static Future<void> _showTransactionNotificationUnlessSelfTransferNow(...) async`
 */
export async function showTransactionNotificationUnlessSelfTransferNow(
  transaction: Transaction,
): Promise<void> {
  try {
    // === TRANSLATED NOTIFICATION / REPOSITORY CALLS (COMMENTED OUT) ===
    // In Dart:
    // final transactions = await TransactionRepository().getTransactions();
    // final banks = await _bankConfigService.getBanks(allowRemoteFetch: false);
    // final accounts = await AccountRepository().getAccounts();
    // final categories = await CategoryRepository().getCategories();
    // final suppressedTransactions = _selfTransferNotificationResolver.transactionsToSuppress(...);
    // if (suppressedTransactions.isNotEmpty) { return; }
    // await NotificationService.instance.showTransactionNotification(transaction: transaction, bankId: transaction.bankId);
    // console.log(
    //   `debug: Notification triggered for transaction: ${transaction.reference}`,
    // );
  } catch (error) {
    // console.log(`debug: Could not check self-transfer notification: ${error}`);
  }
}

// ============================================================================
// 44. processMessage (Dart lines 1032-1105)
// ============================================================================

/**
 * Primary public entry point to process an SMS into a Transaction.
 * Enriches SIM-based wallets via canonical inbox lookup when necessary.
 *
 * Mirrors Dart: `static Future<Transaction?> processMessage(...) async`
 */
export async function processMessage(
  messageBody: string,
  senderAddress: string,
  options?: {
    messageDate?: Date | null;
    notifyUser?: boolean;
    skipDashenExpenseDuplicates?: boolean;
    skipAutoCategorization?: boolean;
    allowRemoteBankFetch?: boolean;
    allowRemotePatternFetch?: boolean;
    sourceMessageId?: number | null;
    sourceSubscriptionId?: number | null;
    getInboxMessages?: GetInboxMessagesFn;
  },
): Promise<Transaction | null> {
  let effectiveBody = messageBody;
  let effectiveSender = senderAddress;
  let effectiveDate = options?.messageDate ?? null;
  let effectiveMessageId = options?.sourceMessageId ?? null;
  let effectiveSubscriptionId = options?.sourceSubscriptionId ?? null;

  const allowRemoteBankFetch = options?.allowRemoteBankFetch ?? true;
  const allowRemotePatternFetch = options?.allowRemotePatternFetch ?? false;
  const notifyUser = options?.notifyUser ?? false;
  const skipDashenExpenseDuplicates =
    options?.skipDashenExpenseDuplicates ?? true;
  const skipAutoCategorization = options?.skipAutoCategorization ?? false;

  if (effectiveMessageId == null || effectiveSubscriptionId == null) {
    try {
      const bank = await getRelevantBank(senderAddress, {
        allowRemoteFetch: allowRemoteBankFetch,
      });

      if (bank?.simBased === true) {
        const banks = await getBanks({
          allowRemoteFetch: allowRemoteBankFetch,
        });

        for (
          let attempt = 0;
          attempt < _canonicalInboxLookupAttempts;
          attempt++
        ) {
          if (attempt > 0) {
            await new Promise((resolve) =>
              setTimeout(resolve, _canonicalInboxLookupDelayMs),
            );
          }

          const inboxMessage = await findCanonicalInboxCopy({
            originalBody: messageBody,
            senderAddress,
            messageDate: options?.messageDate ?? null,
            bank,
            banks,
            ...(options?.getInboxMessages
              ? { getInboxMessages: options.getInboxMessages }
              : {}),
          });

          if (inboxMessage?.body == null || inboxMessage?.address == null) {
            continue;
          }

          effectiveBody = inboxMessage.body;
          effectiveSender = inboxMessage.address;
          effectiveDate =
            inboxMessage.date == null
              ? (options?.messageDate ?? null)
              : new Date(inboxMessage.date);

          const parsedId =
            inboxMessage.id != null
              ? typeof inboxMessage.id === "number"
                ? inboxMessage.id
                : parseInt(String(inboxMessage.id), 10)
              : null;

          effectiveMessageId = Number.isNaN(parsedId) ? null : parsedId;
          effectiveSubscriptionId = inboxMessage.subscriptionId ?? null;
          break;
        }
      }
    } catch (error) {
      // console.log(`debug: Could not enrich incoming SMS ownership: ${error}`);
    }
  }

  const result = await processMessageInternal(effectiveBody, effectiveSender, {
    messageDate: effectiveDate,
    sourceMessageId: effectiveMessageId,
    sourceSubscriptionId: effectiveSubscriptionId,
    notifyUser,
    skipDashenExpenseDuplicates,
    skipAutoCategorization,
    allowRemoteBankFetch,
    allowRemotePatternFetch,
    recordFailure: true,
    ...(options?.getInboxMessages
      ? { getInboxMessages: options.getInboxMessages }
      : {}),
  });

  return result.transaction ?? null;
}

// ============================================================================
// 45. retryFailedParse (Dart lines 1107-1127)
// ============================================================================

/**
 * Re-attempts parsing a previously failed SMS without triggering error notifications.
 *
 * Mirrors Dart: `static Future<ParseResult> retryFailedParse(...) async`
 */
export async function retryFailedParse(
  messageBody: string,
  senderAddress: string,
  options?: {
    messageDate?: Date | null;
    skipDashenExpenseDuplicates?: boolean;
    skipAutoCategorization?: boolean;
    sourceMessageId?: number | null;
    sourceSubscriptionId?: number | null;
    getInboxMessages?: GetInboxMessagesFn;
  },
): Promise<ParseResult> {
  return processMessageInternal(messageBody, senderAddress, {
    messageDate: options?.messageDate ?? null,
    sourceMessageId: options?.sourceMessageId ?? null,
    sourceSubscriptionId: options?.sourceSubscriptionId ?? null,
    notifyUser: false,
    skipDashenExpenseDuplicates: options?.skipDashenExpenseDuplicates ?? true,
    skipAutoCategorization: options?.skipAutoCategorization ?? false,
    recordFailure: false,
    ...(options?.getInboxMessages
      ? { getInboxMessages: options.getInboxMessages }
      : {}),
  });
}

// ============================================================================
// 46. processMessageInternal (Dart lines 1129-1506)
// ============================================================================

/**
 * Complete internal parsing, dedup, account attribution, and transaction saving pipeline.
 *
 * Mirrors Dart: `static Future<ParseResult> _processMessageInternal(...) async`
 */
export async function processMessageInternal(
  messageBody: string,
  senderAddress: string,
  options?: {
    messageDate?: Date | null;
    notifyUser?: boolean;
    skipDashenExpenseDuplicates?: boolean;
    skipAutoCategorization?: boolean;
    allowRemoteBankFetch?: boolean;
    allowRemotePatternFetch?: boolean;
    recordFailure?: boolean;
    sourceMessageId?: number | null;
    sourceSubscriptionId?: number | null;
    getInboxMessages?: GetInboxMessagesFn;
  },
): Promise<ParseResult> {
  console.log(`debug: Processing message: ${messageBody}`);

  const allowRemoteBankFetch = options?.allowRemoteBankFetch ?? true;
  const allowRemotePatternFetch = options?.allowRemotePatternFetch ?? false;
  const notifyUser = options?.notifyUser ?? false;
  const recordFailure = options?.recordFailure ?? true;
  const skipDashenExpenseDuplicates =
    options?.skipDashenExpenseDuplicates ?? true;
  const skipAutoCategorization = options?.skipAutoCategorization ?? false;
  const messageDate = options?.messageDate ?? null;
  const sourceMessageId = options?.sourceMessageId ?? null;
  const sourceSubscriptionId = options?.sourceSubscriptionId ?? null;

  // 1. Identify Bank
  const bank = await getRelevantBank(senderAddress, {
    allowRemoteFetch: allowRemoteBankFetch,
  });

  if (bank == null) {
    // console.log(
    //   `debug: No bank found for address ${senderAddress} - skipping processing.`,
    // );
    return createParseResult({
      status: ParseStatus.noBank,
      reason: "No matching bank",
    });
  }

  // 2. Non-ledger Telebirr Notifications Filter
  if (bank.id === 6 && isTelebirrAtmAuthorization(messageBody)) {
    return createParseResult({
      status: ParseStatus.duplicate,
      reason: "Ignored Telebirr ATM authorization notice",
    });
  }
  if (bank.id === 6 && isTelebirrAirtimeReceipt(messageBody)) {
    return createParseResult({
      status: ParseStatus.duplicate,
      reason: "Ignored Telebirr airtime receipt acknowledgement",
    });
  }
  // Check if the user has a registered account for this bank
  // 3. Registered Account Check
  // === TRANSLATED REPOSITORY METHOD (COMMENTED OUT) ===
  // In Dart:
  // final registeredAccounts = await AccountRepository().getAccounts();
  // final hasRegisteredAccount = registeredAccounts.any((a) => a.bank == bank.id);
  // In Expo SQLite Repository:
  // const accountRepo = createAccountRepository(db);
  // const registeredAccounts = await accountRepo.getAccounts();
  const registeredAccounts: Account[] = [];
  const hasRegisteredAccount = await hasRegisteredAccountForBank(bank.id);

  if (!hasRegisteredAccount) {
    console.log(
      `debug: No registered account for bank ${bank.name} (${bank.id}) - skipping.`,
    );
    return createParseResult({
      status: ParseStatus.unregisteredBank,
      reason: "No registered account for this bank",
    });
  }

  // 4. Load SMS Patterns
  const patterns = await getPatterns(allowRemotePatternFetch);
  const relevantPatterns = patterns.filter((p) => p.bankId === bank.id);
  // console.log(
  // `debug: Loaded ${relevantPatterns.length} native SMS patterns for ${bank.name}`,
  // );

  // 5. Pattern Parsing
  debugSms(messageBody);
  const cleanedMessageBody = cleanSmsText(messageBody);

  let details: Record<string, any> | null = await extractTransactionDetails(
    cleanedMessageBody,
    senderAddress,
    messageDate,
    relevantPatterns,
    _cachedBanks ? { banks: _cachedBanks } : {},
  );

  // Fallback Parser (TODO(deferred): fallback_sms_parser)
  /*
  if (details == null && FallbackSmsParser.isEnabled) {
    // console.log(`debug: Trying fallback SMS parser for ${bank.name}`);
    details = await FallbackSmsParser.extractTransactionDetails({
      messageBody: cleanedMessageBody,
      senderAddress,
      messageDate,
      bank,
    });
  }
  */

  if (details == null) {
    console.log(
      `debug: No matching pattern found for message from ${senderAddress}`,
    );

    if (notifyUser && recordFailure) {
      try {
        const canonicalResult = await retryCanonicalInboxCopy({
          originalBody: messageBody,
          senderAddress,
          messageDate,
          bank,
          skipDashenExpenseDuplicates,
          skipAutoCategorization,
          allowRemoteBankFetch,
          allowRemotePatternFetch,
          ...(options?.getInboxMessages
            ? { getInboxMessages: options.getInboxMessages }
            : {}),
        });

        if (canonicalResult != null) {
          if (
            canonicalResult.status === ParseStatus.success &&
            canonicalResult.transaction != null
          ) {
            await showTransactionNotificationUnlessSelfTransfer(
              canonicalResult.transaction,
            );
          }
          return canonicalResult;
        }
      } catch (e) {
        // console.log(`debug: Canonical inbox retry failed: ${e}`);
      }
    }

    if (recordFailure && looksLikeTransactionMessage(messageBody)) {
      if (notifyUser) {
        // === TRANSLATED NOTIFICATION REVIEW (COMMENTED OUT) ===
        // In Dart:
        // final reviewEnabled = await NotificationSettingsService.instance.isFailedParseReviewNotificationsEnabled();
        // if (reviewEnabled) { ... }
        await recordFailedParse({
          address: senderAddress,
          body: messageBody,
          reason: "No matching pattern found",
          timestamp: messageDate,
          bankId: bank.id,
        });
      } else {
        await recordFailedParse({
          address: senderAddress,
          body: messageBody,
          reason: "No matching pattern found",
          timestamp: messageDate,
          bankId: bank.id,
        });
      }
    }

    return createParseResult({
      status: ParseStatus.noPattern,
      reason: "No matching pattern found",
    });
  }

  // console.log(`debug: Extracted details: ${JSON.stringify(details)}`);

  // Date preference logic
  if (messageDate != null && details["time"] == null) {
    details["time"] = messageDate.toISOString();
  } else if (messageDate != null && details["time"] != null) {
    // Prefer broadcast/inbox message date for historical consistency
    details["time"] = messageDate.toISOString();
  }

  // Ownership resolution
  const parsedBankId =
    typeof details["bankId"] === "number" ? details["bankId"] : bank.id;

  const ownershipBank =
    parsedBankId === bank.id
      ? bank
      : bankById(
          await getBanks({ allowRemoteFetch: allowRemoteBankFetch }),
          parsedBankId,
        );

  let resolvedOwner: Account | null = null;
  if (ownershipBank != null) {
    const bankAccounts = registeredAccounts.filter(
      (account) => account.bank === parsedBankId,
    );

    const greetingName = accountHolderNameFromGreeting(
      messageBody,
      bankAccounts,
    );

    resolvedOwner = resolveSmsOwnership({
      bank: ownershipBank,
      accounts: bankAccounts,
      messageBody,
      parsedAccountNumber: details["accountNumber"]?.toString(),
      sourceSubscriptionId: sourceSubscriptionId ?? null,
    });

    if (resolvedOwner != null) {
      details["ownerAccountNumber"] = resolvedOwner.accountNumber;
      details["ownerAssignmentSource"] = "automatic";

      if (sourceSubscriptionId != null && sourceSubscriptionId >= 0) {
        details["sourceSubscriptionId"] = sourceSubscriptionId;
        if (greetingName != null) {
          // === TRANSLATED REPOSITORY METHOD (COMMENTED OUT) ===
          // In Dart:
          // await AccountRepository().bindSmsSubscription(accountNumber: resolvedOwner.accountNumber, bank: parsedBankId, subscriptionId: sourceSubscriptionId);
          // In Expo SQLite Repository:
          // await accountRepo.bindSmsSubscription({ accountNumber: resolvedOwner.accountNumber, bank: parsedBankId, subscriptionId: sourceSubscriptionId });
          // console.log(`debug: Bound SMS subscription ${sourceSubscriptionId} to ${resolvedOwner.accountNumber}`);
        }
      }
    }
  }

  // Attach SMS source identity
  const smsSource = createSmsTransactionSourceFromParts({
    bankId: parsedBankId,
    ...(sourceMessageId != null ? { messageId: sourceMessageId } : {}),
    senderAddress,
    body: messageBody,
    ...(messageDate != null ? { dateMillis: messageDate.getTime() } : {}),
  });

  Object.assign(details, smsTransactionSourceToJson(smsSource));

  // Scoped reference
  details["reference"] = scopeSmsReference(
    parsedBankId,
    details["reference"]?.toString(),
    details["type"]?.toString(),
  );

  // 6. Check Duplicate Transaction
  // === TRANSLATED REPOSITORY METHOD (COMMENTED OUT) ===
  // In Dart:
  // TransactionRepository txRepo = TransactionRepository();
  // List<Transaction> existingTx = await txRepo.getTransactions();
  // In Expo SQLite Repository:
  // const txRepo = createTransactionRepository(db);
  // const existingTx = await txRepo.getTransactions();
  const existingTx: Transaction[] = [];

  const smsSourceDuplicate = findSmsSourceDuplicate(details, existingTx);
  if (smsSourceDuplicate != null) {
    if (resolvedOwner != null) {
      // === TRANSLATED REPOSITORY METHOD (COMMENTED OUT) ===
      // In Dart:
      // await txRepo.updateTransactionOwnership(reference: smsSourceDuplicate.reference, ownerAccountNumber: resolvedOwner.accountNumber, ...);
    }
    await captureTransactionSourceSms({
      transactionReference: smsSourceDuplicate.reference,
      body: messageBody,
      senderAddress,
      receivedAt: messageDate,
      messageId: sourceMessageId,
    });
    // console.log("debug: Duplicate SMS source skipped");
    return createParseResult({
      status: ParseStatus.duplicate,
      reason: "Duplicate SMS source",
    });
  }

  const newRef = details["reference"] as string | undefined;
  if (newRef != null && existingTx.some((t) => t.reference === newRef)) {
    // console.log("debug: Duplicate transaction skipped");
    if (resolvedOwner != null) {
      // === TRANSLATED REPOSITORY METHOD (COMMENTED OUT) ===
      // In Dart:
      // await txRepo.updateTransactionOwnership(reference: newRef, ownerAccountNumber: resolvedOwner.accountNumber, ...);
    }
    await captureTransactionSourceSms({
      transactionReference: newRef,
      body: messageBody,
      senderAddress,
      receivedAt: messageDate,
      messageId: sourceMessageId,
    });

    if (isAtmWithdrawal(details, messageBody)) {
      try {
        const existing = existingTx.find((t) => t.reference === newRef);
        if (existing) {
          await createCashTransactionForAtmWithdrawal(existing, existingTx);
        }
      } catch (e) {
        // console.log(`debug: Error reconciling cash transfer: ${e}`);
      }
    }

    if (recordFailure) {
      await recordFailedParse({
        address: senderAddress,
        body: messageBody,
        reason: `Duplicate transaction ${newRef}`,
        timestamp: messageDate,
        bankId: parsedBankId,
      });
    }

    return createParseResult({
      status: ParseStatus.duplicate,
      reason: `Duplicate transaction ${newRef}`,
    });
  }

  if (
    skipDashenExpenseDuplicates &&
    isDashenExactDuplicate(details, existingTx)
  ) {
    // console.log("debug: Duplicate Dashen transaction skipped by amount and balance");
    if (recordFailure) {
      await recordFailedParse({
        address: senderAddress,
        body: messageBody,
        reason: "Duplicate Dashen transaction by amount and balance",
        timestamp: messageDate,
        bankId: parsedBankId,
      });
    }
    return createParseResult({
      status: ParseStatus.duplicate,
      reason: "Duplicate Dashen transaction by amount and balance",
    });
  }

  // Update account balance
  if (resolvedOwner != null && details["currentBalance"] != null) {
    const newBalance = sanitizeAmount(String(details["currentBalance"]));
    await saveUpdatedAccountBalance(resolvedOwner, newBalance);
  }

  // 7. Save Transaction
  const newTx = createTransactionFromJson(details);

  // === TRANSLATED REPOSITORY METHOD (COMMENTED OUT) ===
  // In Dart:
  // await txRepo.saveTransaction(newTx, skipAutoCategorization: skipAutoCategorization);
  // final savedTx = await txRepo.getTransactionByReference(newTx.reference) ?? newTx;
  // In Expo SQLite Repository:
  // const savedTx = await txRepo.saveTransaction(newTx, { skipAutoCategorization });
  const savedTx = newTx;

  await captureTransactionSourceSms({
    transactionReference: savedTx.reference,
    body: messageBody,
    senderAddress,
    receivedAt: messageDate,
    messageId: sourceMessageId,
  });

  // console.log(`debug: New transaction saved: ${savedTx.reference}`);

  if (isAtmWithdrawal(details, messageBody)) {
    try {
      await createCashTransactionForAtmWithdrawal(savedTx, existingTx);
    } catch (e) {
      // console.log(`debug: Error creating cash transfer: ${e}`);
    }
  }

  if (notifyUser) {
    await showTransactionNotificationUnlessSelfTransfer(savedTx);
  }

  if (savedTx.type === "DEBIT") {
    try {
      // === TRANSLATED BUDGET ALERT SERVICE (COMMENTED OUT) ===
      // In Dart: await BudgetAlertService().checkAndNotifyBudgetAlerts();
    } catch (e) {
      // console.log(`debug: Error checking budget alerts after SMS transaction: ${e}`);
    }
  }

  try {
    // === TRANSLATED WIDGET SERVICE (COMMENTED OUT) ===
    // In Dart: await WidgetService.refreshWidget();
  } catch (e) {
    // console.log(`debug: Error refreshing widget after SMS transaction: ${e}`);
  }

  return createParseResult({
    status: ParseStatus.success,
    transaction: savedTx,
  });
}

// ============================================================================
// HELPER UTILITIES: Telebirr classifier, Greeting & Ownership resolvers
// (Included directly here to respect the strict rule: "don't create non-existing files")
// ============================================================================

const _telebirrAtmAuthorizationRegex =
  /\bATM\s+withdraw(?:al)?\s+secret\s+code\s+is\s+(\d{4,8})\b/i;

const _telebirrAirtimeReceiptPatterns = [
  /you\s+have\s+received\s+ETB\s+[\d,.]+\s+airtime\s+from\s+\S+[\s\S]*?transaction\s+number\s+is\s+([A-Z0-9@-]+)/i,
  /[\d,.]+\s+ብር[\s\S]*?ተሞልቶሎታል[\s\S]*?ቁጥርዎ\s+([A-Z0-9@-]+)/i,
];

function isTelebirrAtmAuthorization(messageBody: string): boolean {
  return _telebirrAtmAuthorizationRegex.test(messageBody);
}

function isTelebirrAirtimeReceipt(messageBody: string): boolean {
  for (const pattern of _telebirrAirtimeReceiptPatterns) {
    if (pattern.test(messageBody)) return true;
  }
  return false;
}

function scopeSmsReference(
  bankId: number,
  reference?: string | null,
  transactionType?: string | null,
): string {
  const cleanRef = reference?.trim() ?? "";
  if (cleanRef.length === 0) return "";
  if (bankId === 6) {
    // Telebirr references scope with transaction leg
    const type = (transactionType ?? "").toUpperCase();
    if (type === "DEBIT" && !cleanRef.endsWith("_dr")) {
      return `${cleanRef}_dr`;
    }
    if (type === "CREDIT" && !cleanRef.endsWith("_cr")) {
      return `${cleanRef}_cr`;
    }
  }
  return cleanRef;
}

function accountHolderNameFromGreeting(
  messageBody: string,
  accounts: readonly Account[],
): string | null {
  const match = /^\s*(?:dear|hi|hello)\s+([^,;:\r\n]{1,100})/i.exec(
    messageBody,
  );
  if (!match || !match[1]) return null;
  const greeting = match[1].trim().toLowerCase();

  for (const acc of accounts) {
    // since we don't have account repository here, we just return the greeting
    const name = acc.accountHolderName.trim().toLowerCase();
    if (name.length > 0 && greeting.includes(name)) {
      return acc.accountHolderName;
    }
  }
  return null;
}

function resolveSmsOwnership({
  bank: _bank,
  accounts,
  messageBody,
  parsedAccountNumber,
  sourceSubscriptionId,
}: {
  bank: Bank;
  accounts: readonly Account[];
  messageBody: string;
  parsedAccountNumber?: string | null;
  sourceSubscriptionId?: number | null;
}): Account | null {
  if (accounts.length === 0) return null;
  if (accounts.length === 1) return accounts[0]!;

  // 1. Check greeting match
  const greetingOwner = accountHolderNameFromGreeting(messageBody, accounts);
  if (greetingOwner != null) {
    const match = accounts.find(
      (a) => a.accountHolderName.toLowerCase() === greetingOwner.toLowerCase(),
    );
    if (match) return match;
  }

  // 2. Check SIM subscription ID match
  if (sourceSubscriptionId != null) {
    const subMatch = accounts.find(
      (a) => a.smsSubscriptionId === sourceSubscriptionId,
    );
    if (subMatch) return subMatch;
  }

  // 3. Check parsed account number match
  if (parsedAccountNumber != null && parsedAccountNumber.length > 0) {
    const cleanParsed = parsedAccountNumber.replace(/[^0-9]/g, "");
    const accMatch = accounts.find((a) => {
      const cleanAcc = a.accountNumber.replace(/[^0-9]/g, "");
      return (
        cleanAcc === cleanParsed ||
        cleanAcc.endsWith(cleanParsed) ||
        cleanParsed.endsWith(cleanAcc)
      );
    });
    if (accMatch) return accMatch;
  }

  // 4. Default account
  const defaultAcc = accounts.find((a) => a.isDefault);
  if (defaultAcc) return defaultAcc;

  return accounts[0] ?? null;
}
