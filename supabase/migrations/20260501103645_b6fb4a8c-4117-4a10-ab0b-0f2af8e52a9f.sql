create table public.vibration_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  machine text not null,
  rms numeric not null,
  etat text not null,
  device_timestamp bigint,
  created_at timestamptz not null default now()
);

alter table public.vibration_history enable row level security;

create policy "Users view own history"
  on public.vibration_history for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users insert own history"
  on public.vibration_history for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users delete own history"
  on public.vibration_history for delete
  to authenticated
  using (auth.uid() = user_id);

create index vibration_history_user_created_idx
  on public.vibration_history (user_id, created_at desc);