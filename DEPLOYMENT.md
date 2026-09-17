# Deployment and operations

Covers the container deployment, the migration and rollback ordering, and the
backup/restore drill.

> **Two deployment paths exist right now.** The live VPS still uses the
> `git reset --hard` + systemd workflow in `.github/workflows/deploy.yml`, which
> now takes a pre-deploy backup and is gated on CI. The container path below is
> the target. Cutting over is a deliberate operation — see §7 — and has **not**
> been performed.

---

## 1. The shape of it

```
customer → nginx (frontend image) ─┬─ / , /assets/   static SPA build
                                   ├─ /api/, /admin/, /static/  → backend:8000
                                   └─ /media/        uploaded files (volume)

backend (gunicorn)  ── PostgreSQL 16
worker  (celery)   ─┤
beat    (celery)   ─┴─ Redis  (cache + broker)
```

One backend image runs four roles, selected by the entrypoint argument: `web`,
`worker`, `beat`, `migrate`. Same artefact, so a worker can never be running
different code from the web tier.

---

## 2. What the entrypoint deliberately does not do

**It does not run migrations.** Every container used to `migrate` on start,
which means:

- two containers race two migrations against each other;
- a rollback to the previous image silently re-runs what the new one applied, so
  the rollback does not roll back;
- nobody chooses when the schema changes — it happens whenever a process
  restarts.

Migration is an explicit step (§4). The `web` role runs `migrate --check` and
**refuses to start** against a schema it does not match, so a skipped migration
fails loudly at boot instead of serving 500s.

`collectstatic` is a build step baked into the image, not a boot step.

---

## 3. Configuration

All backend configuration comes from `backend/.env`. In production the settings
module validates it at import and **refuses to start** if anything is wrong,
reporting every problem at once — see `backend/common/env.py`.

It will refuse to start on, among others:

- `SECRET_KEY` under 50 characters or still carrying `django-insecure-`
- running on SQLite
- `ALLOWED_HOSTS` empty or containing `*`
- `SECURE_SSL_REDIRECT` / `SESSION_COOKIE_SECURE` / `CSRF_COOKIE_SECURE` off
- `SAFEPAY_ENABLED` on without a webhook secret, or pointed at the sandbox
- `CELERY_TASK_ALWAYS_EAGER` on

`CONFIG_CHECK_STRICT=0` downgrades this to a warning. That is for getting a
shell on an already-broken box, not for normal operation.

### Required for the container stack

| Variable | Notes |
| --- | --- |
| `SECRET_KEY` | `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | also needed in the shell running compose, for the `db` service |
| `REDIS_URL` | set by compose to `redis://redis:6379/0` |
| `CELERY_BROKER_URL` | set by compose to `redis://redis:6379/1` |
| `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` | real hostnames |
| `FRONTEND_URL`, `BACKEND_PUBLIC_URL` | `https://…` |
| `IMAGE_TAG` | the artefact being deployed |

---

## 4. Deploying

Images are built and tested in CI and referenced by tag. Nothing is rebuilt on
the server, so what runs is what was tested — not a rebuild that may resolve
different dependencies on a different day.

```bash
cd /srv/paknutrition
export IMAGE_TAG=<the tag CI produced>

# 1. Back up first, always. Note the file it writes.
docker compose -f docker-compose.prod.yml exec -T backend \
    python manage.py backup_database --label pre-deploy

# 2. Pull the new images. Nothing is running them yet.
docker compose -f docker-compose.prod.yml pull

# 3. Migrate, explicitly, as its own step.
docker compose -f docker-compose.prod.yml run --rm migrate

# 4. Roll the application forward.
docker compose -f docker-compose.prod.yml up -d backend worker beat frontend

# 5. Verify readiness, not just liveness.
curl -fsS https://<host>/readyz | jq .

# 6. Smoke test the paths that carry money.
curl -fsS https://<host>/api/payment-methods/ >/dev/null && echo "catalogue OK"
docker compose -f docker-compose.prod.yml exec -T backend \
    python manage.py reconcile_payments --dry-run
```

Step 5 must return `"status": "ok"`. A 503 names which dependency failed.

### Migration compatibility

Migrations are applied **before** the new code starts, so for the duration of
the rollout the old code runs against the new schema. Every migration must be
backward compatible with the currently-running release:

- adding a column is safe if it is nullable or has a default;
- **renaming or dropping** a column is not safe in one release. Split it: add
  the new column and dual-write, deploy, backfill, then drop in a later release.
- adding an index concurrently avoids locking a busy table.

This is why every schema change so far has been additive.

---

## 5. Rolling back

Rolling back **code** is a tag change. Rolling back **schema** is not — which is
why the ordering above matters.

```bash
export IMAGE_TAG=<the previous tag>
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d backend worker beat frontend
curl -fsS https://<host>/readyz
```

This works **only if the new release's migrations are backward compatible** —
the previous image will now be running against the newer schema. If they are
not, the rollback is a restore, not a redeploy:

```bash
# Stop writes first, or the restore loses whatever arrives during it.
docker compose -f docker-compose.prod.yml stop backend worker beat

docker compose -f docker-compose.prod.yml run --rm backend \
    python manage.py restore_database /backups/<pre-deploy dump> --force

export IMAGE_TAG=<the previous tag>
docker compose -f docker-compose.prod.yml up -d backend worker beat frontend
```

Everything between the backup and the restore is lost. That is the cost of a
non-backward-compatible migration, and the reason to avoid writing one.

---

## 6. Backups and the restore drill

### Taking a backup

```bash
docker compose -f docker-compose.prod.yml exec -T backend \
    python manage.py backup_database --output-dir /backups --keep 14
```

Writes `pg_dump` custom format. The `./backups` directory is mounted into the
`db` service, so backups survive the container. **Copy them off the box** — a
backup on the same disk as the database does not survive the failure most likely
to need it.

### The drill

**A backup that has never been restored is not a backup.** The rehearsal restores
into a throwaway database, counts the rows, and drops it. It never touches the
live database:

```bash
docker compose -f docker-compose.prod.yml exec -T backend \
    python manage.py restore_database /backups/<file>.dump --into-scratch-db
```

Expected output:

```
Restore drill: paknutrition.20260917T120000Z.dump -> scratch database 'paknutrition_restore_drill'
Restore drill succeeded. Row counts:
  users_user                                  1,204
  products_product                              186
  orders_order                                3,417
  orders_orderitem                            7,905
  payments_paymenttransaction                   902
Scratch database 'paknutrition_restore_drill' dropped.
```

**An exit code of zero is not the result — the row counts are.** A restore that
produces empty tables exits cleanly and has restored nothing; the command calls
that out explicitly, and CI fails on it.

### It is proven continuously

The `restore-drill` job in `.github/workflows/ci.yml` runs this whole loop on
every push — seed a database, dump it, restore it into a scratch database, and
fail if any table comes back empty. The runbook cannot rot into something that
no longer works by the time someone needs it at 2am.

### Cadence

| What | When |
| --- | --- |
| Automatic backup | before every deploy (built into the deploy workflow) |
| Scheduled backup | daily, via cron on the host |
| Off-box copy | daily, after the scheduled backup |
| Restore drill on a **production** backup | monthly, and after any schema change large enough to worry about |

```cron
# Daily backup at 02:15 UTC, retaining two weeks.
15 2 * * * cd /srv/paknutrition && docker compose -f docker-compose.prod.yml exec -T backend python manage.py backup_database --output-dir /backups --keep 14 >> /var/log/paknutrition-backup.log 2>&1
```

---

## 7. Cutting over from the current VPS deployment

Not yet done. The live site still runs the `git reset --hard` + systemd path.
Moving to containers is a planned operation, not a side effect of a push:

1. Install Docker on the VPS; leave the existing stack running.
2. Bring the container stack up on a different port, pointed at a **restored
   copy** of the production database. Do not point it at production.
3. Run the smoke tests in §4 against it.
4. Take a final backup, stop the systemd services, run the migration step, and
   switch nginx to the container stack.
5. Keep the old stack installed and the final backup for the rollback window.

Until then the systemd path stays authoritative, and it has already been
hardened: gated on CI, and taking a pre-deploy backup.

---

## 8. Observability

- **Logs** are JSON, one object per line, each carrying `request_id`. The same
  id is returned to the caller in `X-Request-ID`, so a customer's report can be
  traced directly: `docker compose logs backend | grep <id>`.
- **Payment activity** logs at INFO under the `payments` logger regardless of
  the root level — it is the audit trail for money.
- **Failed background tasks** are logged by the `task_failure` handler in
  `config/celery.py`. Without it, a task that exhausts its retries vanishes and
  the only symptom is a customer who never got an email.
- **Nothing sensitive is logged.** Passwords, tokens, signatures and card fields
  are redacted by `common.logging.scrub`; emails and phone numbers are masked.
- **Error monitoring** is opt-in: set `SENTRY_DSN`. Nothing is sent anywhere
  without it, and `send_default_pii` is off so customer records do not leave in
  a crash report.

### Worth alerting on

| Condition | Why |
| --- | --- |
| `PaymentTransaction.status = MISMATCH` | a customer was charged an amount that did not match their basket |
| `reconcile_payments` settling anything | a webhook was never delivered; investigate the endpoint |
| `/readyz` non-200 | the site cannot serve |
| Repeated `WebhookEvent.result = REJECTED` | someone is probing the webhook, or the signing secret is wrong |
