-- ── REPARACIÓ puntual (executar UN COP al SQL Editor) ─────────────
-- La 1a versió de create_group posava l'override DESPRÉS de l'insert,
-- i el trigger protect_family_role rebaixava el rol del creador a 'usuari'.
-- Això promou la família creadora del grup 'EA 25/26' a admin.

alter table families disable trigger trg_protect_family_role;

update families set role = 'admin'
where group_id = (select id from groups where name = 'EA 25/26')
  and name = 'Quintana Andreví';

alter table families enable trigger trg_protect_family_role;

-- Verificació: ha de dir role = admin
select f.name, f.role, g.name as grup
from families f join groups g on g.id = f.group_id;
