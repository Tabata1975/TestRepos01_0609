import sqlite3
from datetime import date
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)
DB_PATH = "pomodoro.db"


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


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/session", methods=["POST"])
def add_session():
    data = request.get_json(force=True)
    duration = int(data.get("duration", 25))
    today = date.today().isoformat()

    with get_db() as conn:
        conn.execute(
            "INSERT INTO sessions (date, completed, duration) VALUES (?, 1, ?)",
            (today, duration),
        )
        conn.commit()

        row = conn.execute(
            "SELECT COUNT(*) AS cnt, SUM(duration) AS total FROM sessions WHERE date = ?",
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
            "SELECT COUNT(*) AS cnt, SUM(duration) AS total FROM sessions WHERE date = ?",
            (today,),
        ).fetchone()

    return jsonify({
        "completed":     row["cnt"]   or 0,
        "total_minutes": row["total"] or 0,
    })


if __name__ == "__main__":
    init_db()
    app.run()
