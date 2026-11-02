/**
 * Transaction Sync Service
 *
 * Watches TinyBase for locally-saved transactions with status PENDING or
 * CLEARED, waits for network connectivity, then upserts them row-by-row
 * into a Supabase `transactions` table and marks them SYNCED in TinyBase.
 *
 * This is intentionally NOT a TinyBase Synchronizer or SupabasePersister.
 * Those tools serialize the entire store as one JSONB blob. This service
 * treats each TinyBase row as an individual Supabase row so the remote
 * `transactions` table is queryable.
 *
 * ─── SUPABASE TABLE ────────────────────────────────────────────────────
 * Create it once in the Supabase SQL editor:
 *
 *   CREATE TABLE transactions (
 *     reference        TEXT PRIMARY KEY,
 *     amount           DOUBLE PRECISION NOT NULL DEFAULT 0,
 *     creditor         TEXT,
 *     receiver         TEXT,
 *     note             TEXT,
 *     time             TEXT,
 *     status           TEXT,
 *     current_balance  TEXT,
 *     bank_id          INTEGER,
 *     type             TEXT,
 *     transaction_link TEXT,
 *     account_number   TEXT,
 *     category_id      INTEGER,
 *     category_ids     JSONB,
 *     profile_id       INTEGER,
 *     service_charge   DOUBLE PRECISION,
 *     vat              DOUBLE PRECISION,
 *     source_type      TEXT,
 *     source_message_id TEXT,
 *     source_fingerprint TEXT,
 *     synced_at        TIMESTAMPTZ DEFAULT now()
 *   );
 *
 *   ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
 *   -- Adjust this policy to your auth model:
 *   CREATE POLICY transactions_access ON transactions
 *     FOR ALL TO authenticated USING (true) WITH CHECK (true);
 */

import {
    rowToTransaction,
    store,
    TRANSACTIONS_TABLE,
    transactionToRow
} from "@/lib/store";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Transaction } from "@/models/transaction";
import * as Network from "expo-network";
import { AppState } from "react-native";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Supabase table that stores individual transaction rows. */
const SUPABASE_TRANSACTIONS_TABLE = "transactions";

/** How many transactions to upload in one batch request. */
const BATCH_SIZE = 50;

/** Minimum seconds between sync attempts (prevents hammering). */
const MIN_SYNC_INTERVAL_SEC = 30;

/** Polling interval (seconds) for the periodic sync timer. */
const POLL_INTERVAL_SEC = 60;

// ---------------------------------------------------------------------------
// Supabase row mapping — camelCase (TinyBase) → snake_case (Supabase)
// ---------------------------------------------------------------------------

interface SupabaseTransactionRow {
    reference: string;
    amount: number;
    creditor: string | null;
    receiver: string | null;
    note: string | null;
    time: string | null;
    status: string | null;
    current_balance: string | null;
    bank_id: number | null;
    type: string | null;
    transaction_link: string | null;
    account_number: string | null;
    category_id: number | null;
    category_ids: number[] | null;
    profile_id: number | null;
    service_charge: number | null;
    vat: number | null;
    source_type: string | null;
    source_message_id: string | null;
    source_fingerprint: string | null;
}

function transactionToSupabaseRow(tx: Transaction): SupabaseTransactionRow {
    return {
        reference: tx.reference,
        amount: tx.amount,
        creditor: tx.creditor ?? null,
        receiver: tx.receiver ?? null,
        note: tx.note ?? null,
        time: tx.time ?? null,
        status: "SYNCED",
        current_balance: tx.currentBalance ?? null,
        bank_id: tx.bankId ?? null,
        type: tx.type ?? null,
        transaction_link: tx.transactionLink ?? null,
        account_number: tx.accountNumber ?? null,
        category_id: tx.categoryId ?? null,
        category_ids: tx.categoryIds ?? null,
        profile_id: tx.profileId ?? null,
        service_charge: tx.serviceCharge ?? null,
        vat: tx.vat ?? null,
        source_type: tx.sourceType ?? null,
        source_message_id: tx.sourceMessageId ?? null,
        source_fingerprint: tx.sourceFingerprint ?? null,
    };
}

// ---------------------------------------------------------------------------
// Connectivity check
// ---------------------------------------------------------------------------

async function hasConnectivity(): Promise<boolean> {
    try {
        const state = await Network.getNetworkStateAsync();
        if (!state.isConnected) return false;
        if (state.isInternetReachable === false) return false;
        return true;
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Core sync logic
// ---------------------------------------------------------------------------

let _lastSyncAtMs = 0;
let _syncInProgress = false;
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedules a sync attempt after a short 500ms delay to coalesce rapid writes.
 * Bypasses the 30-second interval throttle so real-time SMS sync immediately.
 */
export function triggerDebouncedSync(): void {
    if (_debounceTimer) {
        clearTimeout(_debounceTimer);
    }
    _debounceTimer = setTimeout(() => {
        _debounceTimer = null;
        void syncPendingTransactions(true);
    }, 500);
}

/**
 * Reads every TinyBase transaction row whose status is NOT "SYNCED",
 * upserts them into Supabase in batches, and marks each as "SYNCED"
 * on success.
 *
 * @param force If true, bypasses the MIN_SYNC_INTERVAL_SEC throttle (used for real-time events)
 * @returns The number of transactions successfully synced.
 */
export async function syncPendingTransactions(force = false): Promise<number> {
    if (!isSupabaseConfigured) {
        console.warn("[TransactionSync] Supabase not configured — skipping.");
        return 0;
    }

    // Throttle periodic polling only. Real-time events pass force = true.
    const now = Date.now();
    if (!force && now - _lastSyncAtMs < MIN_SYNC_INTERVAL_SEC * 1000) {
        return 0;
    }

    if (_syncInProgress) {
        // If a sync is currently in-flight, ensure a follow-up run happens
        triggerDebouncedSync();
        return 0;
    }

    _syncInProgress = true;
    _lastSyncAtMs = now;

    try {
        // 1. Check connectivity
        const online = await hasConnectivity();
        if (!online) {
            console.log("[TransactionSync] Offline — will retry later.");
            return 0;
        }

        // 2. Collect unsynced rows from TinyBase
        const rowIds = store.getRowIds(TRANSACTIONS_TABLE);
        const unsyncedPairs: Array<{ rowId: string; tx: Transaction }> = [];

        for (const rowId of rowIds) {
            const row = store.getRow(TRANSACTIONS_TABLE, rowId);
            if (!row) continue;
            const status = row.status as string | null;
            if (status === "SYNCED") continue; // already uploaded
            unsyncedPairs.push({ rowId, tx: rowToTransaction(row) });
        }

        if (unsyncedPairs.length === 0) {
            return 0;
        }

        console.log(
            `[TransactionSync] Found ${unsyncedPairs.length} unsynced transaction(s).`,
        );

        let totalSynced = 0;

        // 3. Upload in batches
        for (let i = 0; i < unsyncedPairs.length; i += BATCH_SIZE) {
            const batch = unsyncedPairs.slice(i, i + BATCH_SIZE);
            const supabaseRows = batch.map(({ tx }) =>
                transactionToSupabaseRow(tx),
            );

            const { error } = await supabase
                .from(SUPABASE_TRANSACTIONS_TABLE)
                .upsert(supabaseRows, { onConflict: "reference" });

            if (error) {
                console.warn(
                    `[TransactionSync] Batch upsert failed (${error.message}). Falling back to row-by-row upload...`,
                );
                // Fallback: 1 malformed row should not prevent the other 49 valid rows from syncing
                for (const item of batch) {
                    const singleRow = transactionToSupabaseRow(item.tx);
                    const { error: singleErr } = await supabase
                        .from(SUPABASE_TRANSACTIONS_TABLE)
                        .upsert(singleRow, { onConflict: "reference" });

                    if (!singleErr) {
                        store.setRow(TRANSACTIONS_TABLE, item.rowId, transactionToRow({
                            ...item.tx,
                            status: "SYNCED",
                        }));
                        totalSynced += 1;
                    } else {
                        console.error(
                            `[TransactionSync] Skipping failing row (${item.tx.reference}):`,
                            singleErr.message,
                        );
                    }
                }
                continue;
            }

            // 4. Mark each successfully uploaded row as SYNCED in TinyBase
            store.transaction(() => {
                for (const { rowId, tx } of batch) {
                    const updatedRow = transactionToRow({
                        ...tx,
                        status: "SYNCED",
                    });
                    store.setRow(TRANSACTIONS_TABLE, rowId, updatedRow);
                }
            });

            totalSynced += batch.length;
        }

        if (totalSynced > 0) {
            console.log(
                `[TransactionSync] Successfully synced ${totalSynced} transaction(s) to Supabase.`,
            );
        }

        return totalSynced;
    } catch (err) {
        console.error("[TransactionSync] Unexpected error during sync:", err);
        return 0;
    } finally {
        _syncInProgress = false;
    }
}

// ---------------------------------------------------------------------------
// Periodic background polling
// ---------------------------------------------------------------------------

let _pollInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Starts a periodic timer that attempts to sync pending transactions.
 * Also registers a TinyBase listener so that any new PENDING write
 * triggers an immediate sync attempt (debounced by MIN_SYNC_INTERVAL_SEC).
 *
 * Call once at app startup, after local persistence is initialized.
 */
export function startTransactionSyncService(): () => void {
    if (!isSupabaseConfigured) {
        console.warn(
            "[TransactionSync] Supabase not configured — sync service will not start.",
        );
        return () => { };
    }

    console.log("[TransactionSync] Starting sync service.");

    // Immediate first attempt
    void syncPendingTransactions();

    // Periodic polling
    _pollInterval = setInterval(() => {
        void syncPendingTransactions();
    }, POLL_INTERVAL_SEC * 1000);

    // Reactive: listen to any row change in the transactions table.
    // When a new PENDING row lands, trigger debounced sync immediately!
    const listenerId = store.addTableListener(
        TRANSACTIONS_TABLE,
        (_store, _tableId) => {
            triggerDebouncedSync();
        },
        true, // mutator = true so the listener can read the table during a transaction commit
    );

    // Trigger sync whenever the user returns to the app from background
    const appStateSub = AppState.addEventListener("change", (state) => {
        if (state === "active") {
            triggerDebouncedSync();
        }
    });

    // Return a teardown function
    return () => {
        if (_pollInterval) {
            clearInterval(_pollInterval);
            _pollInterval = null;
        }
        if (_debounceTimer) {
            clearTimeout(_debounceTimer);
            _debounceTimer = null;
        }
        appStateSub.remove();
        store.delListener(listenerId);
        console.log("[TransactionSync] Sync service stopped.");
    };
}
