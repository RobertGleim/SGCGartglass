import os
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv


root_path = Path(__file__).parent.parent
env_path = root_path / '.env'
env_local_path = root_path / '.env.local'
load_dotenv(dotenv_path=env_path)
load_dotenv(dotenv_path=env_local_path, override=True)


def _sqlalchemy_database_uri():
    """Build SQLAlchemy URI from DATABASE_URL or DB_* environment variables."""
    url = os.environ.get('DATABASE_URL')
    if url:
        normalized = url.strip()
        if normalized.startswith('mysql://'):
            normalized = normalized.replace('mysql://', 'mysql+pymysql://', 1)
        if normalized.startswith('postgres://'):
            normalized = normalized.replace('postgres://', 'postgresql+psycopg://', 1)
        elif normalized.startswith('postgresql://') and not normalized.startswith('postgresql+psycopg://'):
            normalized = normalized.replace('postgresql://', 'postgresql+psycopg://', 1)

        # If credentials contain unescaped '@', keep host as the final segment and
        # URL-encode the entire credential portion to avoid parser confusion.
        if normalized.startswith('mysql+pymysql://') and normalized.count('@') > 1:
            scheme_end = normalized.find('://') + 3
            last_at = normalized.rfind('@')
            creds = normalized[scheme_end:last_at]
            if ':' in creds:
                raw_user, raw_password = creds.split(':', 1)
                safe_creds = f"{quote_plus(raw_user)}:{quote_plus(raw_password)}"
            else:
                safe_creds = quote_plus(creds)
            normalized = f"{normalized[:scheme_end]}{safe_creds}{normalized[last_at:]}"

        return normalized
    host = os.environ.get('DB_HOST', 'localhost')
    port = os.environ.get('DB_PORT', '3306')
    user = os.environ.get('DB_USER', '')
    password = os.environ.get('DB_PASSWORD', '')
    database = os.environ.get('DB_NAME', '')
    db_path = os.environ.get('DB_PATH')
    # Use SQLite if DB_PATH is set and user/database are empty
    if db_path and not user and not database:
        # Resolve relative paths against the project root
        db_path_obj = Path(db_path)
        if not db_path_obj.is_absolute():
            db_path_obj = root_path / db_path_obj
        # Ensure the directory exists
        db_path_obj.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{db_path_obj}"
    if not all((user, database)):
        # Default to SQLite in the backend directory for development
        _backend_dir = Path(__file__).parent
        default_db = _backend_dir / 'designer.db'
        return f"sqlite:///{default_db}"

    # Render/Hostinger safety: avoid accidental credentials leaking into host
    # e.g. host like "&9@srv1224.hstgr.io" should become "srv1224.hstgr.io"
    if '@' in host:
        host = host.rsplit('@', 1)[-1]

    safe_user = quote_plus(user)
    safe_password = quote_plus(password)
    safe_database = quote_plus(database)
    return f"mysql+pymysql://{safe_user}:{safe_password}@{host}:{port}/{safe_database}"


class BaseConfig:
    PORT = int(os.environ.get('PORT', '5000'))
    SECRET_KEY = os.environ.get('SECRET_KEY') or os.environ.get('JWT_SECRET', 'dev-secret')
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '*')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024
    DEBUG = False
    TESTING = False

    # SQLAlchemy (Designer: templates, glass_types, user_projects, work_orders)
    SQLALCHEMY_DATABASE_URI = _sqlalchemy_database_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,
        'pool_recycle': 300,
    }

    # Uploads (glass type textures: backend/uploads/)
    UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER') or str(Path(__file__).parent / 'uploads')


class DevelopmentConfig(BaseConfig):
    DEBUG = True
    TESTING = False


class ProductionConfig(BaseConfig):
    DEBUG = False
    TESTING = False


class TestingConfig(BaseConfig):
    DEBUG = True
    TESTING = True


CONFIGS = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
}


def get_config(config_name=None):
    requested = (config_name or os.environ.get('APP_ENV') or os.environ.get('FLASK_ENV') or '').strip().lower()
    if not requested:
        requested = 'development' if os.environ.get('FLASK_DEBUG', 'false').lower() == 'true' else 'production'
    return CONFIGS.get(requested, ProductionConfig), requested
