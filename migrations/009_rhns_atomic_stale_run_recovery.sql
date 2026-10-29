-- Atomic stale-run recovery for RHNS.
-- Run and open-task recovery is performed in one database transaction.
CREATE OR REPLACE FUNCTION public.rhns_recover_stale_run(
  p_tenant_id uuid,
  p_run_id uuid,
  p_expected_status text,
  p_next_status text,
  p_error jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_expected_status NOT IN ('created', 'planning', 'executing', 'verifying') THEN
    RAISE EXCEPTION 'Unsupported expected status';
  END IF;
  IF p_next_status NOT IN ('failed', 'unknown_outcome') THEN
    RAISE EXCEPTION 'Unsupported recovery status';
  END IF;
  IF (p_expected_status IN ('executing', 'verifying')) <> (p_next_status = 'unknown_outcome') THEN
    RAISE EXCEPTION 'Recovery status does not match stage';
  END IF;

  UPDATE public.rhns_runs
  SET status = p_next_status, error = COALESCE(p_error, '{}'::jsonb),
      completed_at = v_now, updated_at = v_now
  WHERE id = p_run_id AND tenant_id = p_tenant_id AND status = p_expected_status;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE public.rhns_tasks
  SET status = 'cancelled',
      error = jsonb_build_object('message', 'Run recovered after runtime restart',
        'disposition', 'run_terminated_before_execution'),
      completed_at = v_now, updated_at = v_now
  WHERE run_id = p_run_id AND tenant_id = p_tenant_id AND status IN ('proposed', 'approved');

  UPDATE public.rhns_tasks
  SET status = CASE WHEN p_next_status = 'unknown_outcome' THEN 'unknown_outcome' ELSE 'failed' END,
      error = jsonb_build_object('message', 'Run recovered after runtime restart',
        'disposition', CASE WHEN p_next_status = 'unknown_outcome' THEN 'outcome_ambiguous' ELSE 'run_failed' END),
      completed_at = v_now, updated_at = v_now
  WHERE run_id = p_run_id AND tenant_id = p_tenant_id AND status = 'executing';
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.rhns_recover_stale_run(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rhns_recover_stale_run(uuid, uuid, text, text, jsonb) TO service_role;
