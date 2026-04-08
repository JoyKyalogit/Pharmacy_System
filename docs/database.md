# Database Documentation

## Database Engine

- **Engine:** PostgreSQL
- **Encoding:** UTF-8
- **Timezone:** UTC
- **Primary design:** Normalized transactional schema with auditability

## Tables

## `roles`

```sql
CREATE TABLE roles (
  id            BIGSERIAL PRIMARY KEY,
  name          VARCHAR(50) UNIQUE NOT NULL, -- Admin, Pharmacist, Cashier
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## `users`

```sql
CREATE TABLE users (
  id              BIGSERIAL PRIMARY KEY,
  role_id         BIGINT NOT NULL REFERENCES roles(id),
  full_name       VARCHAR(150) NOT NULL,
  email           VARCHAR(150) UNIQUE NOT NULL,
  phone           VARCHAR(30),
  password_hash   TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## `suppliers`

```sql
CREATE TABLE suppliers (
  id              BIGSERIAL PRIMARY KEY,
  name            VARCHAR(150) NOT NULL,
  contact_person  VARCHAR(120),
  phone           VARCHAR(30),
  email           VARCHAR(150),
  address         TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## `drugs`

```sql
CREATE TABLE drugs (
  id                        BIGSERIAL PRIMARY KEY,
  name                      VARCHAR(150) NOT NULL,
  sku                       VARCHAR(80) UNIQUE NOT NULL,
  category                  VARCHAR(80),
  unit                      VARCHAR(30) NOT NULL, -- tablet, capsule, bottle
  reorder_level             INTEGER NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  is_prescription_required  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## `batches`

```sql
CREATE TABLE batches (
  id                 BIGSERIAL PRIMARY KEY,
  drug_id            BIGINT NOT NULL REFERENCES drugs(id),
  supplier_id        BIGINT REFERENCES suppliers(id),
  batch_no           VARCHAR(100) NOT NULL,
  expiry_date        DATE NOT NULL,
  quantity_received  INTEGER NOT NULL CHECK (quantity_received > 0),
  quantity_available INTEGER NOT NULL CHECK (quantity_available >= 0),
  unit_cost          NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
  selling_price      NUMERIC(12,2) NOT NULL CHECK (selling_price >= 0),
  received_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (drug_id, batch_no)
);
```

## `sales`

```sql
CREATE TABLE sales (
  id                 BIGSERIAL PRIMARY KEY,
  receipt_no         VARCHAR(80) UNIQUE NOT NULL,
  cashier_id         BIGINT NOT NULL REFERENCES users(id),
  sale_type          VARCHAR(20) NOT NULL CHECK (sale_type IN ('OTC', 'PRESCRIPTION')),
  prescription_ref   VARCHAR(120),
  customer_name      VARCHAR(150),
  payment_method     VARCHAR(20) NOT NULL CHECK (payment_method IN ('CASH', 'M_PESA', 'CARD')),
  status             VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'COMPLETED', 'VOIDED', 'REFUNDED')),
  void_reason        TEXT,
  voided_by          BIGINT REFERENCES users(id),
  voided_at          TIMESTAMPTZ,
  subtotal           NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  discount_total     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  tax_total          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  grand_total        NUMERIC(12,2) NOT NULL CHECK (grand_total >= 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (sale_type <> 'PRESCRIPTION' OR prescription_ref IS NOT NULL)
);
```

## `sale_items`

```sql
CREATE TABLE sale_items (
  id               BIGSERIAL PRIMARY KEY,
  sale_id          BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  drug_id          BIGINT NOT NULL REFERENCES drugs(id),
  batch_id         BIGINT REFERENCES batches(id),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  unit_price       NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  discount_amount  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  line_total       NUMERIC(12,2) NOT NULL CHECK (line_total >= 0)
);
```

## `audit_logs`

```sql
CREATE TABLE audit_logs (
  id               BIGSERIAL PRIMARY KEY,
  user_id          BIGINT REFERENCES users(id),
  action           VARCHAR(120) NOT NULL,      -- e.g. CREATE_BATCH, LOGIN, VOID_SALE
  entity_type      VARCHAR(80) NOT NULL,       -- e.g. drug, batch, sale
  entity_id        VARCHAR(80),
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address       VARCHAR(64),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## `stock_movements`

```sql
CREATE TABLE stock_movements (
  id                 BIGSERIAL PRIMARY KEY,
  drug_id            BIGINT NOT NULL REFERENCES drugs(id),
  batch_id           BIGINT REFERENCES batches(id),
  sale_id            BIGINT REFERENCES sales(id),
  movement_type      VARCHAR(30) NOT NULL CHECK (
    movement_type IN ('RECEIPT', 'SALE', 'RETURN', 'ADJUSTMENT', 'EXPIRE', 'VOID_REVERSAL')
  ),
  quantity_delta     INTEGER NOT NULL, -- positive for stock-in, negative for stock-out
  reason             VARCHAR(200),
  created_by         BIGINT REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Relationships

- `users.role_id -> roles.id` (many users to one role)
- `batches.drug_id -> drugs.id` (many batches to one drug)
- `batches.supplier_id -> suppliers.id` (many batches to one supplier)
- `sales.cashier_id -> users.id` (many sales to one user)
- `sale_items.sale_id -> sales.id` (many items to one sale)
- `sale_items.drug_id -> drugs.id` (many sale items to one drug)
- `sale_items.batch_id -> batches.id` (optional batch traceability per item)
- `audit_logs.user_id -> users.id` (many logs to one user)
- `stock_movements.drug_id -> drugs.id` (many movements to one drug)
- `stock_movements.batch_id -> batches.id` (many movements to one batch)
- `stock_movements.sale_id -> sales.id` (many movements to one sale)

## Key Constraints and Rules

- Sale items are deleted automatically if a sale is deleted (`ON DELETE CASCADE`)
- Quantities and financial fields are non-negative
- `sale_type='PRESCRIPTION'` must include `prescription_ref` (DB check + application validation)
- `quantity_available` in `batches` is decremented during checkout in a DB transaction with row-level locking (`SELECT ... FOR UPDATE`)
- Expired batches must never be used during checkout (`expiry_date >= CURRENT_DATE` at deduction time)
- Every stock mutation must produce a `stock_movements` row for traceability
- Unique constraints:
  - `roles.name`
  - `users.email`
  - `drugs.sku`
  - `(batches.drug_id, batches.batch_no)`
  - `sales.receipt_no`

## Recommended Indexes

```sql
CREATE INDEX idx_batches_drug_expiry ON batches(drug_id, expiry_date);
CREATE INDEX idx_batches_expiry_available ON batches(expiry_date, quantity_available);
CREATE INDEX idx_sales_created_at ON sales(created_at);
CREATE INDEX idx_sales_cashier_created_at ON sales(cashier_id, created_at);
CREATE INDEX idx_sale_items_drug_id ON sale_items(drug_id);
CREATE INDEX idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_stock_movements_created_at ON stock_movements(created_at);
CREATE INDEX idx_stock_movements_drug_batch ON stock_movements(drug_id, batch_id);
```

## ER Diagram (Text)

```text
roles (1) --------< users (M)
                      |
                      | cashier_id
                      v
                 sales (1) --------< sale_items (M) >-------- (1) drugs
                    ^                                           ^
                    |                                           |
                    | user_id                                   | drug_id
               audit_logs (M)                            batches (M)
                                                               ^
                                                               |
                                                        stock_movements (M)
                                                             |
                                                             | supplier_id
                                                             v
                                                         suppliers (1)
```
