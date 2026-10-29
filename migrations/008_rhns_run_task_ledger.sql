-- RHNS durable run/task lifecycle records.
-- Additive, tenant-scoped, service-role-only storage. No provider writes are enabled by this schema.

CREATE TABLE IF NOT EXISTS public.rhns_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.crf_tenants(id) ON DELETE RESTRICT,
  run_key TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  execution_mode TEXT NOT NULL CHECK (execution_mode IN ('read_only_observation', 'proposal_only')),
  status TEXT NOT NULL CHECK (status IN (
    'created', 'planning', 'awaiting_approval', 'executing', 'verifying',
    'succeeded', 'rejected', 'failed', 'cancelled', 'unknown_outcome'
  )),
  goal JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  error JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, run_key),
  CHECK ((status NOT IN ('succeeded', 'rejected', 'failed', 'cancelled', 'unknown_outcome')) OR completed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS rhns_runs_tenant_status_created_idx
  ON public.rhns_runs (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS rhns_runs_tenant_started_idx
  ON public.rhns_runs (tenant_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.rhns_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.crf_tenants(id) ON DELETE RESTRICT,
  run_id UUID NOT NULL,
  task_key TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'proposed', 'approved', 'executing', 'confirmed', 'failed',
    'unknown_outcome', 'cancelled', 'rejected'
  )),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  error JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rhns_tasks_run_tenant_fk
    FOREIGN KEY (tenant_id, run_id) REFERENCES public.rhns_runs (tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (run_id, task_key),
  CHECK ((status NOT IN ('confirmed', 'failed', 'unknown_outcome', 'cancelled', 'rejected')) OR completed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS rhns_tasks_tenant_status_created_idx
  ON public.rhns_tasks (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS rhns_tasks_run_status_idx
  ON public.rhns_tasks (run_id, status);
CREATE INDEX IF NOT EXISTS rhns_tasks_tenant_agent_idx
  ON public.rhns_tasks (tenant_id, agent_id, created_at DESC);

ALTER TABLE public.rhns_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rhns_tasks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.rhns_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.rhns_tasks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.rhns_runs TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.rhns_tasks TO service_role;

DO $$
BEGIN
  CREATE POLICY rhns_runs_service_role
    ON public.rhns_runs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY rhns_tasks_service_role
    ON public.rhns_tasks
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
