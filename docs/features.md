# Feature Breakdown

## 1) Stock Management

### Drug Catalog

- Create and maintain medicine records with SKU, category, and unit
- Mark items as prescription-required where applicable
- Set reorder levels for low-stock detection

### Batch Tracking

- Receive stock by batch number and supplier
- Store unit cost, selling price, and expiry date per batch
- Support traceability for recalls and compliance checks

### Inventory Control

- Real-time available quantity per drug
- Automatic deduction when sale is completed
- Low stock alerts based on configurable reorder threshold
- Expiry alerts for near-expiry batches

---

## 2) POS System

### Fast Checkout

- Search drugs by name/SKU
- Add multiple items to a cart
- Compute totals, discounts, and final amount

### Sale Types

- **OTC sales:** standard walk-in purchases
- **Prescription sales:** requires prescription metadata and validation

### Payment Methods

- Cash
- M-Pesa
- Card

### Receipt Handling

- Generate unique receipt numbers
- Return printable sale details after checkout
- Persist full sale and item-level line details

---

## 3) Reporting and Analytics

### Sales Reporting

- Daily and monthly sales trends
- Sales count and gross revenue
- Cashier performance summaries

### Profit Reporting

- Gross profit calculations based on batch cost vs sale price
- Product and category profitability insights

### Inventory Reporting

- Current stock on hand
- Low-stock list for replenishment planning
- Expiry reports by date window

---

## 4) Alerts and Monitoring

### Low Stock Alerts

- Trigger when quantity falls below reorder level
- Visible in dashboard and inventory module

### Expiry Alerts

- Highlight batches nearing expiry within configurable days
- Helps reduce waste and enforce FEFO dispensing

### Operational Traceability

- Audit logs for major actions and exceptions
- Supports supervision, compliance, and incident review

---

## 5) Access Control and Governance

- JWT-based authenticated sessions
- Role-based authorization by endpoint
- Least-privilege defaults for non-admin roles
- Action history maintained via audit logs

---

## 6) Extensibility Roadmap (Optional)

- Supplier purchase order workflow
- Multi-branch inventory support
- Barcode scanner and label printing integration
- Electronic prescription integrations
- Notification channels (SMS/email/WhatsApp) for alerts
