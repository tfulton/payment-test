CREATE TABLE marketplace_participants (
  demo_entity_id TEXT PRIMARY KEY REFERENCES demo_entities(id),
  checkbook_user_id TEXT NOT NULL UNIQUE,
  checkbook_user_ref TEXT NOT NULL UNIQUE,
  checkbook_publishable_key TEXT NOT NULL,
  checkbook_api_secret TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE marketplace_wallets (
  demo_entity_id TEXT PRIMARY KEY REFERENCES marketplace_participants(demo_entity_id),
  checkbook_wallet_id TEXT NOT NULL UNIQUE,
  name TEXT,
  provider_balance_minor INTEGER,
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE marketplace_payment_methods (
  demo_entity_id TEXT PRIMARY KEY REFERENCES marketplace_participants(demo_entity_id),
  payment_method_id TEXT NOT NULL REFERENCES payment_methods(id),
  checkbook_bank_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attached_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE marketplace_ledger_entries (
  id TEXT PRIMARY KEY,
  demo_entity_id TEXT NOT NULL REFERENCES demo_entities(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'admin_credit', 'admin_debit', 'cash_out_principal', 'cash_out_fee', 'adjustment'
  )),
  amount_minor INTEGER NOT NULL CHECK (amount_minor <> 0),
  reason TEXT NOT NULL,
  payment_method_id TEXT,
  payment_method_label TEXT,
  payment_method_mask TEXT,
  provider_operation_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX marketplace_ledger_entity_idx
  ON marketplace_ledger_entries(demo_entity_id, created_at DESC);
