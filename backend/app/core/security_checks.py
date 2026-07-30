import logging
import re

from app.core.config import Settings

logger = logging.getLogger("pharmacy.security")

WEAK_JWT_SECRETS = {
    "replace_with_strong_secret",
    "changeme",
    "secret",
    "jwt_secret",
    "your_secret_key",
}

WEAK_PASSWORDS = {
    "securepass123!",
    "staffpass123!",
    "admin123",
    "password",
    "password123",
}

COMMON_WEAK_PINS = {
    "1234",
    "0000",
    "1111",
    "123456",
    "12345678",
    "password",
    "changemedeskpin!",
}


def _is_weak_pin(pin: str) -> bool:
    normalized = pin.strip().lower()
    if normalized in COMMON_WEAK_PINS:
        return True
    if normalized.isdigit() and len(normalized) <= 6:
        return True
    return False


def validate_security_settings(settings: Settings) -> list[str]:
    issues: list[str] = []

    jwt = settings.jwt_secret_key.strip()
    if len(jwt) < 32 or jwt.lower() in WEAK_JWT_SECRETS:
        issues.append("JWT_SECRET_KEY must be at least 32 characters and not a default/example value.")

    kiosk_pin = settings.kiosk_pin.strip()
    if not kiosk_pin:
        issues.append("KIOSK_PIN is not set. Staff cannot sign in at the desk.")
    elif len(kiosk_pin) < 8:
        issues.append("KIOSK_PIN must be at least 8 characters.")
    elif _is_weak_pin(kiosk_pin):
        issues.append("KIOSK_PIN is too easy to guess. Use a longer mixed PIN.")

    admin_password = settings.seed_admin_password.strip()
    if len(admin_password) < 10 or admin_password.lower() in WEAK_PASSWORDS:
        issues.append("SEED_ADMIN_PASSWORD should be at least 10 characters and not a default/example value.")

    staff_password = settings.seed_staff_password.strip()
    if len(staff_password) < 12 or staff_password.lower() in WEAK_PASSWORDS:
        issues.append("SEED_STAFF_PASSWORD should be at least 12 characters and not a default/example value.")

    if re.search(r"postgres:postgres@", settings.database_url, re.IGNORECASE):
        issues.append("DATABASE_URL uses the default postgres/postgres credentials.")

    return issues


def enforce_security_settings(settings: Settings) -> None:
    issues = validate_security_settings(settings)
    if not issues:
        return

    message = "Security configuration problems:\n- " + "\n- ".join(issues)
    if settings.app_env.lower() == "production":
        raise RuntimeError(message)

    logger.warning("%s", message)
