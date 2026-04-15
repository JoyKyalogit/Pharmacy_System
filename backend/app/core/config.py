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
    jwt_expire_minutes: int = 15
    bcrypt_rounds: int = 12
    cors_origins: str = "http://localhost:3000"
    auto_seed: bool = False
    seed_admin_name: str = "System Admin"
    seed_admin_email: str = "admin@pharmacy.local"
    seed_admin_password: str = "SecurePass123!"


settings = Settings()
