-- 030_billing_audit_logs.sql
-- Logs lifecycle events for invoices and billing actions.

create table if not exists public.billing_audit_logs (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('created', 'updated', 'payment_recorded', 'status_changed')),
  old_status text null,
  new_status text null,
  amount numeric null,
  metadata jsonb null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists billing_audit_logs_invoice_id_idx on public.billing_audit_logs(invoice_id);
create index if not exists billing_audit_logs_actor_user_id_idx on public.billing_audit_logs(actor_user_id);
create index if not exists billing_audit_logs_created_at_idx on public.billing_audit_logs(created_at desc);
