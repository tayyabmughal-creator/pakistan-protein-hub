# PakNutrition

PakNutrition is a full-stack supplements e-commerce application with:
- a Django REST API in [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend`](./backend)
- a React + Vite storefront/admin frontend in [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend`](./frontend)

## Local Development

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python3 manage.py migrate
python3 manage.py runserver 8000
```

The backend API will be available at `http://127.0.0.1:8000/api/`.

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

The frontend will be available at `http://127.0.0.1:8080/` unless Vite chooses another port.

## Environment Variables

### Backend

Use [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/.env.example`](./backend/.env.example) as the starting point.

Required in production:
- `SECRET_KEY`
- `DEBUG=False`
- `ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`
- `FRONTEND_URL`

Optional:
- PostgreSQL via `POSTGRES_*`
- SMTP via `EMAIL_*`
- order notifications via `ORDER_NOTIFICATION_*` and `TWILIO_*`
- custom admin path via `ADMIN_URL`

### Frontend

Use [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/.env.example`](./frontend/.env.example).

Required:
- `VITE_API_BASE_URL`

Example:

```bash
VITE_API_BASE_URL=https://api.example.com/api
```

## Production Notes

- Product detail pages are public; checkout, cart, profile, orders, and admin remain protected.
- Promotions now have a public API at `/api/promotions/` and the deals page reads from it.
- The backend defaults are now environment-driven instead of local-development hardcoded.
- SQLite still works for local development, but PostgreSQL should be used for production.
- A containerized production stack is available via [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/docker-compose.prod.yml`](./docker-compose.prod.yml).

## Test Coverage

Backend API coverage now exists for:
- auth/profile in [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/users/tests.py`](./backend/users/tests.py)
- catalog in [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/products/tests.py`](./backend/products/tests.py)
- cart flows in [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/cart/tests.py`](./backend/cart/tests.py)
- order creation/cancellation in [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/orders/tests.py`](./backend/orders/tests.py)
- reviews/verified purchase rules in [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/reviews/tests.py`](./backend/reviews/tests.py)
- promotions listing in [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/promotions/tests.py`](./backend/promotions/tests.py)

## Docker Deployment

Use:
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/docker-compose.prod.yml`](./docker-compose.prod.yml)
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/.env.prod.example`](./.env.prod.example)
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/Dockerfile`](./backend/Dockerfile)
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/Dockerfile`](./frontend/Dockerfile)

Quick start:

```bash
cp .env.prod.example .env
cp backend/.env.example backend/.env
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

This Docker Compose path is also what the GitHub Actions deploy workflow now uses on `main`.

If you change `ADMIN_URL` away from `admin/`, update [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/nginx/default.conf`](./frontend/nginx/default.conf) to proxy the same path.

## Key URLs

- Storefront: `/`
- Admin SPA: `/admin`
- Backend API: `/api/`
- Swagger docs: `/api/docs/`
