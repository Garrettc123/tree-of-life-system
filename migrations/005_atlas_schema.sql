-- ============================================================
-- GARCAR ENTERPRISE: ATLAS WEBHOOK INGESTION SCHEMA
-- Supabase Postgres — Central Event Ledger
-- Run in Supabase SQL Editor or: supabase db push
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Webhook Events Ingestion Table ──────────────────────────
CREATE TABLE IF NOT EXISTS webhook_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id        TEXT UNIQUE NOT NULL,
  source          TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending',
  retry_count     INTEGER NOT NULL DEFAULT 0,
  max_retries     INTEGER NOT NULL DEFAULT 3,
  error_message   TEXT,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_source     ON webhook_events (source);
CREATE INDEX IF NOT EXISTS idx_webhook_event_type ON webhook_events (event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_status     ON webhook_events (status);
CREATE INDEX IF NOT EXISTS idx_webhook_created    ON webhook_events (created_at DESC);

-- ── Revenue Ledger ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS revenue_ledger (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_event_id    UUID REFERENCES webhook_events(id),
  stripe_event_id     TEXT UNIQUE NOT NULL,
  stripe_object_id    TEXT NOT NULL,
  object_type         TEXT NOT NULL,
  customer_id         TEXT,
  customer_email      TEXT,
  amount_cents        BIGINT NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'usd',
  status              TEXT NOT NULL,
  tax_amount_cents    BIGINT NOT NULL DEFAULT 0,
  net_amount_cents    BIGINT GENERATED ALWAYS AS (amount_cents - tax_amount_cents) STORED,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_revenue_customer ON revenue_ledger (customer_email);
CREATE INDEX IF NOT EXISTS idx_revenue_status   ON revenue_ledger (status);
CREATE INDEX IF NOT EXISTS idx_revenue_created  ON revenue_ledger (created_at DESC);

-- ── Lead Pipeline ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  apollo_id       TEXT UNIQUE,
  email           TEXT NOT NULL,
  first_name      TEXT,
  last_name       TEXT,
  company         TEXT,
  title           TEXT,
  phone           TEXT,
  linkedin_url    TEXT,
  enrichment_data JSONB NOT NULL DEFAULT '{}',
  ai_score        NUMERIC(3,2) DEFAULT 0.00,
  status          TEXT NOT NULL DEFAULT 'new',
  assigned_agent  TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_score  ON leads (ai_score DESC);

-- ── Contracts ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id               UUID REFERENCES leads(id),
  stripe_customer_id    TEXT,
  docusign_envelope_id  TEXT UNIQUE,
  contract_type         TEXT NOT NULL DEFAULT 'service_agreement',
  status                TEXT NOT NULL DEFAULT 'draft',
  amount_cents          BIGINT,
  currency              TEXT NOT NULL DEFAULT 'usd',
  stripe_payment_link   TEXT,
  signed_at             TIMESTAMPTZ,
  expires_at            TIMESTAMPTZ,
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contracts_lead   ON contracts (lead_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts (status);

-- ── Tax Accruals ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_accruals (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  revenue_event_id  UUID REFERENCES revenue_ledger(id),
  period_year       INTEGER NOT NULL,
  period_quarter    INTEGER NOT NULL CHECK (period_quarter BETWEEN 1 AND 4),
  tax_jurisdiction  TEXT NOT NULL DEFAULT 'federal',
  taxable_amount    BIGINT NOT NULL,
  tax_rate_bps      INTEGER NOT NULL,
  tax_due_cents     BIGINT GENERATED ALWAYS AS ((taxable_amount * tax_rate_bps) / 10000) STORED,
  status            TEXT NOT NULL DEFAULT 'accrued',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tax_period ON tax_accruals (period_year, period_quarter);

-- ── Treasury Positions ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS treasury_positions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_name    TEXT NOT NULL UNIQUE,
  account_type    TEXT NOT NULL DEFAULT 'stripe',
  balance_cents   BIGINT NOT NULL DEFAULT 0,
  available_cents BIGINT NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'usd',
  last_synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata        JSONB NOT NULL DEFAULT '{}'
);

-- ── Deployments ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deployments (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_event_id UUID REFERENCES webhook_events(id),
  repo_name        TEXT NOT NULL,
  repo_full_name   TEXT NOT NULL,
  environment      TEXT NOT NULL DEFAULT 'production',
  branch           TEXT NOT NULL DEFAULT 'main',
  commit_sha       TEXT,
  status           TEXT NOT NULL DEFAULT 'triggered',
  deploy_url       TEXT,
  deployed_at      TIMESTAMPTZ,
  duration_ms      INTEGER,
  triggered_by     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deploys_repo    ON deployments (repo_full_name);
CREATE INDEX IF NOT EXISTS idx_deploys_status  ON deployments (status);
CREATE INDEX IF NOT EXISTS idx_deploys_created ON deployments (created_at DESC);

-- ── ATLAS Tasks ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS atlas_tasks (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_event_id UUID REFERENCES webhook_events(id),
  task_type        TEXT NOT NULL,
  crew_agent       TEXT,
  input_data       JSONB NOT NULL DEFAULT '{}',
  output_data      JSONB NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'queued',
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  duration_ms      INTEGER,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_type    ON atlas_tasks (task_type);
CREATE INDEX IF NOT EXISTS idx_tasks_status  ON atlas_tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON atlas_tasks (created_at DESC);

-- ── Auto-update trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_webhook_updated   BEFORE UPDATE ON webhook_events  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
DO $$ BEGIN
  CREATE TRIGGER trg_revenue_updated   BEFORE UPDATE ON revenue_ledger  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
DO $$ BEGIN
  CREATE TRIGGER trg_leads_updated     BEFORE UPDATE ON leads           FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
DO $$ BEGIN
  CREATE TRIGGER trg_contracts_updated BEFORE UPDATE ON contracts       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
DO $$ BEGIN
  CREATE TRIGGER trg_deploys_updated   BEFORE UPDATE ON deployments     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- ── Row Level Security ───────────────────────────────────────
ALTER TABLE webhook_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_ledger     ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_accruals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasury_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_tasks        ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_all_webhook  ON webhook_events     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_all_revenue  ON revenue_ledger     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_all_leads    ON leads              FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_all_contract ON contracts          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_all_tax      ON tax_accruals       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_all_treasury ON treasury_positions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_all_deploys  ON deployments        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_all_tasks    ON atlas_tasks        FOR ALL TO service_role USING (true) WITH CHECK (true);
