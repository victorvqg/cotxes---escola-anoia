-- ═══════════════════════════════════════════════════════════════════════
-- v47 · AVISOS: NOMÉS L'ADMIN HO VEU TOT, I SENSE DUPLICATS (v4.19)
--
-- 1 · RLS: la política de lectura de notifications deixava veure TOTS els
--     avisos a l'staff (is_staff_or_admin). Ara: cada família llegeix només
--     els seus; NOMÉS l'admin els de tot el grup.
--
-- 2 · DUPLICATS: si dos dispositius de la mateixa família desen gairebé
--     alhora, tots dos llegeixen l'estat d'abans i tots dos insereixen el
--     mateix avís (la carrera «un per dispositiu»). El fix és a l'origen:
--     un trigger BEFORE INSERT descarta en silenci una acció idèntica
--     (mateixa família, missatge, acció, nen i detall) arribada dins del
--     mateix parell de segons. Una mateixa acció al mateix segon es guarda
--     UNA sola vegada, vingui d'on vingui.
--
-- Idempotent: es pot executar més d'un cop sense por.
-- ═══════════════════════════════════════════════════════════════════════

-- 1 · lectura: la família els seus; l'admin, tots (l'staff ja no ho veu tot)
drop policy if exists notif_select on notifications;
create policy notif_select on notifications for select to authenticated
  using (family_id = my_family() or is_admin());

-- 2 · trigger antiduplicats
create or replace function notifications_dedupe() returns trigger as $$
begin
  if exists (select 1 from notifications n
              where n.family_id = new.family_id
                and coalesce(n.message, '')    = coalesce(new.message, '')
                and coalesce(n.action, '')     = coalesce(new.action, '')
                and coalesce(n.child_name, '') = coalesce(new.child_name, '')
                and coalesce(n.detail, '')     = coalesce(new.detail, '')
                and n.created_at > now() - interval '2 seconds') then
    return null;   -- duplicat: es descarta en silenci
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_notifications_dedupe on notifications;
create trigger trg_notifications_dedupe before insert on notifications
  for each row execute function notifications_dedupe();

-- Neteja opcional dels duplicats JA guardats (mateix segon, mateix contingut):
delete from notifications a using notifications b
 where a.id > b.id
   and a.family_id = b.family_id
   and coalesce(a.message, '')    = coalesce(b.message, '')
   and coalesce(a.action, '')     = coalesce(b.action, '')
   and coalesce(a.child_name, '') = coalesce(b.child_name, '')
   and coalesce(a.detail, '')     = coalesce(b.detail, '')
   and date_trunc('second', a.created_at) = date_trunc('second', b.created_at);

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK · si vols desfer-ho, executa NOMÉS aquest bloc (els duplicats
-- ja esborrats no tornen):
-- ═══════════════════════════════════════════════════════════════════════
-- drop trigger if exists trg_notifications_dedupe on notifications;
-- drop function if exists notifications_dedupe();
-- drop policy if exists notif_select on notifications;
-- create policy notif_select on notifications for select to authenticated
--   using (family_id = my_family() or is_staff_or_admin());
