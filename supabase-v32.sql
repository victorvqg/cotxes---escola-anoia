-- ══════════════════════════════════════════════════════════════════
-- v3.2 · Executa TOT aquest fitxer al SQL Editor (New query → Run).
-- És segur re-executar-lo.
--   1 · columna `curs` a families
--   2 · claim_family ara exigeix el CODI DE LA FAMÍLIA (p_token):
--       ja no es pot reclamar una família existent sense que un membre
--       d'aquella família et passi el codi (el veu al seu Perfil).
-- ══════════════════════════════════════════════════════════════════

alter table families add column if not exists curs text not null default '';

create or replace function claim_family(p_family uuid, p_token text) returns void as $$
declare v_accounts int; v_group uuid; v_nom text; v_token uuid;
begin
  select group_id, name, invite_token into v_group, v_nom, v_token from families where id = p_family;
  if v_group is null then raise exception 'Família inexistent'; end if;
  if upper(left(replace(v_token::text, '-', ''), 8)) <> upper(trim(coalesce(p_token, ''))) then
    raise exception 'Codi de la família incorrecte: demana-l''o a algú d''aquella família (el veu al seu Perfil)';
  end if;
  select count(*) into v_accounts from profiles where family_id = p_family;
  if v_accounts >= 2 then raise exception 'Aquesta família ja té 2 comptes'; end if;
  if exists (select 1 from profiles where id = auth.uid() and family_id is not null) then
    raise exception 'Aquest compte ja té família'; end if;
  perform set_config('app.admin_override', 'on', true);
  update profiles set family_id = p_family, requested_group = v_group, status = 'aprovat'
    where id = auth.uid();
  insert into activity_log (group_id, actor_id, family_id, action, details)
    values (v_group, auth.uid(), p_family, 'aprovació d''accés', 'Compte vinculat a ' || v_nom);
end $$ language plpgsql security definer;

-- Verificació: ha de llistar claim_family amb 2 paràmetres
select proname, pronargs from pg_proc where proname = 'claim_family';

-- ── 3 · Staff NO pot tocar MAI la família de l'admin (bloqueig a nivell BD) ──
create or replace function can_touch_family(p_family uuid) returns boolean as $$
  select p_family = my_family()
    or (is_admin() and exists (select 1 from families f where f.id = p_family and f.group_id = my_group()))
    or (is_staff_or_admin() and not is_admin()
        and exists (select 1 from families f where f.id = p_family and f.group_id = my_group() and f.role <> 'admin'));
$$ language sql security definer stable;

drop policy if exists families_update on families;
create policy families_update on families for update to authenticated
  using (can_touch_family(id));

drop policy if exists children_write on children;
create policy children_write on children for insert to authenticated
  with check (can_touch_family(family_id));
drop policy if exists children_update on children;
create policy children_update on children for update to authenticated
  using (can_touch_family(family_id));
drop policy if exists children_delete on children;
create policy children_delete on children for delete to authenticated
  using (can_touch_family(family_id));

drop policy if exists marks_insert on weekly_marks;
create policy marks_insert on weekly_marks for insert to authenticated
  with check (can_touch_family(family_id));
drop policy if exists marks_update on weekly_marks;
create policy marks_update on weekly_marks for update to authenticated
  using (can_touch_family(family_id));
drop policy if exists marks_delete on weekly_marks;
create policy marks_delete on weekly_marks for delete to authenticated
  using (can_touch_family(family_id));

drop policy if exists assig_insert on assignments;
create policy assig_insert on assignments for insert to authenticated
  with check (group_id = my_group() and can_touch_family(driver_family_id));
drop policy if exists assig_delete on assignments;
create policy assig_delete on assignments for delete to authenticated
  using (can_touch_family(driver_family_id));

-- ── 4 · LÍMITS: 100 famílies per grup · 5 fills per família ──
create or replace function limita_families() returns trigger as $$
begin
  if (select count(*) from families where group_id = new.group_id) >= 100 then
    raise exception 'Aquest grup ja ha arribat al màxim de 100 famílies';
  end if;
  return new;
end $$ language plpgsql;
drop trigger if exists trg_max_families on families;
create trigger trg_max_families before insert on families for each row execute function limita_families();

create or replace function limita_nens() returns trigger as $$
begin
  if (select count(*) from children where family_id = new.family_id) >= 5 then
    raise exception 'Màxim 5 fills per família';
  end if;
  return new;
end $$ language plpgsql;
drop trigger if exists trg_max_nens on children;
create trigger trg_max_nens before insert on children for each row execute function limita_nens();
