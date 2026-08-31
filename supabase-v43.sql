-- ═══════════════════════════════════════════════════════════════════════
-- v43 · LA FAMÍLIA DEL NEN POT TREURE'L DEL COTXE D'UN ALTRE CONDUCTOR (v4.11)
--
-- EL PROBLEMA: les assignacions (qui puja a quin cotxe) només les podia
--   esborrar la família del CONDUCTOR (assig_delete exigeix
--   can_touch_family(driver_family_id)). En esborrar la graella d'un fill,
--   la SEVA família ha de poder alliberar les places que ocupava als cotxes
--   dels altres.
--
-- LA SOLUCIÓ: una segona política de DELETE (les polítiques se sumen):
--   també pot esborrar una assignació qui pot tocar la família del NEN
--   assignat (el seu titular, l'admin o l'staff segons can_touch_family).
--   La d'INSERT no es toca: posar un nen al cotxe segueix sent cosa del
--   conductor.
--
-- Idempotent: es pot executar més d'un cop sense por.
-- ═══════════════════════════════════════════════════════════════════════

drop policy if exists assig_delete_familia_nen on assignments;
create policy assig_delete_familia_nen on assignments for delete to authenticated
  using (can_touch_family((select c.family_id from children c where c.id = assignments.child_id)));

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK · si vols desfer-ho, executa NOMÉS aquesta línia
-- (torna a deixar l'esborrat només en mans del conductor; cap dada es toca):
-- ═══════════════════════════════════════════════════════════════════════
-- drop policy if exists assig_delete_familia_nen on assignments;
