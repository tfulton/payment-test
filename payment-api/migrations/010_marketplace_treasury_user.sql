CREATE TABLE marketplace_treasury_users (
  id TEXT PRIMARY KEY,
  checkbook_user_id TEXT NOT NULL UNIQUE,
  checkbook_user_ref TEXT NOT NULL UNIQUE,
  checkbook_publishable_key TEXT NOT NULL,
  checkbook_api_secret TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
