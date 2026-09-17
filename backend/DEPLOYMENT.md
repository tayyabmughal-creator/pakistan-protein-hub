# Backend deployment — the currently live path

> The full operations guide, including the container stack, migration and
> rollback ordering, and the backup/restore drill, is
> [`../DEPLOYMENT.md`](../DEPLOYMENT.md). **That is the authoritative document.**
> This file records only what is running in production right now.

## What is live

Push to `main` → `.github/workflows/deploy.yml` → SSH to the VPS:

1. **CI gate.** The deploy job `needs: ci`, so nothing reaches the VPS unless
   repo hygiene, backend tests on PostgreSQL, migration consistency, the
   deployment security check, frontend lint/typecheck/build, the restore drill
   and the dependency audit all pass.
2. **Pre-deploy backup.** `pg_dump` of the configured database (or a copy of
   `db.sqlite3` if the box is still on SQLite) into `~/paknutrition-backups`,
   keeping the last 14. This is not optional: the next step overwrites the
   working tree.
3. `git fetch origin main && git reset --hard origin/main`
4. `pip install -r requirements.txt` into `.venv`
5. `python manage.py migrate --noinput`
6. `python manage.py collectstatic --noinput`
7. `python manage.py check`
8. `npm ci && npm run build` in `frontend/`
9. `systemctl restart` gunicorn and nginx, then `is-active` on both

## Known limitations of this path

Recorded honestly, because they are the reasons the container path exists:

- **It is a mutable in-place deploy.** Dependencies are resolved on the server
  at deploy time rather than in a tested artefact.
- **There is no rollback except redeploying an older commit**, which re-runs
  installation and rebuilds the frontend.
- **Migrations run as part of the same step as the code change**, so there is no
  window in which to verify the schema before serving traffic.
- **`git reset --hard` deletes files removed from the index.** This is why step 2
  exists. Before deploying any commit that untracks a file the server relies on,
  check what that file is.
- **Redis and Celery are not part of this path.** Without a broker,
  `common.dispatch.enqueue` runs notification tasks inline, so behaviour matches
  the previous release rather than degrading. To gain the benefit, set
  `REDIS_URL` and `CELERY_BROKER_URL` and run a worker under systemd.

## Environment

Create `backend/.env` from [`.env.example`](./.env.example). In production the
settings module validates it at import and refuses to start if it is wrong,
listing every problem at once — see `common/env.py` and §3 of the root guide.

## Required GitHub Actions secrets

`SSH_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_PORT`, `PROJECT_PATH`,
`GUNICORN_SERVICE`, `NGINX_SERVICE`.

## Health

- `GET /healthz` — liveness. No dependencies. Use for process supervision.
- `GET /readyz` — readiness. Checks database, cache and unapplied migrations.
  Returns 503 with the failing dependency named. **This is what to check after a
  deploy**; a 200 from `/healthz` only means the process is running.
