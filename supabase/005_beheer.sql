-- Beheerders kunnen vanuit de app uitnodigingscodes maken, bekijken en intrekken.
-- Wie lid wordt met een code waarbij grants_admin = true, wordt beheerder.

alter table public.invite_codes add column if not exists grants_admin boolean not null default false;
alter table public.members add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.members where user_id = auth.uid()), false);
$$;
grant execute on function public.is_admin() to authenticated;

create or replace function public.redeem_invite(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v text; adm boolean;
begin
  if auth.uid() is null then raise exception 'niet aangemeld'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then return true; end if;
  update public.invite_codes set uses = uses + 1
   where upper(code) = upper(trim(p_code)) and active and uses < max_uses
   returning code, grants_admin into v, adm;
  if v is null then return false; end if;
  insert into public.members (user_id, code, is_admin) values (auth.uid(), v, coalesce(adm, false));
  return true;
end $$;

create or replace function public.create_invite(p_label text, p_max int default 1) returns text
language plpgsql security definer set search_path = public as $$
declare pre text; c text; i int := 0;
begin
  if not public.is_admin() then raise exception 'geen beheerder'; end if;
  if p_max < 1 or p_max > 100 then raise exception 'aantal tussen 1 en 100'; end if;
  pre := left(upper(regexp_replace(coalesce(p_label, ''), '[^A-Za-z]', '', 'g')), 8);
  if pre = '' then pre := 'GAST'; end if;
  loop
    c := pre || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)) || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
    exit when not exists (select 1 from public.invite_codes where code = c);
    i := i + 1; if i > 5 then raise exception 'kon geen unieke code maken'; end if;
  end loop;
  insert into public.invite_codes (code, label, max_uses) values (c, left(p_label, 80), p_max);
  return c;
end $$;

create or replace function public.list_invites()
returns table (code text, label text, max_uses int, uses int, active boolean, created_at timestamptz, members bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'geen beheerder'; end if;
  return query select i.code, i.label, i.max_uses, i.uses, i.active, i.created_at,
    (select count(*) from public.members m where m.code = i.code)
    from public.invite_codes i order by i.created_at desc;
end $$;

create or replace function public.set_invite_active(p_code text, p_active boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'geen beheerder'; end if;
  update public.invite_codes set active = p_active where code = p_code and not grants_admin;
  return found;
end $$;

revoke all on function public.create_invite(text, int) from public, anon;
revoke all on function public.list_invites() from public, anon;
revoke all on function public.set_invite_active(text, boolean) from public, anon;
grant execute on function public.create_invite(text, int) to authenticated;
grant execute on function public.list_invites() to authenticated;
grant execute on function public.set_invite_active(text, boolean) to authenticated;
