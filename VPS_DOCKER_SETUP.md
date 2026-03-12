# VPS Docker Setup

Use this when preparing the VPS for the GitHub Actions deployment on `main`.

## 1. Server Requirements

Install:
- Docker Engine
- Docker Compose plugin
- Git

Verify:

```bash
docker --version
docker compose version
git --version
```

## 2. Clone the Project

```bash
git clone <your-repo-url> paknutrition
cd paknutrition
```

This folder path must match the GitHub secret `PROJECT_PATH`.

## 3. Create the Root Compose Env

Create `.env` in the project root:

```env
POSTGRES_DB=paknutrition
POSTGRES_USER=paknutrition
POSTGRES_PASSWORD=replace-with-a-strong-password
VITE_API_BASE_URL=https://your-domain.com/api
```

## 4. Create the Backend Env

Create `backend/.env`:

```env
SECRET_KEY=replace-with-a-long-random-secret
DEBUG=False
ALLOWED_HOSTS=your-domain.com,www.your-domain.com
CSRF_TRUSTED_ORIGINS=https://your-domain.com,https://www.your-domain.com
CORS_ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com
FRONTEND_URL=https://your-domain.com
ADMIN_URL=secure-admin/

POSTGRES_DB=paknutrition
POSTGRES_USER=paknutrition
POSTGRES_PASSWORD=replace-with-a-strong-password
POSTGRES_HOST=db
POSTGRES_PORT=5432

EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=no-reply@your-domain.com
EMAIL_HOST_PASSWORD=replace-with-smtp-password
DEFAULT_FROM_EMAIL=PakNutrition <no-reply@your-domain.com>

ORDER_NOTIFICATION_EMAIL_ENABLED=True
ORDER_NOTIFICATION_SMS_ENABLED=False
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

SECURE_SSL_REDIRECT=True
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True
```

## 5. First Manual Deploy

Run this once on the VPS before relying on GitHub Actions:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

Check status:

```bash
docker compose -f docker-compose.prod.yml --env-file .env ps
```

Check logs if needed:

```bash
docker compose -f docker-compose.prod.yml --env-file .env logs backend
docker compose -f docker-compose.prod.yml --env-file .env logs frontend
```

## 6. GitHub Secrets

Set these in GitHub Actions secrets:
- `SSH_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`
- `VPS_PORT`
- `PROJECT_PATH`

## 7. Deploy Flow

After the VPS env files exist and the first manual deploy works:
- commit changes
- push to `main`
- GitHub Actions will redeploy with Docker Compose automatically

## 8. Important Note

If you change `ADMIN_URL` away from `admin/`, update:
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/nginx/default.conf`](./frontend/nginx/default.conf)

so the proxied admin path matches the Django setting.
