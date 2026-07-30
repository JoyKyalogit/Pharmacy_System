import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import Base, engine
from app.core.security_checks import enforce_security_settings
from app.routers import router
from scripts.seed import run as run_seed

logging.basicConfig(level=logging.INFO)
enforce_security_settings(settings)

_docs_enabled = settings.app_env.lower() != "production"
app = FastAPI(
    title=settings.app_name,
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

# Lightweight "dev migration" to add new columns when using create_all().
# (create_all doesn't alter existing tables.)
with engine.begin() as conn:
    conn.execute(text("ALTER TABLE IF EXISTS drugs ADD COLUMN IF NOT EXISTS purchase_unit VARCHAR(30) NOT NULL DEFAULT 'pack'"))
    conn.execute(text("ALTER TABLE IF EXISTS drugs ADD COLUMN IF NOT EXISTS units_per_purchase INTEGER NOT NULL DEFAULT 1"))
    conn.execute(text("ALTER TABLE IF EXISTS sales ADD COLUMN IF NOT EXISTS kra_pin VARCHAR(20)"))
    conn.execute(text("ALTER TABLE IF EXISTS sales ADD COLUMN IF NOT EXISTS etr_serial VARCHAR(80)"))
    conn.execute(text("ALTER TABLE IF EXISTS sales ADD COLUMN IF NOT EXISTS etr_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'"))

if settings.auto_seed:
    # Free-tier friendly: seed roles/admin at startup when enabled.
    run_seed()

app.include_router(router)
