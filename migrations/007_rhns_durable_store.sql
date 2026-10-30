-- RHNS durable proposal and exact-action approval storage.
-- Additive migration: keeps existing CRF approval, event, and evidence tables intact.
-- Uses the existing tenant registry and existing CRF event/evidence ledgers.

CREATE TABLE IF NOT EXISTS public.rhns_action_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.crf_tenants(id) ON DELETE RESTRICT,
  requested_by TEXT NOT NULL,
  action_hash TEXT NOT NULL CHECK (action_hash ~ '^[0-9a-f]{64}$'),
  action JSONB NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'approved', 'consumed', 'rejected', 'expired')),
  created_at_ms BIGINT NOT NULL,
  expires_at_ms BIGINT NOT NULL,
  consumed_at_ms BIGINT,
  approved_by TEXT,
  approved_at_ms BIGINT,
  CHECK (expires_at_ms > created_at_ms),
  CHECK ((state <> 'approved') OR (approved_by IS NOT NULL AND approved_at_ms IS NOT NULL)),
  CHECK ((state <> 'consumed') OR (consumed_at_ms IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS rhns_action_approvals_tenant_state_expiry_idx
  ON public.rhns_action_approvals (tenant_id, state, expires_at_ms);
CREATE INDEX IF NOT EXISTS rhns_action_approvals_expiry_idx
  ON public.rhns_action_approvals (expires_at_ms)
  WHERE state IN ('pending', 'approved');

CREATE TABLE IF NOT EXISTS public.rhns_proposals (
  tenant_id UUID NOT NULL REFERENCES public.crf_tenants(id) ON DELETE RESTRICT,
  proposal_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft_pending_review', 'approved', 'rejected', 'cancelled')),
  execution_mode TEXT NOT NULL CHECK (execution_mode = 'proposal_only'),
  proposal_hash TEXT NOT NULL CHECK (proposal_hash ~ '^[0-9a-f]{64}$'),
  proposal JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, proposal_id),
  UNIQUE (tenant_id, task_id)
);

CREATE INDEX IF NOT EXISTS rhns_proposals_tenant_state_created_idx
  ON public.rhns_proposals (tenant_id, state, created_at DESC);
CREATE INDEX IF NOT EXISTS rhns_proposals_agent_created_idx
  ON public.rhns_proposals (tenant_id, agent_id, created_at DESC);

ALTER TABLE public.rhns_action_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rhns_proposals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.rhns_action_approvals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.rhns_proposals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.rhns_action_approvals TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.rhns_proposals TO service_role;

DO $$
BEGIN
  CREATE POLICY rhns_action_approvals_service_role
    ON public.rhns_action_approvals
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY rhns_proposals_service_role
    ON public.rhns_proposals
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
