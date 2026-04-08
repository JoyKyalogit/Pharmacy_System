# Operational Workflows

## 1) Adding Stock (Batch Intake)

### Actors

- Admin
- Pharmacist

### Flow

1. User opens stock intake form.
2. Selects existing drug (or creates one if missing).
3. Selects supplier and enters batch metadata:
   - Batch number
   - Expiry date
   - Quantity received
   - Unit cost and selling price
4. Backend validates data:
   - Positive quantity and price
   - Non-expired batch
   - No duplicate `(drug_id, batch_no)`
5. Backend creates `batches` record and updates stock views.
6. System logs action in `audit_logs`.

### Outcome

- New stock becomes available for sale.
- Low stock flags may clear automatically.

---

## 2) Selling Drugs (POS Flow)

### Actors

- Cashier
- Pharmacist
- Admin

### Flow

1. User searches and adds drugs to cart.
2. System checks available quantities across active batches (FEFO/FIFO policy).
3. POS keeps cursor focus on search/scan input and supports keyboard shortcuts for speed.
4. User chooses sale type:
   - `OTC`
   - `PRESCRIPTION`
5. For prescription sale, user enters prescription reference and customer details.
6. User selects payment method (Cash, M-Pesa, Card).
7. Backend performs transactional checkout:
   - Creates `sales`
   - Creates `sale_items`
   - Deducts `batches.quantity_available`
   - Inserts `stock_movements` rows per item deduction
   - Rejects if stock is insufficient
8. Receipt is generated and returned to UI/print pipeline.
9. Audit event is created.

### Outcome

- Stock and sales records stay synchronized.
- Financial and inventory reports update from latest transactions.
- Checkout remains fast and predictable under high throughput with clear inline validation.

### POS Safety and UX Controls

- Block checkout if selected stock is expired.
- Warn when item has near-expiry batches.
- Show clear action-based errors (`INSUFFICIENT_STOCK`, `EXPIRED_BATCH`, `PRESCRIPTION_REQUIRED`).
- Preserve cart state after validation failures to reduce re-entry errors.
- Require explicit confirmation for void and refund operations.

---

## 3) Handling Prescriptions

### Actors

- Pharmacist (primary)
- Admin (oversight)

### Flow

1. Pharmacist receives prescription details.
2. System marks sale as `PRESCRIPTION`.
3. Controlled/prescription-only items are validated against rules.
4. Required fields are enforced:
   - `prescription_ref`
   - Customer identifier (name/phone if policy requires)
5. Sale proceeds through normal checkout.
6. Prescription metadata remains linked to the sale for audit.

### Safety Controls

- Cashier role should not finalize prescription sales unless explicitly permitted by policy.
- Attempts to bypass prescription checks are blocked and logged.
- Missing prescription reference must hard-fail both API and DB constraints.

---

## 4) Generating Reports

### Actors

- Admin
- Pharmacist

### Flow

1. User opens reporting module.
2. Selects date range and optional filters (drug, category, cashier).
3. Backend aggregates data from `sales`, `sale_items`, and `batches`.
4. Dashboard displays:
   - Sales totals
   - Gross profit
   - Stock levels and valuation
   - Expiry and low-stock alerts
5. User exports report (CSV/PDF if enabled).

### Outcome

- Management gets actionable visibility for purchasing and pricing decisions.
