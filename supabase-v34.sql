-- ═══════════════════════════════════════════════════════════════════
-- Cotxes · Escola Anoia — SQL v3.4 (idempotent)
-- Canvi: families_per_reclamar retorna les dades actuals de la família
-- (conductor, places, curs, nens) perquè el segon compte vegi el que
-- reclama ABANS de confirmar, sense haver d'omplir cap formulari.
-- Executa'l SENCER al SQL Editor de Supabase un cop publicada la v3.4.
-- ═══════════════════════════════════════════════════════════════════

-- Cal DROP perquè canvia el tipus de retorn de la funció
drop function if exists public.families_per_reclamar(uuid);

create or replace function public.families_per_reclamar(p_group uuid)
returns table(id uuid, name text, driver text, seats integer, curs text, nens text) as $$
  select f.id, f.name, coalesce(f.driver, ''), f.seats, coalesce(f.curs, ''),
         coalesce((select string_agg(c.name, ', ' order by c.name)
                   from children c where c.family_id = f.id), '')
  from families f
  where f.group_id = p_group
    and (select count(*) from profiles p where p.family_id = f.id) < 2
  order by f.name
$$ language sql security definer stable;
