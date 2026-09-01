-- ═══════════════════════════════════════════════════════════════════════
-- v49 · FINESTRA MÉS ÀMPLIA AL TRIGGER ANTIDUPLICATS D'AVISOS (v4.36)
--
-- EL PROBLEMA: es tornaven a veure files repetides («Riera Garcia · Ramon ·
--   🚗 puja al cotxe», quatre cops al mateix segon). Revisat el codi del
--   client (desa()): amb UN SOL desat, la lògica ja és correcta — compara
--   l'estat carregat (portaBase) amb l'estat després del canvi i mai
--   insereix dues files idèntiques dins la MATEIXA crida (no ha canviat des
--   del v4.21). L'origen real dels repetits és una CURSA entre DOS DESATS
--   INDEPENDENTS gairebé simultanis (dos dispositius de la mateixa família,
--   o un doble toc amb mala cobertura): cada un calcula el seu propi «abans
--   → després» correctament i tots dos insereixen el mateix avís — això
--   NO ho pot evitar un sol client tot sol; només ho pot tancar la base de
--   dades. El trigger del v47 ja ho intentava, però amb una finestra de
--   NOMÉS 2 segons: massa curta per absorbir dues persones desant amb pocs
--   segons de diferència.
--
-- LA SOLUCIÓ: la mateixa idea del v47, amb la finestra ampliada a 60
--   segons. No bloqueja res legítim: si el MATEIX canvi (mateixa família,
--   mateix nen, mateixa acció, mateix detall) es torna a produir de debò
--   més tard (una setmana després, per exemple), es torna a desar sense
--   problema — només es descarta quan arriba dins el minut just després
--   d'una fila idèntica, que és exactament el senyal d'una cursa.
--
-- Idempotent: es pot executar més d'un cop sense por.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function notifications_dedupe() returns trigger as $$
begin
  if exists (select 1 from notifications n
              where n.family_id = new.family_id
                and coalesce(n.message, '')    = coalesce(new.message, '')
                and coalesce(n.action, '')     = coalesce(new.action, '')
                and coalesce(n.child_name, '') = coalesce(new.child_name, '')
                and coalesce(n.detail, '')     = coalesce(new.detail, '')
                and n.created_at > now() - interval '60 seconds') then
    return null;   -- duplicat dins el mateix minut: es descarta en silenci
  end if;
  return new;
end $$ language plpgsql;

-- el trigger ja existia (v47): només es recrea la funció que crida

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK · si vols desfer-ho, executa NOMÉS aquest bloc (torna la
-- finestra de 2 segons del v47):
-- ═══════════════════════════════════════════════════════════════════════
-- create or replace function notifications_dedupe() returns trigger as $$
-- begin
--   if exists (select 1 from notifications n
--               where n.family_id = new.family_id
--                 and coalesce(n.message, '')    = coalesce(new.message, '')
--                 and coalesce(n.action, '')     = coalesce(new.action, '')
--                 and coalesce(n.child_name, '') = coalesce(new.child_name, '')
--                 and coalesce(n.detail, '')     = coalesce(new.detail, '')
--                 and n.created_at > now() - interval '2 seconds') then
--     return null;
--   end if;
--   return new;
-- end $$ language plpgsql;
