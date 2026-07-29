ALTER TABLE payment_methods
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'removed'));

CREATE INDEX payment_methods_status_idx
  ON payment_methods(status);
