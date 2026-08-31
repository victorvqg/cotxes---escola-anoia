-- ═══════════════════════════════════════════════════════════════════════
-- v44 · ESBORRAR UN COMPTE DES DEL PANELL D'ADMIN (v4.13)
--
-- EL PROBLEMA: no es podia esborrar cap compte des de l'app. Esborrar una
--   fila d'auth.users no es pot fer des del navegador amb la clau normal, i
--   a més CAP referència cap a auth.users no té «on delete cascade»
--   (profiles.id, weekly_marks.updated_by, assignments.updated_by,
--   activity_log.actor_id, groups.created_by, notification_reads.user_id,
--   join_requests.user_id): un DELETE directe petaria per claus foranes.
--
-- LA SOLUCIÓ: esborra_compte(correu), SECURITY DEFINER (el propietari de la
--   funció sí que pot esborrar d'auth.users), cridable només per l'admin
--   aprovat del grup, mai sobre si mateix. Segons el cas:
--     · sense família        → s'esborra el compte i prou
--     · progenitor           → compte fora; la família es queda igual
--     · titular amb 2n compte→ l'altre compte passa a titular (owner_id)
--     · titular únic         → cau també la família sencera (fills, graella
--                              i assignacions cauen en cascada des de families)
--   Retorna la llista de tot el que ha fet.
--
-- També s'amplia el CHECK d'activity_log amb l'acció 'baixa compte'
-- (16 accions: superconjunt de la llista del v40 — cap fila existent queda fora).
--
-- Idempotent: es pot executar més d'un cop sense por.
-- ═══════════════════════════════════════════════════════════════════════

alter table activity_log drop constraint if exists activity_log_action_check;
alter table activity_log add constraint activity_log_action_check check (action in (
  'alta família','baixa família','edició perfil','alta fill','baixa fill',
  'canvi graella','assignació creada','assignació eliminada',
  'canvi de rol','aprovació d''accés','rebutjada d''accés','acció automàtica',
  'esborrat graella','codi regenerat','desvinculació',
  'baixa compte'   -- v44 · esborra_compte()
));

create or replace function public.esborra_compte(p_correu text)
returns text[] language plpgsql security definer set search_path = public as $$
declare
  v_grup uuid; v_uid uuid; v_fid uuid; v_fnom text;
  v_titular boolean; v_altre uuid; v_nens int;
  v_fets text[] := '{}';
begin
  -- només l'admin aprovat del grup (mateixa porta que llista_comptes)
  select fa.group_id into v_grup
    from profiles pa join families fa on fa.id = pa.family_id
   where pa.id = auth.uid() and fa.role = 'admin' and pa.status = 'aprovat';
  if v_grup is null then
    raise exception 'Només l''administrador pot esborrar comptes'; end if;

  select u.id into v_uid from auth.users u where lower(u.email) = lower(trim(p_correu));
  if v_uid is null then
    raise exception 'No hi ha cap compte amb el correu %', p_correu; end if;
  if v_uid = auth.uid() then
    raise exception 'No pots esborrar el teu propi compte d''administrador'; end if;

  select p.family_id into v_fid from profiles p where p.id = v_uid;
  if v_fid is not null and not exists (select 1 from families f where f.id = v_fid and f.group_id = v_grup) then
    raise exception 'Aquest compte no és del teu grup'; end if;
  if v_fid is null and exists (select 1 from profiles p where p.id = v_uid
        and p.requested_group is not null and p.requested_group <> v_grup) then
    raise exception 'Aquest compte no és del teu grup'; end if;

  v_fets := v_fets || ('compte ' || lower(trim(p_correu)) || ' esborrat');

  if v_fid is not null then
    select f.name, (f.owner_id is null or f.owner_id = v_uid) into v_fnom, v_titular
      from families f where f.id = v_fid;
    select p2.id into v_altre from profiles p2
     where p2.family_id = v_fid and p2.id <> v_uid limit 1;

    if v_titular and v_altre is not null then
      -- el 2n compte (progenitor) passa a titular; la família es queda igual
      update families set owner_id = v_altre where id = v_fid;
      v_fets := v_fets || ('l''altre compte de la família ' || v_fnom || ' passa a titular');
    elsif v_titular then
      -- titular únic: cau la família sencera (children/weekly_marks/assignments/
      -- notifications cauen en cascada des de families; les assignacions dels
      -- fills als cotxes d'altres cauen per la cascada de children → assignments)
      select count(*) into v_nens from children where family_id = v_fid;
      perform set_config('app.admin_override', 'on', true);
      update profiles set family_id = null, status = 'pendent' where family_id = v_fid;
      insert into activity_log (group_id, actor_id, family_id, affected_family_id, action, details)
        values (v_grup, auth.uid(), my_family(), v_fid, 'baixa família', v_fnom || ' esborrada (compte esborrat)');
      update activity_log set actor_id = null, details = '' where family_id = v_fid and action <> 'baixa família';
      update activity_log set affected_family_id = null where affected_family_id = v_fid;
      delete from families where id = v_fid;
      v_fets := v_fets || ('família ' || v_fnom || ' esborrada, amb ' || v_nens || ' fill(s), la seva graella i les places que ocupaven als cotxes');
    else
      v_fets := v_fets || ('compte desvinculat de la família ' || v_fnom || ' (la família es queda igual)');
    end if;
  end if;

  -- referències soltes cap al compte (cap no té cascade)
  delete from notification_reads where user_id = v_uid;
  delete from join_requests where user_id = v_uid;
  update weekly_marks set updated_by = null where updated_by = v_uid;
  update assignments set updated_by = null where updated_by = v_uid;
  update activity_log set actor_id = null where actor_id = v_uid;
  update groups set created_by = null where created_by = v_uid;
  update families set owner_id = null where owner_id = v_uid;
  delete from profiles where id = v_uid;
  delete from auth.users where id = v_uid;

  insert into activity_log (group_id, actor_id, family_id, action, details)
    values (v_grup, auth.uid(), my_family(), 'baixa compte', lower(trim(p_correu)));
  return v_fets;
end $$;

-- ningú anònim; l'autenticat només arriba a la funció (que exigeix l'admin per dins)
revoke all on function public.esborra_compte(text) from public, anon;
grant execute on function public.esborra_compte(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK · si vols desfer-ho, executa NOMÉS aquest bloc (els comptes ja
-- esborrats no es recuperen; això només treu la funció i torna el CHECK
-- del v40 amb 15 accions — compte: si ja hi ha files 'baixa compte' al
-- registre, deixa-hi la llista de 16):
-- ═══════════════════════════════════════════════════════════════════════
-- drop function if exists public.esborra_compte(text);
-- alter table activity_log drop constraint if exists activity_log_action_check;
-- alter table activity_log add constraint activity_log_action_check check (action in (
--   'alta família','baixa família','edició perfil','alta fill','baixa fill',
--   'canvi graella','assignació creada','assignació eliminada',
--   'canvi de rol','aprovació d''accés','rebutjada d''accés','acció automàtica',
--   'esborrat graella','codi regenerat','desvinculació'
-- ));
