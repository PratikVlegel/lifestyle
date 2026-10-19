-- Opt-in community leaderboard with aggregated movement metrics only.
create table if not exists public.community_kpis (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  metric text not null check (metric in ('steps', 'activity_minutes')),
  period_type text not null check (period_type in ('daily', 'weekly', 'monthly')),
  period_start date not null,
  value integer not null check (value between 0 and 1000000),
  days_count smallint not null check (days_count between 1 and 31),
  updated_at timestamptz not null default now(),
  primary key (user_id, metric, period_type, period_start),
  check ((period_type <> 'weekly' or extract(isodow from period_start) = 1) and (period_type <> 'monthly' or extract(day from period_start) = 1))
);
create index if not exists community_kpis_board_idx on public.community_kpis (period_type, period_start, metric, value desc);
alter table public.community_kpis enable row level security;
grant select, insert, update, delete on public.community_kpis to authenticated;
drop policy if exists "community KPI cijfers lezen voor leden" on public.community_kpis;
create policy "community KPI cijfers lezen voor leden" on public.community_kpis for select to authenticated using (public.is_member());
drop policy if exists "eigen community KPI delen" on public.community_kpis;
create policy "eigen community KPI delen" on public.community_kpis for insert to authenticated with check (user_id = auth.uid() and public.is_member());
drop policy if exists "eigen community KPI aanpassen" on public.community_kpis;
create policy "eigen community KPI aanpassen" on public.community_kpis for update to authenticated using (user_id = auth.uid() and public.is_member()) with check (user_id = auth.uid() and public.is_member());
drop policy if exists "eigen community KPI verwijderen" on public.community_kpis;
create policy "eigen community KPI verwijderen" on public.community_kpis for delete to authenticated using (user_id = auth.uid() and public.is_member());
