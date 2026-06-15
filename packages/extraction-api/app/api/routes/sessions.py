"""Session and stats endpoints for the dashboard."""
from fastapi import APIRouter
from app.db.session_store import SessionStore

router = APIRouter()
store = SessionStore()


@router.get("/recent")
async def get_recent_sessions():
    """Get recent watermark sessions for the dashboard."""
    try:
        sessions = store.find_all_recent(hours=168)  # Last 7 days
        # Convert to serializable format
        result = []
        for s in sessions:
            result.append({
                "user_id": s["user_id"],
                "session_id": s["session_id"],
                "watermark_id": s["watermark_id"],
                "pattern_seed": s["pattern_seed"],
                "page_context": s.get("page_context", "/"),
                "created_at": str(s["created_at"]) if s.get("created_at") else None,
            })
        return result
    except Exception as e:
        print(f"Sessions fetch error: {e}")
        return []
