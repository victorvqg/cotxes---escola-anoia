-- ═══════════════════════════════════════════════════════════════════
-- Cotxes · Escola Anoia — SQL v3.6 (idempotent: segur de re-executar)
-- 1 · Reanomena el grup: EA 25/26 → EA 26/27
-- 2 · Codis d'accés: invite_token deixa d'arribar a la lectura general;
--     només es llegeix via RPC (propi codi o llista d'admin)
-- 3 · Consultes de verificació al final
-- ═══════════════════════════════════════════════════════════════════

-- 1 · Rename del grup (només aquest; idempotent)
update public.groups set name = 'EA 26/27' where invite_code = '31C4C1';

-- 2a · invite_token fora de la lectura general: grants per columna
revoke select on public.families from authenticated;
grant select (id, group_id, name, cognom1, cognom2, driver, seats,
              phone, phone_visible, curs, role, created_at)
  on public.families to authenticated;
-- (insert/update/delete no es toquen; RLS i les RPC security definer
--  segueixen funcionant perquè s'executen amb el rol del propietari)

-- 2b · El codi d'UNA família: només si és la teva o ets admin
create or replace function public.codi_familia(p_family uuid) returns text as $$
declare v_fam uuid; v_token uuid;
begin
  select family_id into v_fam from profiles where id = auth.uid();
  if not (v_fam = p_family or is_admin()) then
    raise exception 'No tens permís per veure aquest codi';
  end if;
  select invite_token into v_token from families where id = p_family;
  if v_token is null then raise exception 'Família inexistent'; end if;
  return upper(left(replace(v_token::text, '-', ''), 8));
end $$ language plpgsql security definer stable;

-- 2c · Tots els codis del grup: només l'admin
create or replace function public.codis_families()
returns table(id uuid, nom text, codi text, n_comptes bigint) as $$
begin
  if not is_admin() then raise exception 'Només l’administrador pot veure tots els codis'; end if;
  return query
    select f.id, f.name,
           upper(left(replace(f.invite_token::text, '-', ''), 8)),
           (select count(*) from profiles p where p.family_id = f.id)
    from families f
    where f.group_id = my_group()
    order by f.name;
end $$ language plpgsql security definer stable;

-- 2d · Regenerar el codi d'una família (només admin; queda al log)
create or replace function public.regenera_codi(p_family uuid) returns text as $$
declare v_nom text;
begin
  if not is_admin() then raise exception 'Només l’administrador pot regenerar codis'; end if;
  update families set invite_token = gen_random_uuid()
  where id = p_family and group_id = my_group()
  returning name into v_nom;
  if v_nom is null then raise exception 'Família inexistent'; end if;
  insert into activity_log (group_id, actor_id, family_id, affected_family_id, action, details)
    values (my_group(), auth.uid(),
            (select family_id from profiles where id = auth.uid()),
            p_family, 'codi regenerat', 'Codi de família regenerat: ' || v_nom);
  return (select codi_familia(p_family));
end $$ language plpgsql security definer;

-- ══ 3 · Verificació ══
-- Com a usuari NORMAL (Authentication → imita un usuari no admin):
--   select invite_token from families;        → HA DE FALLAR (permission denied)
--   select * from codis_families();           → HA DE FALLAR (exception)
--   select codi_familia('<la-meva-família>'); → retorna el teu codi
-- Com a ADMIN:
--   select * from codis_families();           → llista completa amb comptes
--   select name from groups where invite_code = '31C4C1';  → 'EA 26/27'
