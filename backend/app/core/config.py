from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Pharmacy System API"
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/pharmacy_db"
    jwt_secret_key: str = "replace_with_strong_secret"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480
    bcrypt_rounds: int = 12
    cors_origins: str = "http://localhost:3000"
    auto_seed: bool = False
    seed_admin_name: str = "System Admin"
    seed_admin_email: str = "admin@pharmacy.local"
    seed_admin_password: str = "SecurePass123!"
    seed_staff_name: str = "Pharmacy Staff"
    seed_staff_email: str = "staff@pharmacy.local"
    seed_staff_password: str = "StaffPass123!"
    kiosk_pin: str = ""
    auth_rate_limit_max_attempts: int = 5
    auth_rate_limit_window_seconds: int = 300
    auth_rate_limit_lockout_seconds: int = 900
    expiry_warning_days: int = 90


settings = Settings()
