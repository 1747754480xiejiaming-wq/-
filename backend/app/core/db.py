from app.core.config import Settings, get_settings


def database_url(settings: Settings | None = None) -> str:
    """Return the configured database URL without creating or mutating a database."""
    return (settings or get_settings()).database_url
