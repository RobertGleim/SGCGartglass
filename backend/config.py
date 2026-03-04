import os
from pathlib import Path

from dotenv import load_dotenv


root_path = Path(__file__).parent.parent
env_path = root_path / '.env'
env_local_path = root_path / '.env.local'
backend_path = Path(__file__).parent
backend_env_path = backend_path / '.env'
backend_env_local_path = backend_path / '.env.local'
load_dotenv(dotenv_path=env_path)
load_dotenv(dotenv_path=env_local_path, override=True)
load_dotenv(dotenv_path=backend_env_path, override=True)
load_dotenv(dotenv_path=backend_env_local_path, override=True)


def _sqlalchemy_database_uri():
    """Build SQLAlchemy URI from DATABASE_URL/POSTGRES_URL (PostgreSQL only)."""
    url = os.environ.get('DATABASE_URL') or os.environ.get('POSTGRES_URL')
    if not url:
        raise RuntimeError('Set DATABASE_URL or POSTGRES_URL to a PostgreSQL connection string.')

    normalized = url.strip()
    if normalized.startswith('postgres://'):
        normalized = normalized.replace('postgres://', 'postgresql+psycopg://', 1)
    elif normalized.startswith('postgresql://') and not normalized.startswith('postgresql+psycopg://'):
        normalized = normalized.replace('postgresql://', 'postgresql+psycopg://', 1)

    if not normalized.startswith('postgresql+psycopg://'):
        raise RuntimeError('DATABASE_URL/POSTGRES_URL must be a PostgreSQL URL (postgres:// or postgresql://).')

    return normalized


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

    # Email (for password reset + notifications)
    MAIL_SERVER = os.environ.get('MAIL_SERVER')
    MAIL_PORT = int(os.environ.get('MAIL_PORT', '587'))
    MAIL_USE_TLS = os.environ.get('MAIL_USE_TLS', 'true').lower() == 'true'
    MAIL_USE_SSL = os.environ.get('MAIL_USE_SSL', 'false').lower() == 'true'
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD')
    MAIL_DEFAULT_SENDER = os.environ.get('MAIL_DEFAULT_SENDER') or os.environ.get('MAIL_USERNAME')


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
