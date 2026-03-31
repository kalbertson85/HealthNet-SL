-- 031_lab_audit_logs.sql
-- Logs lifecycle events for laboratory tests.

create table if not exists public.lab_audit_logs (
  id uuid primary key default uuid_generate_v4(),
  lab_test_id uuid not null references public.lab_tests(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('created', 'status_updated', 'sample_collected', 'sample_received', 'result_entered', 'cancelled')),
  old_status text null,
  new_status text null,
  notes text null,
  metadata jsonb null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists lab_audit_logs_lab_test_id_idx on public.lab_audit_logs(lab_test_id);
create index if not exists lab_audit_logs_actor_user_id_idx on public.lab_audit_logs(actor_user_id);
create index if not exists lab_audit_logs_created_at_idx on public.lab_audit_logs(created_at desc);
