-- =============================================================================
-- Migration: 20261102000000_milestone_0_foundation.sql
-- Authentic MVP Milestone 0: Database Schema Foundation & Generated Types
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ORGANIZATIONAL TABLES
-- -----------------------------------------------------------------------------

-- Businesses
CREATE TABLE public.businesses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  business_type       TEXT,
  currency_code       TEXT NOT NULL DEFAULT 'ETB',
  timezone            TEXT NOT NULL DEFAULT 'Africa/Addis_Ababa',
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tracking_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at         TIMESTAMPTZ
);

-- Branches (At most one Main Branch per business)
CREATE TABLE public.branches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  code                TEXT,
  address             TEXT,
  is_main             BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_branches_one_main_per_business
  ON public.branches(business_id)
  WHERE is_main = true;

CREATE INDEX idx_branches_business_id
  ON public.branches(business_id);

-- Business Members (Owners, Managers, Cashiers, Staff)
CREATE TABLE public.business_members (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  username            TEXT,
  normalized_username TEXT,
  display_name        TEXT NOT NULL,
  phone               TEXT,
  role                TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('owner', 'admin', 'manager', 'cashier', 'viewer')),
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_business_members_business_user UNIQUE (business_id, user_id)
);

CREATE UNIQUE INDEX idx_business_members_normalized_username
  ON public.business_members(business_id, normalized_username)
  WHERE normalized_username IS NOT NULL;

-- Branch Memberships
CREATE TABLE public.branch_memberships (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id            UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  branch_id              UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  member_id              UUID NOT NULL REFERENCES public.business_members(id) ON DELETE CASCADE,
  assigned_by_member_id  UUID REFERENCES public.business_members(id) ON DELETE SET NULL,
  is_active              BOOLEAN NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_branch_memberships_branch_member UNIQUE (branch_id, member_id)
);

CREATE INDEX idx_branch_memberships_lookup
  ON public.branch_memberships(business_id, member_id, branch_id);

-- -----------------------------------------------------------------------------
-- 2. DEVICE TABLES
-- -----------------------------------------------------------------------------

-- Devices (SMS Source phone, Cashier terminal, Owner terminal)
CREATE TABLE public.devices (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id            UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  branch_id              UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  device_key             TEXT,
  device_name            TEXT NOT NULL,
  device_type            TEXT NOT NULL DEFAULT 'sms_source' CHECK (device_type IN ('sms_source', 'cashier_terminal', 'owner_terminal')),
  platform               TEXT NOT NULL DEFAULT 'android',
  app_version            TEXT,
  os_version             TEXT,           -- e.g. "Android 14"
  api_level              INTEGER,        -- e.g. 34 (Android API Level for debugging)
  device_model           TEXT,           -- e.g. "SM-A525F"
  device_manufacturer    TEXT,           -- e.g. "Samsung"
  registered_by_member_id UUID REFERENCES public.business_members(id) ON DELETE SET NULL,
  is_active              BOOLEAN NOT NULL DEFAULT true,
  last_seen_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at             TIMESTAMPTZ
);

CREATE INDEX idx_devices_business_branch
  ON public.devices(business_id, branch_id);

-- Device Member Assignments
CREATE TABLE public.device_assignments (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id            UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  device_id              UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  member_id              UUID NOT NULL REFERENCES public.business_members(id) ON DELETE CASCADE,
  assigned_by_member_id  UUID REFERENCES public.business_members(id) ON DELETE SET NULL,
  is_active              BOOLEAN NOT NULL DEFAULT true,
  assigned_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at             TIMESTAMPTZ
);

-- -----------------------------------------------------------------------------
-- 3. BANK REFERENCE TABLE
-- -----------------------------------------------------------------------------

CREATE TABLE public.banks (
  id              INTEGER PRIMARY KEY,
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  short_name      TEXT NOT NULL,
  sender_ids      TEXT NOT NULL,
  logo_url        TEXT,
  mask_pattern    INTEGER DEFAULT 4,
  uniform_masking BOOLEAN DEFAULT true,
  sim_based       BOOLEAN DEFAULT false,
  colors          TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 4. ACCOUNTS (Business Bank / Till Accounts)
-- -----------------------------------------------------------------------------

CREATE TABLE public.accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  branch_id             UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  bank_id               INTEGER NOT NULL REFERENCES public.banks(id),
  account_number_masked TEXT NOT NULL,
  account_match_key     TEXT NOT NULL,
  account_holder_name   TEXT NOT NULL,
  balance               NUMERIC(14,2) NOT NULL DEFAULT 0,
  settled_balance       NUMERIC(14,2),
  pending_credit        NUMERIC(14,2),
  currency_code         TEXT NOT NULL DEFAULT 'ETB',
  include_in_totals     BOOLEAN NOT NULL DEFAULT true,
  is_dormant            BOOLEAN NOT NULL DEFAULT false,
  is_default            BOOLEAN NOT NULL DEFAULT false,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  balance_updated_at    TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_accounts_business_bank_match UNIQUE (business_id, bank_id, account_match_key)
);

CREATE INDEX idx_accounts_business_bank
  ON public.accounts(business_id, bank_id);

-- Device Bank Accounts (monitored by SMS-source device)
CREATE TABLE public.device_bank_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  device_id             UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  account_id            UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  sim_label             TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_by_member_id  UUID REFERENCES public.business_members(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_device_bank_accounts UNIQUE (device_id, account_id)
);

-- -----------------------------------------------------------------------------
-- 5. BUSINESS CATEGORIES (Chart of Accounts / Business Expense & Income)
-- -----------------------------------------------------------------------------

CREATE TABLE public.categories (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  flow                TEXT NOT NULL CHECK (flow IN ('income', 'expense')),
  code                TEXT,                               -- optional accounting code e.g. "4010"
  is_cogs             BOOLEAN NOT NULL DEFAULT false,     -- Cost of Goods Sold vs Operating Expense
  is_tax_deductible   BOOLEAN NOT NULL DEFAULT true,
  uncategorized       BOOLEAN NOT NULL DEFAULT false,     -- True for default uncategorized fallback bucket
  icon_key            TEXT,
  color_key           TEXT,
  description         TEXT,
  is_builtin          BOOLEAN NOT NULL DEFAULT false,
  builtin_key         TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_categories_business_name_flow UNIQUE (business_id, name, flow)
);

CREATE INDEX idx_categories_business_flow
  ON public.categories(business_id, flow);

CREATE INDEX idx_categories_business_uncategorized
  ON public.categories(business_id, uncategorized);

-- -----------------------------------------------------------------------------
-- 6. TRANSACTIONS
-- -----------------------------------------------------------------------------

CREATE TABLE public.transactions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id              UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  branch_id                UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  account_id               UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  bank_id                  INTEGER REFERENCES public.banks(id) ON DELETE SET NULL,
  source_device_id         UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  
  -- Categorization
  category_id              UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  category_ids             JSONB,                            -- Array of category UUIDs for split transactions
  
  -- Financial Attributes
  amount                   NUMERIC(14,2) NOT NULL DEFAULT 0,
  reference                TEXT,
  creditor                 TEXT,
  receiver                 TEXT,
  note                     TEXT,
  transaction_at           TIMESTAMPTZ,
  transaction_time_inferred BOOLEAN NOT NULL DEFAULT false,
  status                   TEXT DEFAULT 'CLEARED',
  current_balance          NUMERIC(14,2),
  service_charge           NUMERIC(14,2),
  vat                      NUMERIC(14,2),
  disaster_recovery        NUMERIC(14,2),
  total_amount             NUMERIC(14,2),
  
  -- Totals naming convention: 'CREDIT' or 'DEBIT'
  type                     TEXT,
  transaction_link         TEXT,
  account_number           TEXT,
  owner_account_number     TEXT,
  currency_code            TEXT NOT NULL DEFAULT 'ETB',
  
  -- Provenance & Deduplication
  source_type              TEXT DEFAULT 'bank_sms',
  source_message_id        TEXT,
  source_fingerprint       TEXT NOT NULL,
  owner_assignment_source  TEXT,
  captured_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  sms_received_at          TIMESTAMPTZ,
  parser_version           TEXT,
  
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Hard deduplication guarantee: same fingerprint within business cannot be duplicated
  CONSTRAINT uq_transactions_business_fingerprint UNIQUE (business_id, source_fingerprint)
);

CREATE INDEX idx_transactions_business_date
  ON public.transactions(business_id, transaction_at DESC);

CREATE INDEX idx_transactions_business_type_date
  ON public.transactions(business_id, type, transaction_at DESC);

CREATE INDEX idx_transactions_business_captured
  ON public.transactions(business_id, captured_at DESC);

CREATE INDEX idx_transactions_business_branch
  ON public.transactions(business_id, branch_id);

CREATE INDEX idx_transactions_business_category
  ON public.transactions(business_id, category_id);

-- -----------------------------------------------------------------------------
-- 7. DIAGNOSTICS: FAILED PARSES
-- -----------------------------------------------------------------------------

CREATE TABLE public.failed_parses (
  id                BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  business_id       UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  source_device_id  UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  sender            TEXT NOT NULL,
  body              TEXT NOT NULL,
  reason            TEXT,
  parser_version    TEXT,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_failed_parses_business_date
  ON public.failed_parses(business_id, received_at DESC);

-- -----------------------------------------------------------------------------
-- 8. SEED DATA (DEVELOPMENT ENVIRONMENT)
-- -----------------------------------------------------------------------------

-- Development Business
INSERT INTO public.businesses (id, name, business_type, currency_code, timezone, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Authentic Dev Business',
  'Retail Store',
  'ETB',
  'Africa/Addis_Ababa',
  'active'
) ON CONFLICT (id) DO NOTHING;

-- Initial Main Branch
INSERT INTO public.branches (id, business_id, name, code, is_main, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Main Branch',
  'MAIN',
  true,
  true
) ON CONFLICT (id) DO NOTHING;

-- Seed Default Business Categories
INSERT INTO public.categories (id, business_id, name, flow, code, is_cogs, uncategorized, is_builtin, builtin_key, icon_key, color_key)
VALUES
  -- Income categories
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Product Sales', 'income', '4010', false, false, true, 'income_sales', 'shopping_bag', '#10B981'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Service Revenue', 'income', '4020', false, false, true, 'income_services', 'build', '#3B82F6'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Other Income', 'income', '4090', false, false, true, 'income_other', 'attach_money', '#8B5CF6'),
  ('00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000000001', 'Uncategorized Income', 'income', '4999', false, true, true, 'income_uncategorized', 'help_outline', '#64748B'),

  -- Expense categories
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'Inventory & Supplies (COGS)', 'expense', '5010', true, false, true, 'expense_cogs', 'inventory_2', '#EF4444'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'Rent & Store Utilities', 'expense', '6010', false, false, true, 'expense_rent_utilities', 'storefront', '#F59E0B'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001', 'Salaries & Staff Wages', 'expense', '6020', false, false, true, 'expense_salaries', 'badge', '#6366F1'),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000001', 'Bank & Transfer Fees', 'expense', '6030', false, false, true, 'expense_bank_fees', 'account_balance', '#EC4899'),
  ('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000001', 'Taxes & Government Fees', 'expense', '6040', false, false, true, 'expense_taxes', 'receipt_long', '#64748B'),
  ('00000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000000001', 'General Business Expenses', 'expense', '6090', false, false, true, 'expense_general', 'receipt', '#94A3B8'),
  ('00000000-0000-0000-0000-000000000029', '00000000-0000-0000-0000-000000000001', 'Uncategorized Expense', 'expense', '6999', false, true, true, 'expense_uncategorized', 'help_outline', '#64748B')
ON CONFLICT (id) DO NOTHING;

-- Seed Ethiopian Banks
INSERT INTO public.banks (id, code, name, short_name, sender_ids, logo_url, mask_pattern, uniform_masking, sim_based, colors)
VALUES
  (1, 'CBE', 'Commercial Bank Of Ethiopia', 'CBE', 'CBE', 'assets/images/cbe.png', 4, true, false, '["#7C1055", "#FFD700"]'),
  (2, 'Awash', 'Awash Bank', 'Awash', 'Awash,Awash Bank,AwashBank', 'assets/images/awash.png', 4, true, false, '["#003366", "#FF6600"]'),
  (3, 'BOA', 'Bank Of Abyssinia', 'BOA', 'BOA', 'assets/images/boa.png', 4, true, false, '["#FFA500", "#000000"]'),
  (4, 'Dashen', 'Dashen Bank', 'Dashen', 'Dashen,DashenBank,Dashen Bank,DB SuperApp', 'assets/images/dashen.png', 4, true, false, '["#002B49", "#D4AF37"]'),
  (5, 'Telebirr', 'Ethio Telecom Telebirr', 'Telebirr', '127,telebirr,Telebirr', 'assets/images/telebirr.png', 4, true, true, '["#00A859", "#FFCC00"]')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  sender_ids = EXCLUDED.sender_ids;

-- -----------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.failed_parses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "banks_select_policy" ON public.banks
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "dev_businesses_all" ON public.businesses
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

CREATE POLICY "dev_branches_all" ON public.branches
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

CREATE POLICY "dev_business_members_all" ON public.business_members
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

CREATE POLICY "dev_branch_memberships_all" ON public.branch_memberships
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

CREATE POLICY "dev_devices_all" ON public.devices
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

CREATE POLICY "dev_device_assignments_all" ON public.device_assignments
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

CREATE POLICY "dev_device_bank_accounts_all" ON public.device_bank_accounts
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

CREATE POLICY "dev_accounts_all" ON public.accounts
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

CREATE POLICY "dev_categories_all" ON public.categories
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

CREATE POLICY "dev_transactions_all" ON public.transactions
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

CREATE POLICY "dev_failed_parses_all" ON public.failed_parses
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
