-- ══════════════════════════════════════════════════════════════════
-- v4.1 · Executa TOT aquest fitxer al SQL Editor (New query → Run).
-- És segur re-executar-lo.
--
--   Fins ara qualsevol que entrés a l'app podia crear un grup nou. Ara cal
--   un CODI DE CREACIÓ DE GRUP.
--
--   IMPORTANT — on viu el codi: NO pot estar a index.html, que és públic
--   (qualsevol pot llegir-ne el codi font). Viu en una taula `app_config`
--   SENSE CAP POLÍTICA RLS, o sigui que cap client hi arriba mai
--   directament. Només s'hi accedeix per tres funcions security definer:
--     · create_group()            → el comprova (no el revela)
--     · codi_creacio_grup()       → el llegeix (només admin)
--     · set_codi_creacio_grup()   → el canvia (només admin)
--
--   ⚠ POSA-HI EL TEU CODI al pas 2 abans d'executar, o fes-ho després des
--   de la pantalla d'administració de l'app.
-- ══════════════════════════════════════════════════════════════════

-- ── 1 · Taula de configuració, tancada a cal i canto ──────────────
create table if not exists app_config (
  key         text primary key,
  value       text not null default '',
  updated_at  timestamptz default now(),
  updated_by  uuid
);
alter table app_config enable row level security;
-- Cap política a propòsit: amb RLS activat i zero polítiques, NINGÚ no hi
-- accedeix des del client. Les funcions security definer de sota sí.
revoke all on table app_config from anon, authenticated;

-- ── 2 · El codi de creació ────────────────────────────────────────
--    ⚠ CANVIA 'CANVIA-ME' pel codi que vulguis (mínim 4 caràcters).
--    Es compara sense distingir majúscules ni espais del voltant.
insert into app_config (key, value) values ('codi_creacio_grup', 'CANVIA-ME')
  on conflict (key) do nothing;

-- ── 3 · Llegir-lo i canviar-lo: només l'administrador ─────────────
create or replace function public.codi_creacio_grup() returns text as $$
begin
  if not is_admin() then raise exception 'Només l''administrador pot veure el codi de creació'; end if;
  return (select value from app_config where key = 'codi_creacio_grup');
end $$ language plpgsql security definer;

create or replace function public.set_codi_creacio_grup(p_codi text) returns void as $$
begin
  if not is_admin() then raise exception 'Només l''administrador pot canviar el codi de creació'; end if;
  if length(trim(coalesce(p_codi, ''))) < 4 then
    raise exception 'El codi de creació ha de tenir com a mínim 4 caràcters'; end if;
  update app_config set value = trim(p_codi), updated_at = now(), updated_by = auth.uid()
    where key = 'codi_creacio_grup';
end $$ language plpgsql security definer;

-- ── 4 · create_group ara exigeix el codi ──────────────────────────
-- S'esborra la signatura de 5 arguments perquè no quedi cap porta oberta:
-- si es deixés, es podria seguir creant grups sense codi cridant-la.
drop function if exists create_group(text, text, text, text, int);

create or replace function create_group(p_name text, p_cognom1 text, p_cognom2 text,
                                        p_driver text, p_seats int, p_codi text)
returns uuid as $$
declare v_gid uuid; v_fid uuid; v_codi text;
begin
  select value into v_codi from app_config where key = 'codi_creacio_grup';
  if coalesce(v_codi, '') = '' or upper(trim(coalesce(p_codi, ''))) <> upper(trim(v_codi)) then
    raise exception 'Codi de creació incorrecte';
  end if;
  -- l'override ha d'anar ABANS de l'insert: el trigger protect_family_role el comprova
  perform set_config('app.admin_override', 'on', true);
  insert into groups (name, invite_code, created_by)
    values (p_name, upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)), auth.uid())
    returning id into v_gid;
  insert into families (group_id, cognom1, cognom2, name, driver, seats, role)
    values (v_gid, p_cognom1, coalesce(p_cognom2,''),
            trim(p_cognom1 || ' ' || coalesce(p_cognom2,'')), p_driver, coalesce(p_seats,3), 'admin')
    returning id into v_fid;
  insert into profiles (id, email, family_id, requested_group, status, consent_at)
    values (auth.uid(), (select email from auth.users where id = auth.uid()), v_fid, v_gid, 'aprovat', now())
    on conflict (id) do update set family_id = v_fid, requested_group = v_gid, status = 'aprovat';
  insert into activity_log (group_id, actor_id, family_id, action, details)
    values (v_gid, auth.uid(), v_fid, 'alta família', 'Grup ' || p_name || ' creat');
  return v_gid;
end $$ language plpgsql security definer;

-- ══ VERIFICACIÓ ══════════════════════════════════════════════════
-- 1) La taula no s'ha de poder llegir des del client (imitant un usuari):
--      select * from app_config;            → 0 files o permission denied
-- 2) Com a ADMIN:
--      select codi_creacio_grup();          → el teu codi
--      select set_codi_creacio_grup('ABCD1234');
-- 3) Com a usuari normal:
--      select codi_creacio_grup();          → excepció «Només l'administrador…»
-- 4) Ha de quedar UNA sola create_group, amb 6 arguments:
--      select proname, pronargs from pg_proc where proname = 'create_group';
-- 5) A l'app: crear un grup amb un codi dolent → «Codi de creació incorrecte».

-- ══ ROLLBACK ═════════════════════════════════════════════════════
-- drop function if exists create_group(text, text, text, text, int, text);
-- create or replace function create_group(p_name text, p_cognom1 text, p_cognom2 text,
--                                         p_driver text, p_seats int)
-- returns uuid as $$
-- declare v_gid uuid; v_fid uuid;
-- begin
--   perform set_config('app.admin_override', 'on', true);
--   insert into groups (name, invite_code, created_by)
--     values (p_name, upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)), auth.uid())
--     returning id into v_gid;
--   insert into families (group_id, cognom1, cognom2, name, driver, seats, role)
--     values (v_gid, p_cognom1, coalesce(p_cognom2,''),
--             trim(p_cognom1 || ' ' || coalesce(p_cognom2,'')), p_driver, coalesce(p_seats,3), 'admin')
--     returning id into v_fid;
--   insert into profiles (id, email, family_id, requested_group, status, consent_at)
--     values (auth.uid(), (select email from auth.users where id = auth.uid()), v_fid, v_gid, 'aprovat', now())
--     on conflict (id) do update set family_id = v_fid, requested_group = v_gid, status = 'aprovat';
--   insert into activity_log (group_id, actor_id, family_id, action, details)
--     values (v_gid, auth.uid(), v_fid, 'alta família', 'Grup ' || p_name || ' creat');
--   return v_gid;
-- end $$ language plpgsql security definer;
-- drop function if exists public.codi_creacio_grup();
-- drop function if exists public.set_codi_creacio_grup(text);
-- drop table if exists app_config;
