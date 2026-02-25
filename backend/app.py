"""
SGCG Designer - Flask application factory.
Initializes Flask, CORS, Flask-SQLAlchemy, and registers blueprints.
"""
import os
from flask import Flask, jsonify
from flask_cors import CORS

from .config import get_config
from .models import db


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

    # CORS: allow frontend (Vite/Hostinger) to call API
    allowed_origins = _get_allowed_origins(app.config.get("CORS_ORIGINS", "*"))
    CORS(
        app,
        origins=allowed_origins,
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        supports_credentials=True,
    )

    # SQLAlchemy
    db.init_app(app)

    # Health check: GET /api/health
    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok"})

    # Designer template API
    try:
        from .routes import templates_bp, admin_templates_bp
        app.register_blueprint(templates_bp, url_prefix="/api")
        app.register_blueprint(admin_templates_bp, url_prefix="/api/admin")
    except ImportError:
        pass

    # Designer glass types API
    try:
        from .routes import glass_types_bp, admin_glass_types_bp
        app.register_blueprint(glass_types_bp, url_prefix="/api")
        app.register_blueprint(admin_glass_types_bp, url_prefix="/api/admin")
    except ImportError:
        pass

    # Serve uploaded textures at /uploads/textures/<filename>
    @app.route("/uploads/textures/<path:filename>")
    def send_texture(filename):
        from pathlib import Path
        from flask import send_from_directory
        upload_folder = app.config.get("UPLOAD_FOLDER") or str(Path(app.root_path) / "uploads")
        textures_dir = Path(upload_folder) / "textures"
        return send_from_directory(str(textures_dir), filename)

    # Serve uploaded template images at /uploads/templates/<filename>
    @app.route("/uploads/templates/<path:filename>")
    def send_template_image(filename):
        from pathlib import Path
        from flask import send_from_directory
        templates_dir = Path(app.root_path) / "uploads" / "templates"
        return send_from_directory(str(templates_dir), filename)

    # Test route to verify backend is running updated code
    @app.route("/api/test-backend")
    def test_backend():
        return jsonify({"status": "Backend updated", "timestamp": "2026-02-25-v2"})

    # Serve any other uploaded file at /uploads/<filename>
    @app.route("/uploads/<path:filename>")
    def send_upload(filename):
        from pathlib import Path
        from flask import send_from_directory
        import os
        upload_folder = app.config.get("UPLOAD_FOLDER") or str(Path(app.root_path) / "uploads")
        full_path = os.path.join(upload_folder, filename)
        print(f"[DEBUG] Uploads route - filename: {filename}")
        print(f"[DEBUG] upload_folder: {upload_folder}")
        print(f"[DEBUG] full_path: {full_path}")
        print(f"[DEBUG] file exists: {os.path.exists(full_path)}")
        print(f"[DEBUG] app.root_path: {app.root_path}")
        return send_from_directory(str(upload_folder), filename)

    # Projects API (user project save/load)
    try:
        from .routes.projects import projects_bp
        app.register_blueprint(projects_bp)
    except ImportError:
        pass

    # Work Orders API (user + admin)
    try:
        from .routes.work_orders import work_orders_bp, admin_work_orders_bp
        app.register_blueprint(work_orders_bp)
        app.register_blueprint(admin_work_orders_bp)
    except ImportError:
        pass

    # Legacy shop API (optional; comment out for Designer-only backend)
    try:
        from .routes import api
        app.register_blueprint(api, url_prefix="/api")
    except ImportError:
        pass

    # Auto-create tables (safe for dev; use migrations for production)
    with app.app_context():
        try:
            db.create_all()
        except Exception as e:
            app.logger.warning(f"db.create_all() warning: {e}")

        # Add new columns to existing tables if they're missing (SQLite ALTER TABLE)
        try:
            from sqlalchemy import inspect, text
            inspector = inspect(db.engine)
            if "templates" in inspector.get_table_names():
                existing = {c["name"] for c in inspector.get_columns("templates")}
                additions = {
                    "difficulty":    "VARCHAR(50)",
                    "dimensions":    "VARCHAR(100)",
                    "piece_count":   "INTEGER",
                    "image_url":     "VARCHAR(500)",
                    "template_type": "VARCHAR(20) DEFAULT 'svg'",
                }
                for col, col_type in additions.items():
                    if col not in existing:
                        db.session.execute(
                            text(f"ALTER TABLE templates ADD COLUMN {col} {col_type}")
                        )
                        db.session.commit()
                        app.logger.info(f"Added column: templates.{col}")
        except Exception as e:
            app.logger.warning(f"Migration warning: {e}")

    return app


app = create_app()


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(app.config.get("PORT", os.environ.get("PORT", "5000"))),
        debug=bool(app.config.get("DEBUG", False)),
    )
