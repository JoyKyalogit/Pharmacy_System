# Pharmacy Stock Management and POS System

## Overview

This project is a pharmacy operations platform that combines stock management and point-of-sale (POS) in one system. It supports batch-level inventory control, expiry tracking, OTC and prescription sales, multi-method payments, and role-based workflows for Admin, Pharmacist, and Cashier users.

## Core Capabilities

- Batch-based stock intake with supplier linkage, cost/price control, and expiry dates
- POS checkout flow for OTC and prescription transactions
- Payment support for Cash, M-Pesa, and Card
- Real-time stock deduction and low-stock/expiry alerts
- Sales, profit, and inventory reporting dashboards
- Audit logs for sensitive actions and operational traceability

## Feature Summary

- **Stock Management**
  - Drug catalog management
  - Batch receiving and stock adjustments
  - Reorder and expiry alerts
- **POS**
  - Fast product search and cart-based checkout
  - Prescription validation for controlled items
  - Mixed payment handling
- **Reporting**
  - Daily/monthly sales and gross profit
  - Stock valuation and movement trends
  - Expiry risk monitoring
- **Access Control**
  - Role-based permissions by user profile
  - JWT-protected API and route guards

## Technology Stack

- **Frontend:** React (TypeScript), Axios, React Router
- **Backend:** FastAPI, Pydantic, SQLAlchemy, JWT auth
- **Database:** PostgreSQL
- **Security:** bcrypt password hashing, RBAC, audit logging
- **Deployment:** Uvicorn/Gunicorn, Nginx reverse proxy, Docker (optional)

## Quick Start

1. Clone the repository.
2. Configure environment variables (see `setup.md`).
3. Start PostgreSQL and create the database.
4. Run backend migrations and start the FastAPI server.
5. Start the React frontend and log in with a seeded user.

For complete setup details, see:

- `setup.md`
- `deployment.md`
- `database.md`
