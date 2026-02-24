import pytest
from backend.app import app
from backend.db import db
from backend.models import Template

@pytest.fixture
def client():
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    with app.test_client() as client:
        with app.app_context():
            db.create_all()
        yield client
        with app.app_context():
            db.drop_all()

def test_get_templates(client):
    t = Template(name='Test', regions=[])  # regions as empty list
    db.session.add(t)
    db.session.commit()
    resp = client.get('/api/templates')
    assert resp.status_code == 200
    assert 'Test' in resp.get_data(as_text=True)

def test_get_template_by_id(client):
    t = Template(name='Test', regions=[])
    db.session.add(t)
    db.session.commit()
    resp = client.get(f'/api/templates/{t.id}')
    assert resp.status_code == 200
    assert 'Test' in resp.get_data(as_text=True)

def test_create_template(client):
    resp = client.post('/api/admin/templates', json={
        'name': 'New',
        'regions': [{'id': 'r1', 'color': '#fff'}]
    })
    assert resp.status_code == 201
    assert 'New' in resp.get_data(as_text=True)

def test_create_template_validation(client):
    resp = client.post('/api/admin/templates', json={})
    assert resp.status_code == 400
    assert 'error' in resp.get_data(as_text=True)
