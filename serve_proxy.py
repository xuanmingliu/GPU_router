from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, unquote, urlsplit
from urllib.request import Request, urlopen
from http import cookies
from datetime import datetime, timezone
import hashlib
import math
import os
import json
import secrets
import time

ROOT = Path(__file__).resolve().parent
UPSTREAM = "https://gpu.ai-galaxy.cn"
PORT = int(os.environ.get("PORT", "8010"))
STARLIGHT_BACKEND_HOSTPORT = os.environ.get("STARLIGHT_BACKEND_HOSTPORT", "").strip()
STARLIGHT_PUBLIC_BACKEND = os.environ.get("STARLIGHT_PUBLIC_BACKEND", "https://gpu-router-starlight.onrender.com").strip().rstrip("/")
STARLIGHT_BACKEND = os.environ.get(
    "STARLIGHT_BACKEND",
    STARLIGHT_PUBLIC_BACKEND or "http://127.0.0.1:8030",
).rstrip("/")
AUTH_DB_PATH = ROOT / "data" / "local-auth.json"
JOB_BILLING_PATH = ROOT / "data" / "job-billing.json"
SESSION_MAX_AGE = 60 * 60 * 24 * 30
DB_BACKEND = os.environ.get("DB_BACKEND", "json").strip().lower()
MYSQL_HOST = os.environ.get("MYSQL_HOST", "127.0.0.1")
MYSQL_PORT = int(os.environ.get("MYSQL_PORT", "3306"))
MYSQL_USER = os.environ.get("MYSQL_USER", "root")
MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD", "")
MYSQL_DATABASE = os.environ.get("MYSQL_DATABASE", "chuanxinyun")
MYSQL_SCHEMA_PATH = ROOT / "database" / "schema.sql"
POSTGRES_DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
POSTGRES_SCHEMA_PATH = ROOT / "database" / "schema.postgres.sql"
ENABLE_LEGACY_JOB_CLAIM = os.environ.get("ENABLE_LEGACY_JOB_CLAIM", "").strip().lower() in {"1", "true", "yes"}

RECHARGE_CODES = {
    "e21eabedc87ffa7041cedd347b36bd7906e9d61efdcbae2faa4737d89e531918": {
        "codeId": "FZC-100",
        "amountCents": 10000,
    },
    "fefb7adf68f4cdb06e676722d5885156fc3596ad2cf9ad2bfb2f67d342a6c8b6": {
        "codeId": "FZC-200",
        "amountCents": 20000,
    },
    "453738e746d5ed0b1952d3f6f009c0176e3ee5dac36a66a8d65dd3b684991d1b": {
        "codeId": "FZC-300",
        "amountCents": 30000,
    },
    "e65bdd9f4cb55e8dee029cad0a2b3e966eff4246f90bf2441c4e0e0090ef7b47": {
        "codeId": "FZC-400",
        "amountCents": 40000,
    },
    "2489fe61887cad702edffa70b5907e93059d6681e7c89b39afe5edaf973bda83": {
        "codeId": "FZC-500",
        "amountCents": 50000,
    },
}

os.chdir(ROOT)


def starlight_backend_candidates():
    candidates = [STARLIGHT_BACKEND]
    if STARLIGHT_PUBLIC_BACKEND:
        candidates.append(STARLIGHT_PUBLIC_BACKEND)
    if os.environ.get("USE_STARLIGHT_HOSTPORT", "").strip().lower() in {"1", "true", "yes"} and STARLIGHT_BACKEND_HOSTPORT:
        candidates.append(f"http://{STARLIGHT_BACKEND_HOSTPORT}".rstrip("/"))
    unique = []
    for candidate in candidates:
        if candidate and candidate not in unique:
            unique.append(candidate)
    return unique


def retryable_starlight_gateway_error(status, content_type, data):
    if status not in {502, 503, 504}:
        return False
    sample = data.decode("utf-8", errors="ignore").lower()
    return "text/html" in content_type.lower() or "<title>502" in sample or "render" in sample


STARLIGHT_RETRY_DELAYS = [2, 5, 10, 15, 20, 30]


def ensure_auth_shape(data):
    data.setdefault("users", {})
    data.setdefault("sessions", {})
    data.setdefault("jobsByAccount", {})
    return data


def ensure_job_billing_shape(data):
    data.setdefault("jobs", {})
    return data


def job_key(job):
    cluster = job.get("cluster") or job.get("Cluster") or ""
    job_id = job.get("jobId") or job.get("InstanceUuid") or job.get("Container_name") or job.get("name") or ""
    return f"{cluster}/{job_id}" if cluster and job_id else ""


def load_job_billing():
    if not JOB_BILLING_PATH.exists():
        return ensure_job_billing_shape({})
    try:
        with JOB_BILLING_PATH.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, dict):
            return ensure_job_billing_shape({})
        return ensure_job_billing_shape(data)
    except (OSError, json.JSONDecodeError):
        return ensure_job_billing_shape({})


def save_job_billing(data):
    data = ensure_job_billing_shape(data)
    JOB_BILLING_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = JOB_BILLING_PATH.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    tmp.replace(JOB_BILLING_PATH)


def billing_rate_cents_per_hour(job):
    partition = str(job.get("partition") or job.get("Partition") or job.get("gpuType") or job.get("Gpu_type") or "").lower()
    if "h100" in partition:
        return 1500
    if "a100" in partition:
        return 750
    if "a800" in partition:
        return 500
    return 500


def to_unix_seconds(value):
    if not value:
        return 0
    try:
        text = str(value).strip().replace("Z", "+00:00")
        return int(datetime.fromisoformat(text).timestamp())
    except Exception:
        try:
            return int(float(value))
        except Exception:
            return 0


def job_started_at(job):
    upstream = job.get("upstream") or {}
    return (
        upstream.get("startedAt")
        or upstream.get("createdAt")
        or job.get("startedAt")
        or job.get("createdAt")
        or ""
    )


def job_ended_at(job):
    upstream = job.get("upstream") or {}
    return upstream.get("endAt") or job.get("endedAt") or ""


def settle_account_job_billing(account, jobs_payload):
    if not account:
        return {"updated": False, "balanceCents": None, "jobs": 0}
    if not isinstance(jobs_payload, list):
        return {"updated": False, "balanceCents": None, "jobs": 0}

    now = int(time.time())
    db = load_auth_db()
    users = db.setdefault("users", {})
    user = users.get(account)
    if not user:
        return {"updated": False, "balanceCents": None, "jobs": 0}

    billing = load_job_billing()
    billing_jobs = billing.setdefault("jobs", {})
    changed = False
    charged_jobs = 0

    for job in jobs_payload:
        summary = job.get("summary") or {}
        phase = str(summary.get("phase") or "").lower()
        if phase in {"pending", "syncing"}:
            continue

        started_at = job_started_at(job)
        if not started_at:
            continue
        start_seconds = to_unix_seconds(started_at)
        if not start_seconds:
            continue

        end_value = job_ended_at(job)
        end_seconds = now if phase == "running" else to_unix_seconds(end_value) or now
        elapsed_seconds = max(0, end_seconds - start_seconds)
        if elapsed_seconds <= 0:
            continue

        hours_to_charge = max(1, math.ceil(elapsed_seconds / 3600))
        rate_cents = billing_rate_cents_per_hour(job)
        key = job_key(job)
        record = billing_jobs.get(key, {})
        charged_hours = int(record.get("chargedHours") or 0)
        if hours_to_charge <= charged_hours:
            continue

        delta_hours = hours_to_charge - charged_hours
        delta_cents = delta_hours * rate_cents
        balance = int(user.get("balanceCents") or 0) - delta_cents
        user["balanceCents"] = balance
        billing_jobs[key] = {
            "account": account,
            "cluster": job.get("cluster") or job.get("Cluster") or "",
            "jobId": job.get("jobId") or job.get("InstanceUuid") or job.get("Container_name") or job.get("name") or "",
            "chargedHours": hours_to_charge,
            "rateCentsPerHour": rate_cents,
            "lastPhase": phase,
            "lastSettledAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
            "startedAt": started_at,
        }
        db.setdefault("balanceLedger", []).append({
            "account": account,
            "direction": "out",
            "amountCents": delta_cents,
            "balanceAfterCents": balance,
            "businessType": "gpu_runtime",
            "businessId": key,
            "note": f"实例运行扣费 {delta_hours} 小时",
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
        })
        changed = True
        charged_jobs += 1

    if changed:
        save_auth_db(db)
        save_job_billing(billing)
    return {"updated": changed, "balanceCents": int(user.get("balanceCents") or 0), "jobs": charged_jobs}


def mysql_enabled():
    return DB_BACKEND == "mysql"


def postgres_enabled():
    return DB_BACKEND in {"postgres", "postgresql"}


def mysql_connect():
    try:
        import pymysql
    except ImportError as exc:
        raise RuntimeError("DB_BACKEND=mysql 需要先安装 PyMySQL：pip install PyMySQL") from exc
    return pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DATABASE,
        charset="utf8mb4",
        autocommit=False,
        cursorclass=pymysql.cursors.DictCursor,
    )


def split_sql_statements(sql_text):
    statements = []
    current = []
    for line in sql_text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("--"):
            continue
        current.append(line)
        if stripped.endswith(";"):
            statements.append("\n".join(current).rstrip(";"))
            current = []
    if current:
        statements.append("\n".join(current))
    return statements


def init_mysql_schema():
    if not mysql_enabled():
        return
    if not MYSQL_SCHEMA_PATH.exists():
        raise RuntimeError(f"MySQL schema 文件不存在：{MYSQL_SCHEMA_PATH}")
    with mysql_connect() as conn:
        with conn.cursor() as cur:
            for statement in split_sql_statements(MYSQL_SCHEMA_PATH.read_text(encoding="utf-8")):
                cur.execute(statement)
        conn.commit()


def postgres_connect():
    if not POSTGRES_DATABASE_URL:
        raise RuntimeError("DB_BACKEND=postgres 需要设置 DATABASE_URL")
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise RuntimeError("DB_BACKEND=postgres 需要先安装 psycopg：pip install psycopg[binary]") from exc
    return psycopg.connect(POSTGRES_DATABASE_URL, row_factory=dict_row)


def init_postgres_schema():
    if not postgres_enabled():
        return
    if not POSTGRES_SCHEMA_PATH.exists():
        raise RuntimeError(f"PostgreSQL schema 文件不存在：{POSTGRES_SCHEMA_PATH}")
    with postgres_connect() as conn:
        with conn.cursor() as cur:
            for statement in split_sql_statements(POSTGRES_SCHEMA_PATH.read_text(encoding="utf-8")):
                cur.execute(statement)
        conn.commit()


def load_auth_db_mysql():
    db = ensure_auth_shape({})
    with mysql_connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT account, password_hash, balance_cents, frozen_cents, created_at FROM users")
            for row in cur.fetchall():
                created = row.get("created_at")
                db["users"][row["account"]] = {
                    "account": row["account"],
                    "passwordHash": row["password_hash"],
                    "balanceCents": int(row.get("balance_cents") or 0),
                    "frozenCents": int(row.get("frozen_cents") or 0),
                    "createdAt": created.isoformat() if hasattr(created, "isoformat") else str(created or ""),
                }
            cur.execute("SELECT token, account, created_at_unix FROM sessions")
            for row in cur.fetchall():
                db["sessions"][row["token"]] = {
                    "account": row["account"],
                    "createdAt": int(row.get("created_at_unix") or 0),
                }
            cur.execute("SELECT account, job_key FROM user_job_ownership")
            for row in cur.fetchall():
                db["jobsByAccount"].setdefault(row["account"], []).append(row["job_key"])
    for account, keys in db["jobsByAccount"].items():
        db["jobsByAccount"][account] = sorted(set(keys))
    return db


def load_auth_db_postgres():
    db = ensure_auth_shape({})
    with postgres_connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT account, password_hash, balance_cents, frozen_cents, created_at FROM users")
            for row in cur.fetchall():
                created = row.get("created_at")
                db["users"][row["account"]] = {
                    "account": row["account"],
                    "passwordHash": row["password_hash"],
                    "balanceCents": int(row.get("balance_cents") or 0),
                    "frozenCents": int(row.get("frozen_cents") or 0),
                    "createdAt": created.isoformat() if hasattr(created, "isoformat") else str(created or ""),
                }
            cur.execute("SELECT token, account, created_at_unix FROM sessions")
            for row in cur.fetchall():
                db["sessions"][row["token"]] = {
                    "account": row["account"],
                    "createdAt": int(row.get("created_at_unix") or 0),
                }
            cur.execute("SELECT account, job_key FROM user_job_ownership")
            for row in cur.fetchall():
                db["jobsByAccount"].setdefault(row["account"], []).append(row["job_key"])
    for account, keys in db["jobsByAccount"].items():
        db["jobsByAccount"][account] = sorted(set(keys))
    return db


def save_auth_db_mysql(data):
    data = ensure_auth_shape(data)
    owner_pairs = {
        (account, key)
        for account, keys in data.get("jobsByAccount", {}).items()
        for key in keys
    }
    with mysql_connect() as conn:
        with conn.cursor() as cur:
            for account, user in data.get("users", {}).items():
                cur.execute(
                    """
                    INSERT INTO users (account, password_hash, balance_cents, frozen_cents)
                    VALUES (%s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                      password_hash = VALUES(password_hash),
                      balance_cents = VALUES(balance_cents),
                      frozen_cents = VALUES(frozen_cents)
                    """,
                    (
                        account,
                        user.get("passwordHash") or "",
                        int(user.get("balanceCents") or 0),
                        int(user.get("frozenCents") or 0),
                    ),
                )

            for token, session in data.get("sessions", {}).items():
                cur.execute(
                    """
                    INSERT INTO sessions (token, account, created_at_unix)
                    VALUES (%s, %s, %s)
                    ON DUPLICATE KEY UPDATE account = VALUES(account), created_at_unix = VALUES(created_at_unix)
                    """,
                    (token, session.get("account") or "", int(session.get("createdAt") or 0)),
                )

            for account, key in owner_pairs:
                cur.execute(
                    """
                    INSERT IGNORE INTO user_job_ownership (account, job_key)
                    VALUES (%s, %s)
                    """,
                    (account, key),
                )
        conn.commit()


def save_auth_db_postgres(data):
    data = ensure_auth_shape(data)
    owner_pairs = {
        (account, key)
        for account, keys in data.get("jobsByAccount", {}).items()
        for key in keys
    }
    with postgres_connect() as conn:
        with conn.cursor() as cur:
            for account, user in data.get("users", {}).items():
                cur.execute(
                    """
                    INSERT INTO users (account, password_hash, balance_cents, frozen_cents)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (account) DO UPDATE SET
                      password_hash = EXCLUDED.password_hash,
                      balance_cents = EXCLUDED.balance_cents,
                      frozen_cents = EXCLUDED.frozen_cents,
                      updated_at = CURRENT_TIMESTAMP
                    """,
                    (
                        account,
                        user.get("passwordHash") or "",
                        int(user.get("balanceCents") or 0),
                        int(user.get("frozenCents") or 0),
                    ),
                )

            for token, session in data.get("sessions", {}).items():
                cur.execute(
                    """
                    INSERT INTO sessions (token, account, created_at_unix)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (token) DO UPDATE SET
                      account = EXCLUDED.account,
                      created_at_unix = EXCLUDED.created_at_unix
                    """,
                    (token, session.get("account") or "", int(session.get("createdAt") or 0)),
                )

            for account, key in owner_pairs:
                cur.execute(
                    """
                    INSERT INTO user_job_ownership (account, job_key)
                    VALUES (%s, %s)
                    ON CONFLICT (account, job_key) DO NOTHING
                    """,
                    (account, key),
                )
        conn.commit()


def load_auth_db():
    if mysql_enabled():
        return load_auth_db_mysql()
    if postgres_enabled():
        return load_auth_db_postgres()
    if not AUTH_DB_PATH.exists():
        return ensure_auth_shape({})
    try:
        with AUTH_DB_PATH.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, dict):
            return ensure_auth_shape({})
        return ensure_auth_shape(data)
    except (OSError, json.JSONDecodeError):
        return ensure_auth_shape({})


def save_auth_db(data):
    if mysql_enabled():
        save_auth_db_mysql(data)
        return
    if postgres_enabled():
        save_auth_db_postgres(data)
        return
    AUTH_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = AUTH_DB_PATH.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    tmp.replace(AUTH_DB_PATH)


def delete_session_token(token):
    if not token:
        return
    if mysql_enabled():
        with mysql_connect() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM sessions WHERE token = %s", (token,))
            conn.commit()
        return
    if postgres_enabled():
        with postgres_connect() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM sessions WHERE token = %s", (token,))
            conn.commit()
        return
    db = load_auth_db()
    db.get("sessions", {}).pop(token, None)
    save_auth_db(db)


def delete_owned_job_key(account, key):
    if not account or not key:
        return
    if mysql_enabled():
        with mysql_connect() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM user_job_ownership WHERE account = %s AND job_key = %s", (account, key))
            conn.commit()
        return
    if postgres_enabled():
        with postgres_connect() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM user_job_ownership WHERE account = %s AND job_key = %s", (account, key))
            conn.commit()
        return
    db = load_auth_db()
    jobs_by_account = db.setdefault("jobsByAccount", {})
    keys = set(jobs_by_account.get(account, []))
    keys.discard(key)
    jobs_by_account[account] = sorted(keys)
    save_auth_db(db)


def redeem_recharge_code(account, code):
    if not account:
        return False, {"reason": "请先登录"}
    code_hash = hash_recharge_code(code)
    code_meta = RECHARGE_CODES.get(code_hash)
    if not code_meta:
        return False, {"reason": "充值码不存在或格式不正确"}

    amount = int(code_meta["amountCents"])
    code_id = code_meta["codeId"]
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    if mysql_enabled():
        with mysql_connect() as conn:
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT account FROM recharge_code_redemptions WHERE account = %s AND code_hash = %s",
                        (account, code_hash),
                    )
                    if cur.fetchone():
                        conn.rollback()
                        return False, {"reason": "该账号已使用过这个充值码"}
                    cur.execute("SELECT balance_cents FROM users WHERE account = %s FOR UPDATE", (account,))
                    row = cur.fetchone()
                    if not row:
                        conn.rollback()
                        return False, {"reason": "账号不存在，请重新登录"}
                    balance = int(row.get("balance_cents") or 0) + amount
                    cur.execute("UPDATE users SET balance_cents = %s WHERE account = %s", (balance, account))
                    cur.execute(
                        """
                        INSERT INTO recharge_code_redemptions (code_hash, code_id, account, amount_cents)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (code_hash, code_id, account, amount),
                    )
                    cur.execute(
                        """
                        INSERT INTO balance_ledger
                          (account, direction, amount_cents, balance_after_cents, business_type, business_id, note)
                        VALUES (%s, 'in', %s, %s, 'recharge_code', %s, %s)
                        """,
                        (account, amount, balance, code_id, f"充值码兑换 +{format_money(amount)} 元"),
                    )
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        return True, {"amountCents": amount, "balanceCents": balance, "codeId": code_id}

    if postgres_enabled():
        with postgres_connect() as conn:
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT account FROM recharge_code_redemptions WHERE account = %s AND code_hash = %s",
                        (account, code_hash),
                    )
                    if cur.fetchone():
                        conn.rollback()
                        return False, {"reason": "该账号已使用过这个充值码"}
                    cur.execute("SELECT balance_cents FROM users WHERE account = %s FOR UPDATE", (account,))
                    row = cur.fetchone()
                    if not row:
                        conn.rollback()
                        return False, {"reason": "账号不存在，请重新登录"}
                    balance = int(row.get("balance_cents") or 0) + amount
                    cur.execute("UPDATE users SET balance_cents = %s, updated_at = CURRENT_TIMESTAMP WHERE account = %s", (balance, account))
                    cur.execute(
                        """
                        INSERT INTO recharge_code_redemptions (code_hash, code_id, account, amount_cents)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (code_hash, code_id, account, amount),
                    )
                    cur.execute(
                        """
                        INSERT INTO balance_ledger
                          (account, direction, amount_cents, balance_after_cents, business_type, business_id, note)
                        VALUES (%s, 'in', %s, %s, 'recharge_code', %s, %s)
                        """,
                        (account, amount, balance, code_id, f"充值码兑换 +{format_money(amount)} 元"),
                    )
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        return True, {"amountCents": amount, "balanceCents": balance, "codeId": code_id}

    db = load_auth_db()
    used_codes = db.setdefault("usedRechargeCodes", {})
    account_code_key = f"{account}:{code_hash}"
    legacy_use = used_codes.get(code_hash)
    if account_code_key in used_codes or (isinstance(legacy_use, dict) and legacy_use.get("account") == account):
        return False, {"reason": "该账号已使用过这个充值码"}
    users = db.setdefault("users", {})
    user = users.get(account)
    if not user:
        return False, {"reason": "账号不存在，请重新登录"}
    balance = int(user.get("balanceCents") or 0) + amount
    user["balanceCents"] = balance
    user.setdefault("frozenCents", 0)
    used_codes[account_code_key] = {
        "codeId": code_id,
        "account": account,
        "codeHash": code_hash,
        "amountCents": amount,
        "redeemedAt": now_iso,
    }
    db.setdefault("balanceLedger", []).append({
        "account": account,
        "direction": "in",
        "amountCents": amount,
        "balanceAfterCents": balance,
        "businessType": "recharge_code",
        "businessId": code_id,
        "note": f"充值码兑换 +{format_money(amount)} 元",
        "createdAt": now_iso,
    })
    save_auth_db(db)
    return True, {"amountCents": amount, "balanceCents": balance, "codeId": code_id}


def hash_password(password):
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def normalize_recharge_code(code):
    return "".join(str(code or "").strip().upper().split())


def hash_recharge_code(code):
    return hashlib.sha256(normalize_recharge_code(code).encode("utf-8")).hexdigest()


def format_money(cents):
    return f"{int(cents or 0) / 100:.2f}"


def now_ts():
    return int(time.time())


class ProxyStaticHandler(SimpleHTTPRequestHandler):
    proxy_prefixes = ("/api/", "/third-party/")
    spa_routes = {"/store", "/console", "/account", "/activity_202510"}

    def local_path(self):
        return ROOT / unquote(urlsplit(self.path).path).lstrip("/")

    def local_asset_exists(self):
        return self.local_path().is_file()

    def should_proxy_get(self):
        path = urlsplit(self.path).path
        if path.startswith(self.proxy_prefixes):
            return True
        if path.startswith("/assets/") and not self.local_asset_exists():
            return True
        return False

    def do_GET(self):
        path = urlsplit(self.path).path
        if path.startswith("/console/assets/"):
            self.path = self.path.replace("/console/assets/", "/assets/", 1)
            path = urlsplit(self.path).path
        if path.startswith("/starlight-api/") or path.startswith("/starlight-runs/"):
            return self.proxy_starlight()
        if self.is_removed_support_route(path):
            return self.redirect_response("/console")
        if path.startswith("/third-party/api/v1/work-order/"):
            return self.empty_work_order_response(path)
        if path.startswith("/api/notifications/"):
            return self.empty_notification_response(path)
        if path == "/third-party/api/v1/verification/verifications":
            return self.json_response({
                "code": 200,
                "data": [
                    {"verify_type": 0, "verify_chan": 1, "status": 1},
                    {"verify_type": 1, "verify_chan": 1, "status": 1},
                ],
                "message": "ok",
            })
        if path == "/login":
            return self.serve_login()
        if path == "/local-auth/session":
            return self.local_auth_session()
        if path == "/agreements":
            return self.serve_html_file("agreements.html")
        if path == "/privacy":
            return self.serve_html_file("privacy.html")
        if self.should_proxy_get():
            return self.proxy(cache_asset=True)
        if path == "/console" or path == "/account" or path.startswith("/console/") or path.startswith("/account/"):
            if not self.require_local_session():
                return
            return self.serve_store()
        if path in self.spa_routes:
            return self.serve_store()
        if path.startswith("/assets/") and path.endswith((".js", ".css")):
            return self.serve_static_no_cache()
        return super().do_GET()

    def do_HEAD(self):
        path = urlsplit(self.path).path
        if path.startswith("/console/assets/"):
            self.path = self.path.replace("/console/assets/", "/assets/", 1)
            path = urlsplit(self.path).path
        if path == "/login":
            return self.serve_login(head_only=True)
        if self.is_removed_support_route(path):
            return self.redirect_response("/console")
        if path == "/agreements":
            return self.serve_html_file("agreements.html", head_only=True)
        if path == "/privacy":
            return self.serve_html_file("privacy.html", head_only=True)
        if path.startswith("/assets/") and path.endswith((".js", ".css")):
            return self.serve_static_no_cache(head_only=True)
        if path == "/console" or path == "/account" or path.startswith("/console/") or path.startswith("/account/"):
            if not self.require_local_session():
                return
            return self.serve_store(head_only=True)
        if path in self.spa_routes:
            return self.serve_store(head_only=True)
        return super().do_HEAD()

    def do_POST(self):
        path = urlsplit(self.path).path
        if path.startswith("/local-auth/"):
            return self.handle_local_auth(path, self.read_body())
        if path.startswith("/starlight-api/"):
            return self.proxy_starlight(body=self.read_body())
        if path.startswith(self.proxy_prefixes):
            body = self.read_body()
            if path == "/api/get_user_info":
                return self.mock_user_info(body)
            if path.startswith("/api/notifications/"):
                return self.empty_notification_response(path)
            if path.startswith("/third-party/api/v1/work-order/"):
                return self.empty_work_order_response(path)
            if path in {"/api/instance/get_instance_status_count", "/api/get_container_by_token_with_page_v2"}:
                return self.mock_console_api(path, body)
            if path in {"/api/login", "/api/register", "/api/company_register", "/api/auth/send_verify_code"} or path.startswith("/api/auth/wechat/"):
                return self.json_response({"status": 2, "reason": "本地演示模式已禁用智星云登录接口", "data": ""}, status=403)
            return self.proxy(cache_asset=False, body=body)
        self.send_error(404, "Not proxied")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def read_body(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        return self.rfile.read(length) if length else None

    def json_response(self, payload, status=200, extra_headers=None):
        import json
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def empty_notification_response(self, path):
        if path.endswith("/set_read_all"):
            return self.json_response({"status": 0, "reason": "ok", "data": True})
        return self.json_response({
            "status": 0,
            "reason": "ok",
            "data": {
                "data": [],
                "list": [],
                "total": 0,
                "page_count": 0,
            },
        })

    def empty_work_order_response(self, path):
        if path.endswith("/unread-flag"):
            return self.json_response({"code": 200, "data": {"unread": False}, "message": "ok"})
        if path.endswith("/categories") or path.endswith("/documents"):
            return self.json_response({"code": 200, "data": [], "message": "ok"})
        if path.endswith("/orders"):
            return self.json_response({"code": 200, "data": {"orders": [], "total": 0}, "message": "ok"})
        return self.json_response({"code": 200, "data": {}, "message": "ok"})

    def is_removed_support_route(self, path):
        return (
            path == "/inform"
            or path.startswith("/inform/")
            or path == "/messages"
            or path.startswith("/messages/")
            or path.startswith("/console/messages")
            or path == "/workOrderAgreement"
            or path.startswith("/workOrder")
            or path.startswith("/console/workOrder")
            or path.startswith("/console/myWorkOrder")
            or path.startswith("/console/selectQuestion")
        )

    def make_cookie_header(self, token, max_age=SESSION_MAX_AGE):
        return f"cx_demo_token={token}; Path=/; SameSite=Lax; Max-Age={max_age}"

    def clear_cookie_header(self):
        return "cx_demo_token=; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT"

    def require_local_session(self):
        session, token = self.session_record()
        if session:
            return True
        self.send_response(302)
        self.send_header("Location", "/login")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        if token:
            self.send_header("Set-Cookie", self.clear_cookie_header())
        self.end_headers()
        return False

    def redirect_response(self, location):
        self.send_response(302)
        self.send_header("Location", location)
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.end_headers()

    def cookie_token(self):
        header = self.headers.get("Cookie", "")
        jar = cookies.SimpleCookie()
        try:
            jar.load(header)
        except cookies.CookieError:
            return ""
        morsel = jar.get("cx_demo_token")
        return morsel.value if morsel else ""

    def session_record(self, token=None):
        token = token or self.cookie_token()
        if not token:
            return None, ""
        db = load_auth_db()
        session = db.get("sessions", {}).get(token)
        if not session:
            return None, token
        if now_ts() - int(session.get("createdAt", 0) or 0) > SESSION_MAX_AGE:
            db.get("sessions", {}).pop(token, None)
            save_auth_db(db)
            return None, token
        account = session.get("account")
        user = db.get("users", {}).get(account or "")
        if not user:
            return None, token
        return {"account": account, "token": token, "user": user}, token

    def session_from_body_or_cookie(self, body=None):
        token = self.cookie_token()
        if token:
            session, _ = self.session_record(token)
            if session:
                return session
        token = ""
        if body:
            params = parse_qs((body or b"").decode("utf-8", errors="ignore"))
            token = (params.get("session") or params.get("token") or [""])[0]
        session, _ = self.session_record(token or None)
        return session

    def owned_job_keys(self, account):
        if not account:
            return set()
        db = load_auth_db()
        return set(db.setdefault("jobsByAccount", {}).get(account, []))

    def save_owned_job_key(self, account, key):
        if not account or not key:
            return
        db = load_auth_db()
        jobs_by_account = db.setdefault("jobsByAccount", {})
        keys = set(jobs_by_account.get(account, []))
        keys.add(key)
        jobs_by_account[account] = sorted(keys)
        save_auth_db(db)

    def remove_owned_job_key(self, account, key):
        if not account or not key:
            return
        delete_owned_job_key(account, key)

    def claim_legacy_jobs_if_first_user(self, account, jobs):
        if not ENABLE_LEGACY_JOB_CLAIM:
            return
        if not account:
            return
        db = load_auth_db()
        jobs_by_account = db.setdefault("jobsByAccount", {})
        if any(jobs_by_account.values()):
            return
        keys = sorted(key for key in (job_key(job) for job in jobs) if key)
        if not keys:
            return
        jobs_by_account[account] = keys
        save_auth_db(db)

    def filter_jobs_for_account(self, jobs, account):
        if not account:
            return []
        self.claim_legacy_jobs_if_first_user(account, jobs)
        owned = self.owned_job_keys(account)
        return [job for job in jobs if job_key(job) in owned]

    def issue_session(self, account):
        db = load_auth_db()
        token = "cx_demo_" + secrets.token_urlsafe(32)
        db.setdefault("sessions", {})[token] = {"account": account, "createdAt": now_ts()}
        save_auth_db(db)
        return token

    def parse_json_or_form(self, body):
        text = (body or b"").decode("utf-8", errors="ignore")
        if not text:
            return {}
        try:
            data = json.loads(text)
            return data if isinstance(data, dict) else {}
        except json.JSONDecodeError:
            params = parse_qs(text)
            return {key: values[0] if values else "" for key, values in params.items()}

    def local_auth_session(self):
        session, token = self.session_record()
        if not session:
            return self.json_response(
                {"ok": False, "reason": "未登录"},
                extra_headers={"Set-Cookie": self.clear_cookie_header()} if token else None,
            )
        user = session.get("user") or {}
        try:
            settle_account_job_billing(session["account"], self.fetch_user_starlight_jobs())
        except Exception:
            pass
        user = load_auth_db().get("users", {}).get(session["account"]) or user
        balance_cents = int(user.get("balanceCents") or 0)
        return self.json_response({
            "ok": True,
            "account": session["account"],
            "token": session["token"],
            "balanceCents": balance_cents,
            "balance": format_money(balance_cents),
        })

    def handle_local_auth(self, path, body):
        payload = self.parse_json_or_form(body)
        if path == "/local-auth/logout":
            token = payload.get("token") or self.cookie_token()
            delete_session_token(token)
            return self.json_response({"ok": True}, extra_headers={"Set-Cookie": self.clear_cookie_header()})

        if path == "/local-auth/redeem-code":
            session, _ = self.session_record()
            if not session:
                return self.json_response({"ok": False, "reason": "请先登录后再充值"}, status=401)
            ok, result = redeem_recharge_code(session["account"], payload.get("code"))
            if not ok:
                return self.json_response({"ok": False, **result}, status=400)
            return self.json_response({
                "ok": True,
                "amountCents": result["amountCents"],
                "amount": format_money(result["amountCents"]),
                "balanceCents": result["balanceCents"],
                "balance": format_money(result["balanceCents"]),
                "codeId": result["codeId"],
            })

        account = str(payload.get("account") or "").strip().lower()
        password = str(payload.get("password") or "")
        if not account or not password:
            return self.json_response({"ok": False, "reason": "请输入账号和密码"}, status=400)
        if len(password) < 6:
            return self.json_response({"ok": False, "reason": "密码至少 6 位"}, status=400)

        db = load_auth_db()
        users = db.setdefault("users", {})
        if path == "/local-auth/register":
            if account in users:
                return self.json_response({"ok": False, "reason": "账号已存在，请直接登录"}, status=409)
            users[account] = {
                "account": account,
                "passwordHash": hash_password(password),
                "balanceCents": 0,
                "frozenCents": 0,
                "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            save_auth_db(db)
        elif path == "/local-auth/login":
            user = users.get(account)
            if not user or user.get("passwordHash") != hash_password(password):
                return self.json_response({"ok": False, "reason": "账号或密码错误"}, status=401)
        else:
            return self.send_error(404, "Unknown local auth path")

        token = self.issue_session(account)
        return self.json_response({
            "ok": True,
            "account": account,
            "token": token,
        }, extra_headers={"Set-Cookie": self.make_cookie_header(token)})

    def serve_login(self, head_only=False):
        data = (ROOT / "local-login.html").read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.end_headers()
        if not head_only:
            self.wfile.write(data)

    def serve_store(self, head_only=False):
        return self.serve_html_file("store.html", head_only=head_only)

    def serve_html_file(self, filename, head_only=False):
        data = (ROOT / filename).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.end_headers()
        if not head_only:
            self.wfile.write(data)

    def serve_static_no_cache(self, head_only=False):
        path = self.local_path()
        if not path.is_file():
            return self.send_error(404, "File not found")
        data = path.read_bytes()
        content_type = "application/javascript" if path.suffix == ".js" else "text/css"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.end_headers()
        if not head_only:
            self.wfile.write(data)

    def mock_user_info(self, body):
        params = parse_qs((body or b"").decode("utf-8", errors="ignore"))
        token = self.cookie_token() or (params.get("session") or params.get("token") or [""])[0]
        session, _ = self.session_record(token)
        if not session:
            return self.json_response({"status": 2, "reason": "获取token失败!", "data": ""})
        jobs_payload = self.fetch_user_starlight_jobs(body)
        try:
            settle_account_job_billing(session.get("account") or "", jobs_payload.get("jobs") or [])
        except Exception:
            pass
        suffix = token[-8:]
        account = session.get("account") or ""
        user = load_auth_db().get("users", {}).get(account) or (session.get("user") or {})
        balance_cents = int(user.get("balanceCents") or 0)
        return self.json_response({
            "status": 0,
            "reason": "ok",
            "data": {
                "Id": 900001,
                "UserId": 900001,
                "Username": account or f"附中云用户{suffix}",
                "Name": account or f"附中云用户{suffix}",
                "Nickname": account or f"附中云用户{suffix}",
                "Phone": account if account.startswith("1") and len(account) == 11 else "13800138000",
                "Email": account if "@" in account else "demo@chuanxinyun.local",
                "Money": balance_cents / 100,
                "PowerMoney": 0,
                "CreditMoneyQuota": 0,
                "VipLevel": 0,
                "AccumulatedMoney": 0,
                "SubAccount": False,
                "IsStudentVerified": 1,
                "StudentVerifiedTime": "2026-06-13T00:00:00+08:00",
                "StudentVerifiedExpireTime": "2027-06-13T00:00:00+08:00",
                "IsEnterpriseVerified": True,
                "IsPersonalVerified": True,
                "IsVerified": True,
                "HasPassword": True,
                "PasswordSet": True,
                "NeedSetPassword": False,
            },
        })

    def fetch_starlight_jobs(self):
        try:
            with urlopen(STARLIGHT_BACKEND + "/api/jobs", timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            return {"total": 0, "jobs": [], "error": str(exc)}

    def fetch_user_starlight_jobs(self, body=None):
        session = self.session_from_body_or_cookie(body)
        if not session:
            return {"total": 0, "jobs": []}
        payload = self.fetch_starlight_jobs()
        jobs = self.filter_jobs_for_account(payload.get("jobs") or [], session.get("account"))
        return {**payload, "total": len(jobs), "jobs": jobs}

    def console_status_value(self, phase):
        if phase == "pending" or phase == "syncing":
            return 2
        if phase == "running":
            return 1
        if phase == "succeeded":
            return 8
        if phase == "failed":
            return -1
        return 0

    def starlight_access_from_job(self, job):
        upstream = job.get("upstream") or {}
        proxies = upstream.get("proxies") or []
        access = {
            "webssh": "",
            "jupyter": "",
            "sshCommand": "",
            "sshHost": "",
            "sshPort": "",
        }
        for proxy in proxies:
            proxy_id = proxy.get("id")
            name = str(proxy.get("name") or "").lower()
            protocol = proxy.get("protocol")
            source_port = proxy.get("source_port")
            user_name = proxy.get("user_name") or "thzskj_wfeng33_1"
            if not proxy_id or not source_port:
                continue
            if protocol == 1:
                url = f"http://{proxy_id}.proxy.nscc-gz.cn:{source_port}/"
                if "jupyter" in name:
                    access["jupyter"] = url
                elif "webssh" in name:
                    access["webssh"] = url
            elif protocol == 3:
                host = "proxy.nscc-gz.cn"
                access["sshHost"] = host
                access["sshPort"] = str(source_port)
                access["sshCommand"] = f"ssh {user_name}@{host} -p {source_port}"
        return access

    def console_instance_from_job(self, job, index):
        summary = job.get("summary") or {}
        upstream = job.get("upstream") or {}
        resources = job.get("resources") or {}
        status = self.console_status_value(summary.get("phase"))
        gpu = resources.get("gpu") or 0
        memory = resources.get("memory") or 0
        image = (job.get("image") or "").split("/")[-1]
        access = self.starlight_access_from_job(job)
        detail = []
        if summary.get("phase") == "running":
            detail.append("实例已启动，可查看启动指令进入容器。")
            if access.get("sshCommand"):
                detail.append(f"SSH连接命令：{access.get('sshCommand')}")
        elif summary.get("phase") in {"pending", "syncing"}:
            detail.append("实例正在排队或同步访问入口，运行中后会显示 SSH 启动指令。")
        elif summary.get("label"):
            detail.append(f"当前状态：{summary.get('label')}")
        if upstream.get("ip"):
            detail.append(f"服务：{upstream.get('ip')}")
        if job.get("workDir"):
            detail.append(f"工作目录：{job.get('workDir')}")
        if summary.get("reason"):
            detail.append(str(summary.get("reason")).splitlines()[0][:160])
        return {
            "Id": 900000 + index,
            "InstanceUuid": job.get("jobId") or job.get("name") or f"starlight-{index}",
            "Container_name": job.get("jobId") or job.get("name") or f"starlight-{index}",
            "InstanceName": job.get("name") or job.get("jobId") or f"starlight-{index}",
            "Note": summary.get("label") or "状态同步中",
            "Status": status,
            "IsAbnormal": 1 if status == -1 else 0,
            "ContainerType": "docker",
            "Gpu_type": job.get("partition") or "CPU",
            "Gpu_num": gpu,
            "Cpu_num": resources.get("cpu") or 0,
            "Memory": memory,
            "AddCpu": 0,
            "AddMemory": 0,
            "AddDisk": 0,
            "Bandwidth": 0,
            "NoFreeBandwidth": 0,
            "MaxBandwidth": 0,
            "Image": image,
            "Host": upstream.get("nodeName") or "",
            "ServerName": upstream.get("nodeName") or "",
            "InstanceDetail": "\n".join(detail) or summary.get("label") or "",
            "CreateTime": upstream.get("createdAt") or job.get("createdAt") or "",
            "StartTime": upstream.get("startedAt") or "",
            "DueTime": upstream.get("endAt") or "2099-12-31T23:59:59+08:00",
            "Due_time": upstream.get("endAt") or "2099-12-31T23:59:59+08:00",
            "Total_cost": upstream.get("jobFee") or 0,
            "TotalCost": upstream.get("jobFee") or 0,
            "SpecName": f"{resources.get('cpu') or 0}核/{gpu}块/{memory}GiB",
            "PayTypeFirst": 0,
            "InstanceAutorenew": 0,
            "Cluster": job.get("cluster") or "",
            "Partition": job.get("partition") or "",
            "StarlightPhase": summary.get("phase") or "unknown",
            "StarlightStatusText": summary.get("label") or "状态同步中",
            "StarlightAccess": access,
            "CheckedAt": job.get("checkedAt") or "",
        }

    def mock_console_api(self, path, body=None):
        session = self.session_from_body_or_cookie(body)
        if not session:
            empty_data = {
                "data": [],
                "total": 0,
                "page": 1,
                "page_size": 10,
            }
            if path == "/api/instance/get_instance_status_count":
                return self.json_response({
                    "status": 0,
                    "reason": "ok",
                    "data": {"all": 0, "running": 0, "shutdown": 0, "creating": 0, "error": 0, "expired": 0},
                })
            return self.json_response({"status": 0, "reason": "ok", "data": empty_data})
        jobs_payload = self.fetch_starlight_jobs()
        jobs = self.filter_jobs_for_account(jobs_payload.get("jobs") or [], session.get("account"))
        try:
            settle_account_job_billing(session.get("account") or "", jobs)
        except Exception:
            pass
        instances = [self.console_instance_from_job(job, index) for index, job in enumerate(jobs, start=1)]
        if path == "/api/instance/get_instance_status_count":
            running = sum(1 for item in instances if item["Status"] == 1)
            creating = sum(1 for item in instances if item["Status"] in {0, 2, 4, 5})
            ended = sum(1 for item in instances if item["Status"] == 8)
            error = sum(1 for item in instances if item["Status"] == -1)
            return self.json_response({
                "status": 0,
                "reason": "ok",
                "data": {
                    "all": len(instances),
                    "running": running,
                    "shutdown": 0,
                    "creating": creating,
                    "error": error,
                    "expired": ended,
                },
            })
        params = parse_qs((body or b"").decode("utf-8", errors="ignore"))
        page = int((params.get("page") or ["1"])[0] or "1")
        page_size = 10
        start = max(page - 1, 0) * page_size
        page_instances = instances[start:start + page_size]
        return self.json_response({
            "status": 0,
            "reason": "ok",
            "data": {
                "data": page_instances,
                "total": len(instances),
                "page": page,
                "page_size": page_size,
            },
        })

    def proxy(self, cache_asset=False, body=None):
        if body is None:
            body = self.read_body()
        target = UPSTREAM + self.path
        headers = {}
        for k, v in self.headers.items():
            if k.lower() in {"host", "connection", "content-length", "accept-encoding"}:
                continue
            headers[k] = v
        headers["Host"] = "gpu.ai-galaxy.cn"
        headers["Origin"] = UPSTREAM
        headers["Referer"] = UPSTREAM + "/store"
        req = Request(target, data=body, headers=headers, method=self.command)
        try:
            with urlopen(req, timeout=30) as resp:
                data = resp.read()
                if cache_asset and self.command == "GET" and resp.status == 200 and urlsplit(self.path).path.startswith("/assets/"):
                    rel = unquote(urlsplit(self.path).path).lstrip("/")
                    dest = ROOT / rel
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(data)
                    if dest.suffix in {".js", ".css", ".html"}:
                        try:
                            text = dest.read_text()
                            text = text.replace("智星云", "附中云")
                            dest.write_text(text)
                            data = dest.read_bytes()
                        except UnicodeDecodeError:
                            pass
                self.send_response(resp.status)
                for k, v in resp.headers.items():
                    if k.lower() in {"connection", "transfer-encoding", "content-encoding"}:
                        continue
                    self.send_header(k, v)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(data)
        except HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            for k, v in e.headers.items():
                if k.lower() in {"connection", "transfer-encoding", "content-encoding"}:
                    continue
                self.send_header(k, v)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)
        except URLError as e:
            self.send_error(502, f"Proxy error: {e}")

    def proxy_starlight(self, body=None):
        if body is None:
            body = self.read_body()
        path = urlsplit(self.path).path
        query = urlsplit(self.path).query
        if path == "/starlight-api/jobs" and self.command == "GET":
            return self.json_response(self.fetch_user_starlight_jobs())
        if path.startswith("/starlight-api/"):
            target_path = "/api/" + path.removeprefix("/starlight-api/")
        elif path.startswith("/starlight-runs/"):
            target_path = "/runs/" + path.removeprefix("/starlight-runs/")
        else:
            return self.send_error(404, "Unknown starlight path")
        headers = {}
        for k, v in self.headers.items():
            if k.lower() in {"host", "connection", "content-length", "accept-encoding"}:
                continue
            headers[k] = v
        backends = starlight_backend_candidates()
        last_error = None
        for backend_index, backend in enumerate(backends):
            target = backend + target_path + (("?" + query) if query else "")
            for attempt in range(len(STARLIGHT_RETRY_DELAYS) + 1):
                req = Request(target, data=body, headers=headers, method=self.command)
                try:
                    with urlopen(req, timeout=120) as resp:
                        data = resp.read()
                        content_type = resp.headers.get("Content-Type", "")
                        if path.startswith("/starlight-api/") and "application/json" not in content_type.lower():
                            sample = data.decode("utf-8", errors="ignore").replace("\n", " ")[:240]
                            if retryable_starlight_gateway_error(resp.status, content_type, data) and attempt < len(STARLIGHT_RETRY_DELAYS):
                                time.sleep(STARLIGHT_RETRY_DELAYS[attempt])
                                continue
                            return self.json_response({
                                "error": "后端接口返回的不是 JSON",
                                "status": resp.status,
                                "contentType": content_type,
                                "sample": sample,
                            }, status=502)
                        if path == "/starlight-api/direct-submit" and self.command == "POST":
                            try:
                                payload = json.loads(data.decode("utf-8"))
                                session = self.session_from_body_or_cookie(body)
                                ref = payload.get("jobRef") or {}
                                key = job_key({"cluster": ref.get("cluster"), "jobId": ref.get("jobId")})
                                if payload.get("submitted") and session and key:
                                    self.save_owned_job_key(session.get("account"), key)
                            except Exception:
                                pass
                        if path == "/starlight-api/jobs/delete" and self.command == "POST":
                            try:
                                payload = self.parse_json_or_form(body)
                                session = self.session_from_body_or_cookie(body)
                                key = job_key({"cluster": payload.get("cluster"), "jobId": payload.get("jobId")})
                                if session and key:
                                    self.remove_owned_job_key(session.get("account"), key)
                            except Exception:
                                pass
                        self.send_response(resp.status)
                        for k, v in resp.headers.items():
                            if k.lower() in {"connection", "transfer-encoding", "content-encoding"}:
                                continue
                            self.send_header(k, v)
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.end_headers()
                        self.wfile.write(data)
                        return
                except HTTPError as e:
                    data = e.read()
                    content_type = e.headers.get("Content-Type", "")
                    if retryable_starlight_gateway_error(e.code, content_type, data) and (attempt < len(STARLIGHT_RETRY_DELAYS) or backend_index < len(backends) - 1):
                        last_error = (e, data, content_type)
                        if attempt < len(STARLIGHT_RETRY_DELAYS):
                            time.sleep(STARLIGHT_RETRY_DELAYS[attempt])
                            continue
                        break
                    if path.startswith("/starlight-api/"):
                        sample = data.decode("utf-8", errors="ignore").replace("\n", " ")[:240]
                        message = sample or getattr(e, "reason", "") or f"HTTP {e.code}"
                        try:
                            payload = json.loads(data.decode("utf-8"))
                            if isinstance(payload, dict):
                                payload.setdefault("error", payload.get("reason") or payload.get("message") or f"HTTP {e.code}")
                                return self.json_response(payload, status=e.code)
                        except Exception:
                            pass
                        return self.json_response({
                            "error": message,
                            "status": e.code,
                            "contentType": content_type,
                            "sample": sample,
                        }, status=e.code)
                    self.send_response(e.code)
                    for k, v in e.headers.items():
                        if k.lower() in {"connection", "transfer-encoding", "content-encoding"}:
                            continue
                        self.send_header(k, v)
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(data)
                    return
                except URLError as e:
                    last_error = e
                    if attempt < len(STARLIGHT_RETRY_DELAYS) or backend_index < len(backends) - 1:
                        if attempt < len(STARLIGHT_RETRY_DELAYS):
                            time.sleep(STARLIGHT_RETRY_DELAYS[attempt])
                            continue
                        break
                    if path.startswith("/starlight-api/"):
                        return self.json_response({"error": f"后端接口不可用：{e}"}, status=502)
                    self.send_error(502, f"Starlight proxy error: {e}")
                    return
        if path.startswith("/starlight-api/"):
            return self.json_response({"error": f"后端接口不可用：{last_error}"}, status=502)
        self.send_error(502, f"Starlight proxy error: {last_error}")


if __name__ == "__main__":
    init_mysql_schema()
    init_postgres_schema()
    print(f"Serving static + API/assets proxy on http://0.0.0.0:{PORT}/store")
    print(f"Data backend: {DB_BACKEND}")
    ThreadingHTTPServer(("0.0.0.0", PORT), ProxyStaticHandler).serve_forever()
