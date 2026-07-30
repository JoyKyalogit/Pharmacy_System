# Deployment Guide

## Pharmacy LAN deployment (recommended)

Use one PC as the server inside the shop. Other devices (laptops, tablets) open the app in a browser over Wi‑Fi or Ethernet.

### 1) Server PC

- Install PostgreSQL, Python, Node.js.
- Configure `backend/.env` (database, `KIOSK_PIN`, admin/staff seed values, `JWT_SECRET_KEY`).
- Run `python scripts/seed.py`.
- Start backend: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Build and serve frontend, or run dev with network access:

```bash
cd frontend
npm run build
npm run preview -- --host 0.0.0.0 --port 3000
```

Find the server IP (Windows: `ipconfig`, e.g. `192.168.1.50`).

### 2) Other pharmacy devices

- Connect to **staff Wi‑Fi** (not guest/public Wi‑Fi if possible).
- Set `VITE_API_BASE_URL=http://<server-ip>:8000/api/v1` before building the frontend, or use the same value in `frontend/.env` on the server if all devices load the UI from that machine.
- Open `http://<server-ip>:3000` and bookmark it.
- Staff use the **desk PIN**; only the owner/manager uses **admin login** for reports.

### 3) Network security

- Do **not** port-forward 3000 or 8000 on the router.
- Use a Wi‑Fi password for staff devices only; prefer a separate guest network for customers.
- Optionally restrict Windows Firewall on the server to your LAN subnet (e.g. `192.168.1.0/24`) for ports 3000 and 8000.

---

## Local development

### 1) Start PostgreSQL

- Ensure PostgreSQL service is running.
- Create database `pharmacy_db`.

### 2) Configure environment

- Backend: `backend/.env` — see `setup.md` for all variables (`KIOSK_PIN`, seed users, `DATABASE_URL`, etc.).
- Frontend: `frontend/.env` — `VITE_API_BASE_URL=http://localhost:8000/api/v1`

### 3) Migrations and seed

```bash
cd backend
alembic upgrade head
python scripts/seed.py
```

### 4) Start services

```bash
# Backend
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Frontend
cd frontend
npm run dev -- --host 0.0.0.0 --port 3000
```

### 5) Validate

- Desk PIN opens Stock, Add medicine, and Sales
- Sale deducts batch stock (FEFO when batch not specified)
- Admin login unlocks Reports
- **Lock desk** returns to PIN screen

---

## Production deployment guidelines

### Infrastructure

- Deploy backend on a Linux VM or container on the pharmacy LAN (or private VPN).
- Run PostgreSQL on the same private network; do not expose the DB publicly.
- Serve frontend as static files via Nginx from the server PC or a small local VM.

### Backend runtime

```bash
gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 4 -b 0.0.0.0:8000
```

### Reverse proxy (Nginx)

- Optional on LAN; useful for a single port (e.g. 80) and static files.
- Proxy `/api/` to backend.
- Serve frontend build from `/var/www/pharmacy-ui`.
- Add security headers and request size limits.

### Configuration and secrets

- Set `KIOSK_PIN`, `JWT_SECRET_KEY`, and `SEED_*` via environment — never in git.
- Rotate desk PIN and admin password when staff change.
- Set `CORS_ORIGINS` to your real frontend origin(s) only.

### Database operations

- Enable automated daily backups on the server PC or NAS.
- Run migrations during a quiet window with a rollback plan.
- Test restore periodically.

### Observability

- Log backend errors to a file on the server.
- Monitor disk space and PostgreSQL health.
- Review failed desk PIN / admin login attempts in `audit_logs` if needed.

---

## Optional Docker setup

See `docker-compose.yml` in the repository root (if present). Do not expose PostgreSQL to public networks; keep services on a private subnet.

### Docker notes

- Use multi-stage builds for smaller images.
- Pin image tags and scan for vulnerabilities.
- Do not run containers as root where possible.
- Mount `backend/.env` via secrets, not committed files.
