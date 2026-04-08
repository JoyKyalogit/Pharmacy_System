# API Documentation

Base URL: `/api/v1`  
Auth: `Authorization: Bearer <JWT>`

## Conventions

- Content type: `application/json`
- All timestamps are ISO 8601 UTC (`2026-03-24T11:43:00Z`)
- Monetary fields use decimal values (2 dp)
- Clients should send `Idempotency-Key` on checkout/payment requests to avoid duplicate sales on retries.
- Standard error shape:

```json
{
  "detail": "Validation error",
  "errors": [
    { "field": "quantity", "message": "Must be greater than 0" }
  ]
}
```

---

## Authentication

### Login

- **Route:** `/auth/login`
- **Method:** `POST`
- **Request Body:**

```json
{
  "email": "admin@pharmacy.local",
  "password": "SecurePass123!"
}
```

- **Response (200):**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": 1,
    "name": "System Admin",
    "email": "admin@pharmacy.local",
    "role": "Admin"
  }
}
```

### Refresh Token (Optional)

- **Route:** `/auth/refresh`
- **Method:** `POST`
- **Request Body:** `{ "refresh_token": "<token>" }`
- **Response (200):** New access token payload
- **Notes:** Refresh token should rotate on every successful refresh.

---

## Drugs and Stock

### Create Drug

- **Route:** `/drugs`
- **Method:** `POST`
- **Roles:** Admin, Pharmacist
- **Request Body:**

```json
{
  "name": "Amoxicillin 500mg",
  "sku": "AMOX-500",
  "category": "Antibiotics",
  "unit": "capsule",
  "reorder_level": 50,
  "is_prescription_required": true
}
```

- **Response (201):**

```json
{
  "id": 101,
  "name": "Amoxicillin 500mg",
  "sku": "AMOX-500",
  "reorder_level": 50,
  "is_active": true
}
```

### Receive Stock Batch

- **Route:** `/stock/batches`
- **Method:** `POST`
- **Roles:** Admin, Pharmacist
- **Request Body:**

```json
{
  "drug_id": 101,
  "supplier_id": 7,
  "batch_no": "BATCH-2026-03-01",
  "expiry_date": "2027-09-30",
  "quantity_received": 500,
  "unit_cost": 18.5,
  "selling_price": 30.0
}
```

- **Response (201):**

```json
{
  "id": 2001,
  "drug_id": 101,
  "batch_no": "BATCH-2026-03-01",
  "available_quantity": 500,
  "status": "ACTIVE"
}
```

### Get Stock Levels

- **Route:** `/stock/levels`
- **Method:** `GET`
- **Roles:** Admin, Pharmacist, Cashier
- **Response (200):**

```json
[
  {
    "drug_id": 101,
    "drug_name": "Amoxicillin 500mg",
    "total_quantity": 420,
    "reorder_level": 50,
    "is_low_stock": false,
    "nearest_expiry": "2027-09-30"
  }
]
```

---

## Sales / POS

### Create Sale

- **Route:** `/sales`
- **Method:** `POST`
- **Roles:** Admin, Pharmacist, Cashier
- **Headers:** `Idempotency-Key: <uuid>`
- **Request Body:**

```json
{
  "sale_type": "PRESCRIPTION",
  "customer_name": "Jane Doe",
  "prescription_ref": "RX-2026-00018",
  "payment_method": "M_PESA",
  "items": [
    {
      "drug_id": 101,
      "quantity": 10,
      "unit_price": 30.0,
      "discount": 0
    }
  ]
}
```

- **Response (201):**

```json
{
  "sale_id": 8009,
  "receipt_no": "RCPT-20260324-8009",
  "subtotal": 300.0,
  "discount_total": 0.0,
  "tax_total": 0.0,
  "grand_total": 300.0,
  "payment_method": "M_PESA",
  "created_at": "2026-03-24T11:45:10Z"
}
```

- **Validation and Safety Rules:**
  - Reject sale if any requested quantity cannot be fulfilled from non-expired stock.
  - Reject prescription sale when `prescription_ref` is missing.
  - Apply FEFO allocation at checkout time.

- **Error Codes (Recommended):**
  - `INSUFFICIENT_STOCK`
  - `EXPIRED_BATCH`
  - `PRESCRIPTION_REQUIRED`
  - `SALE_ALREADY_PROCESSED`

### Get Sale by ID

- **Route:** `/sales/{sale_id}`
- **Method:** `GET`
- **Roles:** Admin, Pharmacist, Cashier
- **Response (200):**

```json
{
  "id": 8009,
  "sale_type": "PRESCRIPTION",
  "cashier_id": 12,
  "items": [
    {
      "drug_id": 101,
      "drug_name": "Amoxicillin 500mg",
      "quantity": 10,
      "unit_price": 30.0,
      "line_total": 300.0
    }
  ],
  "totals": {
    "grand_total": 300.0
  }
}
```

### Void Sale

- **Route:** `/sales/{sale_id}/void`
- **Method:** `POST`
- **Roles:** Admin, Pharmacist (policy-limited)
- **Request Body:**

```json
{
  "reason": "Wrong item dispensed",
  "supervisor_ref": "SUP-2026-0042"
}
```

- **Response (200):** Sale marked `VOIDED` and stock reversal posted to `stock_movements`.

---

## Reports

### Sales Summary

- **Route:** `/reports/sales-summary`
- **Method:** `GET`
- **Roles:** Admin, Pharmacist
- **Query Params:** `start_date`, `end_date`, `group_by=day|month`
- **Response (200):**

```json
{
  "range": {
    "start_date": "2026-03-01",
    "end_date": "2026-03-24"
  },
  "totals": {
    "sales_count": 312,
    "gross_revenue": 452100.0,
    "gross_profit": 138750.0
  },
  "series": [
    { "period": "2026-03-23", "revenue": 18300.0, "profit": 5400.0 }
  ]
}
```

### Expiry Report

- **Route:** `/reports/expiry`
- **Method:** `GET`
- **Roles:** Admin, Pharmacist
- **Query Params:** `within_days=30`
- **Response (200):**

```json
[
  {
    "drug_id": 111,
    "drug_name": "Cough Syrup 100ml",
    "batch_no": "CS-2025-12-02",
    "expiry_date": "2026-04-10",
    "available_quantity": 22
  }
]
```

### Low Stock Report

- **Route:** `/reports/low-stock`
- **Method:** `GET`
- **Roles:** Admin, Pharmacist
- **Response (200):**

```json
[
  {
    "drug_id": 113,
    "drug_name": "Paracetamol 500mg",
    "current_quantity": 15,
    "reorder_level": 100
  }
]
```
