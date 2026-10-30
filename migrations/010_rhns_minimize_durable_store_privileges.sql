-- RHNS operational tables do not require row deletion during normal runtime.
-- Preserve read/write lifecycle operations while reducing destructive privilege.
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.rhns_runs, public.rhns_tasks,
            public.rhns_proposals, public.rhns_action_approvals
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.rhns_runs, public.rhns_tasks,
            public.rhns_proposals, public.rhns_action_approvals
  TO service_role;
