CREATE TABLE payment_intents (
  id TEXT PRIMARY KEY,
  test_user_id TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('external_debit', 'external_credit', 'internal_transfer')),
  provider_path TEXT NOT NULL CHECK (provider_path IN ('plaid_transfer', 'checkbook_standard', 'checkbook_marketplace')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  payment_method_id TEXT REFERENCES payment_methods(id),
  counterparty_type TEXT NOT NULL,
  counterparty_ref TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready', 'submitted', 'processing', 'succeeded', 'failed', 'returned', 'canceled', 'action_required')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX payment_intents_test_user_id_idx
  ON payment_intents(test_user_id);

CREATE TABLE provider_operations (
  id TEXT PRIMARY KEY,
  payment_intent_id TEXT NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  external_id TEXT,
  provider_status TEXT,
  request_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (provider, external_id)
);

CREATE INDEX provider_operations_payment_intent_id_idx
  ON provider_operations(payment_intent_id);
