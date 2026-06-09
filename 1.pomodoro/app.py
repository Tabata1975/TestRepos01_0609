import sqlite3
from datetime import date, timedelta
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)
DB_PATH = "pomodoro.db"
XP_PER_COMPLETION = 100
XP_PER_LEVEL = 500


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                date      TEXT    NOT NULL,
                completed INTEGER NOT NULL DEFAULT 1,
                duration  INTEGER NOT NULL
            )
        """)
        conn.commit()


def get_daily_totals(conn, start_date):
    rows = conn.execute(
        """
        SELECT date, SUM(completed) AS completed, SUM(duration) AS minutes
        FROM sessions
        WHERE date >= ?
        GROUP BY date
        ORDER BY date ASC
        """,
        (start_date.isoformat(),),
    ).fetchall()
    return {
        row["date"]: {"completed": row["completed"] or 0, "minutes": row["minutes"] or 0}
        for row in rows
    }


def build_period_graph(daily_totals, days):
    today = date.today()
    graph = []
    for offset in range(days - 1, -1, -1):
        day = today - timedelta(days=offset)
        day_key = day.isoformat()
        totals = daily_totals.get(day_key, {"completed": 0, "minutes": 0})
        graph.append({
            "date": day_key,
            "label": f"{day.month}/{day.day}",
            "completed": totals["completed"],
            "minutes": totals["minutes"],
        })
    return graph


def build_period_stats(graph):
    total_completed = sum(point["completed"] for point in graph)
    total_minutes = sum(point["minutes"] for point in graph)
    active_days = sum(1 for point in graph if point["completed"] > 0)
    completion_rate = round((active_days / len(graph)) * 100, 1) if graph else 0
    avg_focus_minutes = round(total_minutes / total_completed, 1) if total_completed else 0
    return {
        "completed_sessions": total_completed,
        "total_minutes": total_minutes,
        "average_focus_minutes": avg_focus_minutes,
        "completion_rate": completion_rate,
        "graph": graph,
    }


def calculate_streak_days(conn):
    rows = conn.execute(
        "SELECT DISTINCT date FROM sessions WHERE completed = 1 ORDER BY date DESC"
    ).fetchall()
    active_dates = {row["date"] for row in rows}
    if not active_dates:
        return 0

    today = date.today()
    current_day = today
    yesterday = today - timedelta(days=1)
    has_today = current_day.isoformat() in active_dates
    has_yesterday = yesterday.isoformat() in active_dates

    if not has_today and has_yesterday:
        current_day = yesterday
    elif not has_today:
        return 0

    streak = 0
    while current_day.isoformat() in active_dates:
        streak += 1
        current_day -= timedelta(days=1)
    return streak


def build_badges(streak_days, weekly_completed):
    return [
        {
            "id": "streak_3",
            "name": "3日連続",
            "description": "3日連続でポモドーロを完了",
            "progress": min(streak_days, 3),
            "target": 3,
            "unlocked": streak_days >= 3,
        },
        {
            "id": "weekly_10",
            "name": "今週10回完了",
            "description": "過去7日で10セッション完了",
            "progress": min(weekly_completed, 10),
            "target": 10,
            "unlocked": weekly_completed >= 10,
        },
    ]


def build_gamification_data(conn):
    totals = conn.execute(
        "SELECT SUM(completed) AS completed, SUM(duration) AS minutes FROM sessions"
    ).fetchone()
    total_completed = totals["completed"] or 0
    total_minutes = totals["minutes"] or 0

    total_xp = total_completed * XP_PER_COMPLETION
    level = total_xp // XP_PER_LEVEL + 1
    xp_in_level = total_xp % XP_PER_LEVEL
    xp_for_next_level = XP_PER_LEVEL - xp_in_level

    today = date.today()
    daily_totals = get_daily_totals(conn, today - timedelta(days=29))
    weekly_stats = build_period_stats(build_period_graph(daily_totals, 7))
    monthly_stats = build_period_stats(build_period_graph(daily_totals, 30))
    streak_days = calculate_streak_days(conn)

    return {
        "xp": {
            "total": total_xp,
            "per_completion": XP_PER_COMPLETION,
            "per_level": XP_PER_LEVEL,
            "level": level,
            "xp_in_level": xp_in_level,
            "xp_for_next_level": xp_for_next_level,
        },
        "streak_days": streak_days,
        "badges": build_badges(streak_days, weekly_stats["completed_sessions"]),
        "weekly_stats": weekly_stats,
        "monthly_stats": monthly_stats,
        "summary": {
            "completed_sessions": total_completed,
            "total_minutes": total_minutes,
        },
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/session", methods=["POST"])
def add_session():
    data = request.get_json(silent=True) or {}
    try:
        duration = int(data.get("duration", 25))
    except (TypeError, ValueError):
        return jsonify({"error": "duration は分単位の整数で指定してください"}), 400
    if duration <= 0:
        return jsonify({"error": "duration は 1 以上で指定してください"}), 400
    today = date.today().isoformat()

    with get_db() as conn:
        conn.execute(
            "INSERT INTO sessions (date, completed, duration) VALUES (?, 1, ?)",
            (today, duration),
        )
        conn.commit()

        row = conn.execute(
            "SELECT SUM(completed) AS cnt, SUM(duration) AS total FROM sessions WHERE date = ?",
            (today,),
        ).fetchone()

    return jsonify({
        "completed":     row["cnt"]   or 0,
        "total_minutes": row["total"] or 0,
    })


@app.route("/api/today", methods=["GET"])
def today_progress():
    today = date.today().isoformat()
    with get_db() as conn:
        row = conn.execute(
            "SELECT SUM(completed) AS cnt, SUM(duration) AS total FROM sessions WHERE date = ?",
            (today,),
        ).fetchone()

    return jsonify({
        "completed":     row["cnt"]   or 0,
        "total_minutes": row["total"] or 0,
    })


@app.route("/api/gamification", methods=["GET"])
def gamification_progress():
    with get_db() as conn:
        data = build_gamification_data(conn)
    return jsonify(data)


if __name__ == "__main__":
    init_db()
    app.run()
