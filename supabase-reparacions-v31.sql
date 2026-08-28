-- ══════════════════════════════════════════════════════════════════
-- v3.1 · REPARACIONS PENDENTS — enganxa NOMÉS aquest fitxer al SQL Editor
-- (esborra abans tot el que hi hagi a l'editor) i prem Run.
-- És segur executar-lo més d'un cop.
-- ══════════════════════════════════════════════════════════════════

-- 1 · Recupera el rol admin de la família creadora del grup 'EA 25/26'
alter table families disable trigger trg_protect_family_role;

update families set role = 'admin'
where group_id = (select id from groups where name = 'EA 25/26')
  and name = 'Quintana Andreví';

alter table families enable trigger trg_protect_family_role;

-- 2 · Sincronització en viu: afegeix la taula children (si no hi és ja)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'children') then
    alter publication supabase_realtime add table children;
  end if;
end $$;

-- 3 · Verificació: la família Quintana Andreví ha de sortir amb role = admin
select f.name, f.role, g.name as grup
from families f join groups g on g.id = f.group_id;
