# Operational Workflows

## 1) Opening the app (desk PIN)

### Actors

- Any staff member at the counter

### Flow

1. Open the pharmacy app URL in the browser (bookmark on staff devices).
2. Enter the **desk PIN** (`KIOSK_PIN` on the server).
3. Backend validates PIN and issues a staff (Pharmacist) JWT.
4. App opens on **Stock**; session is kept until **Lock desk** or the browser tab session ends.

### Outcome

- Staff can use Stock, Add medicine, and Sales without individual accounts.

---

## 2) Adding stock (Add medicine)

### Actors

- Staff with desk PIN session

### Flow

1. Go to **Add medicine**.
2. Enter medicine name, batch number, packet count, optional tablets per packet, prices, and expiry.
3. Submit — backend creates or updates the drug and adds a batch with available quantity.
4. Confirm the medicine appears on **Stock**.

### Outcome

- New stock is available for sale on the linked batch.

---

## 3) Selling drugs (Sales)

### Actors

- Staff with desk PIN session

### Flow

1. Go to **Sales**.
2. Search medicine or batch; pick a row from the list (nearest expiry listed first).
3. Enter quantity; add lines to the cart.
4. **Finalize sale** — backend creates the sale, deducts the selected batch, and records stock movement.
5. Stock view reflects reduced quantity.

### Outcome

- Sale completed; inventory updated for the chosen batch.

---

## 4) Viewing reports (admin)

### Actors

- Owner / manager (admin account)

### Flow

1. Click **Reports (Admin)**.
2. Enter admin email and password (`SEED_ADMIN_*`).
3. Choose today, month, or custom range; load report.
4. Review daily totals and medicines sold.
5. Use **Back to pharmacy desk** to return to the normal staff session.

### Outcome

- Financial summary for the selected period; staff desk PIN is unchanged.

---

## 5) Leaving the counter (lock desk)

### Flow

1. Click **Lock desk** in the sidebar.
2. Session cleared; PIN screen shown.

### Outcome

- Next user must enter the desk PIN to continue.

---

## 6) Changing credentials

| Change | Action |
|--------|--------|
| Desk PIN | Edit `KIOSK_PIN` in `backend/.env`, restart backend |
| Admin password | Edit `SEED_ADMIN_PASSWORD`, run `scripts/seed.py`, restart backend |
| Staff (internal) | Edit `SEED_STAFF_*`, run `scripts/seed.py` |
