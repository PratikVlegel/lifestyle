-- Uitnodigingscodes: alleen leden kunnen de gedeelde bibliotheek en recepten lezen of aanvullen.
-- Nieuwe code maken (bv. in de SQL editor of de Table editor van Supabase):
--   insert into public.invite_codes (code, label, max_uses) values ('NAAM-ABCD-EFGH', 'voor Jan', 1);
-- Code intrekken:
--   update public.invite_codes set active = false where code = 'NAAM-ABCD-EFGH';

create table if not exists public.invite_codes (
  code        text primary key check (char_length(code) between 6 and 40),
  label       text,
  max_uses    int not null default 1 check (max_uses > 0),
  uses        int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.invite_codes enable row level security;  -- geen policies: niemand leest codes via de API

create table if not exists public.members (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  code       text references public.invite_codes(code) on delete set null,
  joined_at  timestamptz not null default now()
);
alter table public.members enable row level security;
drop policy if exists "eigen lidmaatschap" on public.members;
create policy "eigen lidmaatschap" on public.members for select to authenticated using (user_id = auth.uid());

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid());
$$;

create or replace function public.redeem_invite(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if auth.uid() is null then raise exception 'niet aangemeld'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then return true; end if;
  update public.invite_codes set uses = uses + 1
   where upper(code) = upper(trim(p_code)) and active and uses < max_uses
   returning code into v;
  if v is null then return false; end if;
  insert into public.members (user_id, code) values (auth.uid(), v);
  return true;
end $$;

revoke all on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.is_member() to anon, authenticated;

-- Bestaande regels vervangen door regels met lidmaatschap.
drop policy if exists "iedereen leest" on public.foods;
drop policy if exists "leden lezen" on public.foods;
create policy "leden lezen" on public.foods for select to authenticated using (public.is_member());
drop policy if exists "ingelogd toevoegen" on public.foods;
drop policy if exists "leden toevoegen" on public.foods;
create policy "leden toevoegen" on public.foods for insert to authenticated with check (created_by = auth.uid() and public.is_member());
drop policy if exists "eigen producten aanpassen" on public.foods;
create policy "eigen producten aanpassen" on public.foods for update to authenticated using (created_by = auth.uid() and public.is_member()) with check (created_by = auth.uid());

drop policy if exists "recepten lezen" on public.shared_preps;
create policy "recepten lezen" on public.shared_preps for select to authenticated using (public.is_member());
drop policy if exists "recepten toevoegen" on public.shared_preps;
create policy "recepten toevoegen" on public.shared_preps for insert to authenticated with check (created_by = auth.uid() and public.is_member());

drop policy if exists "reviews lezen" on public.prep_reviews;
create policy "reviews lezen" on public.prep_reviews for select to authenticated using (public.is_member());
drop policy if exists "review toevoegen" on public.prep_reviews;
create policy "review toevoegen" on public.prep_reviews for insert to authenticated with check (created_by = auth.uid() and public.is_member());

drop policy if exists "foto uploaden" on storage.objects;
create policy "foto uploaden" on storage.objects for insert to authenticated
  with check (bucket_id = 'prep-photos' and (storage.foldername(name))[1] = auth.uid()::text and public.is_member());

-- Codes zelf maak je in Supabase (zie bovenaan); ze staan bewust niet in deze openbare repo.
