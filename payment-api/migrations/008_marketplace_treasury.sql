CREATE TABLE marketplace_treasury_wallets (
  id TEXT PRIMARY KEY,
  checkbook_wallet_id TEXT NOT NULL UNIQUE,
  name TEXT,
  provider_balance_minor INTEGER,
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
