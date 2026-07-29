WITH ranked_payment_methods AS (
  SELECT
    payment_methods.id,
    ROW_NUMBER() OVER (
      PARTITION BY plaid_items.test_user_id, plaid_items.plaid_environment
      ORDER BY payment_methods.updated_at DESC, payment_methods.id DESC
    ) AS active_rank
  FROM payment_methods
  JOIN plaid_items ON plaid_items.id = payment_methods.plaid_item_id
  WHERE payment_methods.status = 'active'
    AND plaid_items.status = 'active'
)
UPDATE payment_methods
SET status = 'removed', updated_at = datetime('now')
WHERE id IN (
  SELECT id
  FROM ranked_payment_methods
  WHERE active_rank > 1
);
