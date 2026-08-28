-- ═══════════════════════════════════════════════════════════════════
-- COTXES · ESCOLA ANOIA — Fase 1 Supabase (0 €)
-- Executa TOT aquest fitxer al SQL Editor del projecte (New query → Run).
-- És idempotent en reexecutar les funcions (create or replace), però NO
-- ho tornis a córrer un cop hi hagi dades reals sense fer backup.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── 1 · TAULES ──────────────────────────────────────────────────────

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  status text not null default 'actiu' check (status in ('actiu','arxivat')),
  notice text default '',
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table families (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id),
  cognom1 text not null,
  cognom2 text default '',
  name text not null,
  driver text not null,
  phone text default '',
  phone_visible boolean default true,
  seats int not null default 3 check (seats between 0 and 6),
  role text not null default 'usuari' check (role in ('usuari','staff','admin')),
  invite_token uuid default gen_random_uuid(),
  created_at timestamptz default now()
);

create table profiles (
  id uuid primary key references auth.users(id),
  email text,
  family_id uuid references families(id),
  requested_group uuid references groups(id),
  status text not null default 'pendent' check (status in ('pendent','aprovat','rebutjat')),
  consent_at timestamptz,
  created_at timestamptz default now()
);

create table children (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null
);

create table weekly_marks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  slot text not null check (slot in ('e8','e9','r13','e15','r17')),
  day  text not null check (day in ('dl','dt','dc','dj','dv')),
  type text not null check (type in ('drive','request','own')),
  children_ids uuid[] default '{}',
  seats_override int,
  updated_by uuid references auth.users(id),
  updated_at timestamptz default now(),
  unique (family_id, slot, day)
);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id),
  driver_family_id uuid not null references families(id) on delete cascade,
  child_id uuid not null references children(id) on delete cascade,
  slot text not null, day text not null,
  updated_by uuid references auth.users(id),
  unique (child_id, slot, day)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  message text not null,
  slot text, day text,
  created_at timestamptz default now()
);

create table notification_reads (
  notification_id uuid references notifications(id) on delete cascade,
  user_id uuid references auth.users(id),
  read_at timestamptz default now(),
  primary key (notification_id, user_id)
);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id),
  actor_id uuid references auth.users(id),
  family_id uuid,
  affected_family_id uuid,
  action text not null check (action in (
    'alta família','baixa família','edició perfil','alta fill','baixa fill',
    'canvi graella','assignació creada','assignació eliminada',
    'canvi de rol','aprovació d''accés','rebutjada d''accés','acció automàtica')),
  details text default '',
  created_at timestamptz default now()
);

create table join_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  group_id uuid not null references groups(id),
  family_id uuid references families(id),
  kind text not null check (kind in ('família nova','segon compte')),
  status text not null default 'pendent' check (status in ('pendent','aprovat','rebutjat')),
  reject_reason text default '',
  created_at timestamptz default now()
);

-- ── 2 · FUNCIONS D'AJUDA (les fan servir les policies RLS) ─────────

create or replace function my_family() returns uuid as $$
  select family_id from profiles where id = auth.uid()
$$ language sql security definer stable;

create or replace function my_group() returns uuid as $$
  select coalesce(
    (select f.group_id from profiles p join families f on f.id = p.family_id where p.id = auth.uid()),
    (select requested_group from profiles where id = auth.uid())
  )
$$ language sql security definer stable;

create or replace function is_admin() returns boolean as $$
  select exists (select 1 from profiles p join families f on f.id = p.family_id
                 where p.id = auth.uid() and f.role = 'admin' and p.status = 'aprovat')
$$ language sql security definer stable;

create or replace function is_staff_or_admin() returns boolean as $$
  select exists (select 1 from profiles p join families f on f.id = p.family_id
                 where p.id = auth.uid() and f.role in ('staff','admin') and p.status = 'aprovat')
$$ language sql security definer stable;

create or replace function is_member() returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'aprovat' and family_id is not null)
$$ language sql security definer stable;

-- ── 3 · RLS: activació ──────────────────────────────────────────────

alter table groups enable row level security;
alter table profiles enable row level security;
alter table families enable row level security;
alter table children enable row level security;
alter table weekly_marks enable row level security;
alter table assignments enable row level security;
alter table notifications enable row level security;
alter table notification_reads enable row level security;
alter table activity_log enable row level security;
alter table join_requests enable row level security;

-- ── 4 · RLS: policies ───────────────────────────────────────────────

create policy groups_select on groups for select to authenticated using (true);
-- grups només es creen/toquen via funcions segures (create_group, set_group_notice)

create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid()
         or (is_admin() and exists (select 1 from families f where f.id = profiles.family_id and f.group_id = my_group())));
create policy profiles_insert on profiles for insert to authenticated
  with check (id = auth.uid());
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid() or is_admin());
create policy profiles_delete on profiles for delete to authenticated
  using (id = auth.uid());

create policy families_select on families for select to authenticated
  using (group_id = my_group() and is_member());
create policy families_insert on families for insert to authenticated
  with check (group_id = my_group());
create policy families_update on families for update to authenticated
  using (id = my_family() or (is_staff_or_admin() and group_id = my_group()));
create policy families_delete on families for delete to authenticated
  using (id = my_family() or is_admin());

create policy children_select on children for select to authenticated
  using (exists (select 1 from families f where f.id = children.family_id and f.group_id = my_group()) and is_member());
create policy children_write on children for insert to authenticated
  with check (family_id = my_family() or is_staff_or_admin());
create policy children_update on children for update to authenticated
  using (family_id = my_family() or is_staff_or_admin());
create policy children_delete on children for delete to authenticated
  using (family_id = my_family() or is_staff_or_admin());

create policy marks_select on weekly_marks for select to authenticated
  using (exists (select 1 from families f where f.id = weekly_marks.family_id and f.group_id = my_group()) and is_member());
create policy marks_insert on weekly_marks for insert to authenticated
  with check (family_id = my_family() or is_staff_or_admin());
create policy marks_update on weekly_marks for update to authenticated
  using (family_id = my_family() or is_staff_or_admin());
create policy marks_delete on weekly_marks for delete to authenticated
  using (family_id = my_family() or is_staff_or_admin());

create policy assig_select on assignments for select to authenticated
  using (group_id = my_group() and is_member());
create policy assig_insert on assignments for insert to authenticated
  with check (group_id = my_group() and (driver_family_id = my_family() or is_staff_or_admin()));
create policy assig_delete on assignments for delete to authenticated
  using (driver_family_id = my_family() or is_staff_or_admin());

create policy notif_select on notifications for select to authenticated
  using (family_id = my_family() or is_staff_or_admin());
create policy notif_insert on notifications for insert to authenticated
  with check (exists (select 1 from families f where f.id = notifications.family_id and f.group_id = my_group()));

create policy nr_select on notification_reads for select to authenticated using (user_id = auth.uid());
create policy nr_insert on notification_reads for insert to authenticated with check (user_id = auth.uid());

create policy log_select on activity_log for select to authenticated
  using (group_id = my_group() and is_admin());
create policy log_insert on activity_log for insert to authenticated
  with check (group_id = my_group());
-- sense policies d'update/delete: el log és immutable de veritat

create policy jr_select on join_requests for select to authenticated
  using (user_id = auth.uid() or (is_admin() and group_id = my_group()));
create policy jr_insert on join_requests for insert to authenticated
  with check (user_id = auth.uid());
create policy jr_update on join_requests for update to authenticated
  using (is_admin() and group_id = my_group());

-- ── 5 · TRIGGERS DE PROTECCIÓ I VALIDACIÓ ───────────────────────────

-- (a) Ningú no s'auto-aprova ni es canvia de família (només admin o funcions segures)
create or replace function protect_profile_escalation() returns trigger as $$
begin
  if current_setting('app.admin_override', true) = 'on' then
    return new;
  end if;
  if not is_admin() then
    if new.status is distinct from old.status or new.family_id is distinct from old.family_id then
      raise exception 'Només l''administrador pot canviar l''estat o la família';
    end if;
  end if;
  return new;
end $$ language plpgsql security definer;
create trigger trg_protect_profile before update on profiles
  for each row execute function protect_profile_escalation();

-- (b) Rol de família: força 'usuari' en crear; canvis de rol només admin
create or replace function protect_family_role() returns trigger as $$
begin
  if tg_op = 'INSERT' and new.role <> 'usuari' and not is_admin()
     and current_setting('app.admin_override', true) is distinct from 'on' then
    new.role := 'usuari';
  end if;
  if tg_op = 'UPDATE' and new.role is distinct from old.role and not is_admin() then
    raise exception 'Només l''administrador pot canviar rols';
  end if;
  return new;
end $$ language plpgsql security definer;
create trigger trg_protect_family_role before insert or update on families
  for each row execute function protect_family_role();

-- (c) Validació d'assignacions: request vàlida + capacitat + família diferent
create or replace function validate_assignment() returns trigger as $$
declare v_child_family uuid; v_mark weekly_marks; v_seats int; v_count int;
begin
  select family_id into v_child_family from children where id = new.child_id;
  if v_child_family is null then raise exception 'Nen inexistent'; end if;
  if v_child_family = new.driver_family_id then
    raise exception 'No pots assignar-te un fill de la teva pròpia família'; end if;
  select * into v_mark from weekly_marks
    where family_id = v_child_family and slot = new.slot and day = new.day and type = 'request';
  if v_mark.id is null or not (new.child_id = any(v_mark.children_ids)) then
    raise exception 'Aquest nen no demana plaça en aquesta franja'; end if;
  if not exists (select 1 from weekly_marks
                 where family_id = new.driver_family_id and slot = new.slot and day = new.day and type = 'drive') then
    raise exception 'La família no condueix en aquesta franja'; end if;
  select coalesce((select seats_override from weekly_marks
                    where family_id = new.driver_family_id and slot = new.slot and day = new.day and type = 'drive'),
                  (select seats from families where id = new.driver_family_id))
    into v_seats;
  select count(*) into v_count from assignments
    where driver_family_id = new.driver_family_id and slot = new.slot and day = new.day;
  if v_count >= coalesce(v_seats, 0) then raise exception 'El cotxe ja és ple'; end if;
  new.updated_by := auth.uid();
  return new;
end $$ language plpgsql security definer;
create trigger trg_validate_assignment before insert on assignments
  for each row execute function validate_assignment();

-- (d) Marques: updated_by + updated_at automàtics
create or replace function stamp_mark() returns trigger as $$
begin new.updated_by := auth.uid(); new.updated_at := now(); return new; end
$$ language plpgsql;
create trigger trg_stamp_mark before insert or update on weekly_marks
  for each row execute function stamp_mark();

-- ── 6 · FUNCIONS PÚBLIQUES (les crida l'app via rpc) ───────────────

-- Crear grup + família admin en una sola operació
create or replace function create_group(p_name text, p_cognom1 text, p_cognom2 text, p_driver text, p_seats int)
returns uuid as $$
declare v_gid uuid; v_fid uuid;
begin
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

-- Buscar un grup pel codi d'invitació (retorna només id + nom)
create or replace function grup_per_codi(p_code text)
returns table(id uuid, name text) as $$
  select id, name from groups
  where invite_code = upper(trim(p_code)) and status = 'actiu'
$$ language sql security definer stable;

-- Llista de famílies reclamables d'un grup (només id + nom; mai nens ni telèfons)
create or replace function families_per_reclamar(p_group uuid)
returns table(id uuid, name text) as $$
  select f.id, f.name from families f
  where f.group_id = p_group
    and (select count(*) from profiles p where p.family_id = f.id) < 2
  order by f.name
$$ language sql security definer stable;

-- Reclamar una família existent (màxim 2 comptes per família)
create or replace function claim_family(p_family uuid) returns void as $$
declare v_accounts int; v_group uuid; v_nom text;
begin
  select group_id, name into v_group, v_nom from families where id = p_family;
  if v_group is null then raise exception 'Família inexistent'; end if;
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

-- Unir-se a un grup creant una família nova (amb codi d'invitació)
create or replace function join_group_crea(p_code text, p_cognom1 text, p_cognom2 text, p_driver text, p_seats int)
returns uuid as $$
declare v_gid uuid; v_fid uuid;
begin
  select id into v_gid from groups where invite_code = upper(trim(p_code)) and status = 'actiu';
  if v_gid is null then raise exception 'Codi d''invitació no vàlid'; end if;
  if exists (select 1 from profiles where id = auth.uid() and family_id is not null) then
    raise exception 'Aquest compte ja té família'; end if;
  insert into families (group_id, cognom1, cognom2, name, driver, seats, role)
    values (v_gid, p_cognom1, coalesce(p_cognom2,''),
            trim(p_cognom1 || ' ' || coalesce(p_cognom2,'')), p_driver, coalesce(p_seats,3), 'usuari')
    returning id into v_fid;
  perform set_config('app.admin_override', 'on', true);
  update profiles set family_id = v_fid, requested_group = v_gid, status = 'aprovat'
    where id = auth.uid();
  insert into activity_log (group_id, actor_id, family_id, action, details)
    values (v_gid, auth.uid(), v_fid, 'alta família', 'Alta amb codi d''invitació');
  return v_fid;
end $$ language plpgsql security definer;

-- Esborrar una família (la pròpia o, si ets admin, qualsevol del grup)
create or replace function esborra_familia(p_family uuid) returns void as $$
declare v_group uuid; v_nom text;
begin
  select group_id, name into v_group, v_nom from families where id = p_family;
  if v_group is null then raise exception 'Família inexistent'; end if;
  if not (my_family() = p_family or is_admin()) then
    raise exception 'No tens permís per esborrar aquesta família'; end if;
  if (select role from families where id = p_family) = 'admin' and my_family() = p_family then
    if exists (select 1 from families where group_id = v_group and id <> p_family) then
      raise exception 'Ets l''administrador: transfereix el rol o esborra primer la resta de famílies'; end if;
  end if;
  perform set_config('app.admin_override', 'on', true);
  update profiles set family_id = null, status = 'pendent' where family_id = p_family;
  insert into activity_log (group_id, actor_id, family_id, affected_family_id, action, details)
    values (v_group, auth.uid(), my_family(), p_family, 'baixa família', v_nom || ' esborrada');
  -- anonimitza el rastre de la família esborrada
  update activity_log set actor_id = null, details = '' where family_id = p_family and action <> 'baixa família';
  update activity_log set affected_family_id = null where affected_family_id = p_family;
  delete from families where id = p_family;  -- cascada: fills, marques, assignacions, avisos
end $$ language plpgsql security definer;

-- Aprovar / rebutjar sol·licituds (Fase 2; ja queden llestes)
create or replace function approve_join(p_request uuid) returns void as $$
declare v_req join_requests; v_accounts int;
begin
  select * into v_req from join_requests where id = p_request;
  if v_req is null then raise exception 'Sol·licitud inexistent'; end if;
  if not is_admin() then raise exception 'Només l''admin'; end if;
  select count(*) into v_accounts from profiles where family_id = v_req.family_id;
  if v_accounts >= 2 then raise exception 'Aquesta família ja té 2 comptes'; end if;
  update join_requests set status = 'aprovat' where id = p_request;
  perform set_config('app.admin_override', 'on', true);
  update profiles set family_id = v_req.family_id, status = 'aprovat' where id = v_req.user_id;
  insert into activity_log (group_id, actor_id, family_id, action, details)
    values (v_req.group_id, auth.uid(), v_req.family_id, 'aprovació d''accés', v_req.kind);
end $$ language plpgsql security definer;

create or replace function reject_join(p_request uuid, p_reason text default '') returns void as $$
declare v_req join_requests;
begin
  select * into v_req from join_requests where id = p_request;
  if not is_admin() then raise exception 'Només l''admin'; end if;
  update join_requests set status = 'rebutjat', reject_reason = p_reason where id = p_request;
  perform set_config('app.admin_override', 'on', true);
  update profiles set status = 'rebutjat' where id = v_req.user_id;
  insert into activity_log (group_id, actor_id, family_id, action, details)
    values (v_req.group_id, auth.uid(), v_req.family_id, 'rebutjada d''accés', p_reason);
end $$ language plpgsql security definer;

-- L'avís del grup l'edita qualsevol família membre
create or replace function set_group_notice(p_notice text) returns void as $$
begin
  if not is_member() then raise exception 'No ets membre'; end if;
  update groups set notice = p_notice where id = my_group();
end $$ language plpgsql security definer;

-- Transferir l'administració a una altra família
create or replace function transfer_admin(p_family uuid) returns void as $$
begin
  if not is_admin() then raise exception 'Només l''admin'; end if;
  update families set role = 'usuari' where id = my_family();
  update families set role = 'admin' where id = p_family and group_id = my_group();
  insert into activity_log (group_id, actor_id, family_id, affected_family_id, action, details)
    values (my_group(), auth.uid(), my_family(), p_family, 'canvi de rol', 'administració transferida');
end $$ language plpgsql security definer;

-- ── 7 · TEMPS REAL (sincronització viu; l'app ho farà servir a la Fase 2) ──
alter publication supabase_realtime add table weekly_marks;
alter publication supabase_realtime add table assignments;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table families;
alter publication supabase_realtime add table groups;

-- ── 8 · VERIFICACIÓ: ha de llistar les funcions creades ─────────────
select proname from pg_proc where proname in
  ('create_group','join_group_crea','claim_family','esborra_familia','grup_per_codi','families_per_reclamar',
   'approve_join','reject_join','set_group_notice','transfer_admin','my_family','my_group','is_admin')
order by proname;
