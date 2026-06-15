"""ScreenSentinel Extraction API - Forensic watermark recovery service."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import extract, investigations, reports, health
from app.api.routes import sessions

app = FastAPI(
    title="ScreenSentinel Extraction API",
    description="Forensic watermark extraction and attribution",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/health", tags=["Health"])
app.include_router(extract.router, prefix="/api/v1/extract", tags=["Extraction"])
app.include_router(investigations.router, prefix="/api/v1/investigations", tags=["Investigations"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["Reports"])
app.include_router(sessions.router, prefix="/api/v1/sessions", tags=["Sessions"])


@app.on_event("startup")
async def startup():
    print("ScreenSentinel Extraction API starting...")


@app.on_event("shutdown")
async def shutdown():
    print("ScreenSentinel Extraction API shutting down...")
