"""Extraction endpoint - accepts leaked screenshots for forensic analysis."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.core.pipeline import ExtractionPipeline

router = APIRouter()
pipeline = ExtractionPipeline()


@router.post("/")
async def submit_extraction(
    image: UploadFile = File(...),
    investigation_id: str = Form(None),
    priority: str = Form("normal"),
):
    if image.content_type not in ["image/jpeg", "image/png", "image/webp"]:
        raise HTTPException(400, "Unsupported image format. Use JPEG, PNG, or WebP.")

    image_bytes = await image.read()
    if len(image_bytes) > 20 * 1024 * 1024:  # 20MB limit
        raise HTTPException(400, "Image too large. Maximum 20MB.")

    extraction_id = f"ext_{uuid.uuid4().hex[:12]}"

    # TODO: Queue for async processing (Phase 3, task SS-027)
    # For now, process synchronously
    result = await pipeline.extract(image_bytes, extraction_id)

    return {
        "extraction_id": extraction_id,
        "status": "completed",
        "attribution": result.get("attribution"),
        "per_layer_confidence": result.get("per_layer_confidence"),
        "degradation_analysis": result.get("degradation_analysis"),
    }
