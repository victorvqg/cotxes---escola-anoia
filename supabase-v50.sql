-- ═══════════════════════════════════════════════════════════════════════
-- v50 · NETEJA DELS AVISOS REPETITS JA GUARDATS (v4.38, tasca 1)
--
-- Esborra les files de notifications que són EXACTAMENT el mateix avís
-- (mateixa família, nen, acció i detall) repetit dins el MATEIX SEGON — la
-- firma d'una cursa entre dos desats gairebé simultanis. El SQL v47/v49 ja
-- evita que en tornin a entrar d'ara endavant (trigger antiduplicats a 60
-- segons); aquest script només neteja el que ja hi havia guardat abans.
-- Es conserva la fila MÉS ANTIGA de cada grup de duplicats.
--
-- REVERSIBLE: abans d'esborrar res, es guarda una còpia exacta de les
-- files que es descarten a notifications_dup_backup_v50 (creada aquí
-- mateix). El rollback (al final) les torna a inserir i esborra la còpia.
-- ═══════════════════════════════════════════════════════════════════════

-- 1 · SELECT DE COMPROVACIÓ — mira-ho abans d'esborrar res
select family_id, child_name, action, detail, date_trunc('second', created_at) as segon,
       count(*) as repeticions
  from notifications
 group by family_id, child_name, action, detail, date_trunc('second', created_at)
having count(*) > 1
 order by repeticions desc;

-- 2 · còpia de seguretat de les files QUE ES DESCARTARAN (totes menys la
--     més antiga de cada grup)
create table if not exists notifications_dup_backup_v50 as
select n.*
  from notifications n
  join (
    select id,
           row_number() over (
             partition by family_id, child_name, action, detail, date_trunc('second', created_at)
             order by created_at asc, id asc
           ) as rn
      from notifications
  ) r on r.id = n.id
 where r.rn > 1;

-- 3 · esborra-les (conserva la més antiga de cada grup)
delete from notifications n
 using (
   select id,
          row_number() over (
            partition by family_id, child_name, action, detail, date_trunc('second', created_at)
            order by created_at asc, id asc
          ) as rn
     from notifications
 ) r
 where r.id = n.id and r.rn > 1;

-- 4 · comprovació final: ja no ha de quedar cap grup amb count(*) > 1
select family_id, child_name, action, detail, date_trunc('second', created_at) as segon, count(*)
  from notifications
 group by family_id, child_name, action, detail, date_trunc('second', created_at)
having count(*) > 1;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK · si vols recuperar les files esborrades, executa NOMÉS això:
-- ═══════════════════════════════════════════════════════════════════════
-- insert into notifications select * from notifications_dup_backup_v50;
-- drop table notifications_dup_backup_v50;
