-- ═══════════════════════════════════════════════════════════════════════
-- v51 · AVISAR ELS AFECTATS QUAN UNA FAMÍLIA MARXA DEL GRUP (v4.38, tasca 2 · cas c)
--
-- EL PROBLEMA: esborra_familia() (el «Surt del grup» del Perfil) esborra la
--   fila de families, i les foreign keys en cascada (assignments.driver_
--   family_id, children.family_id → assignments.child_id) es carreguen en
--   silenci: (1) si la família que marxa CONDUÏA, els nens que hi pujaven
--   es queden sense cotxe sense que ningú els avisi; (2) si els FILLS de la
--   família que marxa pujaven al cotxe d'una ALTRA família, aquell
--   conductor perd un passatger sense saber-ho.
--
-- LA SOLUCIÓ: just abans de l'esborrat (dins la mateixa transacció), es
--   consulten les assignacions dels dos costats i s'insereix un avís per a
--   cada família afectada, amb el mateix format que fa servir el client
--   (family_name, child_name, action, detail, actor_name — columnes del
--   v45). Les hores/dies es mapegen igual que FRANGES/DIES_NOM al client:
--   si mai es canvien allà, cal actualitzar-los aquí també.
--
-- Idempotent: es pot executar més d'un cop sense por (create or replace).
-- ═══════════════════════════════════════════════════════════════════════

create or replace function esborra_familia(p_family uuid) returns void as $$
declare v_group uuid; v_nom text;
begin
  select group_id, name into v_group, v_nom from families where id = p_family;
  if v_group is null then raise exception 'Família inexistent'; end if;
  if not ((my_family() = p_family and es_titular(p_family)) or is_admin()) then
    raise exception 'Només el titular de la família pot fer canvis'; end if;
  if (select role from families where id = p_family) = 'admin' and my_family() = p_family then
    if exists (select 1 from families where group_id = v_group and id <> p_family) then
      raise exception 'Ets l''administrador: transfereix el rol o esborra primer la resta de famílies'; end if;
  end if;
  perform set_config('app.admin_override', 'on', true);

  -- v51 · cas (c-1): la família marxa i CONDUÏA — avisa els passatgers
  insert into notifications (family_id, message, family_name, child_name, action, detail, actor_name)
  select c.family_id,
         c.name || ' s''ha quedat sense cotxe al viatge ' ||
           (case a.day when 'dl' then 'Dilluns' when 'dt' then 'Dimarts' when 'dc' then 'Dimecres' when 'dj' then 'Dijous' else 'Divendres' end)
           || ' ' || (case a.slot when 'e8' then '7.35' when 'e9' then '8.35' when 'r13' then '13.00' when 'e15' then '14.35' else '17.00' end)
           || ': ' || v_nom || ' ha marxat del grup i ja no el porta. Cal buscar-li plaça.',
         (select f2.name from families f2 where f2.id = c.family_id),
         c.name,
         'es queda sense cotxe',
         c.name || ' s''ha quedat sense cotxe al viatge ' ||
           (case a.day when 'dl' then 'Dilluns' when 'dt' then 'Dimarts' when 'dc' then 'Dimecres' when 'dj' then 'Dijous' else 'Divendres' end)
           || ' ' || (case a.slot when 'e8' then '7.35' when 'e9' then '8.35' when 'r13' then '13.00' when 'e15' then '14.35' else '17.00' end)
           || ': ' || v_nom || ' ha marxat del grup i ja no el porta. Cal buscar-li plaça.',
         v_nom
    from assignments a join children c on c.id = a.child_id
   where a.driver_family_id = p_family;

  -- v51 · cas (c-2): els FILLS de la família que marxa pujaven al cotxe d'una altra família
  insert into notifications (family_id, message, family_name, child_name, action, detail, actor_name)
  select a.driver_family_id,
         c.name || ' ja no forma part de la família ' || v_nom || ' (ha marxat del grup) i ha deixat el teu cotxe del viatge ' ||
           (case a.day when 'dl' then 'Dilluns' when 'dt' then 'Dimarts' when 'dc' then 'Dimecres' when 'dj' then 'Dijous' else 'Divendres' end)
           || ' ' || (case a.slot when 'e8' then '7.35' when 'e9' then '8.35' when 'r13' then '13.00' when 'e15' then '14.35' else '17.00' end)
           || '. Tens un seient més lliure.',
         (select f3.name from families f3 where f3.id = a.driver_family_id),
         c.name,
         'es queda sense cotxe',
         c.name || ' ja no forma part de la família ' || v_nom || ' (ha marxat del grup) i ha deixat el teu cotxe del viatge ' ||
           (case a.day when 'dl' then 'Dilluns' when 'dt' then 'Dimarts' when 'dc' then 'Dimecres' when 'dj' then 'Dijous' else 'Divendres' end)
           || ' ' || (case a.slot when 'e8' then '7.35' when 'e9' then '8.35' when 'r13' then '13.00' when 'e15' then '14.35' else '17.00' end)
           || '. Tens un seient més lliure.',
         v_nom
    from children c join assignments a on a.child_id = c.id
   where c.family_id = p_family and a.driver_family_id <> p_family;

  update profiles set family_id = null, status = 'pendent' where family_id = p_family;
  insert into activity_log (group_id, actor_id, family_id, affected_family_id, action, details)
    values (v_group, auth.uid(), my_family(), p_family, 'baixa família', v_nom || ' esborrada');
  update activity_log set actor_id = null, details = '' where family_id = p_family and action <> 'baixa família';
  update activity_log set affected_family_id = null where affected_family_id = p_family;
  delete from families where id = p_family;
end $$ language plpgsql security definer;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK · si vols desfer-ho, executa NOMÉS aquest bloc (torna la versió
-- sense avisos; els avisos que ja s'hagin generat es queden a notifications,
-- no es toquen):
-- ═══════════════════════════════════════════════════════════════════════
-- create or replace function esborra_familia(p_family uuid) returns void as $$
-- declare v_group uuid; v_nom text;
-- begin
--   select group_id, name into v_group, v_nom from families where id = p_family;
--   if v_group is null then raise exception 'Família inexistent'; end if;
--   if not ((my_family() = p_family and es_titular(p_family)) or is_admin()) then
--     raise exception 'Només el titular de la família pot fer canvis'; end if;
--   if (select role from families where id = p_family) = 'admin' and my_family() = p_family then
--     if exists (select 1 from families where group_id = v_group and id <> p_family) then
--       raise exception 'Ets l''administrador: transfereix el rol o esborra primer la resta de famílies'; end if;
--   end if;
--   perform set_config('app.admin_override', 'on', true);
--   update profiles set family_id = null, status = 'pendent' where family_id = p_family;
--   insert into activity_log (group_id, actor_id, family_id, affected_family_id, action, details)
--     values (v_group, auth.uid(), my_family(), p_family, 'baixa família', v_nom || ' esborrada');
--   update activity_log set actor_id = null, details = '' where family_id = p_family and action <> 'baixa família';
--   update activity_log set affected_family_id = null where affected_family_id = p_family;
--   delete from families where id = p_family;
-- end $$ language plpgsql security definer;
