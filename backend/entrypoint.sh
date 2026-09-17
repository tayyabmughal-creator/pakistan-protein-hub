#!/bin/sh
#
# Container entrypoint.
#
# Deliberately does NOT run migrations. Every container that started used to run
# `manage.py migrate` automatically, which means:
#
#   * scaling to two containers races two migrations against each other;
#   * a rollback to the previous image silently re-runs whatever the new one
#     applied, so the rollback does not actually roll back;
#   * nobody ever chooses when the schema changes — it happens whenever a
#     process happens to restart.
#
# Migration is an explicit, separate deployment step. See
# `docker compose run --rm migrate` in docker-compose.prod.yml and the ordering
# in DEPLOYMENT.md.
#
# collectstatic is likewise a build step, baked into the image, not something
# done at runtime on every boot.

set -eu

ROLE="${1:-web}"

wait_for_postgres() {
    [ -n "${POSTGRES_DB:-}" ] || return 0
    echo "Waiting for PostgreSQL at ${POSTGRES_HOST:-db}:${POSTGRES_PORT:-5432}..."
    python - <<'PY'
import os
import socket
import sys
import time

host = os.environ.get("POSTGRES_HOST", "db")
port = int(os.environ.get("POSTGRES_PORT", "5432"))

for _ in range(60):
    try:
        with socket.create_connection((host, port), timeout=2):
            print("PostgreSQL is available.")
            break
    except OSError:
        time.sleep(1)
else:
    sys.exit("PostgreSQL did not become available in time.")
PY
}

case "$ROLE" in
    web)
        wait_for_postgres
        # Refuse to serve against a schema the code does not match. Without this
        # a container whose migration step was skipped serves 500s instead of
        # failing loudly at start.
        python manage.py migrate --check || {
            echo "ERROR: unapplied migrations. Run the migrate step before starting web."
            echo "       docker compose -f docker-compose.prod.yml run --rm migrate"
            exit 1
        }
        exec gunicorn config.wsgi:application \
            --bind 0.0.0.0:8000 \
            --workers "${GUNICORN_WORKERS:-3}" \
            --timeout "${GUNICORN_TIMEOUT:-60}" \
            --graceful-timeout 30 \
            --access-logfile - \
            --error-logfile -
        ;;

    migrate)
        wait_for_postgres
        echo "Applying migrations..."
        exec python manage.py migrate --noinput
        ;;

    worker)
        wait_for_postgres
        exec celery -A config worker \
            --loglevel "${CELERY_LOG_LEVEL:-INFO}" \
            --concurrency "${CELERY_CONCURRENCY:-2}"
        ;;

    beat)
        wait_for_postgres
        exec celery -A config beat --loglevel "${CELERY_LOG_LEVEL:-INFO}"
        ;;

    *)
        # Anything else runs verbatim, for one-off commands and debugging.
        exec "$@"
        ;;
esac
