# Lindah Pharmacy Management System

## Overview

A pharmacy operations app for **one location on a local network**: stock viewing, receiving medicine (batch intake), point-of-sale sales, and admin-only sales reports. Designed for counter use without per-staff logins — staff share a **desk PIN**; the owner uses a separate **admin account** for reports.

## Core capabilities

- **Stock** — medicines on hand, batch numbers, expiry and low-stock indicators
- **Add medicine** — batch intake with packets/tablets or bottles, pricing, expiry
- **Sales** — batch search (FEFO), cart checkout, automatic stock deduction
- **Reports (Admin)** — daily, monthly, and custom sales summaries
- **Desk PIN** — simple gate before daily use; **Lock desk** when leaving the counter

## How staff sign in

| Step | What happens |
|------|----------------|
| Open app | Enter **desk PIN** (`KIOSK_PIN` in `backend/.env`) |
| Daily work | Stock, Add medicine, Sales (no email/password) |
| Reports | Click **Reports (Admin)** → admin email + password |
| Leave counter | **Lock desk** |

A **staff user** exists in the database for API security; staff do not sign in with `staff@pharmacy.local` at the counter.

## Technology stack

- **Frontend:** React 18, Vite
- **Backend:** FastAPI, Pydantic, SQLAlchemy, JWT
- **Database:** PostgreSQL
- **Security:** bcrypt, role-based API checks, audit logs

## Quick start

1. Clone the repository.
2. Configure `backend/.env` and `frontend/.env` — see `setup.md`.
3. Create PostgreSQL database `pharmacy_db`.
4. Run `python scripts/seed.py` in `backend/`.
5. Start backend (`uvicorn`) and frontend (`npm run dev`).
6. Open `http://localhost:3000` and enter your desk PIN.

## Documentation

| Document | Contents |
|----------|----------|
| `setup.md` | Install, env vars, seed, run, troubleshoot |
| `deployment.md` | Pharmacy LAN deployment, production notes |
| `features.md` | Feature breakdown |
| `workflows.md` | Stock, sales, reports flows |
| `api.md` | REST API reference |
| `security.md` | Auth, desk PIN, LAN practices |
| `roles_permissions.md` | Roles and API permissions |
| `database.md` | Schema overview |
| `architecture.md` | System structure |
