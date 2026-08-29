-- ═══════════════════════════════════════════════════════════════════
-- Cotxes · Escola Anoia — SQL v3.8 (idempotent: segur de re-executar)
-- Arregla el bug «No s'ha pogut vincular: Aquest compte ja té família»
--   1 · children.curs amb DEFAULT '' (un insert sense curs mai peta)
--   2 · el_meu_perfil(): la recuperació mira el MATEIX usuari (auth.uid)
--       que ha donat l'error, no una variable del client
--   3 · claim_family idempotent i clar (diu a QUINA família estàs)
--   4 · desvincula_compte(): només el perfil propi, amb registre al log
--   5 · alta atòmica: join_group_crea crea perfil + família + nens en
--       UNA transacció (si falla res, no queda cap perfil a mitges)
--   6 · Consultes de verificació al final
-- ═══════════════════════════════════════════════════════════════════

-- 1 · children.curs: default i not null (l'insert de nens sense curs no pot petar)
alter table public.children add column if not exists curs text;
alter table public.children alter column curs set default '';
update public.children set curs = '' where curs is null;
alter table public.children alter column curs set not null;

-- 2 · el_meu_perfil(): la fila de profiles d'auth.uid() (security definer:
--     mateixa font de veritat que les RPC que donen l'error)
create or replace function public.el_meu_perfil() returns setof public.profiles as $$
  select * from public.profiles where id = auth.uid();
$$ language sql security definer stable;

-- 3 · claim_family v3: idempotent (ja vinculat a p_family → acaba bé) i
--     clar (vinculat a UNA ALTRA família → diu el nom)
create or replace function public.claim_family(p_family uuid, p_token text) returns void as $$
declare v_accounts int; v_group uuid; v_nom text; v_token uuid; v_meva uuid; v_nom_meva text;
begin
  select family_id into v_meva from profiles where id = auth.uid();
  if v_meva = p_family then return; end if;   -- idempotent: ja hi ets, cap error
  if v_meva is not null then
    select name into v_nom_meva from families where id = v_meva;
    raise exception 'Aquest compte ja està vinculat a la família %', coalesce(v_nom_meva, '(desconeguda)');
  end if;
  select group_id, name, invite_token into v_group, v_nom, v_token from families where id = p_family;
  if v_group is null then raise exception 'Família inexistent'; end if;
  if upper(left(replace(v_token::text, '-', ''), 8)) <> upper(trim(coalesce(p_token, ''))) then
    raise exception 'Codi de la família incorrecte: demana-l''o a algú d''aquella família (el veu al seu Perfil)';
  end if;
  select count(*) into v_accounts from profiles where family_id = p_family;
  if v_accounts >= 2 then raise exception 'Aquesta família ja té 2 comptes'; end if;
  perform set_config('app.admin_override', 'on', true);
  update profiles set family_id = p_family, requested_group = v_group, status = 'aprovat'
    where id = auth.uid();
  insert into activity_log (group_id, actor_id, family_id, action, details)
    values (v_group, auth.uid(), p_family, 'aprovació d''accés', 'Compte vinculat a ' || v_nom);
end $$ language plpgsql security definer;

-- 4 · desvincula_compte(): NOMÉS el perfil propi; family_id = null,
--     status = 'pendent'; queda al log. La família es recupera amb el seu codi.
create or replace function public.desvincula_compte() returns void as $$
declare v_fam uuid; v_group uuid; v_nom text;
begin
  select family_id into v_fam from profiles where id = auth.uid();
  if v_fam is null then return; end if;   -- ja desvinculat: cap error
  select group_id, name into v_group, v_nom from families where id = v_fam;
  perform set_config('app.admin_override', 'on', true);
  update profiles set family_id = null, status = 'pendent' where id = auth.uid();
  insert into activity_log (group_id, actor_id, family_id, action, details)
    values (v_group, auth.uid(), v_fam, 'desvinculació', 'Compte desvinculat de ' || coalesce(v_nom, ''));
end $$ language plpgsql security definer;

-- 5 · Alta atòmica: join_group_crea amb els nens dins la MATEIXA transacció.
--     Es reemplaça la versió de 5 paràmetres (el client ja no insereix nens a part).
drop function if exists public.join_group_crea(text, text, text, text, int);
create or replace function public.join_group_crea(p_code text, p_cognom1 text, p_cognom2 text, p_driver text, p_seats int, p_nens jsonb default '[]'::jsonb)
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
  insert into children (family_id, name, curs)
    select v_fid, trim(x->>'nom'), coalesce(x->>'curs', '')
    from jsonb_array_elements(coalesce(p_nens, '[]'::jsonb)) x
    where coalesce(trim(x->>'nom'), '') <> '';
  perform set_config('app.admin_override', 'on', true);
  update profiles set family_id = v_fid, requested_group = v_gid, status = 'aprovat'
    where id = auth.uid();
  insert into activity_log (group_id, actor_id, family_id, action, details)
    values (v_gid, auth.uid(), v_fid, 'alta família', 'Alta amb codi d''invitació');
  return v_fid;
end $$ language plpgsql security definer;

-- ══ 6 · Verificació ══
-- Funcions creades (han de sortir totes quatre; join_group_crea amb 6 paràmetres):
select proname, pronargs from pg_proc
where proname in ('el_meu_perfil', 'claim_family', 'desvincula_compte', 'join_group_crea')
order by proname;

-- children.curs amb default:
select column_name, column_default, is_nullable from information_schema.columns
where table_name = 'children' and column_name = 'curs';

-- claim_family idempotent (com a usuari JA vinculat a la seva família):
--   select claim_family('<la-meva-família>', '<el-meu-codi>');  → acaba bé, cap error
-- claim_family sobre una altra família (com a usuari vinculat):
--   select claim_family('<una-altra>', '<codi>');  → «Aquest compte ja està vinculat a la família X»
-- desvincula_compte (com a usuari vinculat):
--   select desvincula_compte();
--   select family_id, status from profiles where id = auth.uid();  → null · 'pendent'
