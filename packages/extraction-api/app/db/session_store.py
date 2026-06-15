"""Session store - looks up watermark sessions from PostgreSQL."""
import os
import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/screensentinel"
)


class SessionStore:
    """Query watermark sessions for forensic attribution."""

    def get_connection(self):
        return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

    def find_all_recent(self, hours: int = 72) -> list:
        """Get all sessions from the last N hours."""
        conn = self.get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                """SELECT user_id, session_id, watermark_id, pattern_seed,
                          page_context, viewport, created_at
                   FROM watermark_sessions
                   WHERE created_at > NOW() - INTERVAL '%s hours'
                   ORDER BY created_at DESC
                   LIMIT 1000""",
                (hours,)
            )
            return cur.fetchall()
        finally:
            conn.close()

    def find_by_watermark_id(self, watermark_id: str) -> dict | None:
        """Find a specific session by watermark ID."""
        conn = self.get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT * FROM watermark_sessions WHERE watermark_id = %s",
                (watermark_id,)
            )
            return cur.fetchone()
        finally:
            conn.close()

    def find_by_user(self, user_id: str) -> list:
        """Find all sessions for a specific user."""
        conn = self.get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                """SELECT user_id, session_id, watermark_id, pattern_seed,
                          page_context, created_at
                   FROM watermark_sessions
                   WHERE user_id = %s
                   ORDER BY created_at DESC
                   LIMIT 100""",
                (user_id,)
            )
            return cur.fetchall()
        finally:
            conn.close()

    def count_sessions(self) -> int:
        """Get total session count."""
        conn = self.get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) as count FROM watermark_sessions")
            row = cur.fetchone()
            return row["count"] if row else 0
        finally:
            conn.close()
