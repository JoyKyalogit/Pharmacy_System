# Roles and Permissions

## Role Definitions

## Admin

Primary system owner and supervisor. Has full access to configuration, users, inventory, sales, and reports.

## Pharmacist

Clinical and stock operations role. Manages medicines, prescription workflows, and most reports.

## Cashier

Front-desk sales role focused on POS transactions and receipt handling with restricted administrative access.

---

## Permission Matrix

| Capability | Admin | Pharmacist | Cashier |
|---|---:|---:|---:|
| View dashboard | Yes | Yes | Yes |
| Manage users | Yes | No | No |
| Assign/change roles | Yes | No | No |
| Create/update drugs | Yes | Yes | No |
| Receive stock batches | Yes | Yes | No |
| Adjust stock manually | Yes | Yes (limited) | No |
| Process OTC sales | Yes | Yes | Yes |
| Process prescription sales | Yes | Yes | Policy-based |
| Void/refund sales | Yes | Yes (limited) | No |
| View sales reports | Yes | Yes | Limited |
| View profit reports | Yes | Yes | No |
| View audit logs | Yes | Limited | No |
| Configure system settings | Yes | No | No |

---

## Endpoint Access Principles

- Backend enforces role checks on every protected route.
- Frontend only hides disallowed actions for usability; it does not replace backend authorization.
- Critical mutations require explicit permission checks and dual-control policy for high-risk actions.

## Permission Keys (Recommended)

- `users.manage`
- `roles.assign`
- `drugs.manage`
- `stock.receive`
- `stock.adjust`
- `sale.create.otc`
- `sale.create.prescription`
- `sale.void`
- `sale.refund`
- `reports.sales.view`
- `reports.profit.view`
- `audit_logs.view`

## Recommended Restrictions

- Cashier cannot:
  - Manage users or roles
  - Receive or adjust stock
  - Access profit and audit reports
  - Void or refund completed sales
- Pharmacist can:
  - Manage stock and prescription sales
  - Access inventory/expiry/sales reports
  - Not manage users or global settings
- Admin can perform all actions, including overrides with audit justification.

## Audit and Accountability

- All role-sensitive actions are logged with user identity and timestamp.
- Permission denied attempts should be captured for security monitoring.
- Void/refund and manual stock adjustments must include reason codes and supervisor reference where required.
