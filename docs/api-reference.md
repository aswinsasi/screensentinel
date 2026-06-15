# ScreenSentinel API Reference

## Authentication
All API requests require `Authorization: Bearer ss_live_<key>` header.

## Endpoints

### POST /api/v1/token
Generate a watermark token for the SDK.

### POST /api/v1/extract
Submit a leaked screenshot for forensic extraction.

### GET /api/v1/extract/{id}/result
Get extraction result by ID.

### POST /api/v1/investigations
Create a new investigation.

### GET /api/v1/reports/{id}
Get forensic report.

See full documentation at docs.screensentinel.io
