-- ═══════════════════════════════════════════════════════════════════
-- Cotxes · Escola Anoia — SQL v3.9 (idempotent: segur de re-executar)
-- Vincular un segon compte NOMÉS amb el codi de família (8 caràcters)
--   1 · vincula_compte_a_familia(): el cos ÚNIC de vinculació (privat)
--   2 · claim_family el reutilitza (mateixes regles, cap duplicat)
--   3 · claim_family_per_codi(p_token): troba la família pel codi i
--       vincula en un sol pas — la cerca va DINS del security definer:
--       cap client pot llegir invite_token ni escanejar families
--   4 · Consultes de verificació al final
-- ═══════════════════════════════════════════════════════════════════

-- 1 · Cos únic de vinculació (idempotent, nom de la família si és una
--     altra, màxim 2 comptes). PRIVAT: es revoca l'execute a l'API.
create or replace function public.vincula_compte_a_familia(p_family uuid, p_via text default '') returns void as $$
declare v_accounts int; v_group uuid; v_nom text; v_meva uuid; v_nom_meva text;
begin
  select family_id into v_meva from profiles where id = auth.uid();
  if v_meva = p_family then return; end if;   -- idempotent: ja hi ets, cap error
  if v_meva is not null then
    select name into v_nom_meva from families where id = v_meva;
    raise exception 'Aquest compte ja està vinculat a la família %', coalesce(v_nom_meva, '(desconeguda)');
  end if;
  select group_id, name into v_group, v_nom from families where id = p_family;
  if v_group is null then raise exception 'Família inexistent'; end if;
  select count(*) into v_accounts from profiles where family_id = p_family;
  if v_accounts >= 2 then raise exception 'Aquesta família ja té 2 comptes'; end if;
  perform set_config('app.admin_override', 'on', true);
  update profiles set family_id = p_family, requested_group = v_group, status = 'aprovat'
    where id = auth.uid();
  insert into activity_log (group_id, actor_id, family_id, action, details)
    values (v_group, auth.uid(), p_family, 'aprovació d''accés', 'Compte vinculat a ' || v_nom || coalesce(p_via, ''));
end $$ language plpgsql security definer;
revoke execute on function public.vincula_compte_a_familia(uuid, text) from public, anon, authenticated;

-- 2 · claim_family: valida el codi de la família triada i reutilitza el cos únic
create or replace function public.claim_family(p_family uuid, p_token text) returns void as $$
declare v_token uuid; v_meva uuid;
begin
  select family_id into v_meva from profiles where id = auth.uid();
  if v_meva = p_family then return; end if;   -- idempotent ABANS del codi
  select invite_token into v_token from families where id = p_family;
  if v_token is null then raise exception 'Família inexistent'; end if;
  if upper(left(replace(v_token::text, '-', ''), 8)) <> upper(trim(coalesce(p_token, ''))) then
    raise exception 'Codi de la família incorrecte: demana-l''o a algú d''aquella família (el veu al seu Perfil)';
  end if;
  perform vincula_compte_a_familia(p_family);
end $$ language plpgsql security definer;

-- 3 · claim_family_per_codi: el codi de família (8) és suficient — un sol pas
create or replace function public.claim_family_per_codi(p_token text)
returns table(family_id uuid, nom text) as $$
declare v_fid uuid; v_nom text;
begin
  select f.id, f.name into v_fid, v_nom
  from families f join groups g on g.id = f.group_id and g.status = 'actiu'
  where upper(left(replace(f.invite_token::text, '-', ''), 8)) = upper(trim(coalesce(p_token, '')))
  limit 1;
  if v_fid is null then
    raise exception 'Cap família amb aquest codi. Demana''l a algú de la família: el veu al seu Perfil.';
  end if;
  perform vincula_compte_a_familia(v_fid, ' · via codi de família');
  return query select v_fid, v_nom;
end $$ language plpgsql security definer;

-- ══ 4 · Verificació ══
-- Funcions (vincula_compte_a_familia SENSE execute per a authenticated):
select p.proname, p.pronargs,
       has_function_privilege('authenticated', p.oid, 'execute') as api_pot_executar
from pg_proc p
where p.proname in ('vincula_compte_a_familia', 'claim_family', 'claim_family_per_codi')
order by p.proname;
--   → vincula_compte_a_familia ha de sortir amb api_pot_executar = false

-- Com a usuari NORMAL (Authentication → imita un usuari):
--   select invite_token from families;                 → HA DE FALLAR (permission denied, v36)
--   select * from claim_family_per_codi('AAAAAAAA');   → «Cap família amb aquest codi…»
--   select * from claim_family_per_codi('<codi bo>');  → vincula i retorna id + nom
--   (repetit amb el mateix compte i la mateixa família → acaba bé, idempotent)
--   (tercer compte a la mateixa família → «Aquesta família ja té 2 comptes»)
