CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  account VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  balance_cents BIGINT NOT NULL DEFAULT 0,
  frozen_cents BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_users_account (account)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token VARCHAR(255) NOT NULL,
  account VARCHAR(255) NOT NULL,
  created_at_unix BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token),
  KEY idx_sessions_account (account),
  CONSTRAINT fk_sessions_account
    FOREIGN KEY (account) REFERENCES users(account)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_job_ownership (
  account VARCHAR(255) NOT NULL,
  job_key VARCHAR(512) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account, job_key),
  CONSTRAINT fk_user_job_ownership_account
    FOREIGN KEY (account) REFERENCES users(account)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS instances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  account VARCHAR(255) NOT NULL,
  cluster_name VARCHAR(128) NOT NULL,
  job_id VARCHAR(255) NOT NULL,
  instance_name VARCHAR(255) NOT NULL,
  partition_name VARCHAR(128) DEFAULT NULL,
  image VARCHAR(512) DEFAULT NULL,
  cpu INT NOT NULL DEFAULT 0,
  gpu INT NOT NULL DEFAULT 0,
  memory_gib INT NOT NULL DEFAULT 0,
  status VARCHAR(64) DEFAULT NULL,
  work_dir VARCHAR(1024) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_instances_cluster_job (cluster_name, job_id),
  KEY idx_instances_account (account),
  CONSTRAINT fk_instances_account
    FOREIGN KEY (account) REFERENCES users(account)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recharge_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_no VARCHAR(64) NOT NULL,
  account VARCHAR(255) NOT NULL,
  amount_cents BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  channel VARCHAR(32) NOT NULL DEFAULT 'manual',
  external_trade_no VARCHAR(128) DEFAULT NULL,
  paid_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_recharge_orders_order_no (order_no),
  KEY idx_recharge_orders_account (account),
  KEY idx_recharge_orders_status (status),
  CONSTRAINT fk_recharge_orders_account
    FOREIGN KEY (account) REFERENCES users(account)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS balance_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  account VARCHAR(255) NOT NULL,
  direction VARCHAR(16) NOT NULL,
  amount_cents BIGINT NOT NULL,
  balance_after_cents BIGINT NOT NULL,
  business_type VARCHAR(64) NOT NULL,
  business_id VARCHAR(128) DEFAULT NULL,
  note VARCHAR(512) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_balance_ledger_account (account),
  KEY idx_balance_ledger_business (business_type, business_id),
  CONSTRAINT fk_balance_ledger_account
    FOREIGN KEY (account) REFERENCES users(account)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recharge_code_redemptions (
  code_hash CHAR(64) NOT NULL,
  code_id VARCHAR(64) NOT NULL,
  account VARCHAR(255) NOT NULL,
  amount_cents BIGINT NOT NULL,
  redeemed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account, code_hash),
  KEY idx_recharge_code_redemptions_account (account),
  CONSTRAINT fk_recharge_code_redemptions_account
    FOREIGN KEY (account) REFERENCES users(account)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
