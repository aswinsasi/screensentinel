#!/bin/bash
set -e

echo "╔══════════════════════════════════════════╗"
echo "║     ScreenSentinel Local Setup           ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# 1. Check prerequisites
echo "→ Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "❌ Node.js required. Install from https://nodejs.org"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm required. Run: npm install -g pnpm"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker required. Install from https://docker.com"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "❌ Python 3.11+ required"; exit 1; }
echo "✓ All prerequisites found"

# 2. Install Node dependencies
echo ""
echo "→ Installing Node.js dependencies..."
pnpm install

# 3. Setup Python virtual environment
echo ""
echo "→ Setting up Python environment..."
cd packages/extraction-api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
cd ../..

# 4. Generate RSA keys for JWT signing
echo ""
echo "→ Generating RSA key pair..."
mkdir -p .keys
if [ ! -f .keys/private.pem ]; then
  openssl genrsa -out .keys/private.pem 2048
  openssl rsa -in .keys/private.pem -pubout -out .keys/public.pem
  echo "✓ RSA keys generated in .keys/"
else
  echo "✓ RSA keys already exist"
fi

# 5. Copy environment file
echo ""
echo "→ Setting up environment..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✓ Created .env from template"
else
  echo "✓ .env already exists"
fi

# 6. Start infrastructure
echo ""
echo "→ Starting infrastructure (PostgreSQL, Redis, MinIO)..."
docker compose -f infra/docker/docker-compose.yml up -d postgres redis minio

echo ""
echo "→ Waiting for services to be healthy..."
sleep 5

# 7. Create MinIO bucket
echo ""
echo "→ Creating S3 bucket..."
docker compose -f infra/docker/docker-compose.yml exec -T minio mc alias set local http://localhost:9000 sentinel_dev dev_password_change_me 2>/dev/null || true
docker compose -f infra/docker/docker-compose.yml exec -T minio mc mb local/screensentinel-evidence 2>/dev/null || true

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✓ Setup complete!                       ║"
echo "║                                          ║"
echo "║  Start development:                      ║"
echo "║    SDK:        cd packages/sdk && pnpm dev║"
echo "║    Token API:  cd packages/token-service  ║"
echo "║                && pnpm dev                ║"
echo "║    Extract API: cd packages/extraction-api║"
echo "║                && uvicorn app.main:app    ║"
echo "║                   --reload                ║"
echo "║                                          ║"
echo "║  Infrastructure:                         ║"
echo "║    PostgreSQL: localhost:5432             ║"
echo "║    Redis:      localhost:6379             ║"
echo "║    MinIO:      localhost:9000 (UI: 9001) ║"
echo "╚══════════════════════════════════════════╝"
