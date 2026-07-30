# Roles and Permissions

## UI access (what staff see)

| Screen | Desk PIN session | Admin session (reports) |
|--------|------------------|-------------------------|
| Stock | Yes | Yes (after exiting reports or via nav) |
| Add medicine | Yes | Yes |
| Sales | Yes | Yes |
| Reports | No — admin login required | Yes |
| Lock desk | Yes | Yes (clears session, returns to PIN) |

There is **no per-user login** at the counter. Everyone shares the desk PIN for daily work.

## Role definitions

### Admin

System owner. Full API access including **all report endpoints**. Used only through **Reports (Admin)** in the UI (email + password).

### Pharmacist

Used as the **desk session** identity after a successful desk PIN. Can manage drugs/stock and process sales in the current app.

### Cashier

Defined in the database for future use. The desk PIN currently signs in as the seeded **Pharmacist** staff user.

---

## API permission summary (current routes)

| Capability | Admin | Pharmacist | Cashier |
|---|---:|---:|---:|
| Desk login → staff JWT | — | (staff user) | — |
| View stock levels | Yes | Yes | Yes |
| Create drug / receive batch | Yes | Yes | No |
| Search batches (POS) | Yes | Yes | Yes |
| Create sale | Yes | Yes | Yes |
| Sales reports (`/reports/*`) | Yes | No | No |
| Low-stock report | Yes | No | No |

---

## Endpoint access principles

- Backend enforces role checks on every protected route.
- Frontend navigation and modals are for usability only; they do not replace server authorization.
- Changing `KIOSK_PIN` does not require re-running seed; changing `SEED_STAFF_*` requires `scripts/seed.py`.

## Audit and accountability

- Desk and admin sign-in events are logged where implemented.
- Sales are attributed to the authenticated user (desk session = staff user).
- A shared desk PIN does not identify which person made a sale; use operational procedures if you need per-person accountability later.
