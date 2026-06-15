# ScreenSentinel

**Invisible Forensic Attribution for Web Applications**

ScreenSentinel embeds invisible, per-user watermark patterns into web application screens. When a screenshot leaks, the system extracts the hidden pattern and traces it back to the exact user who captured it.

> *"Make every leak traceable through AI forensic intelligence."*

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  @screensentinel/sdk                     │    │
│  │                                                         │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │    │
│  │  │ Layer 1  │ │ Layer 2  │ │ Layer 3  │ │ Layer 4  │  │    │
│  │  │ SubPixel │ │Luminance │ │SVG Mesh  │ │Temporal  │  │    │
│  │  │ Patterns │ │Modulate  │ │ Overlay  │ │ Mutate   │  │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │    │
│  └───────────────────┬─────────────────────────────────────┘    │
│                      │ Token Request                            │
└──────────────────────┼──────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│                         SERVER                                   │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │Token Service  │  │Extraction API│  │    Dashboard (Vue)   │  │
│  │  (Node.js)   │  │  (Python)    │  │                      │  │
│  │              │  │              │  │  - Investigations     │  │
│  │ JWT signing  │  │ Preprocess   │  │  - Extractions       │  │
│  │ Session log  │  │ ML Extract   │  │  - Reports           │  │
│  │ Rate limit   │  │ Fuse         │  │  - Sessions          │  │
│  └──────┬───────┘  │ Attribute    │  └──────────────────────┘  │
│         │          └──────┬───────┘                              │
│         │                 │                                      │
│  ┌──────▼─────────────────▼──────┐  ┌────────┐  ┌───────────┐  │
│  │       PostgreSQL 16           │  │ Redis  │  │   MinIO   │  │
│  │  Sessions, Investigations     │  │ Cache  │  │ Evidence  │  │
│  │  Extractions, Audit Log       │  │ Queue  │  │ Storage   │  │
│  └───────────────────────────────┘  └────────┘  └───────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# 1. Clone and bootstrap
git clone <repo-url> screensentinel
cd screensentinel
bash scripts/bootstrap.sh

# 2. Start development servers
# Terminal 1: SDK (watches for changes, rebuilds)
cd packages/sdk && pnpm dev

# Terminal 2: Token Service
cd packages/token-service && pnpm dev

# Terminal 3: Extraction API
cd packages/extraction-api
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

## Project Structure

```
screensentinel/
├── packages/
│   ├── sdk/                  # TypeScript embedding SDK
│   ├── sdk-react/            # React hook wrapper
│   ├── token-service/        # Node.js token generation API
│   ├── extraction-api/       # Python FastAPI extraction service
│   ├── dashboard/            # Vue 3 / Nuxt management UI
│   └── shared/               # Shared types and constants
├── infra/
│   ├── docker/               # Docker Compose, Dockerfiles
│   └── k8s/                  # Kubernetes manifests
├── scripts/                  # Bootstrap, key generation, utilities
└── docs/                     # Documentation
```

## SDK Usage

### Script Tag
```html
<script src="https://cdn.screensentinel.io/v1/sentinel.min.js"></script>
<script>
  ScreenSentinel.init({
    apiKey: 'ss_live_your_api_key',
    userId: getCurrentUser().id,
    tenantId: 'your-org',
  });
</script>
```

### NPM
```typescript
import { ScreenSentinel } from '@screensentinel/sdk';

ScreenSentinel.init({
  apiKey: 'ss_live_your_api_key',
  userId: user.id,
  sessionId: session.id,
  tenantId: 'your-org',
  debug: false, // Set true to visualize watermarks
});
```

## How It Works

1. **Embed**: SDK renders 4 layers of invisible patterns unique to each user
2. **Leak**: Someone screenshots the page. Image gets compressed, cropped, shared.
3. **Extract**: Upload leaked screenshot → AI recovers damaged watermark → identifies user
4. **Report**: Forensic confidence report with per-layer analysis

## Watermark Layers

| Layer | Technique | Survives |
|-------|-----------|----------|
| 1. Sub-Pixel | Tiny shapes at PRNG positions | Moderate compression |
| 2. Luminance | ±0.5-1.5% brightness on DOM elements | Heavy compression, grayscale |
| 3. SVG Mesh | Path curvature encoding in overlay | Cropping, color shifts |
| 4. Temporal | Time-varying mutations every 30s | Screenshot averaging attacks |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Service health check |
| `/api/v1/token` | POST | Generate watermark token |
| `/api/v1/extract` | POST | Submit screenshot for extraction |
| `/api/v1/extract/{id}/result` | GET | Get extraction result |
| `/api/v1/investigations` | POST/GET | Manage investigations |
| `/api/v1/reports/{id}` | GET | Get forensic report |

## Development

```bash
pnpm test          # Run all tests
pnpm build         # Build all packages
pnpm lint          # Lint all packages
pnpm typecheck     # Type check TypeScript
```

## Tech Stack

- **SDK**: TypeScript, Rollup, Vitest
- **Token Service**: Node.js, Express, JWT (RS256), Zod
- **Extraction API**: Python, FastAPI, OpenCV, PyTorch (Phase 5)
- **Dashboard**: Vue 3, Nuxt (Phase 4)
- **Database**: PostgreSQL 16, Redis 7
- **Storage**: S3-compatible (MinIO for dev)
- **Infrastructure**: Docker, Kubernetes, Terraform

## License

Proprietary - Agent Viscro

---

*Built by [Agent Viscro](https://agentviscro.com)*
