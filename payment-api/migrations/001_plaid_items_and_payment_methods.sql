CREATE TABLE plaid_items (
  id TEXT PRIMARY KEY,
  test_user_id TEXT NOT NULL,
  plaid_environment TEXT NOT NULL CHECK (plaid_environment IN ('sandbox', 'production')),
  plaid_item_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  institution_id TEXT,
  institution_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'disconnected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (plaid_environment, plaid_item_id)
);

CREATE TABLE payment_methods (
  id TEXT PRIMARY KEY,
  plaid_item_id TEXT NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'plaid' CHECK (provider = 'plaid'),
  plaid_account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  official_name TEXT,
  mask TEXT,
  account_type TEXT NOT NULL,
  account_subtype TEXT,
  verification_status TEXT,
  can_transfer_in INTEGER CHECK (can_transfer_in IN (0, 1) OR can_transfer_in IS NULL),
  can_transfer_out INTEGER CHECK (can_transfer_out IN (0, 1) OR can_transfer_out IS NULL),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (plaid_item_id, plaid_account_id)
);

CREATE INDEX payment_methods_plaid_item_id_idx
  ON payment_methods(plaid_item_id);
