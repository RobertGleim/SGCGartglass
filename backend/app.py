import os
from pathlib import Path
from flask import Flask, request
from dotenv import load_dotenv

from .routes import api
from .db import init_db

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)


def _get_allowed_origins():
    configured = os.environ.get("CORS_ORIGINS", "*").strip()
    if configured == "*":
        return ["*"]
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


def create_app():
    app = Flask(__name__)
    allowed_origins = _get_allowed_origins()
    
    # Allow larger file uploads (16MB limit for base64 encoded images)
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
    
    app.register_blueprint(api, url_prefix="/api")

    @app.before_request
    def handle_preflight():
        if request.method == "OPTIONS":
            response = app.make_default_options_response()
            request_origin = request.headers.get("Origin")
            
            if "*" in allowed_origins:
                response.headers["Access-Control-Allow-Origin"] = "*"
            elif request_origin in allowed_origins:
                response.headers["Access-Control-Allow-Origin"] = request_origin
            
            response.headers["Vary"] = "Origin"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
            return response

    @app.after_request
    def add_cors_headers(response):
        request_origin = request.headers.get("Origin")

        if "*" in allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = "*"
        elif request_origin in allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = request_origin

        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        return response

    init_db()
    return app


app = create_app()


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "5000")),
        debug=os.environ.get("FLASK_DEBUG", "false").lower() == "true",
    )
