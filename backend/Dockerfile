# Backend image.
#
# Multi-stage so the runtime image carries no compiler: build-essential and
# libpq-dev are needed to build psycopg2 and Pillow wheels, and are 300-odd MB
# of attack surface that has no business being in production.

FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install -r requirements.txt


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

# libpq5 is the psycopg2 runtime; postgresql-client gives the backup and restore
# commands their pg_dump/pg_restore. curl is the container healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 postgresql-client curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 paknutrition

COPY --from=builder /opt/venv /opt/venv

WORKDIR /app
COPY --chown=paknutrition:paknutrition . .
RUN chmod +x /app/entrypoint.sh

# Static files are baked into the image at build time. Doing it at boot means
# every container repeats the work, and two containers can race on the manifest.
# The key below is a throwaway: collectstatic touches no data, and this value is
# not present at runtime.
# repo-hygiene: allow
RUN SECRET_KEY="build-time-only-not-used-at-runtime-0000000000" \
    DEBUG=0 ALLOWED_HOSTS=localhost CONFIG_CHECK_STRICT=0 \
    python manage.py collectstatic --noinput \
    && chown -R paknutrition:paknutrition /app/staticfiles

# Never run as root. A container compromise should not also be a root shell.
USER paknutrition

EXPOSE 8000

# Liveness only — readiness (database, cache, migrations) is what the deploy
# gates on, and a dependency blip must not make the supervisor kill the process.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/healthz || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["web"]
