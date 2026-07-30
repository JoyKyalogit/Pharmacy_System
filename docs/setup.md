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

Create `backend/.env` (copy from `backend/.env.example`):

```env
APP_ENV=development
APP_NAME=Pharmacy System API
APP_HOST=0.0.0.0
APP_PORT=8000

DATABASE_URL=postgresql+psycopg2://<db_user>:<db_password>@localhost:5432/pharmacy_db

JWT_SECRET_KEY=replace_with_strong_secret
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=15

BCRYPT_ROUNDS=12
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Admin — used for Reports only (seed + admin login modal)
SEED_ADMIN_NAME=System Admin
SEED_ADMIN_EMAIL=admin@pharmacy.local
SEED_ADMIN_PASSWORD=SecurePass123!

# Staff — internal API identity after desk PIN (not typed by staff daily)
SEED_STAFF_NAME=Pharmacy Staff
SEED_STAFF_EMAIL=staff@pharmacy.local
SEED_STAFF_PASSWORD=StaffPass123!

# Desk PIN — what staff type to open the app
KIOSK_PIN=ChangeMeDeskPIN!
```

Create `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

| Variable | Where | Purpose |
|----------|--------|---------|
| `KIOSK_PIN` | `backend/.env` | Shared desk password for Stock / Sales / Add medicine |
| `SEED_ADMIN_*` | `backend/.env` | Owner/manager account for **Reports** |
| `SEED_STAFF_*` | `backend/.env` | Backend user issued after correct desk PIN (run `seed.py`) |
| `VITE_API_BASE_URL` | `frontend/.env` | API URL (use server LAN IP when other PCs connect) |

Restart the backend after changing `KIOSK_PIN` or seed credentials.

## 3) Database Setup

Create database:

```sql
CREATE DATABASE pharmacy_db;
```

Run migrations (if using Alembic):

```bash
cd backend
alembic upgrade head
```

Seed roles, admin, and staff user:backend

```bash
cd backend
# Windows
.\.venv\Scripts\python.exe scripts\seed.py
# macOS/Linux
python scripts/seed.py
```

## 4) Run Backend (FastAPI)

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health check:

- Open `http://localhost:8000/health`
- Open API docs at `http://localhost:8000/docs`

## 5) Run Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

For other PCs on the same network:

```bash
npm run dev -- --host 0.0.0.0 --port 3000
```

Set `VITE_API_BASE_URL` to the server machine’s LAN address, e.g. `http://192.168.1.50:8000/api/v1`, then rebuild or restart the dev server.

## 6) Verify End-to-End

1. Open the app → enter **desk PIN** (`KIOSK_PIN` from `backend/.env`).
2. **Stock** — list loads; refresh works.
3. **Add medicine** — add a batch (packets/tablets or bottles, prices, expiry).
4. **Sales** — search by medicine or batch, add to cart, finalize sale; stock decreases.
5. **Reports (Admin)** — enter admin email/password (`SEED_ADMIN_*`); load today / month / custom report.
6. **Lock desk** — returns to PIN screen (use when leaving the counter).

## Troubleshooting

- **Desk PIN not accepted:** Ensure `KIOSK_PIN` is set in `backend/.env` and restart uvicorn.
- **“Staff account missing”:** Run `python scripts/seed.py` in `backend/`.
- **“Desk PIN is not configured”:** Add `KIOSK_PIN=...` to `backend/.env`.
- **DB connection failed:** Verify `DATABASE_URL`, PostgreSQL service, and credentials.
- **CORS errors:** Add the frontend origin to `CORS_ORIGINS` (include LAN URL if using another PC).
- **401 Unauthorized:** Token expired — use **Lock desk** and sign in again, or refresh the page.
- **`uvicorn` not found:** Activate `.venv` or run `.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`.

## Security Setup Notes

- Never commit `.env` files. Use `.env.example` with placeholders only.
- Generate strong values:

```powershell
cd backend
.\.venv\Scripts\python.exe scripts\generate_secrets.py
```

Copy the output into `backend/.env`, then run `python scripts/seed.py` and restart uvicorn.

- On startup the API **warns** in development if secrets are weak. Set `APP_ENV=production` only when secrets are strong (production mode also **disables** `/docs`).
- **Desk PIN** must be at least **8 characters** (letters and numbers recommended).
- **Auth rate limiting:** after 5 failed desk or admin logins from the same PC within 5 minutes, that PC is locked out for 15 minutes.
- Use the app on a **staff-only pharmacy network**; do not expose ports 3000/8000 to the public internet.
- See `deployment.md` for LAN deployment and `security.md` for the auth model.
