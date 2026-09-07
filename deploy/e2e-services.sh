#!/usr/bin/env bash
# The services chainstrip's cove2e stage brings up around the HOST-served app:
# MongoDB as a single-node replica set, the API suite's mock server, and
# httpbin. The app itself is not started here - cove2e starts `meteor` in its
# workspace and points it at this mongo through MONGO_URL (chainstrip.config.json
# e2e.env). `down -v` discards the database, so every cove2e run starts from an
# empty one, exactly as the project's own CI does.
set -euo pipefail
cd "$(dirname "$0")/.."
# PINNED PATCH, not the floating 8.0 tag CI uses. MEASURED on builder-0
# (kernel 7.0.0-30-generic, probe run 34145789854): 8.0-ubi8, 8.0-ubi9,
# 8.2-ubi8 and 7.0-ubi8 all refuse to start - "MongoDB 8.0+ utilizes the
# tcmalloc allocator which has a known issue with this kernel" - while
# 8.0.17-ubi8 and 8.2.3-ubi8, which predate that check, start. Same major as
# CI's matrix. Override with MONGODB_VERSION when the kernel or the image moves.
export MONGODB_VERSION="${MONGODB_VERSION:-8.0.17}"
export COMPOSE_PROFILES=api          # mock-server sits behind the api profile
export COMPOSE_PROJECT_NAME=chainstrip-e2e
compose() { docker compose -f docker-compose-ci.yml -f deploy/compose.e2e.yml "$@"; }
case "${1:-}" in
  up)
    compose up -d --wait mongo mock-server httpbin
    # `--wait` returns when mongo is RUNNING; the replica set is initiated by
    # its entrypoint a few seconds later, and a server that connects before
    # that sees "not primary". Bound: 60 x 2s.
    for i in $(seq 1 60); do
      if compose exec -T mongo mongosh --quiet --eval 'rs.status().ok' 2>/dev/null | grep -q '^1$'; then
        echo "mongo replica set ready after $((i * 2))s"; exit 0
      fi
      sleep 2
    done
    echo "mongo replica set did not initiate in 120s" >&2; compose logs mongo | tail -20 >&2; exit 1
    ;;
  down) compose down -v --remove-orphans ;;
  *) echo "usage: $0 up|down" >&2; exit 2 ;;
esac
