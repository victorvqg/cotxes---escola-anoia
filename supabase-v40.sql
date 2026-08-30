-- ══════════════════════════════════════════════════════════════════
-- v4.0.1 · Executa TOT aquest fitxer al SQL Editor (New query → Run).
-- És segur re-executar-lo.
--
--   EL PROBLEMA: activity_log.action té un CHECK amb una llista tancada
--   d'accions, escrita a supabase-fase1.sql i mai actualitzada. Des de
--   llavors s'han afegit tres accions que NO hi són:
--
--     · 'desvinculació'    → desvincula_compte()   (v37)
--     · 'codi regenerat'   → regenera_codi()       (v36)
--     · 'esborrat graella' → index.html, logActivitat() (v3.6)
--
--   Les dues primeres van dins la transacció d'una RPC: el CHECK falla i
--   AVORTA tota l'operació. Per això desvincular un compte donava
--   «violates check constraint "activity_log_action_check"» i no es
--   desvinculava res. La tercera passa pel try/catch de logActivitat() al
--   client, així que fallava en silenci: la graella s'esborrava però no
--   en quedava cap rastre al registre d'activitat.
--
--   LA SOLUCIÓ: reemplaçar el CHECK per la llista completa (15 accions).
--   No cal migrar cap fila: la llista nova és un superconjunt de la vella,
--   o sigui que tot el que ja hi ha desat continua sent vàlid.
-- ══════════════════════════════════════════════════════════════════

alter table activity_log drop constraint if exists activity_log_action_check;

alter table activity_log add constraint activity_log_action_check check (action in (
  -- les 12 originals (supabase-fase1.sql)
  'alta família','baixa família','edició perfil','alta fill','baixa fill',
  'canvi graella','assignació creada','assignació eliminada',
  'canvi de rol','aprovació d''accés','rebutjada d''accés','acció automàtica',
  -- les 3 que faltaven
  'esborrat graella',   -- index.html · esborraGraellaDeDebò()  (v3.6)
  'codi regenerat',     -- supabase-v36.sql · regenera_codi()
  'desvinculació'       -- supabase-v37.sql · desvincula_compte()
));

-- ══ VERIFICACIÓ ══════════════════════════════════════════════════
-- 1) La llista nova ha de tenir 15 accions:
--      select pg_get_constraintdef(oid) from pg_constraint
--      where conname = 'activity_log_action_check';
--
-- 2) Cap fila existent no ha quedat fora (ha de sortir 0 files):
--      select distinct action from activity_log
--      where action not in (
--        'alta família','baixa família','edició perfil','alta fill','baixa fill',
--        'canvi graella','assignació creada','assignació eliminada',
--        'canvi de rol','aprovació d''accés','rebutjada d''accés','acció automàtica',
--        'esborrat graella','codi regenerat','desvinculació');
--
-- 3) A l'app: Perfil → «Desvincula aquest compte de la família».
--    Ha de funcionar i deixar una entrada 'desvinculació' a activity_log.

-- ══ ROLLBACK (torna a la llista de 12, la de fase1) ═══════════════
-- alter table activity_log drop constraint if exists activity_log_action_check;
-- alter table activity_log add constraint activity_log_action_check check (action in (
--   'alta família','baixa família','edició perfil','alta fill','baixa fill',
--   'canvi graella','assignació creada','assignació eliminada',
--   'canvi de rol','aprovació d''accés','rebutjada d''accés','acció automàtica'));
-- ATENCIÓ: si ja hi ha files amb les accions noves, aquest rollback fallarà.
-- Cal esborrar-les primer:
--   delete from activity_log
--   where action in ('esborrat graella','codi regenerat','desvinculació');
