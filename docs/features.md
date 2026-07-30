# Feature Breakdown

## 1) Stock management

### Stock view

- List medicines with available quantity, batch number, expiry, and status (low / near expiry / expired)
- KPI cards: medicine count, total units, alerts
- Search and refresh

### Add medicine (batch intake)

- Medicine name and batch number
- Number of packets; optional tablets per packet (bottles if left empty)
- Price per tablet and/or price per packet/bottle
- Expiry date
- Creates drug (if needed) and initial batch; stock derived from packet counts

---

## 2) Sales (POS)

### Checkout flow

- Search by medicine name or batch number
- Dropdown shows batches sorted by **nearest expiry first** (FEFO)
- Select batch, quantity (base unit or pack where applicable), add to cart
- Finalize sale — stock deducted from selected batch
- Sales are stored as OTC / CASH by default in the UI (backend supports other types for future use)

### Cart

- Line items with batch, expiry, quantity, price, line total
- Clear cart and finalize sale

---

## 3) Reporting (admin only)

- **Today**, **by month**, or **custom date range**
- Daily totals breakdown for ranges
- Medicines sold with quantities and amounts
- Requires admin email/password (not the desk PIN)

---

## 4) Access control

### Desk PIN

- Single shared PIN configured in `backend/.env` (`KIOSK_PIN`)
- Unlocks Stock, Add medicine, and Sales
- **Lock desk** ends the session

### Admin

- Separate credentials for reports only
- Seeded via `SEED_ADMIN_*` environment variables

---

## 5) Alerts

- Low stock (at or below reorder level)
- Near expiry and expired batches on the stock screen

---

## 6) Optional / roadmap

- Per-staff logins and cashier role in the UI
- Payment method and prescription fields in the sales screen
- Supplier purchase orders and multi-branch support
- Barcode scanning and receipt printing
