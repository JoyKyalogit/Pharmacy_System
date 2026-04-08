# Deployment Guide

## Local Deployment

## 1) Start PostgreSQL

- Ensure PostgreSQL service is running.
- Create database `pharmacy_db`.

## 2) Configure Environment

- Set backend environment variables (`DATABASE_URL`, `JWT_SECRET_KEY`, etc.).
- Set frontend API URL (`VITE_API_BASE_URL`).

## 3) Run Migrations and Seed Data

```bash
cd backend
alembic upgrade head
python scripts/seed.py
```

## 4) Start Services

```bash
# Backend
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Frontend
cd frontend
npm run dev -- --host 0.0.0.0 --port 3000
```

## 5) Validate

- Login succeeds
- Stock intake works
- POS sale updates inventory
- Reports return data

---

## Production Deployment Guidelines

## Infrastructure

- Deploy backend on Linux VM/container (e.g., Ubuntu + systemd or container orchestration).
- Run PostgreSQL on managed DB service or dedicated secure server.
- Serve frontend as static assets via Nginx or CDN.

## Backend Runtime

Use Gunicorn + Uvicorn workers:

```bash
gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 4 -b 0.0.0.0:8000
```

## Reverse Proxy (Nginx)

- Terminate TLS at Nginx.
- Proxy `/api/` to backend.
- Serve frontend build from `/var/www/pharmacy-ui`.
- Add security headers and request size limits.

## Configuration and Secrets

- Store secrets in a vault or secure env injection pipeline.
- Do not hardcode credentials in images or repository.
- Separate dev/staging/prod configuration values.
- Rotate application secrets with a documented schedule.

## Database Operations

- Enable automated daily backups.
- Monitor replication/health (if HA setup).
- Run migrations during deployment window with rollback strategy.
- Test restore drills quarterly and document RPO/RTO.

## Observability

- Centralized logs (backend, reverse proxy, DB)
- Metrics: request rate, latency, error rate, CPU/memory
- Alerts for API failures and DB resource saturation
- Add security alerts: repeated failed logins, permission denied bursts, unusual void/refund rates.

---

## Optional Docker Setup

## Example `docker-compose.yml` (reference)

```yaml
version: "3.9"
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: pharmacy_db
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  backend:
    build: ./backend
    env_file:
      - ./backend/.env
    depends_on:
      - db
    ports:
      - "8000:8000"

  frontend:
    build: ./frontend
    env_file:
      - ./frontend/.env
    depends_on:
      - backend
    ports:
      - "3000:3000"

volumes:
  pgdata:
```

## Docker Deployment Notes

- Use multi-stage builds for smaller images.
- Pin image tags and scan for vulnerabilities.
- Do not run containers as root where possible.
- Do not expose PostgreSQL to public networks; keep DB on private subnet/security group.
