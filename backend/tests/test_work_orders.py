import pytest
from backend.app import app
from backend.db import db
from backend.models import WorkOrder
from unittest.mock import patch

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

def test_submit_work_order(client):
    resp = client.post('/api/work-orders/submit', json={
        'project_id': 1,
        'customer_email': 'test@sgcg.com',
        'regions': [{'id': 'r1', 'color': '#ff0', 'glassType': 'Stained'}]
    })
    assert resp.status_code == 201
    assert 'work order' in resp.get_data(as_text=True)

@patch('backend.routes.send_email')
def test_email_sent_on_submission(mock_send_email, client):
    client.post('/api/work-orders/submit', json={
        'project_id': 1,
        'customer_email': 'test@sgcg.com',
        'regions': [{'id': 'r1', 'color': '#ff0', 'glassType': 'Stained'}]
    })
    mock_send_email.assert_called_once()

def test_status_update(client):
    wo = WorkOrder(project_id=1, customer_email='test@sgcg.com', status='pending')
    db.session.add(wo)
    db.session.commit()
    resp = client.post(f'/api/work-orders/{wo.id}/status', json={'status': 'completed'})
    assert resp.status_code == 200
    assert 'completed' in resp.get_data(as_text=True)


def test_submit_work_order_validation(client):
    resp = client.post('/api/work-orders/submit', json={})
    assert resp.status_code == 400
    assert 'error' in resp.get_data(as_text=True)
