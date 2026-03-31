-- 029_triage_audit_logs.sql
-- Logs lifecycle events for emergency triage assessments.

create table if not exists public.triage_audit_logs (
  id uuid primary key default uuid_generate_v4(),
  triage_id uuid not null references public.triage_assessments(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('created', 'status_updated', 'notes_updated')),
  old_status text null,
  new_status text null,
  notes text null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists triage_audit_logs_triage_id_idx on public.triage_audit_logs(triage_id);
create index if not exists triage_audit_logs_actor_user_id_idx on public.triage_audit_logs(actor_user_id);
create index if not exists triage_audit_logs_created_at_idx on public.triage_audit_logs(created_at desc);
