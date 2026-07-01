CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  account VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  balance_cents BIGINT NOT NULL DEFAULT 0,
  frozen_cents BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token VARCHAR(255) PRIMARY KEY,
  account VARCHAR(255) NOT NULL REFERENCES users(account) ON DELETE CASCADE ON UPDATE CASCADE,
  created_at_unix BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account);

CREATE TABLE IF NOT EXISTS user_job_ownership (
  account VARCHAR(255) NOT NULL REFERENCES users(account) ON DELETE CASCADE ON UPDATE CASCADE,
  job_key VARCHAR(512) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account, job_key)
);

CREATE TABLE IF NOT EXISTS instances (
  id BIGSERIAL PRIMARY KEY,
  account VARCHAR(255) NOT NULL REFERENCES users(account) ON DELETE CASCADE ON UPDATE CASCADE,
  cluster_name VARCHAR(128) NOT NULL,
  job_id VARCHAR(255) NOT NULL,
  instance_name VARCHAR(255) NOT NULL,
  partition_name VARCHAR(128),
  image VARCHAR(512),
  cpu INTEGER NOT NULL DEFAULT 0,
  gpu INTEGER NOT NULL DEFAULT 0,
  memory_gib INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(64),
  work_dir VARCHAR(1024),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (cluster_name, job_id)
);

CREATE INDEX IF NOT EXISTS idx_instances_account ON instances(account);

CREATE TABLE IF NOT EXISTS recharge_orders (
  id BIGSERIAL PRIMARY KEY,
  order_no VARCHAR(64) NOT NULL UNIQUE,
  account VARCHAR(255) NOT NULL REFERENCES users(account) ON DELETE CASCADE ON UPDATE CASCADE,
  amount_cents BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  channel VARCHAR(32) NOT NULL DEFAULT 'manual',
  external_trade_no VARCHAR(128),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recharge_orders_account ON recharge_orders(account);
CREATE INDEX IF NOT EXISTS idx_recharge_orders_status ON recharge_orders(status);

CREATE TABLE IF NOT EXISTS balance_ledger (
  id BIGSERIAL PRIMARY KEY,
  account VARCHAR(255) NOT NULL REFERENCES users(account) ON DELETE CASCADE ON UPDATE CASCADE,
  direction VARCHAR(16) NOT NULL,
  amount_cents BIGINT NOT NULL,
  balance_after_cents BIGINT NOT NULL,
  business_type VARCHAR(64) NOT NULL,
  business_id VARCHAR(128),
  note VARCHAR(512),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_balance_ledger_account ON balance_ledger(account);
CREATE INDEX IF NOT EXISTS idx_balance_ledger_business ON balance_ledger(business_type, business_id);

CREATE TABLE IF NOT EXISTS recharge_code_redemptions (
  code_hash CHAR(64) PRIMARY KEY,
  code_id VARCHAR(64) NOT NULL,
  account VARCHAR(255) NOT NULL REFERENCES users(account) ON DELETE CASCADE ON UPDATE CASCADE,
  amount_cents BIGINT NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recharge_code_redemptions_account ON recharge_code_redemptions(account);
