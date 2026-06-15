-- ScreenSentinel Core Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    api_key_hash VARCHAR(255) NOT NULL,
    settings JSONB DEFAULT '{}',
    plan VARCHAR(50) DEFAULT 'starter',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE watermark_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(255) NOT NULL,
    watermark_id VARCHAR(50) UNIQUE NOT NULL,
    pattern_seed BIGINT NOT NULL,
    layer_config JSONB NOT NULL,
    page_context VARCHAR(500),
    ip_address_hash VARCHAR(64),
    user_agent TEXT,
    viewport JSONB,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    expired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ws_tenant_user ON watermark_sessions(tenant_id, user_id);
CREATE INDEX idx_ws_watermark_id ON watermark_sessions(watermark_id);
CREATE INDEX idx_ws_started_at ON watermark_sessions(started_at DESC);

CREATE TABLE investigations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    source_url VARCHAR(1000),
    severity VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(20) DEFAULT 'open',
    assigned_to VARCHAR(255),
    findings JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

CREATE TABLE extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    investigation_id UUID REFERENCES investigations(id),
    image_path VARCHAR(500) NOT NULL,
    image_hash VARCHAR(128) NOT NULL,
    status VARCHAR(20) DEFAULT 'queued',
    priority VARCHAR(10) DEFAULT 'normal',
    attributed_user VARCHAR(255),
    attributed_session UUID REFERENCES watermark_sessions(id),
    confidence DECIMAL(5,4),
    layer_confidence JSONB,
    degradation_info JSONB,
    processing_time_ms INTEGER,
    model_version VARCHAR(50),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ext_tenant ON extractions(tenant_id);
CREATE INDEX idx_ext_status ON extractions(status);

CREATE TABLE forensic_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    extraction_id UUID REFERENCES extractions(id),
    investigation_id UUID REFERENCES investigations(id),
    report_data JSONB NOT NULL,
    evidence_hash VARCHAR(128) NOT NULL,
    pdf_path VARCHAR(500),
    generated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    actor VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    resource_id UUID,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant ON audit_log(tenant_id, created_at DESC);
