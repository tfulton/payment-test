CREATE TABLE demo_entities (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('owner_operator', 'broker')),
  email TEXT NOT NULL UNIQUE,
  account_holder_type TEXT NOT NULL CHECK (account_holder_type IN ('personal', 'business')),
  created_at TEXT NOT NULL
);

CREATE TABLE demo_cash_outs (
  id TEXT PRIMARY KEY,
  demo_entity_id TEXT NOT NULL REFERENCES demo_entities(id),
  provider_path TEXT NOT NULL CHECK (provider_path IN ('plaid_transfer', 'checkbook_standard', 'checkbook_marketplace')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'submitted', 'succeeded', 'failed', 'returned', 'canceled', 'action_required')),
  idempotency_key TEXT NOT NULL UNIQUE,
  provider_intent_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX demo_cash_outs_entity_idx
  ON demo_cash_outs(demo_entity_id);

CREATE TABLE demo_balance_entries (
  id TEXT PRIMARY KEY,
  demo_entity_id TEXT NOT NULL REFERENCES demo_entities(id),
  bucket TEXT NOT NULL CHECK (bucket IN ('available', 'reserved', 'paid')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor <> 0),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('seed_earnings', 'cash_out_reserved', 'cash_out_settled', 'cash_out_released')),
  cash_out_id TEXT REFERENCES demo_cash_outs(id),
  created_at TEXT NOT NULL
);

CREATE INDEX demo_balance_entries_entity_idx
  ON demo_balance_entries(demo_entity_id);

INSERT INTO demo_entities (id, display_name, entity_type, email, account_holder_type, created_at)
VALUES
  ('owner1', 'Avery Owner', 'owner_operator', 'owner1@example.com', 'personal', datetime('now')),
  ('owner2', 'Jordan Hauling LLC', 'owner_operator', 'owner2@example.com', 'business', datetime('now')),
  ('broker1', 'Morgan Broker', 'broker', 'broker1@example.com', 'personal', datetime('now')),
  ('broker2', 'Summit Brokerage LLC', 'broker', 'broker2@example.com', 'business', datetime('now'));

INSERT INTO demo_balance_entries (id, demo_entity_id, bucket, amount_minor, entry_type, cash_out_id, created_at)
VALUES
  ('seed-owner1', 'owner1', 'available', 2500000, 'seed_earnings', NULL, datetime('now')),
  ('seed-owner2', 'owner2', 'available', 4000000, 'seed_earnings', NULL, datetime('now')),
  ('seed-broker1', 'broker1', 'available', 7500000, 'seed_earnings', NULL, datetime('now')),
  ('seed-broker2', 'broker2', 'available', 10000000, 'seed_earnings', NULL, datetime('now'));
