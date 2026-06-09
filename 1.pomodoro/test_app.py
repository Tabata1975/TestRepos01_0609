import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import app as pomodoro_app  # noqa: E402


@pytest.fixture
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "test_pomodoro.db"
    monkeypatch.setattr(pomodoro_app, "DB_PATH", str(db_path))
    pomodoro_app.app.config.update(TESTING=True)
    pomodoro_app.init_db()

    with pomodoro_app.app.test_client() as test_client:
        yield test_client


def test_today_progress_is_zero_initially(client):
    response = client.get("/api/today")

    assert response.status_code == 200
    assert response.get_json() == {"completed": 0, "total_minutes": 0}


def test_add_session_uses_default_duration_and_returns_aggregate(client):
    response = client.post(
        "/api/session",
        data=json.dumps({}),
        content_type="application/json",
    )

    assert response.status_code == 200
    assert response.get_json() == {"completed": 1, "total_minutes": 25}


@pytest.mark.parametrize("duration", [15, 25, 30])
def test_add_session_accumulates_total_minutes(client, duration):
    client.post(
        "/api/session",
        data=json.dumps({"duration": duration}),
        content_type="application/json",
    )

    progress = client.get("/api/today")

    assert progress.status_code == 200
    data = progress.get_json()
    assert data["completed"] == 1
    assert data["total_minutes"] == duration


def test_multiple_sessions_are_counted_correctly(client):
    client.post(
        "/api/session",
        data=json.dumps({"duration": 20}),
        content_type="application/json",
    )
    client.post(
        "/api/session",
        data=json.dumps({"duration": 30}),
        content_type="application/json",
    )

    progress = client.get("/api/today")

    assert progress.status_code == 200
    assert progress.get_json() == {"completed": 2, "total_minutes": 50}


def test_index_contains_visual_feedback_elements(client):
    response = client.get("/")

    assert response.status_code == 200
    html = response.data.decode("utf-8")
    assert 'class="focus-background"' in html
    assert 'id="ring-gradient-start"' in html
    assert 'id="ring-gradient-end"' in html
