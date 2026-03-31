-- Log password reset requests for audit/monitoring
create table if not exists public.password_reset_events (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);

comment on table public.password_reset_events is 'Records when a password reset email was requested for an account.';
comment on column public.password_reset_events.email is 'Email address the reset was requested for.';
