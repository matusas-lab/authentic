/**
 * SMS Pattern Matching & Extraction Parser
 *
 * 1-to-1 Functional TypeScript replica of Total's patternparser.dart
 * Location: app/utils/patternparser.ts
 */

import { Bank } from "../models/bank";
import { SmsPattern } from "../models/sms_pattern";
import { getBanks } from "../services/bank_config_service";
import { extractTransactionLinkFromMessage } from "./transaction_link_utils";

// ============================================================================
// extractTransactionDetails
// ============================================================================
/**
 * Iterates through [patterns] that match the [senderAddress].
 * Returns a map of extracted data if a match is found, or null otherwise.
 */
export async function extractTransactionDetails(
  messageBody: string,
  sender: string,
  receivedAt: Date | null,
  patterns: readonly SmsPattern[],
  { banks }: { banks?: Bank[] } = {},
): Promise<any> {
  const cleanBody = messageBody.trim();

  for (const pattern of patterns) {
    // console.log(`debug: Pattern Regex: [${pattern.bankId}] ${pattern.regex}`);

    // 2. Try to match regex
    try {
      // RegExp(pattern.regex, caseSensitive: false, multiLine: true, dotAll: true)
      // Supports Python-style (?P<name>...) converted to ES2018 (?<name>...)
      const sanitizedRegex = pattern.regex.replace(
        /\(\?P<([a-zA-Z0-9]+)>/g,
        "(?<$1>",
      );
      const regExp = new RegExp(sanitizedRegex, "mis");
      const match = regExp.exec(cleanBody);

      if (match != null) {
        // console.log(`debug: ✓ Pattern Matched: ${pattern.description}`);
        const groups = match.groups ?? {};
        const groupNames = Object.keys(groups);
        console.log(
          `debug: Available named groups: ${JSON.stringify(groupNames)}`,
        );

        const extracted: Record<string, unknown> = {};

        // Extract known named groups
        // We support: amount, balance, account, reference, creditor, receiver,
        // sender/source (for incoming transfers), time

        extracted["type"] = pattern.type;
        extracted["bankId"] = pattern.bankId; // Default bank ID from pattern
        extracted["patternDescription"] = pattern.description;

        if ("amount" in groups && groups["amount"] !== undefined) {
          // console.log(`debug: Extracted amount: ${groups["amount"]}`);
          const cleanedAmount = cleanNumber(groups["amount"]);
          extracted["amount"] = cleanedAmount
            ? parseFloat(cleanedAmount)
            : null;
          // console.log(`debug: Extracted amount: ${extracted["amount"]}`);
        }

        if ("balance" in groups && groups["balance"] !== undefined) {
          extracted["currentBalance"] = cleanNumber(groups["balance"]);
          // console.log(
          //   `debug: Extracted balance: ${extracted["currentBalance"]}`,
          // );
        }

        if ("account" in groups && groups["account"] !== undefined) {
          // console.log(
          //   "debug: ✓ after account - entering account extraction block",
          // );
          const raw = groups["account"];
          // console.log(`debug: Raw account value: '${raw}'`);

          if (raw != null) {
            const availableBanks = banks ?? (await getBanks());
            const bank = availableBanks.find((b) => b.id === pattern.bankId);

            // Use bank configuration for account extraction
            if (
              bank &&
              bank.uniformMasking === true &&
              bank.maskPattern != null
            ) {
              // Extract last N digits based on mask pattern
              if (raw.length >= bank.maskPattern) {
                extracted["accountNumber"] = raw.substring(
                  raw.length - bank.maskPattern,
                );
                // console.log(
                //   `Cleaned account (masked): ${extracted["accountNumber"]}`,
                // );
              } else {
                extracted["accountNumber"] = raw;
                // console.log(
                //   `Cleaned account (fallback): ${extracted["accountNumber"]}`,
                // );
              }
            } else {
              // No masking or uniformMasking is false - use full account number
              extracted["accountNumber"] = raw;
              // console.log(
              //   `Cleaned account (direct): ${extracted["accountNumber"]}`,
              // );
            }
          } else {
            // console.log("debug: ✗ Raw account is null!");
          }
        } else {
          // console.log("debug: ✗ 'account' group NOT found in named groups");
        }

        if ("reference" in groups && groups["reference"] !== undefined) {
          extracted["reference"] = groups["reference"];
          // console.log(`debug: Extracted reference: ${extracted["reference"]}`);
        }

        if ("type" in groups && groups["type"] !== undefined) {
          const rawType = groups["type"];
          const normalized = normalizeType(rawType);
          if (normalized != null) {
            extracted["type"] = normalized;
          }
        }

        if ("creditor" in groups && groups["creditor"] !== undefined) {
          extracted["creditor"] = groups["creditor"];
        }

        if ("receiver" in groups && groups["receiver"] !== undefined) {
          extracted["receiver"] = groups["receiver"];
        }

        assignOptionalAmount(extracted, "serviceCharge", groups, [
          "serviceCharge",
          "ServiceCharge",
          "servicecharge",
          "servicecharge",
        ]);

        assignOptionalAmount(extracted, "vat", groups, ["vat", "VAT"]);

        let counterparty = firstNamedGroup(groups, [
          "sender",
          "source",
          "agent",
          "payer",
          "from",
        ]);

        const rawType = String(extracted["type"] ?? pattern.type);
        const normalized = rawType.toUpperCase();
        if (normalized.includes("CREDIT")) {
          if (counterparty == null) {
            counterparty = fallbackCounterparty(cleanBody);
          }
          if (counterparty != null && counterparty.trim().length > 0) {
            if (extracted["creditor"] == null) {
              extracted["creditor"] = counterparty.trim();
            }
          }
        }

        if ("time" in groups && groups["time"] !== undefined) {
          // Date parsing is complex, for now store raw string or try basic parse
          // Ideally the regex extracts ISO-like or we have a date parser helper
          extracted["rawtime"] = groups["time"];
          console.log(`debug: raw Date and time ${extracted["rawtime"]}`);

          extracted["time"] = new Date().toISOString(); // Default to now if parse fails
        } else {
          extracted["time"] = new Date().toISOString();
        }

        const transactionLink = extractTransactionLinkFromMessage({
          messageBody: cleanBody,
          pattern: pattern,
          reference:
            extracted["reference"] != null
              ? String(extracted["reference"])
              : null,
        });
        if (transactionLink != null) {
          extracted["transactionLink"] = transactionLink;
        }

        // console.log(`debug: account ${extracted["accountNumber"]}`);
        // console.log(`debug: amount ${extracted["amount"]}`);
        // console.log(`debug: balance ${extracted["currentBalance"]}`);
        // console.log(`debug: reference ${extracted["reference"]}`);
        // console.log(`debug: receiver ${extracted["receiver"]}`);

        if (pattern.refRequired === false && extracted["reference"] == null) {
          const fallbackDate = receivedAt ?? new Date();
          extracted["reference"] =
            `${pattern.bankId}_${fallbackDate.toLocaleString()}`;
        }

        const requiresReference = pattern.refRequired === true;
        const requiresAccount =
          pattern.hasAccount === true && "account" in groups;

        if (extracted["amount"] == null || Number.isNaN(extracted["amount"])) {
          // console.log(
          //   `✗ Pattern '${pattern.description}' matched but amount missing. Skipping.`,
          // );
          continue;
        }

        if ("balance" in groups && extracted["currentBalance"] == null) {
          // console.log(
          //   `✗ Pattern '${pattern.description}' matched but balance missing. Skipping.`,
          // );
          continue;
        }

        if (requiresReference && extracted["reference"] == null) {
          // console.log(
          //   `✗ Pattern '${pattern.description}' matched but reference missing. Skipping.`,
          // );
          continue;
        }

        if (requiresAccount && extracted["accountNumber"] == null) {
          // console.log(
          //   `✗ Pattern '${pattern.description}' matched but account missing. Skipping.`,
          // );
          continue;
        }

        // console.log(
        //   "debug: ✓ All required fields present. Returning extracted data.",
        // );
        return extracted;
      } else {
        // console.log(`debug: ✗ No match for pattern: ${pattern.description}`);
      }
    } catch (e) {
      console.log(
        `debug: ✗ Error checking pattern '${pattern.description}': ${e}`,
      );
      // Continue to next pattern
    }
  }

  // console.log("debug: \n✗ No matching pattern found for message.");
  return null; // No match found
}

// ============================================================================
// Method 2: assignOptionalAmount
// ============================================================================
export function assignOptionalAmount(
  target: Record<string, any>,
  key: string,
  groups: Record<string, string | undefined>,
  groupNames: readonly string[],
): void {
  for (const name of groupNames) {
    if (!(name in groups) || groups[name] === undefined) continue;
    const cleaned = cleanNumber(groups[name]);
    const value = cleaned == null ? null : parseFloat(cleaned);
    if (value != null && !Number.isNaN(value)) {
      target[key] = value;
    }
    return;
  }
}

// ============================================================================
// Method 3: firstNamedGroup
// ============================================================================
export function firstNamedGroup(
  groups: Record<string, string | undefined>,
  groupNames: readonly string[],
): string | null {
  for (const name of groupNames) {
    if (!(name in groups) || groups[name] === undefined) continue;
    const value = groups[name];
    if (value != null && value.trim().length > 0) return value;
  }
  return null;
}

// ============================================================================
// Method 4: fallbackCounterparty
// ============================================================================
export function fallbackCounterparty(body: string): string | null {
  const patterns = [
    /from\s+(.+?)\s+(?:to|on|at|ref|reference|transaction|balance)/i,
    /by\s+(.+?)\s+(?:on|through|ref|reference|transaction|balance)/i,
    /with\s+agent\s+(.+?)\s+(?:on|at|ref|reference|transaction|balance)/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(body);
    if (match == null) continue;
    const value = match[1]?.trim();
    if (value == null || value.length === 0) continue;
    const lower = value.toLowerCase();
    if (lower.includes("your account")) continue;
    if (lower.includes("your telebirr")) continue;
    if (lower.includes("your mpesa")) continue;
    return value;
  }
  return null;
}

// ============================================================================
// Method 5: cleanNumber
// ============================================================================
export function cleanNumber(input?: string | null): string | null {
  if (input == null) return null;

  let cleaned = input.replace(/,/g, "").trim();
  cleaned = cleaned.replace(/[^0-9.]+$/, "");
  cleaned = cleaned.replace(/\.+$/, "");

  return cleaned;
}

// ============================================================================
// Method 6: normalizeType
// ============================================================================
export function normalizeType(rawType?: string | null): string | null {
  if (rawType == null) return null;
  const lower = rawType.toLowerCase();
  if (lower.includes("debit")) return "DEBIT";
  if (lower.includes("credit")) return "CREDIT";
  return null;
}
