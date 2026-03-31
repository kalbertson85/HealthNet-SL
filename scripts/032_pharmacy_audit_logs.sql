-- 032_pharmacy_audit_logs.sql
-- Logs lifecycle events for prescriptions and pharmacy dispensing.

create table if not exists public.pharmacy_audit_logs (
  id uuid primary key default uuid_generate_v4(),
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('created', 'dispensed', 'status_updated', 'cancelled')),
  old_status text null,
  new_status text null,
  notes text null,
  metadata jsonb null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists pharmacy_audit_logs_prescription_id_idx on public.pharmacy_audit_logs(prescription_id);
create index if not exists pharmacy_audit_logs_actor_user_id_idx on public.pharmacy_audit_logs(actor_user_id);
create index if not exists pharmacy_audit_logs_created_at_idx on public.pharmacy_audit_logs(created_at desc);
