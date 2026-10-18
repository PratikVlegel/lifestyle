-- Dubbele producten opruimen en voortaan voorkomen.
-- Een product is "hetzelfde" bij dezelfde naam, hetzelfde merk en dezelfde kcal (hoofdletters tellen niet).

delete from public.foods f
using public.foods g
where lower(f.name) = lower(g.name)
  and lower(coalesce(f.brand, '')) = lower(coalesce(g.brand, ''))
  and f.kcal is not distinct from g.kcal
  and (g.created_at, g.id) < (f.created_at, f.id);

create unique index if not exists foods_uniek_idx
  on public.foods (lower(name), lower(coalesce(brand, '')), coalesce(kcal, -1));
