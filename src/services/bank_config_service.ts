/**
 * Bank Configuration & Synchronization Service
 **/

import bank_patterns from "@/assets/banks.json";
import { CASH_CONSTANTS as CashConstants } from "../constants/cash_constants";
import { Bank, createBank, parseBank } from "../models/bank";

// ============================================================================
// Database & Options Types (Expo SQLite compatible)
// ============================================================================

export interface DatabaseClient {
  getAllAsync<T>(query: string, params?: any[]): Promise<T[]>;
  runAsync(
    query: string,
    params?: any[],
  ): Promise<{ changes: number; lastInsertRowId: number }>;
  withTransactionAsync<T>(task: () => Promise<T>): Promise<T>;
}

export interface BankDbRow {
  id: number;
  name: string;
  shortName: string;
  codes: string; // JSON string
  image: string;
  maskPattern: number | null;
  uniformMasking: number | null; // 1 or 0
  simBased: number | null; // 1 or 0
  colors: string | null; // JSON string
}

export interface GetBanksOptions {
  allowRemoteFetch?: boolean;
  db?: DatabaseClient;
  bundledJson?: unknown;
}

export interface SyncRemoteConfigOptions {
  showError?: boolean;
  db?: DatabaseClient;
}

export interface InitializeBanksOptions {
  db?: DatabaseClient;
  bundledJson?: unknown;
}

// ============================================================================
// Class State & Constants (matching lines 11–20 of Total's bankconfigservice.dart)
// ============================================================================

const banksAssetPath = "assets/banks.json";
const mpesaBankId = 8;
const apolloBankId = 36;
const cbeBirrBankId = 37;
const retiredBankIds = new Set<number>([35, 38]);
const canonicalLocalBankImages: Record<number, string> = {
  [apolloBankId]: "assets/images/apollo.png",
  [cbeBirrBankId]: "assets/images/cbebirr.png",
};
let assetBanksCache: Bank[] | null = null;

// ============================================================================
// Method 1: filterCashBanks (lines 22–28)
// ============================================================================
export function filterCashBanks(banks: Bank[]): Bank[] {
  return banks.filter(
    (bank) => bank.id !== CashConstants.BANK_ID && !retiredBankIds.has(bank.id),
  );
}

// ============================================================================
// Method 2: isMpesaBank (lines 30–36)
// ============================================================================
export function isMpesaBank(bank: Bank): boolean {
  const token =
    `${bank.name} ${bank.shortName} ${bank.codes.join(" ")} ${bank.image}`
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  return token.includes("mpesa");
}

// ============================================================================
// Method 3: canonicalMpesaBank (lines 38–50)
// ============================================================================
export function canonicalMpesaBank(): Bank {
  return createBank({
    id: mpesaBankId,
    name: "M Pesa",
    shortName: "MPESA",
    codes: ["MPESA"],
    image: "assets/images/mpesa.png",
    maskPattern: 0,
    uniformMasking: false,
    simBased: true,
    colors: ["#00a859", "#ffffff"],
  });
}

// ============================================================================
// Method 4: withCanonicalLocalBankImage (lines 52–66)
// ============================================================================
export function withCanonicalLocalBankImage(bank: Bank): Bank {
  const canonicalImage = canonicalLocalBankImages[bank.id];
  if (canonicalImage == null || bank.image === canonicalImage) return bank;
  return createBank({
    id: bank.id,
    name: bank.name,
    shortName: bank.shortName,
    codes: bank.codes,
    image: canonicalImage,
    maskPattern: bank.maskPattern,
    uniformMasking: bank.uniformMasking,
    simBased: bank.simBased,
    colors: bank.colors,
  });
}

// ============================================================================
// Method 5: applyCanonicalLocalBankImages (lines 68–70)
// ============================================================================
export function applyCanonicalLocalBankImages(banks: Bank[]): Bank[] {
  return banks.map(withCanonicalLocalBankImage);
}

// ============================================================================
// Method 6: sameStringList (lines 72–78)
// ============================================================================
export function sameStringList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ============================================================================
// Method 7: mergeStringLists (lines 80–99)
// ============================================================================
export function mergeStringLists(
  primary: string[],
  fallback: string[],
): string[] {
  const merged: string[] = [];

  function add(value: string): void {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    if (merged.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
      return;
    }
    merged.push(trimmed);
  }

  for (const value of primary) {
    add(value);
  }
  for (const value of fallback) {
    add(value);
  }
  return merged;
}

// ============================================================================
// Method 8: mergeBankDefinition (lines 101–115)
// ============================================================================
export function mergeBankDefinition(existing: Bank, asset: Bank): Bank {
  return createBank({
    id: existing.id,
    name: existing.name.trim().length > 0 ? existing.name : asset.name,
    shortName:
      existing.shortName.trim().length > 0
        ? existing.shortName
        : asset.shortName,
    codes: mergeStringLists(existing.codes, asset.codes),
    image: existing.image.trim().length > 0 ? existing.image : asset.image,
    maskPattern: existing.maskPattern ?? asset.maskPattern,
    uniformMasking: existing.uniformMasking ?? asset.uniformMasking,
    simBased: existing.simBased ?? asset.simBased,
    colors: existing.colors ?? asset.colors,
  });
}

// ============================================================================
// Method 9: mergeAssetBankDefinitions (lines 117–129)
// ============================================================================
export function mergeAssetBankDefinitions(
  banks: Bank[],
  assetBanks: Bank[],
): Bank[] {
  const mergedById = new Map<number, Bank>();
  for (const bank of banks) {
    mergedById.set(bank.id, bank);
  }
  for (const assetBank of assetBanks) {
    const existing = mergedById.get(assetBank.id);
    mergedById.set(
      assetBank.id,
      existing == null ? assetBank : mergeBankDefinition(existing, assetBank),
    );
  }
  return Array.from(mergedById.values());
}

// ============================================================================
// Method 10: sameBanks (lines 131–141)
// ============================================================================
export function sameBanks(a: Bank, b: Bank): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.shortName === b.shortName &&
    sameStringList(a.codes, b.codes) &&
    a.image === b.image &&
    a.maskPattern === b.maskPattern &&
    a.uniformMasking === b.uniformMasking &&
    a.simBased === b.simBased &&
    sameStringList(a.colors ?? [], b.colors ?? [])
  );
}

// ============================================================================
// Method 11: sameBankLists (lines 143–153)
// ============================================================================
export function sameBankLists(a: Bank[], b: Bank[]): boolean {
  if (a.length !== b.length) return false;
  const banksByIdA = new Map<number, Bank>();
  for (const bank of a) banksByIdA.set(bank.id, bank);
  const banksByIdB = new Map<number, Bank>();
  for (const bank of b) banksByIdB.set(bank.id, bank);

  if (banksByIdA.size !== banksByIdB.size) return false;
  for (const [id, bankA] of banksByIdA.entries()) {
    const other = banksByIdB.get(id);
    if (other == null || !sameBanks(bankA, other)) return false;
  }
  return true;
}

// ============================================================================
// Method 12: normalizeKnownBankAliases (lines 155–189)
// ============================================================================
export function normalizeKnownBankAliases(banks: Bank[]): Bank[] {
  if (banks.length === 0) return banks;
  const normalized = [...banks];
  const mpesaByIdIndex = normalized.findIndex(
    (bank) => bank.id === mpesaBankId,
  );
  if (mpesaByIdIndex === -1) {
    return applyCanonicalLocalBankImages(normalized);
  }

  const bankAtMpesaId = normalized[mpesaByIdIndex];
  if (isMpesaBank(bankAtMpesaId)) {
    return applyCanonicalLocalBankImages(normalized);
  }

  const mpesaAliasIndex = normalized.findIndex(
    (bank) => bank.id !== mpesaBankId && isMpesaBank(bank),
  );
  const source =
    mpesaAliasIndex >= 0 ? normalized[mpesaAliasIndex] : canonicalMpesaBank();

  normalized[mpesaByIdIndex] = createBank({
    id: mpesaBankId,
    name: source.name,
    shortName: source.shortName,
    codes: source.codes,
    image: source.image,
    maskPattern: source.maskPattern,
    uniformMasking: source.uniformMasking,
    simBased: source.simBased,
    colors: source.colors,
  });

  return applyCanonicalLocalBankImages(normalized);
}

// ============================================================================
// Method 13: loadAssetBanks (lines 191–207)
// ============================================================================
export async function loadAssetBanks(bundledJson?: unknown): Promise<Bank[]> {
  if (assetBanksCache != null) {
    return assetBanksCache;
  }

  try {
    let body = "";
    if (bundledJson != null) {
      body =
        typeof bundledJson === "string"
          ? bundledJson
          : JSON.stringify(bundledJson);
    } else {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        // const asset = require("../assets/banks.json");
        const asset = bank_patterns["banks"];
        // const smsAsset = sms_patterns["patterns"];

        body = typeof asset === "string" ? asset : JSON.stringify(asset);
        // console.log("sms patterns: ", asset);
      } catch {
        console.warn(`debug: Could not find ${banksAssetPath}`);
      }
    }

    const banks = normalizeKnownBankAliases(
      filterCashBanks(parseBanksFromJson(body)),
    );
    assetBanksCache = banks;
    console.log(`debug: Loaded ${banks.length} banks from assets`);
    return banks;
  } catch (e) {
    console.log(`debug: Error loading asset banks: ${e}`);
    return [];
  }
}

// ============================================================================
// Method 14: getBanks (lines 209–276)
// ============================================================================
export async function getBanks(options?: GetBanksOptions): Promise<Bank[]> {
  const allowRemoteFetch = options?.allowRemoteFetch ?? true;
  const db = options?.db;

  // First, try to load from database
  if (db) {
    try {
      const maps = await db.getAllAsync<BankDbRow>("SELECT * FROM banks");
      if (maps.length > 0) {
        const parsedBanks = maps.map((map) => {
          let parsedCodes: string[] = [];
          try {
            const decoded = JSON.parse(map.codes);
            if (Array.isArray(decoded)) parsedCodes = decoded.map(String);
          } catch { }

          let parsedColors: string[] | null = null;
          if (map.colors != null) {
            try {
              const decoded = JSON.parse(map.colors);
              console.log("decoded: ", decoded);
              if (Array.isArray(decoded)) parsedColors = decoded.map(String);
            } catch { }
          }

          return parseBank({
            id: map.id,
            name: map.name,
            shortName: map.shortName,
            codes: parsedCodes,
            image: map.image,
            maskPattern: map.maskPattern,
            uniformMasking:
              map.uniformMasking == null ? null : map.uniformMasking === 1,
            simBased: map.simBased == null ? null : map.simBased === 1,
            colors: parsedColors,
          });
        });

        const filteredBanks = filterCashBanks(parsedBanks);
        const normalizedBanks = normalizeKnownBankAliases(filteredBanks);
        const assetBanks = await loadAssetBanks(options?.bundledJson);
        const banks = normalizeKnownBankAliases(
          mergeAssetBankDefinitions(normalizedBanks, assetBanks),
        );

        if (
          !sameBankLists(filteredBanks, banks) ||
          filteredBanks.length !== parsedBanks.length
        ) {
          await saveBanks(banks, db);
        }
        console.log(`debug: Loaded ${banks.length} banks from database`);
        return banks;
      }
    } catch (e) {
      console.log(`debug: Error parsing stored banks: ${e}`);
      // Fall through to fetch from remote
    }
  }

  if (allowRemoteFetch) {
    // If not in database, try to fetch from remote (only if internet available)
    const hasInternet = await hasInternetConnection();
    if (hasInternet) {
      try {
        const banks = await fetchRemoteBanks();
        if (banks.length > 0) {
          if (db) await saveBanks(banks, db);
          return banks;
        }
      } catch (e) {
        console.log(`debug: Error fetching remote banks: ${e}`);
      }
    } else {
      console.log("debug: No internet connection, cannot fetch remote banks");
    }
  }

  // Fallback to asset list if no banks found
  console.log("debug: No banks available, using assets");
  const assetBanks = await loadAssetBanks(options?.bundledJson);
  // if (assetBanks.length > 0 && db) {
  if (assetBanks.length > 0) {
    // console.log("Asset Banks: ", assetBanks);
    await saveBanks(assetBanks, db);
  }
  return assetBanks;
}

// ============================================================================
// Method 15: hasInternetConnection (lines 278–298)
// ============================================================================
export async function hasInternetConnection(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch("https://www.google.com", {
      method: "HEAD",
      signal: controller.signal,
    });
    return response.status === 200 || response.ok;
  } catch (e) {
    console.log(`debug: Error checking connectivity: ${e}`);
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// Method 16: parseBanksFromJson (lines 300–326)
// ============================================================================
export function parseBanksFromJson(body: string): Bank[] {
  let normalizedBody = body.trim();
  if (
    normalizedBody.startsWith("export") ||
    normalizedBody.startsWith("const") ||
    normalizedBody.startsWith("var") ||
    normalizedBody.startsWith("let")
  ) {
    const jsonMatch = normalizedBody.match(/(\[[\s\S]*\])|(\{[\s\S]*\})/);
    if (jsonMatch != null && jsonMatch[0] != null) {
      normalizedBody = jsonMatch[0];
    }
  }

  try {

    const jsonData = JSON.parse(normalizedBody);
    // console.log('bank config json body - bank only', JSON.stringify(jsonData));
    if (Array.isArray(jsonData)) {
      return jsonData.map((item) => parseBank(item as Record<string, any>));
    }
    if (
      jsonData &&
      typeof jsonData === "object" &&
      Array.isArray(jsonData["banks"])
    ) {
      const banksList = jsonData["banks"] as any[];
      return banksList.map((item) => parseBank(item as Record<string, any>));
    }
  } catch { }

  return [];
}

// ============================================================================
// Method 17: fetchRemoteBanks (lines 328–350)
// ============================================================================
export async function fetchRemoteBanks(): Promise<Bank[]> {
  const url = "https://sms-parsing-visualizer.vercel.app/banks.json";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });

    if (response.status === 200) {
      const responseText = await response.text();
      const banks = normalizeKnownBankAliases(
        filterCashBanks(parseBanksFromJson(responseText)),
      );

      // console.log(`debug: Fetched ${parseBanksFromJson(responseText)} banks from remote`);
      // console.log(`debug: Fetched ${banks.length} banks from remote`);
      return banks;
    } else {
      console.log(`debug: Remote fetch failed with status ${response.status}`);
      return [];
    }
  } catch (e) {
    console.log(`debug: Exception fetching remote banks: ${e}`);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// Method 18: saveBanks (lines 352–379)
// ============================================================================
export async function saveBanks(
  banks: Bank[],
  db?: DatabaseClient,
): Promise<void> {
  if (!db) {
    console.log(
      `debug: No database provided, skipping save of ${banks.length} banks`,
    );
    return;
  }

  // Clear existing banks and insert new ones
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM banks");

    for (const bank of banks) {
      await db.runAsync(
        `INSERT OR REPLACE INTO banks (
          id, name, shortName, codes, image, maskPattern, uniformMasking, simBased, colors
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          bank.id,
          bank.name,
          bank.shortName,
          JSON.stringify(bank.codes),
          bank.image,
          bank.maskPattern,
          bank.uniformMasking == null ? null : bank.uniformMasking ? 1 : 0,
          bank.simBased == null ? null : bank.simBased ? 1 : 0,
          bank.colors != null ? JSON.stringify(bank.colors) : null,
        ],
      );
    }
  });

  console.log(`debug: Saved ${banks.length} banks to database`);
}

// ============================================================================
// Method 19: syncRemoteConfig (lines 381–403)
// ============================================================================
export async function syncRemoteConfig(
  options?: SyncRemoteConfigOptions,
): Promise<void> {
  const hasInternet = await hasInternetConnection();
  if (!hasInternet) {
    console.log("debug: No internet connection, skipping remote sync");
    return;
  }

  try {
    const banks = await fetchRemoteBanks();
    if (banks.length > 0) {
      if (options?.db) {
        await saveBanks(banks, options.db);
      }
      console.log("debug: Successfully synced remote banks config");
    } else {
      console.log("debug: Remote sync returned empty banks");
    }
  } catch (e) {
    console.log(`debug: Error syncing remote banks config: ${e}`);
    if (options?.showError) {
      throw e;
    }
  }
}

// ============================================================================
// Method 20: initializeBanks (lines 405–448)
// ============================================================================
export async function initializeBanks(
  options?: InitializeBanksOptions,
): Promise<boolean> {
  const db = options?.db;

  // If banks exist, return (no sync - sync only happens on explicit refresh)
  if (db) {
    try {
      const maps = await db.getAllAsync<BankDbRow>(
        "SELECT id FROM banks LIMIT 1",
      );
      if (maps.length > 0) {
        return false; // No internet needed, we have cached banks
      }
    } catch { }
  }

  // No banks stored, need to fetch
  const hasInternet = await hasInternetConnection();
  if (!hasInternet) {
    const assetBanks = await loadAssetBanks(options?.bundledJson);
    if (assetBanks.length > 0 && db) {
      await saveBanks(assetBanks, db);
    }
    return false;
  }

  // Fetch and save banks
  try {
    const banks = await fetchRemoteBanks();
    if (banks.length > 0) {
      if (db) await saveBanks(banks, db);
      return false; // Success
    } else {
      const assetBanks = await loadAssetBanks(options?.bundledJson);
      if (assetBanks.length > 0 && db) {
        await saveBanks(assetBanks, db);
      }
      return false;
    }
  } catch (e) {
    console.log(`debug: Error initializing banks: ${e}`);
    const assetBanks = await loadAssetBanks(options?.bundledJson);
    if (assetBanks.length > 0 && db) {
      await saveBanks(assetBanks, db);
    }
    return false;
  }
}
