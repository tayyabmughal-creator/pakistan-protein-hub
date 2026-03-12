# Deployment Checklist

## 1. Active Deployment Path

The active deployment path for this release is the existing VPS setup:
- push to `main`
- GitHub Actions SSHes into the VPS
- the server runs `git pull origin main`
- backend dependencies are installed into the existing virtual environment
- Django migrations and static collection run
- frontend is rebuilt
- Gunicorn and Nginx are restarted with `systemctl`

Docker files remain in the repository for later work, but they are not the active deployment path for this release.

## 2. VPS Prerequisites

The VPS should already have:
- Python 3
- virtualenv support
- Node.js and npm
- Git
- Gunicorn managed by systemd
- Nginx managed by systemd

The GitHub Action expects:
- `$PROJECT_PATH/backend/.env` to already exist

## 3. Backend Environment

Create `backend/.env` from [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/.env.example`](./.env.example) and set at minimum:
- `SECRET_KEY`
- `DEBUG=False`
- `ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`
- `FRONTEND_URL`
- `ADMIN_URL`

If production uses PostgreSQL, also set:
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_HOST`
- `POSTGRES_PORT`

## 4. GitHub Actions Secrets

The workflow at [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) requires:
- `SSH_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`
- `VPS_PORT`
- `PROJECT_PATH`
- `GUNICORN_SERVICE`
- `NGINX_SERVICE`

## 5. Deploy Flow

On push to `main`, the workflow will:
1. SSH into the VPS
2. `cd` into `PROJECT_PATH`
3. `git pull origin main`
4. create/use `.venv` or `venv`
5. `pip install -r backend/requirements.txt`
6. run `python manage.py migrate --noinput`
7. run `python manage.py collectstatic --noinput`
8. run `python manage.py check`
9. run `npm ci` or `npm install`
10. run `npm run build`
11. restart Gunicorn and Nginx via systemd

## 6. Validation

Before release, validate locally:

```bash
cd backend
python3 -m pytest
```

```bash
cd frontend
npm run build
```
