-- ═══════════════════════════════════════════════════════════════════════
-- v53 · REPARA LA NUMERACIÓ A.B.C DELS AVISOS (v4.39 no s'ha aplicat a les dades)
--
-- DIAGNÒSTIC (no tinc accés a la teva base de dades en viu — això és
--   l'auditoria del CODI, no una lectura real; les 3 SELECT del pas 1
--   et donaran la resposta certa quan les executis):
--
--   El client (idAvis, a index.html) NOMÉS mostra l'id «A.B.C» quan
--   grupActiu.numero, la família.numero i l'avís.numero tenen valor TOTS
--   TRES — dissenyat expressament perquè, si el SQL de numeració encara no
--   s'ha executat, l'app es quedi silenciosament com abans (sense id, sense
--   trencar-se) en lloc de petar. He revisat aquest codi i és correcte.
--
--   El SQL v52 (que fa exactament aquesta feina: neteja de duplicats +
--   columnes numero + backfill + triggers) és idempotent i, si s'hagués
--   executat sencer, hauria omplert els tres números. La causa més
--   probable que segueixin buits: el missatge d'error que vas reportar
--   («syntax error at or near "Jan"») ve d'un tros de text que ja hi havia
--   a l'editor SQL abans d'enganxar-hi el fitxer — un error de sintaxi AL
--   PRINCIPI del script fa que Supabase l'aturi SENCER: cap de les seves
--   instruccions (neteja, columnes, backfill, triggers) no arriba a
--   executar-se. En resum: molt probablement el v52 no s'ha arribat a
--   executar mai de debò.
--
-- AQUEST FITXER és autosuficient: fas net i el pots executar tal qual,
--   independentment de si el v52 es va arribar a aplicar en part o gens.
--   Idempotent (seguro de tornar a executar).
-- ═══════════════════════════════════════════════════════════════════════

-- ── PAS 1 · comprovació (a)(b)(c) — mira els resultats abans de continuar ──
-- (a) el grup té número?
select id, name, numero from groups order by created_at;
-- (b) quantes famílies del grup encara NO tenen número?
select count(*) as families_sense_numero from families where numero is null;
-- (c) quants avisos encara NO tenen número?
select count(*) as avisos_sense_numero from notifications where numero is null;

-- ── PAS 2 · neteja de duplicats (n40) ABANS de numerar — si no, la C
--     dels avisos tindria forats. No fa res si ja estava net. ──
create table if not exists notifications_dup_backup_v53 as
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

-- ── PAS 3 · columnes (per si el v52 no les va arribar a crear) ──
alter table groups        add column if not exists numero int;
alter table families      add column if not exists numero int;
alter table notifications add column if not exists numero int;

-- ── PAS 4 · omple els que faltin ──
-- grups.numero: per ordre de creació (avui només n'hi ha un → numero = 1)
with g as (
  select id, row_number() over (order by created_at, id) as rn from groups where numero is null
)
update groups set numero = g.rn from g where groups.id = g.id;

-- families.numero: ordre de creació DINS DE CADA GRUP
with f as (
  select id, row_number() over (partition by group_id order by created_at, id) as rn from families where numero is null
)
update families set numero = f.rn from f where families.id = f.id;

-- notifications.numero: correlatiu DINS DE CADA FAMÍLIA, per ordre de data
with n as (
  select id, row_number() over (partition by family_id order by created_at, id) as rn from notifications where numero is null
)
update notifications set numero = n.rn from n where notifications.id = n.id;

-- ── PAS 5 · perquè no tornin a quedar buits: triggers en crear
--     (idempotent — es recreen tal com ja definia el v52) ──
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

-- ── PAS 6 · comprovació final — han de sortir 0 files a totes tres ──
select count(*) as grups_sense_numero from groups where numero is null;
select count(*) as families_sense_numero from families where numero is null;
select count(*) as avisos_sense_numero from notifications where numero is null;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK · si vols desfer-ho, executa NOMÉS aquest bloc (recupera els
-- duplicats esborrats al pas 2; treu els triggers i les columnes de
-- número — els id «A.B.C» deixaran de sortir, res més es toca):
-- ═══════════════════════════════════════════════════════════════════════
-- insert into notifications select * from notifications_dup_backup_v53
--   on conflict (id) do nothing;
-- drop table if exists notifications_dup_backup_v53;
-- drop trigger if exists trg_numero_grup on groups;
-- drop trigger if exists trg_numero_familia on families;
-- drop trigger if exists trg_numero_avis on notifications;
-- drop function if exists assigna_numero_grup();
-- drop function if exists assigna_numero_familia();
-- drop function if exists assigna_numero_avis();
-- alter table groups drop column if exists numero;
-- alter table families drop column if exists numero;
-- alter table notifications drop column if exists numero;
