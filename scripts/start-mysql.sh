#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

mkdir -p mysql-data mysql-run mysql-logs mysql-files

if [ ! -d mysql-data/mysql ]; then
  mysqld \
    --initialize-insecure \
    --user="$(whoami)" \
    --datadir="$ROOT/mysql-data" \
    --log-error="$ROOT/mysql-logs/init.log"
fi

if [ -f mysql-run/mysql.pid ] && kill -0 "$(cat mysql-run/mysql.pid)" 2>/dev/null; then
  echo "MySQL already running: pid $(cat mysql-run/mysql.pid)"
  exit 0
fi

exec mysqld \
  --datadir="$ROOT/mysql-data" \
  --socket="$ROOT/mysql-run/mysql.sock" \
  --pid-file="$ROOT/mysql-run/mysql.pid" \
  --log-error="$ROOT/mysql-logs/mysql.log" \
  --bind-address=127.0.0.1 \
  --port="${MYSQL_PORT:-3306}" \
  --mysqlx=0 \
  --secure-file-priv="$ROOT/mysql-files"
