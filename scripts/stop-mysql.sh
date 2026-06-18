#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -f mysql-run/mysql.pid ]; then
  echo "MySQL pid file not found."
  exit 0
fi

PID="$(cat mysql-run/mysql.pid)"
if ! kill -0 "$PID" 2>/dev/null; then
  echo "MySQL process is not running."
  rm -f mysql-run/mysql.pid mysql-run/mysql.sock
  exit 0
fi

kill "$PID"
for _ in $(seq 1 30); do
  if ! kill -0 "$PID" 2>/dev/null; then
    rm -f mysql-run/mysql.pid mysql-run/mysql.sock
    echo "MySQL stopped."
    exit 0
  fi
  sleep 1
done

echo "MySQL did not stop in time; sending SIGKILL."
kill -9 "$PID" 2>/dev/null || true
rm -f mysql-run/mysql.pid mysql-run/mysql.sock
