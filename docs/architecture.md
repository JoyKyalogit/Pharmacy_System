# System Architecture

## High-Level Design

The system follows a standard three-tier architecture:

1. **Frontend (React)** for UI, user workflows, and role-aware navigation
2. **Backend API (FastAPI)** for business logic, validation, and authorization
3. **Database (PostgreSQL)** for persistent transactional and reference data

This separation keeps the UI responsive, centralizes core logic on the server, and preserves data integrity through relational constraints.

## Components

### Frontend (React)

- Provides login, stock, POS, reporting, and admin screens
- Stores short-lived access token in memory (or secure client store)
- Sends authenticated requests to FastAPI using bearer JWT
- Handles form validation and user-friendly error states

### Backend (FastAPI)

- Exposes REST endpoints for auth, inventory, sales, and reports
- Enforces RBAC checks per endpoint
- Validates request payloads using Pydantic schemas
- Executes domain logic (stock moves, sale finalization, alerts)
- Writes audit events for important actions
- Uses transaction-safe checkout with FEFO batch allocation and row-level locking

### Database (PostgreSQL)

- Stores users, roles, drugs, batches, sales, and reporting data
- Enforces referential integrity with foreign keys
- Supports transactional updates for checkout and stock operations
- Provides indexed query performance for reports and dashboards
- Stores immutable stock movement history for full inventory traceability

## Data Flow

1. User authenticates via frontend login.
2. FastAPI verifies credentials and returns JWT.
3. Frontend sends JWT with each protected request.
4. Backend validates token, role, and payload.
5. Backend updates/reads PostgreSQL inside transactions.
6. Backend returns JSON responses to frontend for rendering.

## Architecture Diagram (Text)

```text
+---------------------+        HTTPS/JSON        +---------------------+
|   React Frontend    |  <-------------------->  |    FastAPI Backend  |
|  (Browser Client)   |                          |  Auth + Business    |
+----------+----------+                          +----------+----------+
           |                                                |
           | JWT Bearer Token                              | SQLAlchemy / SQL
           |                                                |
           v                                                v
      UI State + Forms                             +---------------------+
                                                   |   PostgreSQL DB     |
                                                   |  Relational Storage |
                                                   +---------------------+
```

## Design Principles

- **Security first:** Authenticate all non-public routes, enforce least privilege
- **Consistency:** Use transactions for operations that affect stock and sales together
- **Traceability:** Log key mutations in `audit_logs`
- **Extensibility:** Keep API and schema modular for future integrations
- **Safety:** Block expired stock sale paths and enforce prescription requirements end-to-end
