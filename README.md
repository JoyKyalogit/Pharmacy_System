# Pharmacy Stock and POS System (Starter Implementation)

This implementation is generated from the `docs/` specifications and includes:

- FastAPI backend with JWT auth, RBAC, stock, sales, and reports endpoints
- PostgreSQL SQLAlchemy models aligned to the documented schema
- React frontend starter for login, stock view, and POS sale submission

## 1) Backend

```bash
cd backend
python -m venv .venv
# Git Bash
source .venv/Scripts/activate
# PowerShell
# .\.venv\Scripts\Activate.ps1
# CMD
# .venv\Scripts\activate.bat
pip install -r requirements.txt
cp .env.example .env
# Edit .env and set real PostgreSQL credentials before seeding.
# Example (local dev):
# DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/pharmacy_db
# If you hit a passlib/bcrypt error, run:
# pip install --upgrade --force-reinstall "bcrypt==4.0.1"
python -m scripts.seed
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

If seeding fails with `password authentication failed`, update `DATABASE_URL` in `backend/.env` with your actual Postgres username/password.

## 2) Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend runs on `http://localhost:3000`.
Backend runs on `http://localhost:8000`.

Set your own admin login credentials in `backend/.env` using:

- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`
- `SEED_ADMIN_NAME`
