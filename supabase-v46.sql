-- ═══════════════════════════════════════════════════════════════════════
-- v46 · LLISTA DE COMPTES AMB DATA D'ALTA I ÚLTIM ACCÉS (v4.16)
--
-- EL PROBLEMA: la fila oberta de «Comptes registrats» repetia la mateixa
--   línia perquè no tenia res més a ensenyar: llista_comptes() no retornava
--   ni la data d'alta formatable ni l'últim accés (auth.users.last_sign_in_at).
--
-- LA SOLUCIÓ: llista_comptes() torna una columna més, ultim_acces.
--   Canvia el tipus de retorn: cal fer DROP + CREATE (create or replace no
--   deixa canviar el «returns table»). La resta (porta d'admin, ordenació,
--   abast) queda exactament igual que al v42.
--
-- Idempotent: es pot executar més d'un cop sense por.
-- ═══════════════════════════════════════════════════════════════════════

drop function if exists public.llista_comptes();

create function public.llista_comptes()
returns table (
  correu text,
  familia text,
  rol_compte text,
  rol_familia text,
  estat text,
  creat timestamptz,
  ultim_acces timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_grup uuid;
begin
  select fa.group_id into v_grup
    from profiles pa join families fa on fa.id = pa.family_id
   where pa.id = auth.uid() and fa.role = 'admin' and pa.status = 'aprovat';
  if v_grup is null then
    raise exception 'Només l''administrador pot veure la llista de comptes';
  end if;

  return query
  select u.email::text                                as correu,
         coalesce(f.name, '')::text                   as familia,
         (case when p.id is null        then 'sense perfil'
               when p.family_id is null then 'sense família'
               when f.owner_id = u.id   then 'titular'
               else 'progenitor' end)::text           as rol_compte,
         coalesce(f.role, '')::text                   as rol_familia,
         coalesce(p.status, '')::text                 as estat,
         u.created_at                                 as creat,
         u.last_sign_in_at                            as ultim_acces
    from auth.users u
    left join profiles p on p.id = u.id
    left join families f on f.id = p.family_id
   where f.group_id = v_grup
      or (p.id is not null and p.family_id is null
          and (p.requested_group = v_grup or p.requested_group is null))
      or p.id is null
   order by (p.family_id is null), lower(coalesce(f.name, '')), u.email;
end $$;

revoke all on function public.llista_comptes() from public, anon;
grant execute on function public.llista_comptes() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK · si vols desfer-ho, executa NOMÉS aquest bloc: torna la versió
-- del v42 (sense ultim_acces). El botó «Mostra els comptes» seguirà anant,
-- però l'últim accés sortirà buit.
-- ═══════════════════════════════════════════════════════════════════════
-- drop function if exists public.llista_comptes();
-- (i torna a executar el bloc «create or replace function public.llista_comptes»
--  del fitxer supabase-v42.sql)
