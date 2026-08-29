-- ═══════════════════════════════════════════════════════════════════
-- Cotxes · Escola Anoia — SQL v3.3 (idempotent: es pot executar més d'un cop)
-- Canvis: curs per nen (columna curs a la taula children)
-- Executa'l SENCER al SQL Editor de Supabase un cop publicada la v3.3.
-- ═══════════════════════════════════════════════════════════════════

-- 1 · Cada nen pot anar a un curs diferent (1r–4t ESO)
alter table public.children
  add column if not exists curs text not null default '';

-- 2 · Reassegura que els nens emeten canvis en temps real (ja ho era des de la v3.1)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'children') then
    alter publication supabase_realtime add table public.children;
  end if;
end $$;
