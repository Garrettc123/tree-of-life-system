-- garcar_events: central event log for the garcar-dispatch bus
-- Run against your Supabase project SQL editor.

create table if not exists garcar_events (
  id            uuid        primary key default gen_random_uuid(),
  event_type    text        not null,
  source_system text        not null default 'unknown',
  trace_id      text,
  payload       jsonb       not null default '{}',
  status        text        not null default 'pending'
                              check (status in ('pending', 'processed', 'failed')),
  error_detail  text,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);

create index if not exists garcar_events_event_type_idx
  on garcar_events (event_type);
create index if not exists garcar_events_source_idx
  on garcar_events (source_system);
create index if not exists garcar_events_created_at_idx
  on garcar_events (created_at desc);
create index if not exists garcar_events_pending_idx
  on garcar_events (status)
  where status = 'pending';
