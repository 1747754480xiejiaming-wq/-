from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.core.config import Settings
from app.core.db import session_factory
from app.seed import seed_database


@pytest.fixture
def client() -> Iterator[TestClient]:
    app = create_app(Settings(database_url="sqlite://", qa_mode="rules", cors_origins=("http://testserver", "http://127.0.0.1:4173")))
    with session_factory(app.state.engine)() as db:
        seed_database(db)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def login(client):
    passwords = {"operator": "Operator1234!", "reviewer": "Reviewer1234!", "lead": "LeadFollow1234!", "admin": "ProjectAdmin1234!"}
    def authenticate(username: str) -> dict[str, str]:
        csrf = client.get('/api/v1/admin/auth/csrf').json()['data']['csrf_token']
        result = client.post('/api/v1/admin/auth/login', headers={'X-CSRF-Token': csrf}, json={'username': username, 'password': passwords[username]})
        assert result.status_code == 200, result.text
        return {'X-CSRF-Token': result.json()['data']['csrf_token']}
    return authenticate
