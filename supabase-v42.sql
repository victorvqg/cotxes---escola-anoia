-- ═══════════════════════════════════════════════════════════════════════
-- v42 · LLISTA DE COMPTES PER A L'ADMINISTRADOR (v4.5)
--
-- EL PROBLEMA: no hi havia cap lloc on veure tots els comptes registrats,
--   el seu correu i a quina família estan vinculats. Els correus viuen a
--   auth.users, que cap client no pot llegir per RLS ni per permisos.
--
-- LA SOLUCIÓ: una funció SECURITY DEFINER que només respon a
--   l'administrador del grup (staff NO) i retorna, per cada compte:
--   correu · família · rol de compte · rol de família · estat.
--
--   Rols de compte possibles (no n'hi ha cap altre a l'esquema):
--     titular       → el compte és families.owner_id (qui pot editar)
--     progenitor    → segon compte vinculat a la família (només lectura)
--     sense família → compte amb perfil però encara no vinculat
--     sense perfil  → alta a mitges (existeix a auth.users i prou)
--   Els nens NO tenen compte: són files de children penjades de la família.
--
-- Idempotent: es pot executar més d'un cop sense por.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.llista_comptes()
returns table (
  correu text,
  familia text,
  rol_compte text,
  rol_familia text,
  estat text,
  creat timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_grup uuid;
begin
  -- només l'admin aprovat del grup (mateixa condició que la RLS d'activity_log)
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
         u.created_at                                 as creat
    from auth.users u
    left join profiles p on p.id = u.id
    left join families f on f.id = p.family_id
   -- comptes del meu grup + comptes sense família (que hi volen entrar o
   -- encara no han triat grup) + altes a mitges sense perfil
   where f.group_id = v_grup
      or (p.id is not null and p.family_id is null
          and (p.requested_group = v_grup or p.requested_group is null))
      or p.id is null
   order by (p.family_id is null), lower(coalesce(f.name, '')), u.email;
end $$;

-- els correus són dades personals: ningú anònim, i l'autenticat només
-- arriba a la funció (que per dins exigeix ser l'admin)
revoke all on function public.llista_comptes() from public, anon;
grant execute on function public.llista_comptes() to authenticated;
