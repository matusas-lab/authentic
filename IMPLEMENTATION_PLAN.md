# Authentic — Updated MVP Implementation Roadmap

## Project objective

Build Authentic as an offline-first bank SMS transaction monitoring application for Ethiopian businesses.

The complete MVP should allow a business owner to:

- Collect historical and incoming bank SMS messages from their Android phone.
- Parse messages into normalized financial transactions.
- Persist transactions locally, including when offline.
- Display transactions as cards.
- Synchronize local transactions with Supabase.
- Authenticate using Google.
- Create a business with an automatically created Main Branch.
- Create cashier and staff accounts.
- Send authorized incoming transactions to cashier devices in real time.
- Display lifetime sales and expense summaries to the owner.
- Display only a daily sales summary to cashiers and staff.
- Search and filter transactions by date and other attributes.
- Export business transaction reports to Excel.

The implementation must prioritize the actual financial logic and edge cases already handled by the Totals Flutter application wherever that logic applies to Authentic.

---

# 1. Fixed technology stack

| Layer                  | Technology                                              |
| ---------------------- | ------------------------------------------------------- |
| Mobile application     | Expo SDK 57                                             |
| Language               | TypeScript                                              |
| State management       | Legend-State v2                                         |
| Local persistence      | MMKV v4                                                 |
| MMKV native dependency | `react-native-nitro-modules`                            |
| Backend                | Supabase                                                |
| Authentication         | Supabase Auth                                           |
| Owner authentication   | Google OAuth                                            |
| Database               | PostgreSQL                                              |
| Database types         | Supabase-generated TypeScript types                     |
| Realtime delivery      | Supabase Realtime Broadcast                             |
| SMS collection         | Existing Kotlin SMS reader and Expo background listener |
| SMS parsing            | Existing bank SMS parser                                |
| Remote persistence     | Legend-State v2 Generic Remote Persistence              |
| Excel export           | Expo-compatible XLSX generation and file sharing        |

Do not migrate to Legend-State v3.

Do not introduce TinyBase, WatermelonDB, PowerSync, Redis, or another synchronization framework.

## 1.1 MMKV v4 requirements

Replace AsyncStorage directly. There is no production customer data requiring migration.

Use MMKV v4 with its Nitro Modules dependency.

Use Expo's dependency compatibility resolver and rebuild the native application. Test with a development build or physical Android device, not Expo Go.

Important compatibility requirement:

Legend-State v2 documents its built-in `ObservablePersistMMKV` adapter, but do not assume that the installed version is compatible with MMKV v4.

Inspect the actual adapter implementation and the installed type definitions.

MMKV v4 changed its API:

- Instance creation uses `createMMKV()`.
- Key deletion uses `.remove()`.
- Nitro Modules is required.

If the Legend-State v2 adapter still uses the older MMKV constructor or `.delete()` API, implement a minimal custom local persistence adapter that satisfies the Legend-State v2 persistence plugin contract while using MMKV v4 internally.

Do not patch unrelated Legend-State functionality or upgrade its major version just to accommodate MMKV.

The desired result is:

**Legend-State v2 observables → Legend-State persistence → MMKV v4.**

## 1.2 Persistence responsibility

Use Legend-State for:

- Local transaction state.
- Local account state.
- SMS processing metadata.
- Pending remote changes.
- Remote transaction synchronization.
- Reactive transaction cards and summaries.

Keep device-only metadata separate from cloud transaction data.

The application must remain useful when offline, and a locally persisted transaction must never depend on a successful Supabase request.

---

# 2. Reference implementation — Totals Flutter application

## Objective

Use the existing open-source Totals Flutter application as a reference implementation throughout the development of Authentic.

The Totals application is already available in the IDE workspace (`../rn-demo/totals-playstore-version-latest`). Treat it as an existing implementation to study, not merely as inspiration.

Before translating a feature, trace its actual implementation through the relevant source files.

### 2.1 Source directories to inspect

Inspect the following directories in the Totals project:

- `services/`
- `utils/`
- `providers/`
- `screens/`
- `repositories/`
- `widgets/`
- `database/`
- `background/`
- `bootstrap/`

Also inspect:

- `DatabaseHelper` and its current schema.
- Dart data models.
- SMS listener and historical SMS reader implementations.
- Transaction parsing and normalization.
- Account identification and SIM assignment.
- Transaction aggregation and date calculations.
- Local persistence and synchronization behavior.
- Relevant tests and error-handling paths.

Follow the actual execution path:

**Screens → Provider → Service → Utility / Model → DatabaseHelper**

Do not inspect only the page UI and recreate its apparent behavior without studying the underlying business logic.

### 2.2 Business logic to translate

Prioritize existing Totals logic that applies to Authentic:

1. Historical SMS retrieval.
2. Realtime SMS collection.
3. Message classification (within `sms_services.dart`).
4. Bank SMS parsing.
5. Transaction normalization.
6. Duplicate transaction prevention.
7. Bank/account identification.
8. SIM and subscription assignment.
9. Transaction date and time interpretation.
10. Balance extraction and account updates.
11. Failed parsing diagnostics.
12. Transaction ordering and filtering.
13. Transaction aggregation and summary calculations.
14. Currency and number formatting.
15. Data export and report calculations where applicable.

Pay particular attention to production edge cases already handled by the existing services and utilities of Totals:

- Two messages with the same amount but different references.
- Duplicate SMS delivery through historical and incoming sources.
- Masked bank account numbers.
- Multiple bank accounts and SIM subscriptions.
- Missing transaction dates.
- Inferred dates.
- Bank-specific transaction references.
- Messages containing service charges, VAT, or DRRF.
- Balance notifications that are not transactions.
- Failed parsing and subsequent reprocessing.

Do not invent new parsing or aggregation behavior if Totals already implements the required logic correctly. Understand the existing implementation first, then translate it into TypeScript and test the equivalent behavior.

### 2.3 Database naming compatibility

Preserve Totals table names when the business meaning still matches.

Use these names:

| Existing Totals table             | Authentic decision                                                        |
| --------------------------------- | ------------------------------------------------------------------------- |
| `transactions`                    | Retain (using `type` for `'CREDIT'` and `'DEBIT'`)                        |
| `accounts`                        | Retain instead of introducing `bank_accounts`                             |
| `banks`                           | Retain                                                                    |
| `failed_parses`                   | Retain                                                                    |
| `categories`                      | Retain for business settings (income/expense flows, COGS, tax-deductible) |
| `transaction_source_sms`          | Retain as local-only storage                                              |
| `profiles`                        | Replace with business membership concepts                                 |
| `user_accounts`                   | Exclude unless an actual MVP requirement needs it                         |
| `budgets`                         | Exclude                                                                   |
| `auto_category_rules`             | Exclude                                                                   |
| `auto_category_prompt_dismissals` | Exclude                                                                   |
| `receiver_category_mappings`      | Exclude                                                                   |
| `loan_debt_entries`               | Exclude                                                                   |
| `loan_debt_repayments`            | Exclude                                                                   |
| `reimbursement_allocations`       | Exclude                                                                   |
| `sync_destinations`               | Exclude                                                                   |
| `sync_rules`                      | Exclude                                                                   |
| `sync_outbox`                     | Do not duplicate Legend-State's local pending-change mechanism            |
| `sync_runtime_locks`              | Exclude                                                                   |

Introduce new tables only where Authentic has genuinely different business-domain requirements, such as businesses, branches, memberships, and devices.

### 2.4 Totals parity requirement

Maintain a feature-level mapping between the existing Totals logic and Authentic:

- Existing Totals implementation.
- Existing edge cases.
- Authentic equivalent.
- Behavior intentionally excluded.
- Tests that demonstrate equivalent behavior.

---

# 3. Milestone 0 — Database schema foundation and generated types ✅ (DONE)

- [x] Schema designed and verified against Totals conventions.
- [x] Organizational tables: `businesses`, `branches`, `business_members`, `branch_memberships`.
- [x] Device tables: `devices` (with Android debug fields), `device_assignments`, `device_bank_accounts`.
- [x] Bank reference: `banks` seeded with CBE, Awash, BOA, Dashen, Telebirr.
- [x] Account table: `accounts` with masked numbers and match keys.
- [x] Business categories: `categories` seeded with retail chart of accounts.
- [x] Transactions: `transactions` with `type` ('CREDIT'|'DEBIT'), `category_id`, `category_ids`, and `UNIQUE (business_id, source_fingerprint)`.
- [x] Diagnostics: `failed_parses`.
- [x] Row Level Security (RLS) enabled on all 12 tables.
- [x] TypeScript types generated in `src/lib/supabase/database.types.ts`.
- [x] Verified with `tsc` (0 errors).

---

# 4. Milestone 1 — Historical and incoming SMS parsing with local persistence

**Objective:** Parse and persist both historical and incoming SMS messages locally before implementing remote synchronization. The application must work without an authenticated Supabase session and without internet access.

### 4.1 Shared processing pipeline

**Raw SMS → Classification → Parsing → Normalization → Fingerprinting → Local persistence**

### 4.2 SMS classification

Handle: OTP, Credit, Debit, Transfer, Payment, Balance notification, Bank alert, Fee/DRRF, Unrecognized. Only valid financial transaction messages create cards. Balance-only SMS updates local account state.

### 4.3 Transaction normalization

Extract: Amount, Currency, Direction/Type, Bank, Account, Creditor/Receiver, Reference, Transaction time, SMS received time, Balance, Fees (VAT/DRRF/charges), Fingerprint.

### 4.4 Fingerprinting and deduplication

Deterministic fingerprint generated consistently across historical import and real-time incoming SMS.

### 4.5 Historical SMS import

Batch reader with progress tracking and resumption window.

### 4.6 Incoming SMS collection

Headless background receiver persisting locally before requiring network.

### 4.7 Local state

Legend-State v2 with MMKV v4 adapter (`ObservablePersistMMKVv4`).

---

# 5. Milestone 2 — Transaction cards and owner dashboard using local data

**Objective:** Display locally persisted transactions before depending on Supabase.

### 5.1 Transaction cards

Reusable transaction cards showing amount, credit/debit indicator, payer/receiver, bank, reference, time, and status.

### 5.2 Owner summary cards

- **Total Lifetime Sales:** Sum of valid credit transactions captured since `tracking_started_at`.
- **Total Lifetime Expenses:** Sum of valid debit transactions captured since `tracking_started_at`.

### 5.3 Owner dashboard & local filters

Newest first, credit/debit filters, search by payer/receiver/amount/reference, date range filters, bank filters.

---

# 6. Milestone 3 — First Supabase synchronization using Legend-State v2

**Objective:** Prove that Legend-State v2 Generic Remote Persistence synchronizes a locally persisted transaction to Supabase.

### 6.1 Vertical slice

One transaction: Raw SMS → Parse → Normalize → Fingerprint → Persist locally in MMKV → Sync to Supabase via Legend-State Generic Remote Persistence.

### 6.2 Idempotency and offline retries

Offline transaction creation, request timeout handling, retry on reconnect, idempotency via `source_fingerprint`.

---

# 7. Milestone 4 — Owner authentication, business onboarding, and RLS

**Objective:** Connect the synchronization flow to authenticated business owners.

### 7.1 Owner Google login

Supabase Auth with Google OAuth.

### 7.2 Business onboarding

Atomic creation of Business, Main Branch, Owner Membership, and `tracking_started_at`.

### 7.3 Multi-tenant RLS

Strict row-level policies enforcing business boundaries. Cashiers cannot access owner account balances or raw SMS records.

---

# 8. Milestone 5 — Staff creation and cashier authentication

**Objective:** Allow owners to create cashier accounts with usernames and passwords (no email required).

- Owner creates cashiers with username + temporary password.
- Server-side Auth identifier resolution.
- Cashier login form: Business code + Username + Password.

---

# 9. Milestone 6 — Supabase Broadcast and real-time cashier transaction feed

**Objective:** Real-time transaction delivery to cashier devices using Supabase Realtime Broadcast.

- Database trigger sends curated Broadcast payload (explicitly excluding owner `current_balance` and account balances).
- Private business channel authorization.
- Cashier Daily Sales Summary (today's sales total and transaction count only; no lifetime summaries).

---

# 10. Milestone 7 — Daily, periodic transactions, and lifetime summaries

**Objective:** Timezone-aware reporting and advanced filtering (`Africa/Addis_Ababa`).

- Today, Yesterday, Last 7 days, Last 30 days, Current month, Custom range.
- Indexed and paginated database queries.

---

# 11. Milestone 8 — Excel transaction and sales report export

**Objective:** Export `.xlsx` workbooks with summary and transaction sheets.

- Reporting periods: Today, Yesterday, Last 7/30 days, Current month, Custom, Lifetime.
- Zero private SMS or sensitive balance data exported.

---

# 12. Final MVP definition of done

1. Owner Google sign-in.
2. Business + Main Branch creation.
3. Owner SMS-source phone registration.
4. Historical SMS import.
5. Incoming SMS collection.
6. Shared parsing pipeline.
7. Local persistence with Legend-State v2 + MMKV v4.
8. Fingerprint deduplication.
9. Owner transaction cards.
10. Owner lifetime sales & expense summaries.
11. Local transaction syncs to Supabase.
12. Offline retry surviving app restart.
13. Staff account creation (username/password).
14. Realtime Broadcast to cashier devices.
15. Sensitive balance fields excluded from cashier payload.
16. Cashier sees daily sales summary only.
17. Date and attribute search/filters.
18. Excel report export.
