from backend.app import create_app


def test_health_endpoint():
    app = create_app()
    client = app.test_client()
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json["status"] == "ok"
    assert "config" in response.json
    assert set(response.json["config"].keys()) == {
        "etsy_api_configured",
        "jwt_configured",
        "admin_configured",
    }
