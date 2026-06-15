"""Investigation management endpoints."""
from fastapi import APIRouter

router = APIRouter()

@router.post("/")
async def create_investigation(data: dict):
    # TODO: Implement in Phase 4
    return {"id": "inv_placeholder", "status": "open", **data}

@router.get("/{investigation_id}")
async def get_investigation(investigation_id: str):
    return {"id": investigation_id, "status": "open"}
