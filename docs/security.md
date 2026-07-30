# Security Model

## Intended deployment

This system is designed for **one pharmacy on a private LAN** (shop Wi‑Fi / Ethernet). It is not intended to be exposed directly to the public internet without additional hardening (VPN, reverse proxy, IP allowlists).

## Authentication

### Desk PIN (daily use)

- Staff enter a shared **desk PIN** (`KIOSK_PIN` in `backend/.env` only — not in the frontend bundle).
- `POST /auth/desk-login` validates the PIN on the server, then issues a JWT for the seeded **Pharmacist** staff user.
- Wrong PIN returns `401`; missing configuration returns `503`.

### Admin login (reports)

- Owner/manager uses email + password via `POST /auth/login`.
- Only users with role `Admin` can call `/reports/*` endpoints.
- The UI hides reports until admin credentials succeed; the API enforces this independently.

### JWT sessions

- Protected endpoints require `Authorization: Bearer <token>`.
- Access tokens expire per `JWT_EXPIRE_MINUTES` (default 15 minutes).
- Expired or invalid tokens return `401 Unauthorized`.

### Staff account (background)

- `SEED_STAFF_EMAIL` / `SEED_STAFF_PASSWORD` define the internal user used after desk PIN success.
- Staff do not type these credentials at the counter; keep them in `backend/.env` only.

## Password security (bcrypt)

- Passwords are hashed with bcrypt; never stored in plain text.
- Admin and staff seed passwords are set via `scripts/seed.py` from environment variables.

## Role-based access control (RBAC)

- Authorization is enforced server-side on every protected route.
- Roles: `Admin`, `Pharmacist`, `Cashier` (staff desk session uses `Pharmacist`).
- **Reports:** `Admin` only.
- **Stock / sales / drug create:** `Admin`, `Pharmacist`, and/or `Cashier` per endpoint (see `roles_permissions.md`).

## Network practices (pharmacy LAN)

- Use **staff-only Wi‑Fi**; avoid sharing the desk PIN or app URL with customers.
- Do not port-forward application ports on the router.
- Prefer separate **guest Wi‑Fi** with client isolation for customer internet.
- Optionally restrict inbound firewall rules on the server PC to your LAN subnet.

## API protection

- Configure `CORS_ORIGINS` to your real frontend origin(s) only.
- Use a strong `JWT_SECRET_KEY` (32+ characters). Run `python scripts/generate_secrets.py` for sample values.
- Change default `KIOSK_PIN`, admin password, and staff password before go-live.
- **Rate limiting:** `/auth/desk-login` and `/auth/login` lock out an IP after 5 failed attempts in 5 minutes (15-minute lockout). Tune via `AUTH_RATE_LIMIT_*` in `.env`.
- **API docs:** `/docs` is disabled when `APP_ENV=production`.
- **Startup checks:** weak secrets log a warning in development and block startup in production.
- Enforce HTTPS if the app is ever accessed outside the LAN (VPN or reverse proxy).

## Audit logging

- Login, desk login, and mutating operations are recorded in `audit_logs` where implemented.
- Review logs periodically for failed admin or desk access attempts.

## Operational checklist

- [ ] `KIOSK_PIN` set to a strong, private value
- [ ] Default seed passwords changed
- [ ] `JWT_SECRET_KEY` replaced
- [ ] `.env` files not committed to git
- [ ] API and DB not reachable from the public internet
- [ ] PostgreSQL backups enabled on the server PC
