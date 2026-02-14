# Pakistan Protein Hub

A modern e-commerce platform for fitness enthusiasts, built with Django (Backend) and React + Vite (Frontend).

## Prerequisites
- Python 3.8+
- Node.js (v14+) & npm

## Quick Start

### 1. Backend Setup (Django)

Navigate to the backend directory:
```bash
cd backend
```

Create a virtual environment (optional but recommended):
```bash
python -m venv venv
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate
```

Install dependencies:
```bash
pip install -r requirements.txt
```

Run migrations:
```bash
python manage.py migrate
```

Start the backend server:
```bash
python manage.py runserver 8000
```
> The API will be available at `http://127.0.0.1:8000/api/`

---

### 2. Frontend Setup (React + Vite)

Open a new terminal and navigate to the frontend directory:
```bash
cd frontend
```

Install dependencies:
```bash
npm install
```

Start the development server:
```bash
npm run dev
```
> The application will be available at `http://127.0.0.1:8080/` (or the port shown in your terminal).

## Accessing the Application

- **Storefront**: [http://127.0.0.1:8080](http://127.0.0.1:8080)
- **Admin Panel**: [http://127.0.0.1:8080/admin](http://127.0.0.1:8080/admin)
- **Backend API**: [http://127.0.0.1:8000/api/](http://127.0.0.1:8000/api/)
- **Swagger Docs**: [http://127.0.0.1:8000/api/docs/](http://127.0.0.1:8000/api/docs/)

## Admin Credentials
(Replace with actual credentials if set up)
- **Username**: admin
- **Password**: admin (or as configured)
