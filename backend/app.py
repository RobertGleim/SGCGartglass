"""
SGCG Designer - Flask application factory.
Initializes Flask, CORS, Flask-SQLAlchemy, and registers blueprints.
"""
import os
import ipaddress
import socket
from urllib import request as urllib_request
from urllib.error import URLError, HTTPError
from urllib.parse import urlparse
from flask import Flask, jsonify, request, Response
from flask_cors import CORS
try:
    from flask_mail import Mail
except Exception:  # pragma: no cover
    Mail = None

from .config import get_config
from .models import db


def _get_allowed_origins(configured_origins):
    configured = (configured_origins or "*").strip()
    if configured == "*":
        return ["*"]
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


def _is_private_or_local_host(hostname):
    if not hostname:
        return True

    normalized = hostname.strip().lower()
    if normalized in {"localhost", "127.0.0.1", "::1"}:
        return True

    try:
        resolved = {addr[4][0] for addr in socket.getaddrinfo(normalized, None)}
    except Exception:
        return True

    for address in resolved:
        try:
            ip = ipaddress.ip_address(address)
        except ValueError:
            continue
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            return True
    return False


def create_app(config_name=None):
    app = Flask(__name__)
    config_class, resolved_config_name = get_config(config_name)
    app.config.from_object(config_class)
    app.config["ACTIVE_CONFIG"] = resolved_config_name

    if Mail is not None:
        try:
            Mail(app)
        except Exception as exc:  # pragma: no cover
            app.logger.warning("Flask-Mail init warning: %s", exc)

    mail_server = (app.config.get("MAIL_SERVER") or "").strip()
    mail_sender = (app.config.get("MAIL_DEFAULT_SENDER") or "").strip()
    mail_username = (app.config.get("MAIL_USERNAME") or "").strip()
    mail_password = app.config.get("MAIL_PASSWORD")
    if not mail_server:
        app.logger.warning("MAIL_SERVER is not configured; password reset emails will not be delivered.")
    if not mail_sender:
        app.logger.warning("MAIL_DEFAULT_SENDER is not configured; password reset emails may fail.")
    if not mail_username:
        app.logger.warning("MAIL_USERNAME is not configured; SMTP authentication may fail.")
    if not mail_password:
        app.logger.warning("MAIL_PASSWORD is not configured; SMTP authentication may fail.")

    # CORS: allow frontend (Vite/Hostinger) to call API
    allowed_origins = _get_allowed_origins(app.config.get("CORS_ORIGINS", "*"))
    supports_credentials = allowed_origins != ["*"]
    CORS(
        app,
        origins=allowed_origins,
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        supports_credentials=supports_credentials,
    )

    # SQLAlchemy
    db.init_app(app)

    # Health check: GET /api/health
    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok"})

    # Proxy external texture URLs through backend so frontend canvas can load same-origin assets.
    @app.route("/api/texture-proxy", methods=["GET"])
    def texture_proxy():
        source_url = (request.args.get("url") or "").strip()
        if not source_url:
            return jsonify({"error": "Missing url"}), 400
        parsed = urlparse(source_url)
        if parsed.scheme not in {"http", "https"}:
            return jsonify({"error": "Invalid url"}), 400
        if not parsed.hostname:
            return jsonify({"error": "Invalid host"}), 400

        allowed_hosts = [
            host.strip().lower()
            for host in str(os.environ.get("TEXTURE_PROXY_ALLOWED_HOSTS") or "").split(",")
            if host.strip()
        ]
        hostname = parsed.hostname.lower()
        if allowed_hosts and hostname not in allowed_hosts:
            return jsonify({"error": "Host not allowed"}), 403
        if _is_private_or_local_host(hostname):
            return jsonify({"error": "Private network host blocked"}), 403

        req = urllib_request.Request(
            source_url,
            headers={"User-Agent": "SGCG-TextureProxy/1.0"},
            method="GET",
        )

        try:
            with urllib_request.urlopen(req, timeout=12) as upstream:
                body = upstream.read()
                content_type = upstream.headers.get("Content-Type", "application/octet-stream")
                response = Response(body, mimetype=content_type)
                response.headers["Cache-Control"] = "public, max-age=86400"
                return response
        except (HTTPError, URLError, TimeoutError) as exc:
            app.logger.warning("Texture proxy failed for %s: %s", source_url, exc)
            return jsonify({"error": "Texture fetch failed"}), 502

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

    # Gallery API
    try:
        from .routes import gallery_bp, admin_gallery_bp
        app.register_blueprint(gallery_bp, url_prefix="/api")
        app.register_blueprint(admin_gallery_bp, url_prefix="/api/admin")
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
    # Falls back to database image_data when file is missing (Render ephemeral FS)
    @app.route("/uploads/templates/<path:filename>")
    def send_template_image(filename):
        from pathlib import Path
        from flask import send_from_directory, make_response
        import os
        templates_dir = Path(app.root_path) / "uploads" / "templates"
        file_path = templates_dir / filename
        if file_path.is_file():
            return send_from_directory(str(templates_dir), filename)
        # File missing (ephemeral FS) — serve from DB
        from .models import Template as TemplateModel
        url_path = f"/uploads/templates/{filename}"
        tmpl = TemplateModel.query.filter(
            (TemplateModel.image_url == url_path) | (TemplateModel.thumbnail_url == url_path)
        ).first()
        if tmpl and tmpl.image_data:
            resp = make_response(tmpl.image_data)
            resp.headers['Content-Type'] = tmpl.image_mime or 'image/png'
            resp.headers['Cache-Control'] = 'public, max-age=86400'
            # Re-cache to disk so subsequent requests are fast
            try:
                os.makedirs(str(templates_dir), exist_ok=True)
                with open(str(file_path), 'wb') as fp:
                    fp.write(tmpl.image_data)
            except Exception:
                pass
            return resp
        return jsonify({'error': 'Image not found'}), 404

    # Serve uploaded gallery images at /uploads/gallery/<filename>
    # Falls back to database image_data when file is missing (ephemeral FS)
    @app.route("/uploads/gallery/<path:filename>")
    def send_gallery_image(filename):
        from pathlib import Path
        from flask import send_from_directory, make_response
        import os
        gallery_dir = Path(app.root_path) / "uploads" / "gallery"
        file_path = gallery_dir / filename
        if file_path.is_file():
            return send_from_directory(str(gallery_dir), filename)
        from .models import GalleryPhoto
        url_path = f"/uploads/gallery/{filename}"
        photo = GalleryPhoto.query.filter(GalleryPhoto.image_url == url_path).first()
        if photo and photo.image_data:
            resp = make_response(photo.image_data)
            resp.headers['Content-Type'] = photo.image_mime or 'image/png'
            resp.headers['Cache-Control'] = 'public, max-age=86400'
            try:
                os.makedirs(str(gallery_dir), exist_ok=True)
                with open(str(file_path), 'wb') as fp:
                    fp.write(photo.image_data)
            except Exception:
                pass
            return resp
        return jsonify({'error': 'Image not found'}), 404

    # Serve any other uploaded file at /uploads/<filename>
    @app.route("/uploads/<path:filename>")
    def send_upload(filename):
        from pathlib import Path
        from flask import send_from_directory
        import os
        upload_folder = app.config.get("UPLOAD_FOLDER") or str(Path(app.root_path) / "uploads")
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

        # Add new ENUM values for work order statuses (PostgreSQL)
        try:
            from sqlalchemy import text
            for new_status in ('Revision Requested', 'Revision Submitted'):
                try:
                    db.session.execute(
                        text(f"ALTER TYPE work_order_status ADD VALUE IF NOT EXISTS '{new_status}'")
                    )
                    db.session.commit()
                    app.logger.info(f"Added ENUM value: {new_status}")
                except Exception:
                    db.session.rollback()
        except Exception as e:
            app.logger.warning(f"ENUM migration warning: {e}")

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
                    "image_data":    "BYTEA",
                    "image_mime":    "VARCHAR(50)",
                    "default_design_data": "JSON",
                    "is_private": "BOOLEAN DEFAULT FALSE",
                    "assigned_customer_id": "INTEGER",
                }
                for col, col_type in additions.items():
                    if col not in existing:
                        db.session.execute(
                            text(f"ALTER TABLE templates ADD COLUMN {col} {col_type}")
                        )
                        db.session.commit()
                        app.logger.info(f"Added column: templates.{col}")

            if "gallery_photos" in inspector.get_table_names():
                gallery_existing = {c["name"] for c in inspector.get_columns("gallery_photos")}
                gallery_additions = {
                    "approval_status": "VARCHAR(20) DEFAULT 'pending'",
                    "submission_group_id": "VARCHAR(64)",
                    "is_cover": "BOOLEAN DEFAULT FALSE",
                    "display_name": "VARCHAR(120)",
                    "hide_submitter_name": "BOOLEAN DEFAULT FALSE",
                }
                for col, col_type in gallery_additions.items():
                    if col not in gallery_existing:
                        db.session.execute(
                            text(f"ALTER TABLE gallery_photos ADD COLUMN {col} {col_type}")
                        )
                        db.session.commit()
                        app.logger.info(f"Added column: gallery_photos.{col}")

                if "approval_status" in gallery_existing:
                    db.session.execute(
                        text("UPDATE gallery_photos SET approval_status = 'approved' WHERE approval_status IS NULL")
                    )
                    db.session.commit()
                db.session.execute(
                    text("UPDATE gallery_photos SET submission_group_id = CAST(id AS VARCHAR) WHERE submission_group_id IS NULL OR submission_group_id = ''")
                )
                db.session.commit()
                db.session.execute(
                    text("UPDATE gallery_photos SET is_cover = FALSE WHERE is_cover IS NULL")
                )
                db.session.commit()
                db.session.execute(
                    text("UPDATE gallery_photos SET hide_submitter_name = FALSE WHERE hide_submitter_name IS NULL")
                )
                db.session.commit()
                db.session.execute(
                    text(
                        """
                        WITH groups_without_cover AS (
                          SELECT submission_group_id
                          FROM gallery_photos
                          GROUP BY submission_group_id
                          HAVING SUM(CASE WHEN is_cover THEN 1 ELSE 0 END) = 0
                        ), first_photo AS (
                          SELECT MIN(id) AS id
                          FROM gallery_photos
                          WHERE submission_group_id IN (SELECT submission_group_id FROM groups_without_cover)
                          GROUP BY submission_group_id
                        )
                        UPDATE gallery_photos
                        SET is_cover = TRUE
                        WHERE id IN (SELECT id FROM first_photo)
                        """
                    )
                )
                db.session.commit()
        except Exception as e:
            app.logger.warning(f"Migration warning: {e}")

        # Migrate author_id / changed_by from INTEGER to VARCHAR (admin user IDs are emails)
        try:
            from sqlalchemy import text, inspect as sa_inspect
            insp = sa_inspect(db.engine)
            col_migrations = [
                ("work_order_revisions", "author_id"),
                ("work_order_status_history", "changed_by"),
            ]
            for tbl, col in col_migrations:
                if tbl in insp.get_table_names():
                    cols = {c["name"]: c for c in insp.get_columns(tbl)}
                    if col in cols:
                        col_type = str(cols[col]["type"])
                        if "INT" in col_type.upper() or "int" in col_type:
                            db.session.execute(
                                text(f'ALTER TABLE {tbl} ALTER COLUMN {col} TYPE VARCHAR(255) USING {col}::VARCHAR')
                            )
                            db.session.commit()
                            app.logger.info(f"Migrated {tbl}.{col} from INTEGER to VARCHAR(255)")
        except Exception as e:
            db.session.rollback()
            app.logger.warning(f"Column type migration warning: {e}")

    return app


app = create_app()


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(app.config.get("PORT", os.environ.get("PORT", "5000"))),
        debug=bool(app.config.get("DEBUG", False)),
    )
