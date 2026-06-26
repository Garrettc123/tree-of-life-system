-- GARCAR ENTERPRISE — IRAS Pipeline Supabase Schema
-- Run in Supabase SQL editor

-- ── IRAS Batches ──
CREATE TABLE IF NOT EXISTS iras_batches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status          TEXT NOT NULL DEFAULT 'prospecting',
    created_at      TIMESTAMPTZ DEFAULT now(),
    target_market   TEXT DEFAULT 'DFW_contractors',
    lead_limit      INTEGER DEFAULT 50,
    leads_discovered INTEGER DEFAULT 0,
    enriched        INTEGER DEFAULT 0,
    outreached      INTEGER DEFAULT 0,
    hot_leads       INTEGER DEFAULT 0,
    customers       INTEGER DEFAULT 0
);

-- ── IRAS Leads ──
CREATE TABLE IF NOT EXISTS iras_leads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        UUID REFERENCES iras_batches(id),
    status          TEXT NOT NULL DEFAULT 'prospected',
    -- Contact
    first_name      TEXT,
    last_name       TEXT,
    email           TEXT UNIQUE,
    phone           TEXT,
    linkedin_url    TEXT,
    company_name    TEXT,
    specialty       TEXT,   -- roofing, HVAC, GC, etc.
    -- Enrichment
    pain_data       JSONB,
    enriched_at     TIMESTAMPTZ,
    -- Scoring
    score           INTEGER DEFAULT 20,
    scored_at       TIMESTAMPTZ,
    -- Outreach
    outreach_enrolled_at TIMESTAMPTZ,
    email_sequence  JSONB,
    -- Conversion
    demo_invited_at TIMESTAMPTZ,
    -- Billing
    stripe_customer_id TEXT,
    payment_link    TEXT,
    billed_at       TIMESTAMPTZ,
    -- Onboarding
    converted_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── Garcar Customers (post-conversion) ──
CREATE TABLE IF NOT EXISTS garcar_customers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_customer_id TEXT UNIQUE,
    email           TEXT UNIQUE,
    first_name      TEXT,
    company         TEXT,
    plan            TEXT,  -- garcar-starter-500, garcar-pro-2000, etc.
    api_key_hash    TEXT,
    status          TEXT DEFAULT 'active',
    onboarded_at    TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_leads_status     ON iras_leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_batch      ON iras_leads(batch_id);
CREATE INDEX IF NOT EXISTS idx_leads_score      ON iras_leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_email      ON iras_leads(email);

-- ── Row-Level Security ──
ALTER TABLE iras_leads       ENABLE ROW LEVEL SECURITY;
ALTER TABLE iras_batches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE garcar_customers ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS — all pipeline writes use service key
