# Security Model

## Authentication (JWT)

- Users authenticate with email/password.
- Backend issues signed JWT access tokens with short expiry (10-15 minutes recommended).
- Protected endpoints require `Authorization: Bearer <token>`.
- Token payload contains user identity, role claims, and a unique token ID (`jti`).
- Expired/invalid tokens return `401 Unauthorized`.
- Refresh tokens should be rotated on each refresh and revoked on logout.
- Role or password changes should invalidate all active sessions for that user.

## Password Security (bcrypt)

- Passwords are never stored in plain text.
- Passwords are hashed with bcrypt using configurable work factor.
- Login verification uses constant-time hash compare.
- Password policy (recommended):
  - Minimum 8-12 characters
  - Mixed character classes
  - Block weak/common passwords

## Role-Based Access Control (RBAC)

- Authorization is enforced server-side for every protected route.
- Roles: `Admin`, `Pharmacist`, `Cashier`
- Access checks happen before business logic execution.
- Sensitive actions (stock adjustments, role changes, report exports) require elevated roles.
- Prefer permission-based checks in code (for example `sale.void`, `stock.adjust`, `prescription.finalize`) instead of role names alone.
- High-risk operations (sale voids and manual stock adjustment) should require dual approval in production.

## Input Validation

- Request payloads validated with Pydantic schemas.
- Validation includes:
  - Required fields
  - Type checks
  - Range checks (quantity > 0, price >= 0)
  - Enum constraints for sale/payment types
- Invalid input returns structured `422` or `400` response.
- All SQL must be parameterized (never string-concatenated SQL).
- Add output encoding/sanitization for user-supplied data rendered in UI to reduce XSS risk.

## Audit Logging

- Mutating operations and security-relevant events are logged in `audit_logs`.
- Typical events:
  - Login success/failure
  - User/role changes
  - Batch creation/adjustment
  - Sale finalization/voids
- Log entries capture user, action, target entity, timestamp, and metadata.
- Audit logs should be append-only from application perspective.
- Denied access attempts, failed logins, and suspicious bursts must also be logged.
- Audit logs should be forwarded to centralized immutable storage for tamper resistance.

## API Protection Best Practices

- Enforce HTTPS in production.
- Configure strict CORS allowlist (no wildcard in production).
- Apply request rate limiting on auth endpoints.
- Sanitize all user-provided strings before rendering in UI.
- Avoid leaking stack traces to clients.
- Add account lockout/backoff policy after repeated failed login attempts.
- Use idempotency keys for checkout and payment endpoints to prevent duplicate transactions.

## Data Protection

- Restrict DB user privileges to least required operations.
- Encrypt database backups and keep retention policies.
- Store secrets in environment or vault, never in source control.
- Rotate JWT secret and admin credentials periodically.
- Separate application DB role from migration/admin DB role.
- Rotate and document secrets with a fixed schedule (for example every 90 days).

## Operational Security Checklist

- [ ] HTTPS configured and valid TLS certificates
- [ ] Strong secrets and key rotation policy
- [ ] Principle-of-least-privilege role design
- [ ] Centralized logs and monitoring alerts
- [ ] Regular patching for OS/runtime/dependencies
- [ ] Tested backup and restore procedures
- [ ] Rate limiting and account lockout on authentication endpoints
- [ ] Session revocation on role/password changes
- [ ] Security testing in CI (SAST, dependency scan, container scan)
