-- ═══════════════════════════════════════════════════════════════════════
-- v45 · AVISOS ESTRUCTURATS A LA BASE DE DADES (v4.15)
--
-- EL PROBLEMA: els avisos d'assignacions («el porta X» / «ja no té cotxe»)
--   es detectaven i es guardaven NOMÉS al localStorage de cada dispositiu:
--   sense filtre ni descàrrega possibles, i cada mòbil veia una història
--   diferent. Només els avisos d'esborrat de graella (v4.11) eren a la BD.
--
-- LA SOLUCIÓ: tots els avisos s'escriuen a la taula notifications (que ja
--   tenia RLS — cada família llegeix els seus, l'admin tots — i temps real).
--   S'hi afegeixen columnes estructurades per poder filtrar i baixar en CSV:
--     family_name  · nom de la família afectada (per mostrar i filtrar)
--     child_name   · nom del nen
--     action       · què ha canviat («🚗 puja al cotxe», «⏳ es queda sense
--                    cotxe», «🗑️ graella esborrada»…)
--     detail       · el detall (abans → després, dia i franja)
--     actor_name   · qui ho ha fet
--   La columna message es manté (compatibilitat i text pla de l'avís).
--
-- Idempotent: es pot executar més d'un cop sense por.
-- ═══════════════════════════════════════════════════════════════════════

alter table notifications add column if not exists family_name text;
alter table notifications add column if not exists child_name  text;
alter table notifications add column if not exists action      text;
alter table notifications add column if not exists detail      text;
alter table notifications add column if not exists actor_name  text;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK · si vols desfer-ho, executa NOMÉS aquest bloc
-- (compte: es perd el contingut d'aquestes columnes; els avisos vells amb
--  només message es queden):
-- ═══════════════════════════════════════════════════════════════════════
-- alter table notifications drop column if exists family_name;
-- alter table notifications drop column if exists child_name;
-- alter table notifications drop column if exists action;
-- alter table notifications drop column if exists detail;
-- alter table notifications drop column if exists actor_name;
