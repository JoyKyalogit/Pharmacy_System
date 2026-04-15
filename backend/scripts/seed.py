import json
import os
import sys
import time

from sqlalchemy import select

# region agent log
backend_root = os.path.dirname(os.path.dirname(__file__))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)
# endregion

from app.core.database import Base, SessionLocal, engine
from app.core.config import settings
from app.core.security import hash_password
from app.models import Role, User


def _agent_log(run_id: str, hypothesis_id: str, location: str, message: str, data: dict):
    with open("debug-f8ee46.log", "a", encoding="utf-8") as f:
        f.write(
            json.dumps(
                {
                    "sessionId": "f8ee46",
                    "runId": run_id,
                    "hypothesisId": hypothesis_id,
                    "location": location,
                    "message": message,
                    "data": data,
                    "timestamp": int(time.time() * 1000),
                }
            )
            + "\n"
        )


# region agent log
_agent_log("pre-fix", "H3", "scripts/seed.py:30", "seed_module_loaded", {"cwd": os.getcwd(), "pythonpath": os.environ.get("PYTHONPATH")})
# endregion


def run():
    # region agent log
    _agent_log("pre-fix", "H4", "scripts/seed.py:36", "seed_run_entered", {"step": "open_db"})
    # endregion
    # Ensure schema exists for first-time local setup.
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        roles = ["Admin", "Pharmacist", "Cashier"]
        existing = {r.name for r in db.scalars(select(Role)).all()}
        for name in roles:
            if name not in existing:
                db.add(Role(name=name, description=f"{name} role"))
        db.commit()

        admin_role = db.scalar(select(Role).where(Role.name == "Admin"))
        admin_email = settings.seed_admin_email.strip().lower()
        admin_password = settings.seed_admin_password
        admin_name = settings.seed_admin_name.strip() or "System Admin"
        admin = db.scalar(select(User).where(User.email == admin_email))
        if not admin:
            db.add(
                User(
                    role_id=admin_role.id,
                    full_name=admin_name,
                    email=admin_email,
                    password_hash=hash_password(admin_password),
                    is_active=True,
                )
            )
            db.commit()
        else:
            admin.full_name = admin_name
            admin.password_hash = hash_password(admin_password)
            admin.role_id = admin_role.id
            admin.is_active = True
            db.commit()
        print("Seed completed.")
    finally:
        db.close()


if __name__ == "__main__":
    # region agent log
    _agent_log("pre-fix", "H5", "scripts/seed.py:66", "seed_main_entry", {"invocation": "__main__"})
    # endregion
    run()
