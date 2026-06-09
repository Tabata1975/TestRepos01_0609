import json
import sys
from datetime import date as real_date
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


@pytest.mark.parametrize("duration", [15, 25, 35, 45])
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
        data=json.dumps({"duration": 15}),
        content_type="application/json",
    )
    client.post(
        "/api/session",
        data=json.dumps({"duration": 45}),
        content_type="application/json",
    )

    progress = client.get("/api/today")

    assert progress.status_code == 200
    assert progress.get_json() == {"completed": 2, "total_minutes": 60}


def test_gamification_is_zero_initially(client):
    response = client.get("/api/gamification")

    assert response.status_code == 200
    data = response.get_json()
    assert data["xp"]["total"] == 0
    assert data["xp"]["level"] == 1
    assert data["streak_days"] == 0
    assert data["weekly_stats"]["completed_sessions"] == 0
    assert data["monthly_stats"]["completed_sessions"] == 0


def test_gamification_includes_xp_badges_streak_and_stats(client, monkeypatch):
    class FixedDate(real_date):
        @classmethod
        def today(cls):
            return cls(2026, 1, 10)

    monkeypatch.setattr(pomodoro_app, "date", FixedDate)

    with pomodoro_app.get_db() as conn:
        conn.executemany(
            "INSERT INTO sessions (date, completed, duration) VALUES (?, 1, ?)",
            [
                ("2026-01-10", 25),
                ("2026-01-10", 25),
                ("2026-01-10", 25),
                ("2026-01-10", 25),
                ("2026-01-09", 25),
                ("2026-01-09", 25),
                ("2026-01-09", 25),
                ("2026-01-08", 25),
                ("2026-01-08", 25),
                ("2026-01-08", 25),
            ],
        )
        conn.commit()

    response = client.get("/api/gamification")

    assert response.status_code == 200
    data = response.get_json()
    assert data["xp"]["total"] == 1000
    assert data["xp"]["level"] == 3
    assert data["xp"]["xp_in_level"] == 0
    assert data["streak_days"] == 3
    assert data["weekly_stats"]["completed_sessions"] == 10
    assert data["weekly_stats"]["average_focus_minutes"] == 25.0
    assert data["weekly_stats"]["completion_rate"] == 42.9
    assert data["monthly_stats"]["completed_sessions"] == 10
    assert len(data["weekly_stats"]["graph"]) == 7
    assert len(data["monthly_stats"]["graph"]) == 30
    assert all(badge["unlocked"] for badge in data["badges"])
