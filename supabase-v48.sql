-- ═══════════════════════════════════════════════════════════════════════
-- v48 · EL SERVIDOR DIU SI EL COMPTE ÉS EL TITULAR (v4.26)
--
-- EL PROBLEMA: el client deduïa «progenitor» llegint families.owner_id
--   amb la sessió del progenitor dins d'un try/catch buit: si la lectura
--   fallava o owner_id era NULL, el tractava com a titular, deixava editar
--   i el frenava la RLS amb un error genèric de permisos.
--
-- LA SOLUCIÓ: el_meu_perfil() retorna també es_titular, calculat al
--   servidor amb la funció es_titular() del v39 (owner_id NULL = família
--   sense titular reclamat: el primer compte pot editar, com sempre).
--   Canvia el tipus de retorn: cal DROP + CREATE.
--
-- Idempotent: es pot executar més d'un cop sense por.
-- ═══════════════════════════════════════════════════════════════════════

drop function if exists public.el_meu_perfil();

create function public.el_meu_perfil()
returns table (
  id uuid, email text, family_id uuid, requested_group uuid,
  status text, consent_at timestamptz, created_at timestamptz,
  es_titular boolean
)
language sql security definer stable as $$
  select p.id, p.email, p.family_id, p.requested_group,
         p.status, p.consent_at, p.created_at,
         (p.family_id is null or es_titular(p.family_id)) as es_titular
    from public.profiles p
   where p.id = auth.uid();
$$;

revoke all on function public.el_meu_perfil() from public, anon;
grant execute on function public.el_meu_perfil() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK · si vols desfer-ho, executa NOMÉS aquest bloc (torna la versió
-- del v37; el client tractarà tothom com a NOMÉS LECTURA fins a reexecutar
-- el bloc de dalt — el titular quedaria bloquejat: desfés-ho només si cal):
-- ═══════════════════════════════════════════════════════════════════════
-- drop function if exists public.el_meu_perfil();
-- create or replace function public.el_meu_perfil() returns setof public.profiles as $$
--   select * from public.profiles where id = auth.uid();
-- $$ language sql security definer stable;
-- revoke all on function public.el_meu_perfil() from public, anon;
-- grant execute on function public.el_meu_perfil() to authenticated;
