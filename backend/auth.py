import os
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import jsonify, request


def create_token(subject):
    secret = os.environ.get("JWT_SECRET", "dev-secret")
    issuer = os.environ.get("JWT_ISSUER", "sgcgartglass")
    ttl_seconds = int(os.environ.get("JWT_TTL_SECONDS", "3600"))
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": subject,
        "iss": issuer,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl_seconds)).timestamp()),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def decode_token(token):
    secret = os.environ.get("JWT_SECRET", "dev-secret")
    issuer = os.environ.get("JWT_ISSUER", "sgcgartglass")
    return jwt.decode(token, secret, algorithms=["HS256"], issuer=issuer)


def require_auth(handler):
    @wraps(handler)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "missing_token"}), 401
        token = auth_header.split(" ", 1)[1].strip()
        try:
            decode_token(token)
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "token_expired"}), 401
        except jwt.InvalidIssuerError:
            return jsonify({"error": "invalid_issuer"}), 401
        except jwt.DecodeError:
            return jsonify({"error": "malformed_token"}), 401
        except jwt.PyJWTError as e:
            return jsonify({"error": f"invalid_token: {type(e).__name__}"}), 401
        return handler(*args, **kwargs)

    return wrapper
