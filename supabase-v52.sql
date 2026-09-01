-- ═══════════════════════════════════════════════════════════════════════
-- v52 · ID D'AVÍS «A.B.C» (v4.39) — grup · família · avís, ESTABLE
--
-- COMPROVACIÓ (tasca 1): avui notifications.id és un uuid intern; no hi ha
--   cap numeració visible enlloc. Ni groups ni families tenen cap columna
--   de número: calen columnes noves i persistir-les (mai calcular-les al
--   vol, perquè si s'esborra una família pel mig els números es mourien).
--
-- COMPROVACIÓ (tasca 2): el codi client (desa()) ja és correcte des del
--   v4.38 — un sol desat no repeteix mai un avís. El que pot quedar és
--   files JA GUARDADES a la BD de duplicats vells (si el SQL v50 encara no
--   s'ha executat). Per no dependre de si allò s'ha fet o no, aquesta
--   migració INCLOU la mateixa neteja (secció 1) abans de numerar: si ja
--   estava net, la secció 1 no troba res a fer i no canvia res.
--
-- QUÈ FA:
--   1 · neteja (idèntica al v50, reversible amb còpia de seguretat)
--   2 · columna numero a groups / families / notifications
--   3 · backfill per ordre de creació (created_at, id de desempat)
--   4 · triggers que assignen el següent número EN CREAR (amb pany
--       consultiu per fila perquè dues insercions gairebé simultànies mai
--       repeteixin número)
--
-- Idempotent: es pot executar més d'un cop sense por.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1 · neteja dels avisos repetits (igual que v50; no fa res si ja està net) ──
select family_id, child_name, action, detail, date_trunc('second', created_at) as segon, count(*) as repeticions
  from notifications
 group by family_id, child_name, action, detail, date_trunc('second', created_at)
having count(*) > 1
 order by repeticions desc;

create table if not exists notifications_dup_backup_v52 as
select n.*
  from notifications n
  join (
    select id, row_number() over (
      partition by family_id, child_name, action, detail, date_trunc('second', created_at)
      order by created_at asc, id asc
    ) as rn
    from notifications
  ) r on r.id = n.id
 where r.rn > 1;

delete from notifications n
 using (
   select id, row_number() over (
     partition by family_id, child_name, action, detail, date_trunc('second', created_at)
     order by created_at asc, id asc
   ) as rn
   from notifications
 ) r
 where r.id = n.id and r.rn > 1;

-- ── 2 · columnes noves ──
alter table groups        add column if not exists numero int;
alter table families      add column if not exists numero int;
alter table notifications add column if not exists numero int;

-- ── 3 · backfill (només files que encara no en tenen) ──
with g as (
  select id, row_number() over (order by created_at, id) as rn from groups where numero is null
)
update groups set numero = g.rn from g where groups.id = g.id;

with f as (
  select id, row_number() over (partition by group_id order by created_at, id) as rn from families where numero is null
)
update families set numero = f.rn from f where families.id = f.id;

with n as (
  select id, row_number() over (partition by family_id order by created_at, id) as rn from notifications where numero is null
)
update notifications set numero = n.rn from n where notifications.id = n.id;

-- ── 4 · triggers: el número següent en crear (mai es recalcula després) ──
create or replace function assigna_numero_grup() returns trigger as $$
begin
  if new.numero is null then
    perform pg_advisory_xact_lock(hashtext('grup_numero'));
    select coalesce(max(numero), 0) + 1 into new.numero from groups;
  end if;
  return new;
end $$ language plpgsql;
drop trigger if exists trg_numero_grup on groups;
create trigger trg_numero_grup before insert on groups for each row execute function assigna_numero_grup();

create or replace function assigna_numero_familia() returns trigger as $$
begin
  if new.numero is null then
    perform pg_advisory_xact_lock(hashtext('familia_numero:' || new.group_id::text));
    select coalesce(max(numero), 0) + 1 into new.numero from families where group_id = new.group_id;
  end if;
  return new;
end $$ language plpgsql;
drop trigger if exists trg_numero_familia on families;
create trigger trg_numero_familia before insert on families for each row execute function assigna_numero_familia();

create or replace function assigna_numero_avis() returns trigger as $$
begin
  if new.numero is null then
    perform pg_advisory_xact_lock(hashtext('avis_numero:' || new.family_id::text));
    select coalesce(max(numero), 0) + 1 into new.numero from notifications where family_id = new.family_id;
  end if;
  return new;
end $$ language plpgsql;
drop trigger if exists trg_numero_avis on notifications;
create trigger trg_numero_avis before insert on notifications for each row execute function assigna_numero_avis();

-- ── comprovació final ──
select family_id, child_name, action, detail, date_trunc('second', created_at) as segon, count(*)
  from notifications
 group by family_id, child_name, action, detail, date_trunc('second', created_at)
having count(*) > 1;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK · si vols desfer-ho, executa NOMÉS aquest bloc. Recupera els
-- avisos netejats a la secció 1; treu els triggers i les columnes de
-- número (els id «A.B.C» deixaran de sortir, res més es toca):
-- ═══════════════════════════════════════════════════════════════════════
-- insert into notifications select * from notifications_dup_backup_v52
--   on conflict (id) do nothing;
-- drop table if exists notifications_dup_backup_v52;
-- drop trigger if exists trg_numero_grup on groups;
-- drop trigger if exists trg_numero_familia on families;
-- drop trigger if exists trg_numero_avis on notifications;
-- drop function if exists assigna_numero_grup();
-- drop function if exists assigna_numero_familia();
-- drop function if exists assigna_numero_avis();
-- alter table groups drop column if exists numero;
-- alter table families drop column if exists numero;
-- alter table notifications drop column if exists numero;
