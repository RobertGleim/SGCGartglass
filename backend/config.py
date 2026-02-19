import os
from pathlib import Path

from dotenv import load_dotenv


root_path = Path(__file__).parent.parent
env_path = root_path / '.env'
env_local_path = root_path / '.env.local'
load_dotenv(dotenv_path=env_path)
load_dotenv(dotenv_path=env_local_path, override=True)


class BaseConfig:
    PORT = int(os.environ.get('PORT', '5000'))
    SECRET_KEY = os.environ.get('SECRET_KEY') or os.environ.get('JWT_SECRET', 'dev-secret')
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '*')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024
    DEBUG = False
    TESTING = False


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
