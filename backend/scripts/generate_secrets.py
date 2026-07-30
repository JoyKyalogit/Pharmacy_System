"""Print strong values to copy into backend/.env (do not commit the output)."""

import secrets
import string


def random_password(length: int = 20) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def random_pin(length: int = 10) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def main() -> None:
    print("Copy these into backend/.env, then run: python scripts/seed.py")
    print()
    print(f"JWT_SECRET_KEY={secrets.token_urlsafe(48)}")
    print(f"KIOSK_PIN={random_pin(10)}")
    print(f"SEED_ADMIN_PASSWORD={random_password(20)}")
    print(f"SEED_STAFF_PASSWORD={random_password(24)}")
    print()
    print("Keep these private. Restart uvicorn after updating .env.")


if __name__ == "__main__":
    main()
