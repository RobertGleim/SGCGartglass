import os
from flask import Flask, request

from .routes import api
from .db import init_db
from .config import get_config


def _get_allowed_origins(configured_origins):
    configured = (configured_origins or "*").strip()
    if configured == "*":
        return ["*"]
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


def create_app(config_name=None):
    app = Flask(__name__)
    config_class, resolved_config_name = get_config(config_name)
    app.config.from_object(config_class)
    app.config["ACTIVE_CONFIG"] = resolved_config_name
    allowed_origins = _get_allowed_origins(app.config.get("CORS_ORIGINS", "*"))
    
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
        port=int(app.config.get("PORT", os.environ.get("PORT", "5000"))),
        debug=bool(app.config.get("DEBUG", False)),
    )
