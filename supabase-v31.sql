-- v3.1 · Sincronització en viu: afegeix la taula `children` a la publicació realtime.
-- Executa'l un sol cop al SQL Editor de Supabase (és segur re-executar-lo).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'children') then
    alter publication supabase_realtime add table children;
  end if;
end $$;
