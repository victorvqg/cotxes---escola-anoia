-- ══════════════════════════════════════════════════════════════════
-- v3.9 → v4.0 · Executa TOT aquest fitxer al SQL Editor (New query → Run).
-- És segur re-executar-lo.
--
--   EL PROBLEMA: una família pot tenir 2 comptes (el titular que la va crear
--   i el progenitor que s'hi vincula amb el codi de família). Fins ara els dos
--   comptes eren INDISTINGIBLES per a la base de dades: totes les comprovacions
--   feien `my_family()`, que només mira A QUINA família pertanys, no QUIN dels
--   dos comptes ets. Resultat: el progenitor podia editar-ho tot.
--
--   LA SOLUCIÓ: `families.owner_id` = el compte titular, i totes les
--   comprovacions d'escriptura hi passen. El progenitor queda en només lectura.
--
--   1 · columna owner_id + backfill + trigger que la manté sola
--   2 · es_titular()
--   3 · can_touch_family() ← una sola funció tanca 8 polítiques d'escriptura
--   4 · política families_delete
--   5 · RPC esborra_familia()
--   6 · RPC set_group_notice()
-- ══════════════════════════════════════════════════════════════════

-- ── 1 · Qui és el titular de cada família ──────────────────────────
alter table families add column if not exists owner_id uuid references auth.users(id) on delete set null;

-- Backfill: el compte MÉS ANTIC de cada família n'esdevé el titular.
-- (el creador sempre es va registrar abans que el segon progenitor)
update families f
set owner_id = sub.uid
from (
  select p.family_id,
         p.id as uid,
         row_number() over (partition by p.family_id order by u.created_at, p.id) as rn
  from profiles p
  join auth.users u on u.id = p.id
  where p.family_id is not null
) sub
where sub.family_id = f.id and sub.rn = 1 and f.owner_id is null;

-- I d'ara endavant: el PRIMER compte que es vincula a una família n'és el titular.
-- Així no cal tocar cap de les RPC d'alta (create_group, join_group_crea,
-- claim_family, claim_family_per_codi, vincula_compte_a_familia).
create or replace function marca_titular() returns trigger as $$
begin
  if new.family_id is not null then
    update families set owner_id = new.id
      where id = new.family_id and owner_id is null;
  end if;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_marca_titular on profiles;
create trigger trg_marca_titular after insert or update of family_id on profiles
  for each row execute function marca_titular();

-- ── 2 · Ets el titular d'aquesta família? ──────────────────────────
-- owner_id null = família encara sense titular (importada o creada per l'admin):
-- es deixa passar per no bloquejar ningú; el trigger de dalt li'n posarà un.
create or replace function es_titular(p_family uuid) returns boolean as $$
  select exists (
    select 1 from families f
    where f.id = p_family
      and (f.owner_id is null or f.owner_id = auth.uid())
  )
$$ language sql security definer stable;

-- ── 3 · El canvi central ───────────────────────────────────────────
-- Només canvia la PRIMERA branca: "sóc d'aquesta família" passa a ser
-- "sóc el TITULAR d'aquesta família". Les branques d'admin i staff no es toquen.
-- Com que families_update, children_write/update/delete, marks_insert/update/delete
-- i assig_insert/delete criden totes aquesta funció, no cal tocar cap política.
create or replace function can_touch_family(p_family uuid) returns boolean as $$
  select (p_family = my_family() and es_titular(p_family))
    or (is_admin() and exists (select 1 from families f where f.id = p_family and f.group_id = my_group()))
    or (is_staff_or_admin() and not is_admin()
        and exists (select 1 from families f where f.id = p_family and f.group_id = my_group() and f.role <> 'admin'));
$$ language sql security definer stable;

-- ── 4 · Esborrar la família: només el titular (o l'admin) ──────────
drop policy if exists families_delete on families;
create policy families_delete on families for delete to authenticated
  using ((id = my_family() and es_titular(id)) or is_admin());

-- ── 5 · La RPC esborra_familia salta l'RLS: cal el mateix guard a dins ──
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
  update profiles set family_id = null, status = 'pendent' where family_id = p_family;
  insert into activity_log (group_id, actor_id, family_id, affected_family_id, action, details)
    values (v_group, auth.uid(), my_family(), p_family, 'baixa família', v_nom || ' esborrada');
  update activity_log set actor_id = null, details = '' where family_id = p_family and action <> 'baixa família';
  update activity_log set affected_family_id = null where affected_family_id = p_family;
  delete from families where id = p_family;
end $$ language plpgsql security definer;

-- ── 6 · L'avís del grup també és una edició ────────────────────────
create or replace function set_group_notice(p_notice text) returns void as $$
begin
  if not is_member() then raise exception 'No ets membre'; end if;
  if not (es_titular(my_family()) or is_admin()) then
    raise exception 'Només el titular de la família pot fer canvis'; end if;
  update groups set notice = p_notice where id = my_group();
end $$ language plpgsql security definer;

-- ══ VERIFICACIÓ ══════════════════════════════════════════════════
-- 1) Com ha quedat el repartiment de titulars (REVISA-HO abans de confiar-hi):
--      select f.name, u.email as titular, (select count(*) from profiles p where p.family_id = f.id) as comptes
--      from families f left join auth.users u on u.id = f.owner_id
--      order by f.name;
-- 2) Cap família amb comptes però sense titular (ha de sortir 0 files):
--      select f.name from families f
--      where f.owner_id is null and exists (select 1 from profiles p where p.family_id = f.id);
-- 3) Imitant el compte del PROGENITOR (Authentication → Impersonate):
--      select can_touch_family(my_family());   → false
--      select es_titular(my_family());         → false
--      update weekly_marks set day = day where family_id = my_family();  → 0 files
--    Imitant el compte del TITULAR:
--      select can_touch_family(my_family());   → true
--
-- Si un titular ha quedat malament, es corregeix a mà:
--      update families set owner_id = (select id from auth.users where email = 'qui@toca.cat')
--      where id = '<uuid-de-la-familia>';

-- ══ ROLLBACK (si cal desfer-ho tot) ═══════════════════════════════
-- drop trigger if exists trg_marca_titular on profiles;
-- drop function if exists marca_titular();
-- create or replace function can_touch_family(p_family uuid) returns boolean as $$
--   select p_family = my_family()
--     or (is_admin() and exists (select 1 from families f where f.id = p_family and f.group_id = my_group()))
--     or (is_staff_or_admin() and not is_admin()
--         and exists (select 1 from families f where f.id = p_family and f.group_id = my_group() and f.role <> 'admin'));
-- $$ language sql security definer stable;
-- drop policy if exists families_delete on families;
-- create policy families_delete on families for delete to authenticated
--   using (id = my_family() or is_admin());
-- (esborra_familia i set_group_notice: reposa'ls des de supabase-fase1.sql)
-- alter table families drop column if exists owner_id;
