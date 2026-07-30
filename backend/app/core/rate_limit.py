from collections import defaultdict
from datetime import datetime, timedelta, timezone
from threading import Lock

from fastapi import HTTPException, Request, status

from app.core.config import settings


class AuthRateLimiter:
    def __init__(self, max_attempts: int, window_seconds: int, lockout_seconds: int) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.lockout_seconds = lockout_seconds
        self._failures: dict[str, list[datetime]] = defaultdict(list)
        self._lockouts: dict[str, datetime] = {}
        self._lock = Lock()

    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    def check_allowed(self, key: str) -> None:
        now = self._now()
        with self._lock:
            locked_until = self._lockouts.get(key)
            if locked_until and now < locked_until:
                retry_minutes = max(1, int((locked_until - now).total_seconds() // 60) + 1)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many failed attempts. Try again in about {retry_minutes} minute(s).",
                )
            if locked_until and now >= locked_until:
                self._lockouts.pop(key, None)
                self._failures.pop(key, None)

    def record_failure(self, key: str) -> None:
        now = self._now()
        window_start = now - timedelta(seconds=self.window_seconds)
        with self._lock:
            attempts = [ts for ts in self._failures[key] if ts >= window_start]
            attempts.append(now)
            self._failures[key] = attempts
            if len(attempts) >= self.max_attempts:
                self._lockouts[key] = now + timedelta(seconds=self.lockout_seconds)
                self._failures.pop(key, None)

    def record_success(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)
            self._lockouts.pop(key, None)


auth_rate_limiter = AuthRateLimiter(
    max_attempts=settings.auth_rate_limit_max_attempts,
    window_seconds=settings.auth_rate_limit_window_seconds,
    lockout_seconds=settings.auth_rate_limit_lockout_seconds,
)


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def auth_rate_limit_key(request: Request, scope: str) -> str:
    return f"{scope}:{get_client_ip(request)}"
