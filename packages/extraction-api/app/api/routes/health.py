from fastapi import APIRouter

router = APIRouter()

@router.get("/")
async def health_check():
    return {"status": "ok", "service": "extraction-api", "version": "0.1.0"}
