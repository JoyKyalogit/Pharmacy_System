# Setup Guide

## Prerequisites

Install the following tools:

- Node.js 18+ and npm
- Python 3.11+
- PostgreSQL 14+
- Git

Optional:

- Docker and Docker Compose for containerized setup

## Suggested Project Layout

```text
project-root/
  backend/
  frontend/
  docs/
```

## 1) Clone and Initialize

```bash
git clone <repository-url>
cd <repository-folder>
```

## 2) Configure Environment Variables

Create `backend/.env`:

```env
APP_ENV=development
APP_NAME=Pharmacy System API
APP_HOST=0.0.0.0
APP_PORT=8000

DATABASE_URL=postgresql+psycopg2://<db_user>:<db_password>@localhost:5432/pharmacy_db

JWT_SECRET_KEY=replace_with_strong_secret
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=15
JWT_REFRESH_EXPIRE_DAYS=7

BCRYPT_ROUNDS=12
CORS_ORIGINS=http://localhost:3000
RATE_LIMIT_LOGIN_PER_MINUTE=5
```

Create `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

## 3) Database Setup

Create database:

```sql
CREATE DATABASE pharmacy_db;
```

Run migrations (example with Alembic):

```bash
cd backend
alembic upgrade head
```

Seed initial roles/admin (if seed script exists):

```bash
python scripts/seed.py
```

## 4) Run Backend (FastAPI)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health check:

- Open `http://localhost:8000/health`
- Open API docs at `http://localhost:8000/docs`

## 5) Run Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## 6) Verify End-to-End

- Login with seeded Admin user
- Add supplier and drug batch
- Process a sample sale
- Confirm stock deduction and sales report entries

## Troubleshooting

- **DB connection failed:** Verify `DATABASE_URL`, PostgreSQL service, and credentials
- **CORS errors:** Ensure backend `CORS_ORIGINS` includes frontend URL
- **401 Unauthorized:** Check token expiry and auth header format
- **Migration errors:** Confirm Alembic revision state and DB permissions

## Security Setup Notes

- Never commit `.env` files. Keep `.env.example` with placeholders only.
- Use different credentials/secrets for development, staging, and production.
- Rotate JWT and admin credentials regularly (recommended every 90 days).
- Do not use shared DB superuser credentials from application runtime.
