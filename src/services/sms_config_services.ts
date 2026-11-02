/**
 * sms-config.service.ts
 *
 * SMS Pattern Configuration Manager.
 *
 * Responsibility:
 *   - Resolve the current SmsPattern[] for SMS parsing
 *   - Persist patterns locally via MMKV (fast key-value store)
 *   - Fetch fresh patterns from remote JSON endpoint
 *   - Fall back through: MMKV cache → Remote → Bundled asset
 *   - Background-sync remote patterns with in-flight dedup guard
 *   - Manual refresh for user-triggered updates
 *   - App-launch initialization (fetch only if nothing cached)
 *
 * Priority chain:
 *   1. MMKV cache (instant, offline-safe)
 *   2. Remote fetch (https://sms-parsing-visualizer.vercel.app/sms_patterns.json)
 *   3. Bundled asset (assets/sms_patterns.json — zero-network fallback)
 *
 * Remote URL is intentionally isolated to REMOTE_PATTERNS_URL below.
 * To swap to a Supabase Storage bucket, change only that constant.
 */

import sms_patterns from "@/assets/sms_patterns.json";
import * as Network from "expo-network";
import { Platform } from "react-native";
import { createMMKV, type MMKV } from "react-native-mmkv";
import { SmsPattern, parseSmsPattern } from "../models/sms_pattern";

// NOTE: Ensure your tsconfig.json has:
//   "resolveJsonModule": true
// and your path alias "@" points to the app root.

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Remote SMS patterns endpoint.
 * Swap this constant to point to Supabase Storage when ready:
 * e.g. "https://<project>.supabase.co/storage/v1/object/public/config/sms_patterns.json"
 */
const REMOTE_PATTERNS_URL =
  "https://sms-parsing-visualizer.vercel.app/sms_patterns.json";

const REMOTE_FETCH_TIMEOUT_MS = 10_000;
const CONNECTIVITY_CHECK_TIMEOUT_MS = 3_000;

/** MMKV storage key for persisted patterns. */
const MMKV_PATTERNS_KEY = "sms_patterns_cache";

// ─── MMKV Instance ────────────────────────────────────────────────────────────

/**
 * Dedicated MMKV instance for SMS config persistence.
 * Uses MMKVLoader builder pattern — isolated instance ID prevents
 * key collisions with other stores in the app.
 *
 * Builder chain: MMKVLoader → withInstanceID → initialize
 */
let storage: MMKV | null = null;
try {
  if (Platform.OS !== "web") {
    storage = createMMKV({ id: "sms-config-storage" });
  }
} catch (e) {}









// ─── In-flight Guard ──────────────────────────────────────────────────────────

/**
 * Mirrors Total's static `_remoteConfigSyncInFlight` field.
 * Prevents duplicate concurrent background sync calls.
 */
let _remoteConfigSyncInFlight: Promise<void> | null = null;

// ─── Asset Patterns Cache ─────────────────────────────────────────────────────

/**
 * Mirrors Total's `_assetPatternsCache` field.
 * In-memory cache so the bundled JSON is only read once per app session.
 */
let _assetPatternsCache: SmsPattern[] | null = null;

// ─── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Loads SMS patterns from the bundled asset file.
 * Result is cached in-memory for the app session.
 *
 * Mirrors: `_loadAssetPatterns()`
 */
async function _loadAssetPatterns(): Promise<SmsPattern[]> {
  if (_assetPatternsCache !== null) {
    return _assetPatternsCache;
  }

  try {
    // sms_patterns is already a parsed JS object (resolved at build time by Metro).
    // Map each raw item through parseSmsPattern so validation/defaults are applied
    // consistently — same path as patterns coming from the remote endpoint.
    const raw = Array.isArray(sms_patterns)
      ? sms_patterns
      : ((sms_patterns as { patterns: unknown[] }).patterns ?? []);

    const patterns = (raw as Record<string, unknown>[]).map(parseSmsPattern);
    _assetPatternsCache = patterns;
    // console.debug(`[SmsConfig] Loaded ${patterns.length} patterns from assets`);
    return patterns;
  } catch (e) {
    // console.debug(`[SmsConfig] Error loading asset patterns: ${e}`);
    return [];
  }
}

/**
 * Checks whether the device has an active internet connection.
 * Uses expo-network for the connectivity check, then validates by reaching Google.
 *
 * Mirrors: `_hasInternetConnection()`
 */
async function _hasInternetConnection(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();

    // No connection at all
    if (!state.isConnected) {
      return false;
    }

    // expo-network also provides isInternetReachable — use it if available
    if (state.isInternetReachable === false) {
      return false;
    }

    // Additional reachability check: try to hit a known server
    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        CONNECTIVITY_CHECK_TIMEOUT_MS,
      );

      const response = await fetch("https://www.google.com", {
        signal: controller.signal,
        method: "HEAD",
      });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  } catch (e) {
    // console.debug(`[SmsConfig] Error checking connectivity: ${e}`);
    return false;
  }
}

/**
 * Parses a JSON string into SmsPattern[].
 * Handles three formats:
 *   1. A raw JSON array:     [ { bankId, ... }, ... ]
 *   2. A JSON object with a "patterns" key: { "patterns": [ ... ] }
 *   3. A JavaScript module export (e.g. `export default [...]` or `const x = [...]`)
 *      — strips the JS wrapper and parses the embedded JSON literal.
 *
 * Mirrors: `_parsePatternsFromJson()`
 */
function _parsePatternsFromJson(body: string): SmsPattern[] {
  let normalizedBody = body.trim();

  // Handle JS module format (e.g. from a .js CDN endpoint)
  if (
    normalizedBody.startsWith("export") ||
    normalizedBody.startsWith("const") ||
    normalizedBody.startsWith("var") ||
    normalizedBody.startsWith("let")
  ) {
    const jsonMatch = /([\s\S]*\])|({[\s\S]*})/.exec(normalizedBody);
    if (jsonMatch) {
      normalizedBody = jsonMatch[0];
    }
  }

  const jsonData: unknown = JSON.parse(normalizedBody);

  if (Array.isArray(jsonData)) {
    return (jsonData as Record<string, unknown>[]).map(parseSmsPattern);
  }

  if (
    jsonData !== null &&
    typeof jsonData === "object" &&
    "patterns" in jsonData &&
    Array.isArray((jsonData as Record<string, unknown>).patterns)
  ) {
    const list = (jsonData as { patterns: Record<string, unknown>[] }).patterns;
    return list.map(parseSmsPattern);
  }

  return [];
}

/**
 * Fetches SMS patterns from the remote endpoint.
 * Returns an empty array on any failure — callers decide how to handle.
 *
 * Mirrors: `_fetchRemotePatterns()`
 */
async function _fetchRemotePatterns(): Promise<SmsPattern[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      REMOTE_FETCH_TIMEOUT_MS,
    );

    const response = await fetch(REMOTE_PATTERNS_URL, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      // console.debug(
      // `[SmsConfig] Remote fetch failed with status ${response.status}`,
      // );
      return [];
    }

    const body = await response.text();
    const patterns = _parsePatternsFromJson(body);
    // console.debug(
    // `[SmsConfig] Fetched ${patterns.length} patterns from remote`,
    // );
    return patterns;
  } catch (e) {
    // console.debug(`[SmsConfig] Exception fetching remote patterns: ${e}`);
    return [];
  }
}

// ─── Internal Sync ────────────────────────────────────────────────────────────

/**
 * The actual background sync implementation.
 * Fetches remote patterns and persists them if non-empty.
 *
 * Mirrors: `_syncRemoteConfig()`
 */
async function _syncRemoteConfig(showError = false): Promise<void> {
  const hasInternet = await _hasInternetConnection();
  if (!hasInternet) {
    // console.debug("[SmsConfig] No internet connection, skipping remote sync");
    return;
  }

  try {
    const patterns = await _fetchRemotePatterns();
    if (patterns.length > 0) {
      await savePatterns(patterns);
      // console.debug("[SmsConfig] Successfully synced remote config");
    } else {
      // console.debug("[SmsConfig] Remote sync returned empty patterns");
    }
  } catch (e) {
    // console.debug(`[SmsConfig] Error syncing remote config: ${e}`);
    if (showError) {
      throw e;
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Cleans/normalizes raw SMS text before processing.
 *
 * Currently only trims whitespace. The more aggressive JSON-based
 * sanitization (invisible character removal, whitespace normalization,
 * sentence boundary correction) is preserved as commented-out stubs
 * for future activation.
 *
 * Mirrors: `cleanSmsText()`
 */
export function cleanSmsText(text: string): string {
  try {
    // Future: uncomment for aggressive sanitization
    // const jsonString = JSON.stringify(text);
    // let cleaned = JSON.parse(jsonString) as string;
    // cleaned = cleaned.replace(/\r/g, ' ');
    // cleaned = cleaned.replace(/\s+/g, ' ');
    // cleaned = cleaned.replace(/\.\s*([A-Z])/g, ' $1');
    // return cleaned;
    return text.trim();
  } catch (e) {
    // console.debug(`[SmsConfig] JSON sanitization failed: ${e}`);
    return text;
  }
}

/**
 * Debugging utility for raw SMS text inspection.
 * Uncomment the log lines below when diagnosing invisible character issues.
 *
 * Mirrors: `debugSms()`
 */
export function debugSms(smsText: string): void {
  // Uncomment to inspect raw SMS bytes when debugging invisible character issues:
  // console.debug('[SmsConfig] Raw SMS (escaped):', JSON.stringify(smsText));
  // console.debug('[SmsConfig] Code units:', [...smsText].map(c => c.codePointAt(0)));
  void smsText; // prevent unused-variable lint warning
}

/**
 * Persists a list of SmsPatterns to MMKV, replacing any previously stored set.
 * Uses setMapAsync — stores the object array natively without manual JSON.stringify.
 *
 * Mirrors: `savePatterns()`
 *
 * Note: Total used SQLite batch insert with boolean→integer coercion.
 * react-native-mmkv-storage stores arrays/objects natively, so no coercion needed.
 */
export async function savePatterns(patterns: SmsPattern[]): Promise<void> {
  try {
    storage?.set(MMKV_PATTERNS_KEY, JSON.stringify(patterns));
  } catch {}
  // console.debug(`[SmsConfig] Saved ${patterns.length} patterns to MMKV`);
}

/**
 * Returns the current list of SMS patterns using a priority chain:
 *   1. MMKV cache (instant, offline-safe)
 *   2. Remote fetch (only if `allowRemoteFetch` is true and internet is available)
 *   3. Bundled asset fallback (always available)
 *
 * Mirrors: `getPatterns()`
 */
export async function getPatterns(
  allowRemoteFetch = true,
): Promise<SmsPattern[]> {
  // 1. Try MMKV cache first
  // const cached = await storage.getArrayAsync<SmsPattern>(MMKV_PATTERNS_KEY);
  // if (cached && cached.length > 0) {
  //   console.debug(
  //   `[SmsConfig] Loaded ${cached.length} patterns from MMKV cache`,
  //   );
  //   return cached;
  // }

  // 2. Try remote fetch
  if (allowRemoteFetch) {
    const hasInternet = await _hasInternetConnection();
    if (hasInternet) {
      try {
        const patterns = await _fetchRemotePatterns();
        if (patterns.length > 0) {
          savePatterns(patterns);
          return patterns;
        }
      } catch (e) {
        // console.debug(`[SmsConfig] Error fetching remote patterns: ${e}`);
      }
    } else {
      // console.debug(
      // "[SmsConfig] No internet connection, cannot fetch remote patterns",
      // );
    }
  }

  // 3. Fallback: bundled asset
  // console.debug("[SmsConfig] Using asset patterns as fallback");
  const assetPatterns = await _loadAssetPatterns();
  if (assetPatterns.length > 0) {
    await savePatterns(assetPatterns);
  }
  return assetPatterns;
}

/**
 * Background sync with in-flight deduplication.
 * If a sync is already running, returns the existing Promise instead of
 * starting a second concurrent fetch — mirrors Total's static field guard.
 *
 * Call this on app resume or after app launch to silently refresh patterns.
 *
 * Mirrors: `syncRemoteConfig()`
 */
export function syncRemoteConfig(showError = false): Promise<void> {
  if (_remoteConfigSyncInFlight !== null) {
    return _remoteConfigSyncInFlight;
  }

  const sync = _syncRemoteConfig(showError);
  _remoteConfigSyncInFlight = sync;

  sync.finally(() => {
    // Only clear the guard if this is still the same promise (not replaced)
    if (_remoteConfigSyncInFlight === sync) {
      _remoteConfigSyncInFlight = null;
    }
  });

  return sync;
}

/**
 * Manual user-triggered pattern refresh.
 * Throws if no internet or if remote returns 0 patterns.
 * Returns the count of patterns saved on success.
 *
 * Mirrors: `refreshPatternsFromInternet()`
 */
export async function refreshPatternsFromInternet(): Promise<number> {
  // console.debug("[SmsConfig] Manual SMS pattern refresh started");

  const hasInternet = await _hasInternetConnection();
  if (!hasInternet) {
    // console.debug(
    // "[SmsConfig] Manual SMS pattern refresh failed - no internet",
    // );
    throw new Error("No internet connection. Connect and try again.");
  }

  const patterns = await _fetchRemotePatterns();
  if (patterns.length === 0) {
    // console.debug(
    // "[SmsConfig] Manual SMS pattern refresh failed - remote returned 0 patterns",
    // );
    throw new Error("Could not download SMS patterns right now.");
  }

  savePatterns(patterns);
  // console.debug(
  // `[SmsConfig] Manual SMS pattern refresh completed with ${patterns.length} patterns`,
  // );
  return patterns.length;
}

/**
 * App-launch pattern bootstrap.
 * Only fetches if MMKV has no cached patterns.
 * Returns true if internet is needed but not available (caller can show a warning).
 * Returns false in all other cases (success or graceful fallback).
 *
 * Mirrors: `initializePatterns()`
 */
export async function initializePatterns(): Promise<boolean> {
  // Patterns already exist — no sync on launch (sync happens on explicit refresh)
  // const cached = await storage.getArrayAsync<SmsPattern>(MMKV_PATTERNS_KEY);
  // if (cached && cached.length > 0) {
  //   return false; // No internet needed, we have cached patterns
  // }

  // No patterns stored — need to fetch
  const hasInternet = await _hasInternetConnection();
  if (!hasInternet) {
    return true; // Internet needed but not available — caller shows a warning
  }

  // Fetch and save
  try {
    const patterns = await _fetchRemotePatterns();
    if (patterns.length > 0) {
      await savePatterns(patterns);
      return false; // Success
    }

    // Remote returned empty — fallback to bundled asset
    const assetPatterns = await _loadAssetPatterns();
    if (assetPatterns.length > 0) {
      await savePatterns(assetPatterns);
    }
    return false;
  } catch (e) {
    // console.debug(`[SmsConfig] Error initializing patterns: ${e}`);

    // Fallback to bundled asset
    const assetPatterns = await _loadAssetPatterns();
    if (assetPatterns.length > 0) {
      await savePatterns(assetPatterns);
    }
    return false;
  }
}
