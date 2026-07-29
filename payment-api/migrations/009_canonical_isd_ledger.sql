CREATE TABLE isd_ledger_entries (
  id TEXT PRIMARY KEY,
  demo_entity_id TEXT NOT NULL REFERENCES demo_entities(id),
  bucket TEXT NOT NULL CHECK (bucket IN ('available', 'reserved', 'paid', 'fees', 'manifestation')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor <> 0),
  entry_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  cash_out_id TEXT REFERENCES demo_cash_outs(id),
  provider_path TEXT,
  provider_operation_id TEXT,
  payment_method_id TEXT,
  payment_method_provider TEXT,
  payment_method_label TEXT,
  payment_method_mask TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX isd_ledger_entries_entity_idx
  ON isd_ledger_entries(demo_entity_id, created_at DESC);
CREATE INDEX isd_ledger_entries_cash_out_idx
  ON isd_ledger_entries(cash_out_id);

INSERT INTO isd_ledger_entries (
  id, demo_entity_id, bucket, amount_minor, entry_type, reason,
  cash_out_id, provider_path, provider_operation_id,
  payment_method_id, payment_method_provider, payment_method_label,
  payment_method_mask, created_at
)
SELECT
  balance.id,
  balance.demo_entity_id,
  balance.bucket,
  balance.amount_minor,
  balance.entry_type,
  CASE balance.entry_type
    WHEN 'seed_earnings' THEN 'Initial approved job earnings'
    WHEN 'cash_out_reserved' THEN 'Cash-out reserved'
    WHEN 'cash_out_settled' THEN 'Cash-out settled'
    WHEN 'cash_out_released' THEN 'Cash-out reservation released'
    ELSE balance.entry_type
  END,
  balance.cash_out_id,
  cash_out.provider_path,
  operation.id,
  intent.payment_method_id,
  method.provider,
  CASE
    WHEN method.id IS NULL THEN NULL
    WHEN item.institution_name IS NULL THEN method.name
    ELSE item.institution_name || ' · ' || method.name
  END,
  method.mask,
  balance.created_at
FROM demo_balance_entries AS balance
LEFT JOIN demo_cash_outs AS cash_out ON cash_out.id = balance.cash_out_id
LEFT JOIN payment_intents AS intent ON intent.id = cash_out.provider_intent_id
LEFT JOIN payment_methods AS method ON method.id = intent.payment_method_id
LEFT JOIN plaid_items AS item ON item.id = method.plaid_item_id
LEFT JOIN provider_operations AS operation ON operation.id = (
  SELECT candidate.id
  FROM provider_operations AS candidate
  WHERE candidate.payment_intent_id = intent.id
  ORDER BY candidate.updated_at DESC
  LIMIT 1
);
