import os
from pathlib import Path
from flask import Flask
from dotenv import load_dotenv

from .routes import api
from .db import init_db

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)


def create_app():
    app = Flask(__name__)
    
    # Allow larger file uploads (16MB limit for base64 encoded images)
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
    
    app.register_blueprint(api, url_prefix="/api")

    @app.after_request
    def add_cors_headers(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        return response

    init_db()
    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
