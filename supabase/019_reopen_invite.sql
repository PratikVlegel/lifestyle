-- Uitnodigingscode opnieuw bruikbaar maken.
-- Een opgebruikte (of ingetrokken) code krijgt extra gebruiken en wordt weer actief.
-- De teller "uses" blijft behouden, zodat je ziet hoe vaak de code in totaal gebruikt is.
-- Beheerderscodes (grants_admin) blijven uitgesloten, net als bij set_invite_active.

create or replace function public.reopen_invite(p_code text, p_extra int default 1) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'geen beheerder'; end if;
  if p_extra is null or p_extra < 1 or p_extra > 100 then raise exception 'aantal tussen 1 en 100'; end if;
  update public.invite_codes
     set max_uses = greatest(max_uses, uses) + p_extra,
         active = true
   where code = p_code and not grants_admin;
  return found;
end $$;

revoke all on function public.reopen_invite(text, int) from public, anon;
grant execute on function public.reopen_invite(text, int) to authenticated;
