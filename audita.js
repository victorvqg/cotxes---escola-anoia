// AUDITORIA FUNCIONAL v2 — Cotxes · Escola Anoia (era Supabase)
// Aixeca l'app en un DOM real (jsdom) amb un Supabase simulat en memòria
// (taules, RLS bàsica, triggers de validació i RPCs) i recorre el flux
// complet: login → consentiment → grup → família → graella → calendaris →
// assignacions → avisos → rols → importació → baixa. Executa: node audita.js
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { JSDOM } = require("jsdom");

const RUTA = process.argv[2] || path.join(__dirname, "index.html");
let html = fs.readFileSync(RUTA, "utf-8");
html = html.replace("ENGANXA-AQUI-LA-ANON-PUBLIC-KEY", "eyJ0ZXN0LWFub24ta2V5");

let ok = 0, ko = 0;
const T = (nom, cond, extra) => { if (cond){ ok++; console.log("  ✓ " + nom); } else { ko++; console.log("  ✗ " + nom + (extra ? " — " + extra : "")); } };
const tic = (ms) => new Promise(r => setTimeout(r, ms || 5));

/* ── 0 · Cablejat estàtic ── */
console.log("0 · CABLEJAT ESTÀTIC");
{
  const defs = new Set([...html.matchAll(/function\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1]));
  const usats = new Set([...html.matchAll(/on[a-z]+=(?:\\)?["']([A-Za-z_$][\w$]*)\(/g)].map(m => m[1]));
  const paraulesClau = new Set(["if", "for", "while", "switch", "return"]);
  const orfes = [...usats].filter(u => !defs.has(u) && !paraulesClau.has(u));
  T("tots els handlers (" + usats.size + ") apunten a funcions existents", orfes.length === 0, orfes.join(","));
  const idsRef = new Set([...html.matchAll(/\$\("#([\w-]+)"\)/g)].map(m => m[1]));
  const idsDef = new Set([...html.matchAll(/id=(?:'|\\?")([\w-]+)(?:'|\\?")/g)].map(m => m[1]));
  const idsOrfes = [...idsRef].filter(i => !idsDef.has(i));
  T("tots els ids referenciats (" + idsRef.size + ") existeixen", idsOrfes.length === 0, idsOrfes.join(","));
  T("lema i peu amb versió 4.31", html.includes("Montbui → Escola Anoia") && html.includes("creat per Víctor Quintana") && html.includes("versió 4.31"));
  T("ja no queda res del backend GitHub", !html.includes("api.github.com") && !html.includes("github_pat") && !html.includes("ghGet") && !html.includes("ghPut"));
  T("Google fora del tot (ni botó, ni text, ni funció)", !html.includes("Google") && !html.includes("fesGoogle") && !html.includes("GOOGLE_OAUTH"));
  // v3.2: l'SQL ha d'incloure el codi de família, el bloqueig staff→admin i els límits
  const sql = fs.readFileSync(path.join(__dirname, "supabase-fase1.sql"), "utf-8");
  T("SQL: claim_family exigeix el codi de la família (p_token)", /claim_family\(p_family uuid, p_token text\)/.test(sql) && sql.includes("Codi de la família incorrecte"));
  T("SQL: can_touch_family (staff no toca l'admin) + límits 100/5", sql.includes("can_touch_family") && sql.includes("limita_families") && sql.includes("limita_nens"));
  // v3.3: curs per nen, tant a fase1 (instal·lacions noves) com al patch v33 (la BD actual)
  const sql33 = fs.readFileSync(path.join(__dirname, "supabase-v33.sql"), "utf-8");
  T("SQL: curs per nen a children (fase1 + patch v33)", /curs text not null default ''/.test(sql) && /alter table public\.children[\s\S]*add column if not exists curs/.test(sql33));
  // v3.8: el patch v37 duu la vinculació robusta sencera
  const sql37 = fs.readFileSync(path.join(__dirname, "supabase-v37.sql"), "utf-8");
  T("SQL v37: el_meu_perfil + claim_family idempotent i clar + desvincula_compte + alta atòmica + default a children.curs",
    sql37.includes("function public.el_meu_perfil") && sql37.includes("ja està vinculat a la família") &&
    sql37.includes("function public.desvincula_compte") && sql37.includes("p_nens jsonb") &&
    sql37.includes("alter column curs set default"));
  T("la URL del projecte Supabase és al CONFIG", html.includes("https://jbfjrgddsywpmwabvbtb.supabase.co"));
  T("la llibreria supabase-js es carrega per CDN", html.includes("@supabase/supabase-js"));
  // Regressió: a create_group, l'override del trigger de rols ha d'anar ABANS de l'insert de la família
  const cg = sql.slice(sql.indexOf("function create_group"), sql.indexOf("$$ language", sql.indexOf("function create_group")));
  T("SQL: create_group posa l'admin_override ABANS d'inserir la família", cg.indexOf("admin_override") > -1 && cg.indexOf("admin_override") < cg.indexOf("insert into families"));
  // v3.9→v4.0: només el titular escriu (families.owner_id)
  const sql39 = fs.readFileSync(path.join(__dirname, "supabase-v39.sql"), "utf-8");
  T("SQL v39: owner_id + es_titular i can_touch_family exigeix ser-ne el titular",
    sql39.includes("add column if not exists owner_id") && sql39.includes("function es_titular") &&
    /p_family = my_family\(\) and es_titular\(p_family\)/.test(sql39) && sql39.includes("trg_marca_titular"));
  // v4.16: llista_comptes torna també l'últim accés (canvi de retorn: drop + create)
  {
    const sql46 = fs.readFileSync(path.join(__dirname, "supabase-v46.sql"), "utf-8");
    T("SQL v46: llista_comptes amb ultim_acces (last_sign_in_at), drop+create i porta d'admin intacta",
      sql46.includes("drop function if exists public.llista_comptes") &&
      sql46.includes("last_sign_in_at") && sql46.includes("ultim_acces") && sql46.includes("role = 'admin'"));
  }
  // v4.26: el servidor diu si el compte és el titular (el_meu_perfil + es_titular)
  {
    const sql48 = fs.readFileSync(path.join(__dirname, "supabase-v48.sql"), "utf-8");
    T("SQL v48: el_meu_perfil retorna es_titular (drop+create, security definer)",
      sql48.includes("drop function if exists public.el_meu_perfil") &&
      sql48.includes("es_titular(p.family_id)") && sql48.includes("security definer"));
  }
  // v4.19: RLS d'avisos només família/admin + trigger antiduplicats + una línia per avís
  {
    const sql47 = fs.readFileSync(path.join(__dirname, "supabase-v47.sql"), "utf-8");
    T("SQL v47: lectura només família/admin (staff fora) i trigger antiduplicats de 2 segons",
      sql47.includes("family_id = my_family() or is_admin()") &&
      sql47.includes("notifications_dedupe") && sql47.includes("before insert on notifications"));
  }
  T("v4.19: el CSS força un avís per línia", html.includes("#avisos-llista details{display:block"));
  // v4.15: els avisos viuen a notifications amb columnes estructurades
  {
    const sql45 = fs.readFileSync(path.join(__dirname, "supabase-v45.sql"), "utf-8");
    T("SQL v45: notifications guanya família, nen, canvi, detall i autor (idempotent)",
      ["family_name", "child_name", "action", "detail", "actor_name"].every(c => sql45.includes(c)) &&
      sql45.includes("add column if not exists"));
  }
  // v4.13: esborrar un compte només via security definer, només l'admin, mai un mateix
  {
    const sql44 = fs.readFileSync(path.join(__dirname, "supabase-v44.sql"), "utf-8");
    T("SQL v44: esborra_compte és security definer, esborra d'auth.users, exigeix l'admin, refusa l'autoesborrat i revoca public/anon",
      sql44.includes("security definer") && sql44.includes("delete from auth.users") &&
      sql44.includes("role = 'admin'") && sql44.includes("el teu propi compte") &&
      /revoke all on function public\.esborra_compte/.test(sql44) && sql44.includes("'baixa compte'"));
  }
  // v4.11: la família del nen pot treure'l del cotxe d'un altre conductor (SQL v43)
  {
    const sql43 = fs.readFileSync(path.join(__dirname, "supabase-v43.sql"), "utf-8");
    T("SQL v43: política de DELETE a assignments per a la família del nen (via can_touch_family)",
      /create policy .* on assignments for delete/.test(sql43) && sql43.includes("child_id") && sql43.includes("can_touch_family"));
  }
  T("v4.11: la sincronització en viu també escolta la taula notifications",
    html.includes('"families", "children", "weekly_marks", "assignments", "notifications"'));
  // v4.5: la llista de comptes llegeix auth.users — només via security definer i només l'admin
  {
    const sql42 = fs.readFileSync(path.join(__dirname, "supabase-v42.sql"), "utf-8");
    T("SQL v42: llista_comptes és security definer, mira auth.users, exigeix l'admin i revoca public/anon",
      sql42.includes("security definer") && sql42.includes("auth.users") &&
      sql42.includes("role = 'admin'") && /revoke all on function public\.llista_comptes/.test(sql42));
  }
  T("el client no deixa editar el progenitor (guards + banner)",
    html.includes("function nomesTitular") && html.includes("esProgenitor") && html.includes("prog-banner") &&
    (html.match(/if \(nomesTitular\(\)\) return;/g) || []).length >= 20);
  // v4.1 · TASCA 4: les hores que es mostren viuen NOMÉS a FRANGES[].hora
  T("les hores mostrades són 7.35 / 8.35 / 14.35 (13.00 i 17.00 sense tocar)",
    html.includes('{id:"e8", hora:"7.35"') && html.includes('{id:"e9", hora:"8.35"') &&
    html.includes('{id:"e15",hora:"14.35"') && html.includes('{id:"r13",hora:"13.00"') && html.includes('{id:"r17",hora:"17.00"'));
  T("no queda cap hora vella (8.00 / 9.00 / 15.00) enlloc del codi", !/8\.00|9\.00|15\.00/.test(html));
  T("les claus internes dels torns NO han canviat (les dades de Supabase hi van lligades)",
    ["e8", "e9", "r13", "e15", "r17"].every(k => html.includes('id:"' + k + '"') || html.includes('id:"' + k + '" ')));
  T("els textos en prosa llegeixen l'hora de FRANGES (horaDe), no literals",
    html.includes("function horaDe(id)") && (html.match(/horaDe\("e[89]"\)/g) || []).length >= 8);
  // v4.1 · TASCA 1: el curs duplicat de la família fora del formulari
  T("ja no hi ha el camp «Curs dels nens» ni el select nf-curs", !html.includes("Curs dels nens") && !html.includes("nf-curs"));
  T("families.curs ja no es fa servir enlloc (ni lògica, ni desat, ni pantalles)",
    !html.includes("f.curs") && !html.includes("dades.curs") && !html.includes("Curs de la família"));
  T("el curs de cada fill sí que hi és, al formulari i al Perfil",
    html.includes("nfNens[") && html.includes("triaCursNen"));
  // v4.1 · TASCA 2: el codi de creació NO pot ser a l'app
  T("el codi de creació no és enlloc d'index.html: es comprova a create_group()",
    html.includes("gg-codicreacio") && html.includes("p_codi: codiC") && !html.includes("codi_creacio_grup:"));
  const sql41 = fs.readFileSync(path.join(__dirname, "supabase-v41.sql"), "utf-8");
  T("SQL v41: app_config amb RLS i sense cap política + create_group el comprova",
    sql41.includes("create table if not exists app_config") && sql41.includes("alter table app_config enable row level security") &&
    sql41.includes("Codi de creació incorrecte") && sql41.includes("drop function if exists create_group(text, text, text, text, int)"));
  T("SQL v41: llegir i canviar el codi és només per a l'admin",
    /function public\.codi_creacio_grup\(\)[\s\S]*?is_admin\(\)/.test(sql41) &&
    /function public\.set_codi_creacio_grup\(p_codi text\)[\s\S]*?is_admin\(\)/.test(sql41));
  // v4.1 · TASCA 3: cap pantalla de pas sense sortida
  T("les pantalles de pas (codi de grup i tria de família) tenen sortida",
    (html.match(/Enrere \\u00b7 tanca la sessi\\u00f3/g) || []).length >= 2 &&
    html.includes("No tens el codi? Demana'l a l'administrador del grup."));
  /* v4.0.1 · REGRESSIÓ: activity_log.action té un CHECK amb llista tancada.
     Tota acció que el codi escrigui (JS o RPC) hi ha de ser, o la BD avorta
     l'operació sencera. Va passar amb 'desvinculació', 'codi regenerat' i
     'esborrat graella'. Aquesta prova ho enganxa abans que ho faci un usuari. */
  {
    const sql40 = fs.readFileSync(path.join(__dirname, "supabase-v44.sql"), "utf-8");   // v44 amplia el CHECK del v40: la llista bona és la seva
    const i0 = sql40.indexOf("add constraint activity_log_action_check");
    const i1 = sql40.indexOf("));", i0);
    const bloc = (i0 >= 0 && i1 > i0) ? sql40.slice(i0, i1) : "";
    const permeses = new Set([...bloc.matchAll(/'((?:[^']|'')*)'/g)].map(x => x[1].replace(/''/g, "'")));
    // 1 · accions que escriu el client
    const delJs = [...html.matchAll(/logActivitat\(\s*"((?:[^"\\]|\\.)*)"/g)]
      .map(m => { try { return JSON.parse('"' + m[1] + '"'); } catch(e){ return m[1]; } });
    // 2 · accions que escriuen les RPC: columna `action` de cada insert into activity_log
    const delSql = [];
    for (const fitxer of fs.readdirSync(__dirname).filter(n => /^supabase-.*\.sql$/.test(n))){
      const t = fs.readFileSync(path.join(__dirname, fitxer), "utf-8");
      for (const m of t.matchAll(/insert into activity_log\s*\(([^)]*)\)\s*values\s*\(([\s\S]*?)\);/gi)){
        const cols = m[1].split(",").map(c => c.trim());
        const idx = cols.indexOf("action");
        if (idx < 0) continue;
        const v = m[2]; const parts = []; let cur = "", dep = 0, j = 0;
        while (j < v.length){
          const ch = v[j];
          if (ch === "'"){ cur += ch; j++;
            while (j < v.length){ cur += v[j];
              if (v[j] === "'"){ if (v[j+1] === "'"){ cur += v[++j]; j++; continue; } j++; break; }
              j++; }
            continue; }
          if (ch === "(") dep++; else if (ch === ")") dep--;
          else if (ch === "," && dep === 0){ parts.push(cur); cur = ""; j++; continue; }
          cur += ch; j++;
        }
        parts.push(cur);
        const val = (parts[idx] || "").trim();
        if (val.startsWith("'")) delSql.push(val.slice(1, val.lastIndexOf("'")).replace(/''/g, "'"));
      }
    }
    const totes = [...new Set([...delJs, ...delSql])];
    const fora = totes.filter(a => !permeses.has(a));
    T("SQL v44: el CHECK d'activity_log llista 16 accions (les 15 del v40 + 'baixa compte')", permeses.size === 16 && permeses.has("baixa compte"), permeses.size + ": " + [...permeses].join(" | "));
    T("cap de les " + totes.length + " accions que escriu el codi queda fora del CHECK", fora.length === 0, "fora: " + fora.join(", "));
  }
}

/* ══ Supabase simulat (taules + RLS bàsica + triggers + rpc) ══ */
const DB = {
  users: {}, groups: [], profiles: [], families: [], children: [],
  weekly_marks: [], assignments: [], notifications: [], notification_reads: [],
  activity_log: [], join_requests: [], _canals: [],
  app_config: { codi_creacio_grup: "CODI-TEST" }   // v4.1: viu a Supabase, mai a index.html
};
let currentUserId = null;
const authCbs = [];
const err = m => ({ data: null, error: { message: m } });
const dades = d => ({ data: d, error: null });
const meu = () => DB.profiles.find(p => p.id === currentUserId) || null;
const mevaFamId = () => { const p = meu(); return p ? p.family_id : null; };
const famPerId = id => DB.families.find(f => f.id === id) || null;
const grupMeu = () => {
  const p = meu(); if (!p) return null;
  const f = famPerId(p.family_id);
  return f ? f.group_id : (p.requested_group || null);
};
const socMembre = () => { const p = meu(); return !!(p && p.status === "aprovat" && p.family_id); };
const rolMeu = () => { const f = famPerId(mevaFamId()); return f ? f.role : "usuari"; };
const socAdmin = () => socMembre() && rolMeu() === "admin";
const socStaffAdmin = () => socMembre() && (rolMeu() === "admin" || rolMeu() === "staff");
const potTocarFam = fid => fid === mevaFamId() || socAdmin() || (socStaffAdmin() && (famPerId(fid) || {}).role !== "admin");
const codiDeFam = f => String(f.invite_token || "").replace(/-/g, "").slice(0, 8).toUpperCase();
function logBD(gid, accio, famId, detalls){
  DB.activity_log.push({ id: randomUUID(), group_id: gid, actor_id: currentUserId, family_id: famId || null, affected_family_id: null, action: accio, details: detalls || "", created_at: new Date().toISOString() });
}

function execQuery(q){
  const t = q.t;
  const filtra = rows => q.filters.reduce((acc, f) => acc.filter(f), rows);
  if (q.op === "select"){
    let rows = [];
    if (t === "profiles") rows = DB.profiles.filter(r => r.id === currentUserId);
    else if (t === "groups") rows = DB.groups.slice();
    else if (t === "families") rows = (socMembre() ? DB.families.filter(r => r.group_id === grupMeu()) : [])
      .map(r => { const c = Object.assign({}, r); delete c.invite_token; return c; });
    else if (t === "children"){ const g = grupMeu(); rows = socMembre() ? DB.children.filter(r => { const f = famPerId(r.family_id); return f && f.group_id === g; }) : []; }
    else if (t === "weekly_marks"){ const g = grupMeu(); rows = socMembre() ? DB.weekly_marks.filter(r => { const f = famPerId(r.family_id); return f && f.group_id === g; }) : []; }
    else if (t === "assignments") rows = socMembre() ? DB.assignments.filter(r => r.group_id === grupMeu()) : [];
    else if (t === "activity_log") rows = socAdmin() ? DB.activity_log.filter(r => r.group_id === grupMeu()) : [];
    else if (t === "notifications") rows = DB.notifications.filter(r => r.family_id === mevaFamId() || socAdmin());   // v47: staff fora
    let res = filtra(rows);
    if (q.ordre) res = res.slice().sort((a, b2) => (String(a[q.ordre.c] || "") < String(b2[q.ordre.c] || "") ? -1 : 1) * (q.ordre.asc ? 1 : -1));
    if (q.limitN != null) res = res.slice(0, q.limitN);
    return dades(res);
  }
  if (q.op === "insert"){
    const out = [];
    for (const row0 of q.rows){
      const row = Object.assign({}, row0);
      if (t === "profiles"){
        if (row.id !== currentUserId) return err("profiles: només la teva fila");
        if (DB.profiles.some(p => p.id === row.id)) return err("duplicate key");
        DB.profiles.push(Object.assign({ email: "", family_id: null, requested_group: null, status: "pendent", consent_at: null, created_at: new Date().toISOString() }, row));
        out.push(row); continue;
      }
      if (t === "families"){
        if (!socMembre() || row.group_id !== grupMeu()) return err("families: fora del teu grup");
        if (DB.families.filter(x => x.group_id === row.group_id).length >= 100) return err("Aquest grup ja ha arribat al màxim de 100 famílies");
        if (row.role && row.role !== "usuari" && !socAdmin()) row.role = "usuari"; // trigger protect_family_role
        const r = Object.assign({ id: randomUUID(), cognom2: "", phone: "", phone_visible: true, seats: 3, role: "usuari", invite_token: randomUUID(), created_at: new Date().toISOString() }, row);
        if (r.seats < 0 || r.seats > 6) return err("seats fora de rang");
        DB.families.push(r); out.push(r); continue;
      }
      if (t === "children"){
        if (!potTocarFam(row.family_id)) return err("children: no és la teva família");
        if (DB.children.filter(c => c.family_id === row.family_id).length >= 5) return err("Màxim 5 fills per família");
        const r = Object.assign({ id: randomUUID() }, row);
        DB.children.push(r); out.push(r); continue;
      }
      if (t === "weekly_marks"){
        if (!potTocarFam(row.family_id)) return err("weekly_marks: no és la teva família");
        if (DB.weekly_marks.some(m => m.family_id === row.family_id && m.slot === row.slot && m.day === row.day)) return err("duplicate key (family,slot,day)");
        const r = Object.assign({ id: randomUUID(), children_ids: [], seats_override: null, updated_by: currentUserId, updated_at: new Date().toISOString() }, row);
        DB.weekly_marks.push(r); out.push(r); continue;
      }
      if (t === "assignments"){
        if (!potTocarFam(row.driver_family_id)) return err("assignments: no és el teu cotxe");
        // trigger validate_assignment
        const child = DB.children.find(c => c.id === row.child_id);
        if (!child) return err("Nen inexistent");
        if (child.family_id === row.driver_family_id) return err("No pots assignar-te un fill de la teva pròpia família");
        const mark = DB.weekly_marks.find(m => m.family_id === child.family_id && m.slot === row.slot && m.day === row.day && m.type === "request");
        if (!mark || !(mark.children_ids || []).includes(row.child_id)) return err("Aquest nen no demana plaça en aquesta franja");
        const drive = DB.weekly_marks.find(m => m.family_id === row.driver_family_id && m.slot === row.slot && m.day === row.day && m.type === "drive");
        if (!drive) return err("La família no condueix en aquesta franja");
        const seats = drive.seats_override != null ? drive.seats_override : (famPerId(row.driver_family_id) || {}).seats;
        const n = DB.assignments.filter(a => a.driver_family_id === row.driver_family_id && a.slot === row.slot && a.day === row.day).length;
        if (n >= (seats || 0)) return err("El cotxe ja és ple");
        if (DB.assignments.some(a => a.child_id === row.child_id && a.slot === row.slot && a.day === row.day)) return err("duplicate key (child,slot,day)");
        const r = Object.assign({ id: randomUUID(), updated_by: currentUserId }, row);
        DB.assignments.push(r); out.push(r); continue;
      }
      if (t === "activity_log"){
        if (!socMembre() || row.group_id !== grupMeu()) return err("activity_log: fora del teu grup");
        DB.activity_log.push(Object.assign({ id: randomUUID(), created_at: new Date().toISOString() }, row));
        out.push(row); continue;
      }
      if (t === "notifications"){
        // v47: trigger antiduplicats — mateixa acció dins de 2 segons, una sola fila
        const dup = DB.notifications.some(x => x.family_id === row.family_id &&
          (x.message || "") === (row.message || "") && (x.action || "") === (row.action || "") &&
          (x.child_name || "") === (row.child_name || "") && (x.detail || "") === (row.detail || "") &&
          (Date.now() - Date.parse(x.created_at)) < 2000);
        if (!dup) DB.notifications.push(Object.assign({ id: randomUUID(), created_at: new Date().toISOString() }, row));
        out.push(row); continue;
      }
      return err("taula no suportada al mock: " + t);
    }
    return dades(q.volFiles ? out : null);
  }
  if (q.op === "update"){
    let rows = DB[t] || [];
    let tocats = 0;
    for (const row of rows){
      if (!q.filters.every(f => f(row))) continue;
      if (t === "profiles"){
        if (row.id !== currentUserId) return err("profiles: només la teva fila");
        if (("status" in q.obj && q.obj.status !== row.status) || ("family_id" in q.obj && q.obj.family_id !== row.family_id))
          return err("Només l'administrador pot canviar l'estat o la família"); // trigger protect_profile_escalation
      }
      if (t === "families"){
        if (!potTocarFam(row.id)) return err("families: no la pots tocar");
        if ("role" in q.obj && q.obj.role !== row.role && !socAdmin()) return err("Només l'administrador pot canviar rols");
      }
      if (t === "children" && !potTocarFam(row.family_id)) return err("children: no és la teva família");
      if (t === "weekly_marks" && !potTocarFam(row.family_id)) return err("weekly_marks: no és la teva família");
      Object.assign(row, q.obj); tocats++;
    }
    return dades(q.volFiles ? tocats : null);
  }
  if (q.op === "delete"){
    const abans = DB[t].length;
    DB[t] = DB[t].filter(row => {
      if (!q.filters.every(f => f(row))) return true;
      if (t === "children" && !potTocarFam(row.family_id)) return true;
      if (t === "weekly_marks" && !potTocarFam(row.family_id)) return true;
      if (t === "assignments" && !potTocarFam(row.driver_family_id) &&
          !potTocarFam((DB.children.find(c => c.id === row.child_id) || {}).family_id)) return true;   // SQL v43
      return false;
    });
    return dades(null);
  }
  return err("operació desconeguda");
}

function qb(t){
  const q = { t: t, op: "select", filters: [], rows: null, obj: null, volFiles: false, ordre: null, limitN: null };
  const api = {
    select(){ if (q.op !== "select") q.volFiles = true; return api; },
    eq(c, v){ q.filters.push(r => r[c] === v); return api; },
    in(c, arr){ q.filters.push(r => (arr || []).indexOf(r[c]) >= 0); return api; },
    order(c, o){ q.ordre = { c: c, asc: !(o && o.ascending === false) }; return api; },
    limit(n){ q.limitN = n; return api; },
    insert(rows){ q.op = "insert"; q.rows = Array.isArray(rows) ? rows : [rows]; return api; },
    update(obj){ q.op = "update"; q.obj = obj; return api; },
    delete(){ q.op = "delete"; return api; },
    then(res, rej){ Promise.resolve().then(() => execQuery(q)).then(res, rej); }
  };
  return api;
}

function rpc(nom, p){
  p = p || {};
  if (nom === "create_group"){
    // v4.1: sense el codi de creació correcte no es crea res
    if (String(p.p_codi || "").trim().toUpperCase() !== String(DB.app_config.codi_creacio_grup || "").trim().toUpperCase())
      return err("Codi de creació incorrecte");
    const gid = randomUUID();
    const codi = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
    DB.groups.push({ id: gid, name: p.p_name, invite_code: codi, status: "actiu", notice: "", created_by: currentUserId, created_at: new Date().toISOString() });
    const fid = randomUUID();
    // Emula trg_protect_family_role: l'override va ABANS de l'insert (si no, el rol cau a 'usuari')
    DB.families.push({ id: fid, group_id: gid, cognom1: p.p_cognom1, cognom2: p.p_cognom2 || "", name: (p.p_cognom1 + " " + (p.p_cognom2 || "")).trim(), driver: p.p_driver || "", phone: "", phone_visible: true, seats: p.p_seats == null ? 3 : p.p_seats, role: "admin", invite_token: randomUUID(), created_at: new Date().toISOString() });
    const pr = meu();
    if (pr){ pr.family_id = fid; pr.requested_group = gid; pr.status = "aprovat"; }
    logBD(gid, "alta família", fid, "Grup " + p.p_name + " creat");
    return dades(gid);
  }
  if (nom === "codi_creacio_grup"){
    if (!socAdmin()) return err("Només l'administrador pot veure el codi de creació");
    return dades(DB.app_config.codi_creacio_grup);
  }
  if (nom === "set_codi_creacio_grup"){
    if (!socAdmin()) return err("Només l'administrador pot canviar el codi de creació");
    const v = String(p.p_codi || "").trim();
    if (v.length < 4) return err("El codi de creació ha de tenir com a mínim 4 caràcters");
    DB.app_config.codi_creacio_grup = v;
    return dades(null);
  }
  if (nom === "grup_per_codi"){
    const g = DB.groups.filter(x => x.invite_code === String(p.p_code || "").trim().toUpperCase() && x.status === "actiu").map(x => ({ id: x.id, name: x.name }));
    return dades(g);
  }
  if (nom === "families_per_reclamar"){
    const r = DB.families.filter(f => f.group_id === p.p_group && DB.profiles.filter(x => x.family_id === f.id).length < 2)
      .map(f => ({ id: f.id, name: f.name, driver: f.driver || "", seats: f.seats, curs: f.curs || "",
                   nens: DB.children.filter(c => c.family_id === f.id).map(c => c.name).join(", ") }));
    return dades(r);
  }
  if (nom === "codi_familia"){
    const f = famPerId(p.p_family);
    if (!f) return err("Família inexistent");
    if (!(f.id === mevaFamId() || socAdmin())) return err("Sense permís");
    return dades(codiDeFam(f));
  }
  if (nom === "codis_families"){
    if (!socAdmin()) return err("Només l'administrador");
    const g = grupMeu();
    const r = DB.families.filter(f => f.group_id === g)
      .map(f => ({ id: f.id, nom: f.name, codi: codiDeFam(f),
                   n_comptes: DB.profiles.filter(x => x.family_id === f.id).length }))
      .sort((a, b) => (a.nom < b.nom ? -1 : 1));
    return dades(r);
  }
  if (nom === "regenera_codi"){
    if (!socAdmin()) return err("Només l'administrador");
    const f = famPerId(p.p_family);
    if (!f || f.group_id !== grupMeu()) return err("Família inexistent");
    f.invite_token = randomUUID();
    logBD(f.group_id, "codi regenerat", f.id, "Codi d'accés regenerat per a " + f.name);
    return dades(codiDeFam(f));
  }
  if (nom === "el_meu_perfil"){
    const pr = meu();
    if (!pr) return dades([]);
    const fila = Object.assign({}, pr);
    if (pr.family_id){
      const f = famPerId(pr.family_id);
      const tit = f ? (f.owner_id || (DB.profiles.find(x => x.family_id === f.id) || {}).id) : null;
      fila.es_titular = !tit || tit === currentUserId;   // com es_titular() del v39
    } else fila.es_titular = true;
    return dades([fila]);
  }
  // v3.9: cos ÚNIC de vinculació (idempotent, nom si és una altra, màxim 2 comptes)
  const vinculaAFamilia = (f, via) => {
    const pr = meu();
    if (pr && pr.family_id === f.id) return dades(null);
    if (pr && pr.family_id){
      const fm = famPerId(pr.family_id);
      return err("Aquest compte ja està vinculat a la família " + (fm ? fm.name : "(desconeguda)"));
    }
    if (DB.profiles.filter(x => x.family_id === f.id).length >= 2) return err("Aquesta família ja té 2 comptes");
    pr.family_id = f.id; pr.requested_group = f.group_id; pr.status = "aprovat";
    logBD(f.group_id, "aprovació d'accés", f.id, "Compte vinculat a " + f.name + (via || ""));
    return dades(null);
  };
  if (nom === "claim_family"){
    const pr = meu();
    if (pr && pr.family_id === p.p_family) return dades(null);   // idempotent ABANS del codi
    const f = famPerId(p.p_family);
    if (!f) return err("Família inexistent");
    if (pr && !pr.family_id && codiDeFam(f) !== String(p.p_token || "").trim().toUpperCase()) return err("Codi de la família incorrecte");
    return vinculaAFamilia(f, "");
  }
  if (nom === "claim_family_per_codi"){
    const codi = String(p.p_token || "").trim().toUpperCase();
    const f = DB.families.find(x => codiDeFam(x) === codi && (DB.groups.find(g => g.id === x.group_id) || {}).status === "actiu");
    if (!f) return err("Cap família amb aquest codi. Demana'l a algú de la família: el veu al seu Perfil.");
    const r = vinculaAFamilia(f, " · via codi de família");
    if (r.error) return r;
    return dades([{ family_id: f.id, nom: f.name }]);
  }
  if (nom === "desvincula_compte"){
    const pr = meu();
    if (!pr || !pr.family_id) return dades(null);   // ja desvinculat: cap error
    const fm = famPerId(pr.family_id);
    pr.family_id = null; pr.status = "pendent";
    if (fm) logBD(fm.group_id, "desvinculació", fm.id, "Compte desvinculat de " + fm.name);
    return dades(null);
  }
  if (nom === "join_group_crea"){
    const g = DB.groups.find(x => x.invite_code === String(p.p_code || "").trim().toUpperCase() && x.status === "actiu");
    if (!g) return err("Codi d'invitació no vàlid");
    const pr = meu();
    if (pr && pr.family_id) return err("Aquest compte ja té família");
    // v3.8: alta ATÒMICA — família + nens + perfil en una sola «transacció»;
    // si un nen és invàlid, no es toca res (el trigger de 5 fills també hi val)
    const nens = (p.p_nens || []).filter(x => x && String(x.nom || "").trim());
    if (nens.length > 5) return err("Màxim 5 fills per família");
    if ((p.p_nens || []).some(x => x && x.__peta)) return err("error simulat en inserir els nens");
    const fid = randomUUID();
    DB.families.push({ id: fid, group_id: g.id, cognom1: p.p_cognom1, cognom2: p.p_cognom2 || "", name: (p.p_cognom1 + " " + (p.p_cognom2 || "")).trim(), driver: p.p_driver || "", phone: "", phone_visible: true, seats: p.p_seats == null ? 3 : p.p_seats, role: "usuari", invite_token: randomUUID(), created_at: new Date().toISOString() });
    nens.forEach(x => DB.children.push({ id: randomUUID(), family_id: fid, name: String(x.nom).trim(), curs: x.curs || "" }));
    pr.family_id = fid; pr.requested_group = g.id; pr.status = "aprovat";
    logBD(g.id, "alta família", fid, "Alta amb codi d'invitació");
    return dades(fid);
  }
  if (nom === "llista_comptes"){
    // v4.5: correus d'auth.users — només l'admin del grup
    if (!socAdmin()) return err("Només l'administrador pot veure la llista de comptes");
    const g = grupMeu();
    const rows = Object.values(DB.users).map(u => {
      const pr = DB.profiles.find(x => x.id === u.id) || null;
      const f = pr && pr.family_id ? famPerId(pr.family_id) : null;
      // el fake no omple owner_id: el titular és el primer perfil vinculat (com el backfill del v39)
      const titular = f ? (f.owner_id || (DB.profiles.find(x => x.family_id === f.id) || {}).id) : null;
      return { pr, f, fila: {
        correu: u.email, familia: f ? f.name : "",
        rol_compte: !pr ? "sense perfil" : !pr.family_id ? "sense família" : (titular === u.id ? "titular" : "progenitor"),
        rol_familia: f ? f.role : "", estat: pr ? pr.status : "", creat: u.creat || "", ultim_acces: u.ultim_acces || null } };
    }).filter(x => (x.f && x.f.group_id === g) ||
                   (x.pr && !x.pr.family_id && (!x.pr.requested_group || x.pr.requested_group === g)) ||
                   !x.pr)
      .map(x => x.fila);
    return dades(rows);
  }
  if (nom === "esborra_compte"){
    // v4.13: només l'admin, mai sobre si mateix; esborra en cadena segons el cas
    if (!socAdmin()) return err("Només l'administrador pot esborrar comptes");
    const correu = String(p.p_correu || "").trim().toLowerCase();
    const u = Object.values(DB.users).find(x => (x.email || "").toLowerCase() === correu);
    if (!u) return err("No hi ha cap compte amb el correu " + p.p_correu);
    if (u.id === currentUserId) return err("No pots esborrar el teu propi compte d'administrador");
    const fets = ["compte " + correu + " esborrat"];
    const pr = DB.profiles.find(x => x.id === u.id) || null;
    const f = pr && pr.family_id ? famPerId(pr.family_id) : null;
    if (f){
      const titular = f.owner_id || (DB.profiles.find(x => x.family_id === f.id) || {}).id;
      const altre = DB.profiles.find(x => x.family_id === f.id && x.id !== u.id);
      if (titular === u.id && altre){
        f.owner_id = altre.id;
        fets.push("l'altre compte de la família " + f.name + " passa a titular");
      } else if (titular === u.id){
        const nensF = DB.children.filter(c => c.family_id === f.id).map(c => c.id);
        DB.profiles.forEach(x => { if (x.family_id === f.id){ x.family_id = null; x.status = "pendent"; } });
        DB.children = DB.children.filter(c => c.family_id !== f.id);
        DB.weekly_marks = DB.weekly_marks.filter(m => m.family_id !== f.id);
        DB.assignments = DB.assignments.filter(a => a.driver_family_id !== f.id && !nensF.includes(a.child_id));
        DB.notifications = DB.notifications.filter(nt => nt.family_id !== f.id);
        DB.families = DB.families.filter(x => x.id !== f.id);
        logBD(grupMeu(), "baixa família", null, f.name + " esborrada (compte esborrat)");
        fets.push("família " + f.name + " esborrada, amb " + nensF.length + " fill(s), la seva graella i les places que ocupaven als cotxes");
      } else {
        fets.push("compte desvinculat de la família " + f.name + " (la família es queda igual)");
      }
    }
    DB.notification_reads = DB.notification_reads.filter(x => x.user_id !== u.id);
    DB.join_requests = DB.join_requests.filter(x => x.user_id !== u.id);
    DB.weekly_marks.forEach(m => { if (m.updated_by === u.id) m.updated_by = null; });
    DB.assignments.forEach(a => { if (a.updated_by === u.id) a.updated_by = null; });
    DB.activity_log.forEach(l => { if (l.actor_id === u.id) l.actor_id = null; });
    DB.families.forEach(x => { if (x.owner_id === u.id) x.owner_id = null; });
    DB.profiles = DB.profiles.filter(x => x.id !== u.id);
    delete DB.users[u.id];
    logBD(grupMeu(), "baixa compte", null, correu);
    return dades(fets);
  }
  if (nom === "esborra_familia"){
    const f = famPerId(p.p_family);
    if (!f) return err("Família inexistent");
    if (!(mevaFamId() === f.id || socAdmin())) return err("No tens permís per esborrar aquesta família");
    if (f.role === "admin" && mevaFamId() === f.id && DB.families.some(x => x.group_id === f.group_id && x.id !== f.id))
      return err("Ets l'administrador: transfereix el rol o esborra primer la resta de famílies");
    DB.profiles.forEach(x => { if (x.family_id === f.id){ x.family_id = null; x.status = "pendent"; } });
    logBD(f.group_id, "baixa família", mevaFamId(), f.name + " esborrada");
    DB.activity_log.forEach(x => { if (x.family_id === f.id && x.action !== "baixa família"){ x.actor_id = null; x.details = ""; } });
    const nensIds = DB.children.filter(c => c.family_id === f.id).map(c => c.id);
    DB.assignments = DB.assignments.filter(a => a.driver_family_id !== f.id && nensIds.indexOf(a.child_id) < 0);
    DB.weekly_marks = DB.weekly_marks.filter(m => m.family_id !== f.id);
    DB.children = DB.children.filter(c => c.family_id !== f.id);
    DB.notifications = DB.notifications.filter(n => n.family_id !== f.id);
    DB.families = DB.families.filter(x => x.id !== f.id);
    return dades(null);
  }
  return err("rpc desconeguda al mock: " + nom);
}

function fakeSupabaseClient(){
  return {
    from: qb,
    rpc: async (n, p) => rpc(n, p),
    channel(nom){
      const c = { nom: nom, subs: [],
        on(t, f, cb){ c.subs.push({ table: f && f.table, cb: cb }); return c; },
        subscribe(){ DB._canals.push(c); return c; },
        unsubscribe(){ return c; } };
      return c;
    },
    removeChannel(c){ DB._canals = DB._canals.filter(x => x !== c); return Promise.resolve(); },
    auth: {
      getSession: async () => dades({ session: currentUserId ? { user: DB.users[currentUserId] } : null }),
      signInWithPassword: async ({ email, password }) => {
        const u = Object.values(DB.users).find(x => x.email === email);
        if (!u || u.password !== password) return err("Invalid login credentials");
        u.ultim_acces = new Date().toISOString();   // com auth.users.last_sign_in_at
        currentUserId = u.id;
        return dades({ session: { user: u }, user: u });
      },
      signUp: async ({ email, password }) => {
        if (Object.values(DB.users).some(x => x.email === email)) return err("User already registered");
        const u = { id: randomUUID(), email: email, password: password };
        DB.users[u.id] = u; currentUserId = u.id;
        return dades({ session: { user: u }, user: u });
      },
      signInWithOAuth: async () => dades({}),
      signOut: async () => { currentUserId = null; authCbs.forEach(cb => cb("SIGNED_OUT", null)); return dades(null); },
      onAuthStateChange: cb => { authCbs.push(cb); return dades({ subscription: { unsubscribe(){} } }); }
    }
  };
}
const afegeixUsuari = (email, pass) => { const u = { id: randomUUID(), email: email, password: pass }; DB.users[u.id] = u; return u; };

/* ══ Suite ══ */
(async () => {
  const dom = new JSDOM(html, {
    url: "https://victorvqg.github.io/cotxes---escola-anoia/",
    runScripts: "dangerously",
    beforeParse(w){
      w.supabase = { createClient: () => fakeSupabaseClient() };
      w.confirm = () => true;
    }
  });
  const w = dom.window, d = w.document;
  const pant = () => d.querySelector("#pantalla").innerHTML;
  const cos = () => (d.querySelector("#tab-cos") || { innerHTML: "" }).innerHTML;
  await new Promise(r => { if (d.readyState !== "loading") r(); else d.addEventListener("DOMContentLoaded", r); });
  await tic(30);

  const famDoc = nom => w.doc.families.find(f => f.nom === nom);
  const famDB = nom => DB.families.find(f => f.name === nom);
  const nenDoc = (fn, nn) => famDoc(fn).nens.find(n => n.nom === nn);
  const nenDB = (fid, nn) => DB.children.find(c => c.family_id === fid && c.name === nn);
  const marquesDB = (fid, type, slot, day) => DB.weekly_marks.filter(m => m.family_id === fid && m.type === type && m.slot === slot && m.day === day);

  async function ompleLogin(email, pass){
    d.querySelector("#li-email").value = email;
    d.querySelector("#li-pass").value = pass;
  }
  async function entraAmb(email, pass){
    await ompleLogin(email, pass);
    await w.fesLogin(); await tic(30);
  }
  async function acceptaConsentiment(){
    const cb = d.querySelector("#cb-consent");
    cb.checked = true; cb.dispatchEvent(new w.Event("change", { bubbles: true }));
    await tic();
    await w.acceptaConsent(); await tic(20);
  }
  async function uneixAmbCodi(codi){
    d.querySelector("#gg-codi").value = codi;
    await w.buscaGrup(); await tic(20);
  }
  async function surtIentra(email, pass){
    await w.tancaSessio(true); await tic(10);
    await entraAmb(email, pass);
  }
  function ompleFamForm(c1, c2, cond, nens){
    d.querySelector("#nf-cpare").value = c1;
    d.querySelector("#nf-cmare").value = c2;
    d.querySelector("#nf-cond").value = cond;
    let inp = d.querySelector("#nf-nens input");
    inp.value = nens[0]; inp.dispatchEvent(new w.Event("input"));
    for (let i = 1; i < nens.length; i++){
      w.nfAfegeixNen();
      const inps = d.querySelectorAll("#nf-nens input");
      inps[i].value = nens[i]; inps[i].dispatchEvent(new w.Event("input"));
    }
  }

  console.log("1 · LOGIN I CONSENTIMENT RGPD");
  T("arrenca a la pantalla de login (correu + 3 passos)", pant().includes("Entra a l'app") && pant().includes("COM FUNCIONA"));
  T("el login no ofereix cap alternativa de Google", !pant().includes("Continua amb Google") && !pant().includes("Google") && typeof w.fesGoogle === "undefined");
  T("mode per defecte: només «Entra» (el registre no es veu)", pant().includes('onclick="fesLogin()"') && !pant().includes('onclick="fesRegistre()"'));
  w.loginA("registre"); await tic();
  T("mode registre: només «Crea el compte»", pant().includes("Crea el teu compte") && pant().includes('onclick="fesRegistre()"') && !pant().includes('onclick="fesLogin()"'));
  w.loginA("entra"); await tic();
  T("es pot tornar al mode Entra", pant().includes('onclick="fesLogin()"'));
  await ompleLogin("admin@test.cat", "malament");
  await w.fesLogin(); await tic(10);
  T("compte inexistent o contrasenya dolenta → refusat amb missatge", pant().includes("incorrectes"));
  await ompleLogin("admin@test.cat", "admin123");
  await w.fesRegistre(); await tic(20);
  T("registre bo → pantalla de consentiment (porta obligatòria)", pant().includes("Consentiment de privacitat") && pant().includes("AEPD"));
  T("el botó Accepto neix desactivat fins marcar la casella", d.querySelector("#btn-consent").disabled === true);
  await acceptaConsentiment();
  T("consentit → porta del grup (codi o crear)", pant().includes("codi d") && pant().includes("Crea el grup"));
  T("el consentiment queda desat al perfil", DB.profiles[0] && !!DB.profiles[0].consent_at);

  console.log("2 · CREAR EL GRUP (admin)");
  d.querySelector("#gg-nom").value = "EA 25/26";
  ompleFamForm("Vila", "Prat", "Marta", ["Jan", "Mia"]);
  // v4.1: cal el codi de creació de grup
  T("el formulari demana el codi de creació i diu a qui demanar-lo",
    !!d.querySelector("#gg-codicreacio") && pant().includes("victorvqg@gmail.com"));
  d.querySelector("#gg-codicreacio").value = "AIXO-NO-VA";
  await w.creaGrup(); await tic(20);
  T("amb un codi de creació dolent NO es crea cap grup", DB.groups.length === 0 && d.querySelector("#avis").textContent.includes("Codi de creació incorrecte"));
  d.querySelector("#gg-codicreacio").value = "codi-test";   // sense distingir majúscules
  await w.creaGrup(); await tic(30);
  T("el grup es crea amb codi d'invitació", DB.groups.length === 1 && /^[A-Z0-9]{6}$/.test(DB.groups[0].invite_code));
  T("la família admin es crea amb els fills", famDB("Vila Prat") && famDB("Vila Prat").role === "admin" && DB.children.filter(c => c.family_id === famDB("Vila Prat").id).map(c => c.name).join(",") === "Jan,Mia");
  T("el perfil queda aprovat i vinculat", DB.profiles[0].status === "aprovat" && DB.profiles[0].family_id === famDB("Vila Prat").id);
  T("entra a l'app amb salutació i rol admin", pant().includes("Hola") && pant().includes("· admin"));
  T("amb el perfil complet de sortida, entra directe a la Graella", cos().includes("Toca una casella") && cos().includes("g-estat"));
  const CODI = DB.groups[0].invite_code;

  console.log("3 · PINTAR L'HORARI (regles R1–R4 intactes)");
  w.triaPinzell("cotxe"); w.pinta("e9", "dl");
  let b = w.balanc("e9", "dl");
  T("pinzell cotxe: la família condueix (3 places)", b.conds.length === 1 && b.places === 3);
  w.pinta("e9", "dl");
  T("escut anti-doble-toc: el 2n toc s'ignora", w.balanc("e9", "dl").conds.length === 1);
  await tic(400); w.pinta("e9", "dl");
  T("passat el guard, el toc commuta (treu la marca)", w.balanc("e9", "dl").conds.length === 0);
  await tic(400); w.pinta("e9", "dl");
  const JANUUID = nenDoc("Vila Prat", "Jan").id; // uuid immutable: sobreviu a reanomenaments
  w.triaPinzell(JANUUID); w.pinta("r17", "dl");
  T("marcar un nen: en Jan necessita plaça", w.balanc("r17", "dl").nens.length === 1);
  w.pinta("e9", "dl");
  T("marcar un nen APAGA el cotxe propi (són excloents)", w.balanc("e9", "dl").nens.length === 1 && w.balanc("e9", "dl").conds.length === 0);
  await tic(400); w.triaPinzell("cotxe"); w.pinta("e9", "dl");
  T("…i conduir neteja els propis nens de la casella", w.balanc("e9", "dl").conds.length === 1 && w.balanc("e9", "dl").nens.length === 0);
  const idJan = () => JANUUID;
  w.triaPinzell(idJan());
  await tic(400); w.pinta("e8", "dj");
  await tic(400); w.pinta("e9", "dj");
  const famVila = () => famDoc("Vila Prat") || famDoc("Vila Puig");
  const janViu = () => famVila().nens.find(n => n.id === idJan());
  T("un nen entra a les 8 O a les 9: marcar una li desmarca l'altra", w.te(janViu().marca, "e9", "dj") && !w.te(janViu().marca, "e8", "dj"));
  await tic(400); w.pinta("e9", "dj");
  await tic(400); w.triaPinzell("propi"); w.pinta("e8", "dj");
  await tic(400); w.triaPinzell("cotxe"); w.pinta("e9", "dj");
  const vFam = () => famDoc("Vila Prat");
  T("respondre les 9.00 buida TOT el de les 8.00 del mateix dia (i al revés)", !w.te(vFam().propi, "e8", "dj") && w.te(vFam().cotxe, "e9", "dj"));
  await tic(400); w.pinta("e9", "dj");

  console.log("3b · PEL NOSTRE COMPTE (🚫)");
  w.triaPinzell(idJan()); await tic(400); w.pinta("e15", "dc");
  w.triaPinzell("propi"); await tic(400); w.pinta("e15", "dc");
  let bp = w.balanc("e15", "dc");
  T("marcar 🚫: cap plaça oferta i el fill propi no compta", bp.propis.length === 1 && bp.places === 0 && bp.nens.length === 0);
  w.triaPinzell("cotxe"); await tic(400); w.pinta("e15", "dc");
  bp = w.balanc("e15", "dc");
  T("🚗 sobre 🚫: s'exclouen mútuament", bp.conds.length === 1 && bp.propis.length === 0);
  w.triaPinzell("esborra"); await tic(400); w.pinta("e15", "dc");
  bp = w.balanc("e15", "dc");
  T("esborra neteja també 🚫/🚗 i el nen", bp.conds.length === 0 && bp.propis.length === 0 && bp.nens.length === 0);

  console.log("3c · LA SETMANA INCOMPLETA AVISA PERÒ ES DESA (v4.6)");
  T("hi ha canvis → surt la barra de desar", !d.querySelector("#barra").classList.contains("amaga"));
  await w.desa(); await tic(30);
  T("v4.6: amb franges buides ES DESA igualment i l'avís queda a la barra",
    d.querySelector("#barra").classList.contains("amaga") &&
    !d.querySelector("#barra-avis").classList.contains("ocult") &&
    d.querySelector("#barra-avis").textContent.includes("Es desa igualment") &&
    DB.activity_log.some(l => l.action === "canvi graella"));
  const vv = famDoc("Vila Prat");
  const grups = [["e8", "e9"], ["r13"], ["e15"], ["r17"]];
  for (const dd of ["dl", "dt", "dc", "dj", "dv"])
    for (const g of grups)
      if (!g.some(s => w.respon(vv, s, dd))) w.commuta(vv.propi, g[g.length - 1], dd);
  w.pintaBarra();
  T("en completar la graella, l'avís de la barra s'apaga sol", d.querySelector("#barra-avis").classList.contains("ocult"));
  w.obreCasella("e9", "dv"); await tic();
  w.celAccio("propi"); await tic();
  T("el rètol de la graella es refresca EN VIU en buidar una casella", cos().includes("Falten <b>1</b>") && cos().includes("Divendres"));
  await tic(400); w.celAccio("propi"); await tic();
  T("i torna a «Setmana completa» en respondre-la", cos().includes("Setmana completa"));
  w.tancaCasella(); await tic();
  await w.desa(); await tic(30);
  const idVila = famDB("Vila Prat").id;
  T("setmana completa: desa a Supabase (drive + request amb uuid de fill)", d.querySelector("#barra").classList.contains("amaga")
      && marquesDB(idVila, "drive", "e9", "dl").length === 1
      && marquesDB(idVila, "request", "r17", "dl").length === 1
      && marquesDB(idVila, "request", "r17", "dl")[0].children_ids.includes(nenDB(idVila, "Jan").id)
      && marquesDB(idVila, "own", "e9", "dt").length === 1);
  const jj = famDoc("Vila Prat").nens.find(n => n.id === idJan());
  w.commuta(jj.marca, "e8", "dv"); w.commuta(jj.marca, "e9", "dv");
  await w.desa(); await tic(10);
  T("un nen amb les 8 i les 9 el mateix dia: desar bloquejat a la barra", d.querySelector("#barra-avis").textContent.includes("Jan") && !d.querySelector("#barra-avis").classList.contains("ocult"));
  w.commuta(jj.marca, "e8", "dv"); w.commuta(jj.marca, "e9", "dv");

  console.log("4 · SEGON COMPTE: S'UNEIX AMB CODI I CREA LA SEVA FAMÍLIA");
  w.triaPinzell("cotxe"); await tic(400); w.pinta("e8", "dt"); await tic(); // canvi pendent de l'admin (prova de concurrència)
  afegeixUsuari("grau@test.cat", "grau123");
  await surtIentra("grau@test.cat", "grau123");
  T("canvi de compte: login → consentiment", pant().includes("Consentiment de privacitat"));
  await acceptaConsentiment();
  await uneixAmbCodi(CODI.toLowerCase()); // el codi ha de funcionar en minúscules
  T("amb el codi, la tria ofereix les famílies reclamables (Vila Prat té 1 compte)", pant().includes("EA 25/26") && (d.querySelector("#sel-fam") || { innerHTML: "" }).innerHTML.includes("Vila Prat"));
  ompleFamForm("Grau", "", "", ["Arlet", "Bru"]);
  await w.creaFam(); await tic(30);
  T("cognom2 OPCIONAL: família d'un sol cognom creada i a la BD", !!famDB("Grau") && famDB("Grau").cognom2 === "" && famDB("Grau").role === "usuari");
  T("els fills de la nova família són a la BD", DB.children.filter(c => c.family_id === famDB("Grau").id).length === 2);
  T("entra com a usuari (no admin)", pant().includes("Hola") && pant().includes("· usuari"));
  w.triaTab("cal"); await tic(30);
  T("família amb la feina a mitges: Calendaris bloquejats (perfil incomplet)", cos().includes("Calendaris bloquejats") && cos().includes("Perfil incomplet"));
  w.renomConductor("Pere"); await tic();
  const vg = famDoc("Grau");
  const idArlet = nenDoc("Grau", "Arlet").id, idBru = nenDoc("Grau", "Bru").id;
  // v3.6: el perfil no és complet sense el curs de cada nen
  w.triaCursNen(idArlet, "2n ESO"); w.triaCursNen(idBru, "2n ESO"); await tic();
  // 2n ESO: dimarts i dimecres l'entrada és a les 8.00
  ["dt", "dc"].forEach(dd => { if (!w.respon(vg, "e8", dd)) w.commuta(vg.propi, "e8", dd); });
  w.commuta(vg.nens.find(n => n.id === idArlet).marca, "r17", "dl");
  w.commuta(vg.nens.find(n => n.id === idBru).marca, "r17", "dl");
  for (const dd of ["dl", "dt", "dc", "dj", "dv"])
    for (const g of grups)
      if (!g.some(s => w.respon(vg, s, dd))) w.commuta(vg.propi, g[g.length - 1], dd);
  await w.desa(); await tic(30);
  T("la família completa (graelles desades a Supabase) té la porta oberta", w.potCal() && marquesDB(famDB("Grau").id, "request", "r17", "dl").length === 1);
  T("i el canvi pendent de l'admin no s'ha perdut pel camí", marquesDB(idVila, "own", "e9", "dt").length === 1);

  console.log("4b · CONCURRÈNCIA: DOS COMPTES DESEN SENSE TREPITJAR-SE");
  await surtIentra("admin@test.cat", "admin123");
  T("l'admin torna a casa seva en reentrar", pant().includes("Hola") && pant().includes("Vila Prat"));
  T("el canvi no desat es va perdre en tancar sessió (l'app ho avisa en sortir)", marquesDB(idVila, "drive", "e8", "dt").length === 0);
  w.triaPinzell("cotxe"); await tic(400); w.pinta("e8", "dt"); await tic(); // el refà i ara sí que el desa
  await w.desa(); await tic(30);
  T("els meus canvis (cotxe dt 8.00) s'han desat", marquesDB(idVila, "drive", "e8", "dt").length === 1);
  T("els canvis de l'altra família no s'han trepitjat", famDB("Grau").driver === "Pere" && marquesDB(famDB("Grau").id, "request", "r17", "dl").length === 1);

  console.log("5 · CALENDARIS (lectura del grup sencer des de Supabase)");
  await w.pintaCalendari(); await tic(30);
  T("el Quadre (qui porta qui) s'obre per defecte", cos().includes(">Quadre<") && cos().includes("veure el detall"));
  T("els subtabs són a dalt de tot, abans del mapa", cos().indexOf(">Quadre<") < cos().indexOf("llegenda"));
  w.triaVistaCal("set"); await tic(20);
  T("la vista de setmana segueix disponible", cos().includes("dcard"));
  T("el dèficit surt al mapa i a la setmana (−3 dl 17.00)", cos().includes("−3"));
  w.triaTab("cal"); await tic(30);
  w.selDia("dl"); await tic(20);
  T("detall del dia: vista de consulta i cada nen amb el seu estat", cos().includes("Vista de consulta") && cos().includes("Arlet") && cos().includes("Bru") && cos().includes("pendent"));
  T("si no condueixes, la targeta t'explica qui assigna i on", cos().includes("els assigna qui condueix") && cos().includes("El teu cotxe"));
  T("detall del dia: badge de falten 3", cos().includes("falten 3"));
  T("línia de conductor completa: qui condueix, amb qui i places lliures", cos().includes("condueix Marta") && cos().includes("amb Jan i Mia") && cos().includes("places lliures"));

  console.log("6 · IMPORTACIÓ DE LES DADES ANTIGUES (dades.json)");
  w.obreAdmin(); await tic();
  T("el panell d'admin mostra el codi d'invitació", pant().includes(CODI) && pant().includes("Importa les dades antigues"));
  const jsonVell = JSON.stringify({ versio: 1, families: [
    { id: "nova", nom: "Família Nova", cognomPare: "Família", cognomMare: "Nova", conductor: "", places: 0, cotxe: {}, nens: [{ id: "pol", nom: "Pol", marca: {} }] },
    { id: "soltera", nom: "Família Soltera", cognomPare: "Soltera", conductor: "Anna", places: 1, cotxe: {}, propi: { e9: ["dl"] }, nens: [{ id: "kim", nom: "Kim", marca: { r17: ["dl"] } }] },
    { id: "portadora", nom: "Portadora Sol", cognomPare: "Portadora", cognomMare: "Sol", conductor: "Pere", places: 2, cotxe: { r17: ["dl"] }, porta: { "r17-dl": [{ fam: "soltera", nen: "kim" }] }, nens: [{ id: "laia", nom: "Laia", marca: {} }] }
  ] });
  d.querySelector("#imp-json").value = jsonVell;
  await w.importaDades(); await tic(40);
  T("importa 3 famílies noves amb els seus fills", DB.families.length === 5 && !!nenDB(famDB("Família Nova").id, "Pol") && !!nenDB(famDB("Família Soltera").id, "Kim"));
  T("les marques antigues es converteixen (propi → own, marca nen → request)", marquesDB(famDB("Família Soltera").id, "own", "e9", "dl").length === 1 && marquesDB(famDB("Família Soltera").id, "request", "r17", "dl")[0].children_ids.includes(nenDB(famDB("Família Soltera").id, "Kim").id));
  T("la porta antiga es converteix en assignació vàlida (trigger la valida)", DB.assignments.some(a => a.driver_family_id === famDB("Portadora Sol").id && a.child_id === nenDB(famDB("Família Soltera").id, "Kim").id && a.slot === "r17" && a.day === "dl"));
  T("el resultat es reporta a l'admin", d.querySelector("#imp-estat").textContent.includes("Importació acabada"));
  w.tancaAdmin(); await tic();

  console.log("6a · RESUM FINAL DEL GRUP");
  await w.pintaResum(); await tic(30);
  T("«Falta cobrir» amb dia i hora", cos().includes("Falta cobrir") && cos().includes("Dilluns") && cos().includes("17.00"));
  T("«On sobren places» amb el marge (+3)", cos().includes("On sobren places") && cos().includes("+3"));
  T("famílies pendents d'omplir detectades", cos().includes("Encara no han marcat res") && cos().includes("Família Nova"));
  T("una família amb només 🚫 NO surt com a pendent", !cos().includes("Família Soltera</b>"));
  T("cada línia de dèficit desplega els nens a col·locar", cos().includes("r-det") && cos().includes("Arlet") && cos().includes("obre el dia"));
  T("«On sobren» desplega conductor i places lliures", cos().includes("Vila Prat (Marta · 3 lliures)"));

  console.log("6b · ASSIGNACIONS (qui puja a quin cotxe)");
  w.triaTab("graella"); await tic();
  w.triaPinzell("cotxe"); await tic(400); w.pinta("r17", "dl"); await tic();
  await w.desa(); await tic(30);
  w.triaTab("cal"); await tic(30); w.triaVistaCal("dia"); await tic(20); w.selDia("dl"); await tic(20);
  w.assigna("r17", "dl", famDoc("Grau").id, idArlet, true); await tic();
  await w.desa(); await tic(30);
  T("el conductor assigna un nen i queda desat a Supabase", DB.assignments.some(a => a.driver_family_id === idVila && a.child_id === nenDB(famDB("Grau").id, "Arlet").id && a.slot === "r17" && a.day === "dl"));
  T("el dia mostra qui porta cada nen (persona: nom + inicials)", cos().includes("el porta Marta VP") && cos().includes("pendent"));
  w.assigna("r17", "dl", famDoc("Grau").id, idBru, true); await tic();
  T("comptador de places del cotxe (2/3)", cos().includes("2/3"));
  await w.desa(); await tic(30);
  T("el segon nen assignat també queda a Supabase", DB.assignments.some(a => a.child_id === nenDB(famDB("Grau").id, "Bru").id));
  w.triaTab("perfil"); await tic();
  w.canviaPlaces(-1); w.canviaPlaces(-1); await tic();
  w.triaTab("cal"); await tic(30);
  T("si les places baixen, el comptador avisa del sobreeiximent (2/1)", cos().includes("2/1"));
  T("el peu llueix les dades del grup, en viu", (function(){ const s = d.querySelector("#peu-stats").textContent; return s.includes("5 famílies") && s.includes("7 nens") && s.includes("4 viatges oferts") && s.includes("3 seients ocupats") && s.includes("seient") && s.includes("lliure"); })());
  T("amb canvis pendents, l'Actualitza dels calendaris s'amaga (mana el Desa)", d.body.classList.contains("amb-barra") && cos().includes("cal-actualitza"));
  w.triaTab("perfil"); await tic();
  w.canviaPlaces(1); w.canviaPlaces(1); await tic();
  w.triaTab("cal"); await tic(30); w.triaVistaCal("nen"); await tic(20);
  w.selNenCanvia(famDoc("Grau").id + "|" + idArlet); await tic();
  T("calendari per nen: es veu qui el porta (persona)", cos().includes("el porta Marta VP"));
  w.triaTab("descarrega"); await tic();
  T("apartat «Descarrega»: horaris dels meus nens i del conductor", pant().includes("Descarrega") && cos().includes("Horari de Jan") && cos().includes("Horari de Mia") && cos().includes("Horari del conductor"));
  T("v4.9: el botó de l'horari del nen duu els cognoms de la família", cos().includes("Horari de Jan " + w.lameva().nom));
  T("v4.9: el botó del conductor duu els cognoms sencers, no inicials", cos().includes(w.nomConductorComplet(w.lameva())));
  const miaViu = famDoc("Vila Prat").nens.find(n => n.nom === "Mia");
  w.commuta(miaViu.marca, "r13", "dl"); w.triaTab("descarrega"); await tic();
  T("nen amb pendents: el botó hi és SEMPRE, amb l'avís del vermell", cos().includes("Horari de Mia") && cos().includes("1 trajecte") && cos().includes("pendent"));
  w.commuta(miaViu.marca, "r13", "dl"); w.triaTab("descarrega"); await tic();
  w.descarregaHorariNen(famDoc("Vila Prat").id, idJan()); await tic();
  T("el full del nen s'obre a pantalla, llest per imprimir o desar en PDF", !d.querySelector("#full-horari").classList.contains("ocult") && d.querySelector("#full-horari").innerHTML.includes("Horari de Jan") && d.querySelector("#full-horari").innerHTML.includes("Imprimeix") && d.querySelector("#full-horari").innerHTML.includes("FULL DEL NEN") && d.querySelector("#full-horari").innerHTML.includes("ENTRADA · MATÍ"));
  T("v4.9: el títol del full del nen duu els cognoms", d.querySelector("#full-horari").innerHTML.includes("Horari de Jan " + w.lameva().nom));
  w.tancaFull(); await tic();
  w.descarregaHorariConductor(); await tic();
  T("el full del conductor: qui puja a cada viatge", d.querySelector("#full-horari").innerHTML.includes("Horari del conductor") && d.querySelector("#full-horari").innerHTML.includes("porta ") && d.querySelector("#full-horari").innerHTML.includes("lliure"));
  T("v4.9: el títol del full del conductor duu els cognoms sencers", d.querySelector("#full-horari").innerHTML.includes(w.nomConductorComplet(w.lameva())));
  await w.comparteixFull(); await tic();
  T("sense canvas ni share (laboratori): consell honest de la captura", d.querySelector("#avis").textContent.includes("captura de pantalla"));
  w.tancaFull(); await tic();
  T("en tancar, el full desapareix", d.querySelector("#full-horari").classList.contains("ocult"));
  w.triaTab("cal"); await tic(30); w.triaVistaCal("nen"); await tic(20);
  w.triaVistaCal("quadre"); await tic(20);
  T("el quadre diu qui porta qui amb noms de pila", cos().includes("Marta VP") && cos().includes("porta") && cos().includes("Arlet"));

  console.log("6b2 · NOVETATS v4.29 (filtre per nen a Resum + vista Per assignar)");
  w.triaVistaCal("resum"); await tic(30);
  T("v4.29: Resum duu el desplegable «Nen: Tots / …»", !!d.querySelector("#resum-nen") && cos().includes("Tots"));
  const files29 = (cos().match(/r-fila/g) || []).length;
  const opt29 = d.querySelector("#resum-nen option[value*='|']").value;
  w.selNenResum(opt29); await tic(30);
  T("v4.29: en triar un nen només surten els seus viatges",
    (cos().match(/r-fila/g) || []).length <= files29 && cos().includes("Es mostren només els viatges de"));
  w.triaVistaCal("quadre"); await tic(20); w.triaVistaCal("resum"); await tic(30);
  T("v4.29: la tria es recorda mentre l'app és oberta", d.querySelector("#resum-nen").value === opt29);
  w.selNenResum(""); await tic(30);
  T("v4.29: «Tots» torna la vista sencera", (cos().match(/r-fila/g) || []).length === files29);
  // vista «Per assignar»: es recompta amb balanc/portaValids (la mateixa font que la pantalla)
  T("v4.29: la pestanya nova hi és", cos().includes("Per assignar"));
  w.triaVistaCal("assignar"); await tic(20);
  let nAmb29 = 0, nSense29 = 0;
  ["dl", "dt", "dc", "dj", "dv"].forEach(dd => ["e8", "e9", "r13", "e15", "r17"].forEach(ss => {
    const b2 = w.balanc(ss, dd);
    const esp = b2.nens.filter(n2 => !n2.portadaPerId).length;
    if (!esp) return;
    const lliures = b2.conds.some(c2 => (c2.places || 0) - w.portaValids(c2, ss, dd).length > 0);
    if (lliures) nAmb29++; else nSense29++;
  }));
  T("v4.29: «Per assignar» quadra amb balanc()/portaValids()",
    (nAmb29 + nSense29 === 0)
      ? cos().includes("Cap nen esperant en viatges amb seients lliures")
      : ((cos().match(/esperen:/g) || []).length === nAmb29 + nSense29 &&
         (nSense29 === 0 || cos().includes("Sense cotxe possible")) &&
         (nAmb29 === 0 || cos().includes("amb seients lliures"))));
  w.triaVistaCal("quadre"); await tic(20);

  console.log("6c · AVISOS ENTRE COMPTES (v4.15: guardats a Supabase per a tot el grup)");
  await surtIentra("grau@test.cat", "grau123");
  T("v4.15: l'assignació ha generat un avís A LA BASE DE DADES per a la família del nen",
    w.avisosNous() >= 1 && DB.notifications.some(n2 => n2.family_id === famDB("Grau").id && (n2.message || "").includes("el porta Marta Vila Prat")));
  w.triaTab("avisos"); await tic(10);
  T("la pàgina d'avisos llista qui porta els nens, amb data i hora AMB SEGONS",
    cos().includes("Bru") && cos().includes("Dilluns 17.00") && /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/.test(cos()));
  T("v4.15: cada avís és una fila desplegable amb el detall i qui ho ha fet",
    cos().includes("<details") && cos().includes("Qui ho ha fet"));
  T("v4.19: un usuari normal NO té filtres, ni cerca, ni descàrrega, i el títol és el de la seva família",
    !cos().includes('id="av-q"') && !cos().includes("Descarrega</button>") && cos().includes("Avisos de la teva família"));
  T("un cop llegits, el comptador es posa a zero", w.avisosNous() === 0);
  await surtIentra("admin@test.cat", "admin123");
  w.triaTab("avisos"); await tic(10);
  T("v4.19: l'admin SÍ que veu el bloc de tot el grup amb filtres i descàrrega",
    cos().includes("Avisos de tot el grup") && cos().includes('id="av-q"') && cos().includes("Descarrega"));
  d.querySelector("#av-q").value = "Bru"; w.avFiltra();
  T("v4.15: la cerca per nen filtra mentre s'escriu",
    d.querySelector("#avisos-llista").innerHTML.includes("Bru") && (d.querySelector("#avisos-llista").innerHTML.match(/<details/g) || []).length >= 1);
  d.querySelector("#av-q").value = "zzzzz"; w.avFiltra();
  T("…i sense coincidències ho diu", d.querySelector("#avisos-llista").innerHTML.includes("Cap avís"));
  w.avNeteja();
  T("«Neteja el filtre» ho torna a mostrar tot", (d.querySelector("#avisos-llista").innerHTML.match(/<details/g) || []).length >= 1);
  d.querySelector("#av-de").value = "2099-01-01"; w.avFiltra();
  T("el filtre de dates també talla", d.querySelector("#avisos-llista").innerHTML.includes("Cap avís"));
  w.avNeteja(); d.querySelector("#av-q").value = "Bru"; w.avFiltra();
  const csvAv = w.avisosCsv();
  T("v4.15: el CSV duu capçalera i NOMÉS el que passa el filtre",
    csvAv.includes("data i hora") && csvAv.includes("Bru") &&
    !csvAv.split("\n").slice(1).some(l => l && !l.toLowerCase().includes("bru")));
  w.avNeteja();
  // v4.19: el trigger antiduplicats — la mateixa acció al mateix segon, una sola fila
  const rowDup = { family_id: famDB("Grau").id, message: "DUPTEST", action: "x", child_name: "Jan", detail: "d" };
  await fakeSupabaseClient().from("notifications").insert(rowDup);
  await fakeSupabaseClient().from("notifications").insert(Object.assign({}, rowDup));
  T("v4.19: una mateixa acció al mateix segon es guarda UNA sola vegada",
    DB.notifications.filter(x => x.message === "DUPTEST").length === 1);
  // v4.21: l'admin DINS d'una altra família veu el que veu aquella família
  w.adminEdita(famDB("Grau").id); await tic(20);
  w.triaTab("avisos"); await tic(10);
  T("v4.21: dins d'una altra família no hi ha bloc de grup ni filtres, només els avisos d'aquella família",
    cos().includes("Avisos de la teva família") && !cos().includes('id="av-q"') && !cos().includes("Avisos de tot el grup"));
  await surtIentra("admin@test.cat", "admin123");
  w.triaTab("cal"); await tic(30); w.triaVistaCal("dia"); await tic(20); w.selDia("dl"); await tic(20);
  w.assigna("r17", "dl", famDoc("Grau").id, idBru, false); await tic();
  await w.desa(); await tic(30);
  T("la desassignació queda a Supabase", !DB.assignments.some(a => a.child_id === nenDB(famDB("Grau").id, "Bru").id));
  await surtIentra("grau@test.cat", "grau123");
  T("v4.15: la baixa del cotxe també és un avís a la BD (escrit en desar, no detectat al mòbil)",
    w.avisosNous() >= 1 && DB.notifications.some(n2 => n2.family_id === famDB("Grau").id && (n2.message || "").includes("ja no té cotxe")));
  w.triaTab("avisos"); await tic(10);
  T("la pàgina mostra la baixa amb nom, dia, franja i el conductor d'abans",
    cos().includes("Bru") && cos().includes("ja no té cotxe") && cos().includes("abans Marta Vila Prat") && cos().includes("Dilluns 17.00"), cos().slice(0, 400));
  T("un cop llegits, el comptador es posa a zero", w.avisosNous() === 0);
  const cliUsuari = fakeSupabaseClient(); // RLS: en Grau (rol usuari), directe contra la BD
  await cliUsuari.from("weekly_marks").delete().eq("family_id", idVila);
  T("RLS: un usuari no pot esborrar les marques d'una altra família", marquesDB(idVila, "drive", "e9", "dl").length === 1);
  w.commuta(famDoc("Grau").nens.find(n => n.id === idArlet).marca, "r17", "dl");
  await w.desa(); await tic(30);
  await surtIentra("admin@test.cat", "admin123");
  w.triaTab("cal"); await tic(30); w.triaVistaCal("dia"); await tic(20); w.selDia("dl"); await tic(20);
  T("si un nen es desmarca, la seva plaça no compta al cotxe de l'altre (0/3)", cos().includes("0/3") && !cos().includes("Arlet"));

  console.log("6d · CANVIS AMB PASSATGERS A BORD");
  w.assigna("r17", "dl", famDoc("Grau").id, idBru, true); await tic();
  await w.desa(); await tic(30);
  w.triaTab("graella"); await tic();
  w.triaPinzell("cotxe"); await tic(400); w.pinta("r17", "dl"); await tic();
  T("treure el cotxe amb nens a bord: avís immediat a la barra", d.querySelector("#barra-avis").textContent.includes("Bru") && d.querySelector("#barra-avis").textContent.includes("sense plaça") && d.querySelector("#barra-avis").classList.contains("info"));
  await tic(400); w.triaPinzell("propi"); w.pinta("r17", "dl"); await tic();
  await w.desa(); await tic(30);
  T("desar amb èxit neteja també l'avís informatiu", d.querySelector("#barra-avis").classList.contains("ocult"));

  console.log("7 · GESTIÓ DE LA FAMÍLIA (persistència real)");
  w.triaTab("perfil"); await tic();
  w.canviaPlaces(1); await tic();
  T("el requadre del Perfil es marca en groc en editar (places 3→4)", d.querySelector("#pl-num").textContent === "4" && cos().includes("perfil pendent"));
  w.canviaPlaces(-1); await tic();
  w.treuNen(nenDoc("Vila Prat", "Mia").id); await w.desa(); await tic(30);
  T("treure un nen: desapareix de la BD (i les seves marques)", !nenDB(idVila, "Mia") && DB.children.filter(c => c.family_id === idVila).length === 1);
  T("en desar, el requadre del Perfil torna a la normalitat", !d.querySelector(".targeta.perfil").classList.contains("pendent"));
  w.renomCognomMare("Puig"); await tic();
  await w.desa(); await tic(30);
  T("canviar un cognom recompon el nom (id intacte, salutació al dia)", famDB("Vila Puig") && famDB("Vila Puig").id === idVila && pant().includes("Vila Puig"));
  w.triaTab("graella"); await tic(); w.triaPinzell(idJan()); await tic(400); w.pinta("r13", "dv"); await tic();
  w.triaTab("perfil"); await tic();
  w.renomNen(idJan(), "Janot"); await tic();
  await w.desa(); await tic(30);
  T("canviar el nom d'un nen (les marques es conserven)", nenDB(idVila, "Janot") && marquesDB(idVila, "request", "r13", "dv")[0].children_ids.includes(nenDB(idVila, "Janot").id));

  console.log("7b · ROLS: admin i staff sense codis PIN");
  w.obreAdmin(); await tic();
  T("el panell de l'admin explica els codis d'accés i la importació", pant().includes("Codis d'accés") && pant().includes("Importa les dades antigues") && pant().includes("dades.json"));
  w.tancaAdmin(); await tic();
  await w.rolFam(famDoc("Grau").id); await tic(20);
  T("l'admin puja una família a staff: desat a la BD", famDB("Grau").role === "staff");
  T("i queda al registre d'activitat", DB.activity_log.some(l => l.action === "canvi de rol" && l.details.includes("staff")));
  await surtIentra("grau@test.cat", "grau123");
  T("el rol ve de la BD, no de cap codi: surt al costat de la salutació", pant().includes("· staff"));
  w.triaTab("families"); await tic();
  T("el staff té «canvia» i «edita» (a totes menys a la de l'admin)", pant().includes(">canvia<") && (pant().match(/>edita</g) || []).length === 4);
  w.adminEdita(famDoc("Vila Puig").id); await tic();
  T("el staff NO pot entrar a la família de l'admin", d.querySelector("#avis").textContent.includes("només la gestiona l'administrador"));
  await w.creaFam(); await tic();
  T("el staff no pot crear famílies", d.querySelector("#avis").textContent.includes("no crear") && DB.families.length === 5);
  T("el staff no veu l'apartat Rols al menú", !pant().includes("Rols del grup") && !pant().includes("Rols<"));
  const rolAbans = famDB("Grau").role;
  await w.rolFam(famDoc("Vila Puig").id); await tic(10);
  T("el staff no pot tocar rols ni per codi", famDB("Grau").role === rolAbans && famDB("Vila Puig").role === "admin");
  const cliExtern = fakeSupabaseClient(); // RLS: mateix usuari (Grau), fora de l'app
  const rlsRes = await cliExtern.from("families").update({ role: "admin" }).eq("id", famDB("Grau").id);
  T("RLS: ni directament contra la BD un no-admin es pot pujar el rol", !!rlsRes.error && famDB("Grau").role === "staff");
  const rlsRes2 = await cliExtern.rpc("esborra_familia", { p_family: famDB("Família Nova").id });
  T("RLS: l'staff no pot esborrar una família (només l'admin)", !!rlsRes2.error && !!famDB("Família Nova"));

  console.log("7c · L'ADMIN CREA UNA FAMÍLIA PER A ALTRES");
  await surtIentra("admin@test.cat", "admin123");
  w.canviaFam(); await tic(20);
  T("per a l'admin, crear és una opció plegada, no la portada", pant().includes("Crear una família nova") && pant().includes("<details"));
  ompleFamForm("Vila", "Puig", "", ["Duplicat"]);
  await w.creaFam(); await tic(20);
  T("nom de família duplicat: bloquejat amb avís", DB.families.length === 5 && d.querySelector("#avis").textContent.includes("Ja existeix"));
  ompleFamForm("Ajudada", "Extra", "", ["Pau"]);
  await w.creaFam(); await tic(30);
  T("l'admin SÍ pot crear una família per a altres (sense compte)", DB.families.length === 6 && famDB("Ajudada Extra") && !DB.profiles.some(p => p.family_id === famDB("Ajudada Extra").id));

  console.log("8 · SEGON COMPTE A LA MATEIXA FAMÍLIA (màxim 2 + CODI DE FAMÍLIA)");
  afegeixUsuari("c@test.cat", "ccc123");
  await surtIentra("c@test.cat", "ccc123");
  await acceptaConsentiment();
  await uneixAmbCodi(CODI);
  T("la família sense compte apareix com a reclamable", (d.querySelector("#sel-fam") || { innerHTML: "" }).innerHTML.includes("Ajudada Extra"));
  T("i el formulari demana el codi de la família", !!d.querySelector("#sel-codi"));
  const codiAjudada = () => codiDeFam(famDB("Ajudada Extra"));
  d.querySelector("#sel-fam").value = famDB("Ajudada Extra").id;
  d.querySelector("#sel-codi").value = "ZZZZZZZZ";
  await w.entraSel(); await tic(20);
  T("codi de família INCORRECTE: rebutjat amb avís", d.querySelector("#avis").textContent.includes("Codi de la família incorrecte") && !DB.profiles.find(p => p.email === "c@test.cat").family_id);
  d.querySelector("#sel-fam").value = famDB("Ajudada Extra").id;
  d.querySelector("#sel-codi").value = codiAjudada();
  await w.entraSel(); await tic(30);
  T("amb el codi BO, reclamar vincula el compte a la família", pant().includes("Hola") && pant().includes("Ajudada Extra") && DB.profiles.find(p => p.email === "c@test.cat").status === "aprovat");
  afegeixUsuari("d2@test.cat", "ddd123");
  await surtIentra("d2@test.cat", "ddd123");
  await acceptaConsentiment();
  await uneixAmbCodi(CODI);
  d.querySelector("#sel-fam").value = famDB("Ajudada Extra").id;
  d.querySelector("#sel-codi").value = codiAjudada();
  await w.entraSel(); await tic(30);
  T("segon compte admès (pare i mare)", DB.profiles.filter(p => p.family_id === famDB("Ajudada Extra").id).length === 2);
  afegeixUsuari("e@test.cat", "eee123");
  await surtIentra("e@test.cat", "eee123");
  await acceptaConsentiment();
  await uneixAmbCodi(CODI);
  T("amb 2 comptes, la família ja NO surt com a reclamable", !(d.querySelector("#sel-fam") || { innerHTML: "" }).innerHTML.includes("Ajudada Extra"));
  const r3 = await fakeSupabaseClient().rpc("claim_family", { p_family: famDB("Ajudada Extra").id, p_token: codiAjudada() });
  T("i el servidor rebutja el tercer compte encara que ho intenti per codi", !!r3.error && r3.error.message.includes("2 comptes"));

  console.log("9 · BAIXA D'UNA FAMÍLIA (cascada + comptes desvinculats)");
  await surtIentra("admin@test.cat", "admin123");
  w.adminEdita(famDB("Ajudada Extra").id); await tic(20);
  await w.esborraFam(); await tic(20);
  T("la baixa avisa que surts del grup, amb el seu nom", (d.querySelector("#conf-box") || { textContent: "" }).textContent.includes("a punt de sortir del grup") && (d.querySelector("#conf-box") || { textContent: "" }).textContent.includes("EA 25/26"));
  d.querySelector("#conf-no").click(); await tic(10);
  T("si cancel·les, la família segueix al grup", !!famDB("Ajudada Extra"));
  await w.esborraFam(); await tic(20);
  d.querySelector("#conf-si").click(); await tic(30);
  T("la família esborrada desapareix de la BD amb els seus fills", DB.families.length === 5 && !famDB("Ajudada Extra") && !DB.children.some(c => c.name === "Pau"));
  T("els comptes de la família queden desvinculats", DB.profiles.filter(p => ["c@test.cat", "d2@test.cat"].includes(p.email)).every(p => p.family_id === null && p.status === "pendent"));
  T("l'admin torna a casa seva", pant().includes("Hola") && pant().includes("Vila Puig"));
  await surtIentra("c@test.cat", "ccc123");
  T("l'usuari desvinculat torna a la porta del grup", pant().includes("codi d") || pant().includes("Crea el grup"));

  console.log("10 · REGISTRE D'ACTIVITÀ (admin el llegeix, la resta no)");
  await surtIentra("admin@test.cat", "admin123");
  const logAdmin = await fakeSupabaseClient().from("activity_log").select("*");
  T("l'admin llegeix el log (altes, canvis de rol, baixes)", logAdmin.data.length >= 4 && logAdmin.data.some(l => l.action === "alta família") && logAdmin.data.some(l => l.action === "baixa família"));
  await surtIentra("grau@test.cat", "grau123");
  const logStaff = await fakeSupabaseClient().from("activity_log").select("*");
  T("el staff NO el pot llegir (RLS)", logStaff.data.length === 0);
  const marqAltres = await fakeSupabaseClient().from("families").select("*");
  T("però tothom del grup hi veu les famílies del seu grup", marqAltres.data.length === 5);

  console.log("10b · NOVETATS v3.1 (menú, Famílies, conductor, admin, realtime)");
  await surtIentra("admin@test.cat", "admin123");
  await tic(20);
  w.obreMenu(); await tic();
  const menuHtml = d.querySelector("#calaix").innerHTML;
  T("el menú té «Tanca sessió» i el calendari duu el nom del grup", menuHtml.includes("Tanca sessió") && menuHtml.includes("Grup · EA 25/26"));
  T("el menú té l'apartat Famílies", menuHtml.includes("Famílies"));
  T("la app se subscriu als canvis en viu del grup (realtime)", DB._canals.length === 1 && DB._canals[0].subs.some(s => s.table === "weekly_marks") && DB._canals[0].subs.some(s => s.table === "children"));
  w.triaTab("families"); await tic();
  T("la pestanya Famílies llista totes les famílies del grup", cos().includes("Les famílies del grup") && (cos().match(/fam-det/g) || []).length >= 5);
  T("…i el directori ja NO penja a sota de la pantalla principal", !pant().includes("<details class='conf'><summary>"));
  w.triaTab("perfil"); await tic();
  T("sense canvis no hi ha botó Desa dins del perfil", !cos().includes("Desa els canvis"));
  w.canviaPlaces(1); await tic();
  T("amb canvis pendents, el perfil ofereix «Desa els canvis»", cos().includes("Desa els canvis"));
  await w.desa(); await tic(30);
  w.triaTab("perfil"); await tic();
  T("en desar, el botó Desa del perfil desapareix", !cos().includes("Desa els canvis"));
  w.canviaPlaces(-1); await w.desa(); await tic(30);  // tornem a deixar 3 places
  w.triaTab("descarrega"); await tic();
  T("v4.9: Descarrega ja NO duplica el resum de viatges (només va dins el full del conductor)", cos().includes("Horari del conductor") && !/portes <b>\d+ nen/.test(cos()) && !cos().includes("Què portaràs"));
  w.obreAdmin(); await tic();
  T("el panell admin té logs i còpia de seguretat", pant().includes("Mostra els logs") && pant().includes("seguretat (JSON)"));
  await w.mostraLogs(); await tic(20);
  T("els logs es llisten amb família, acció i detall", d.querySelector("#logs-box").innerHTML.includes("canvi de rol") || d.querySelector("#logs-box").innerHTML.includes("alta fam"));
  w.copiaSeguretat(); await tic();
  T("la còpia de seguretat no peta ni tan sols sense createObjectURL (jsdom)", true);
  w.tancaAdmin(); await tic();
  // Sincronització: un altre compte (p. ex. la parella) demana plaça on l'admin condueix
  const fVila = famDoc("Vila Puig");
  // v3.6: es tria un torn que segueixi existint per als cursos d'ambdues famílies (la 8.00 és només de 1r/2n dt/dc)
  const slotCond = Object.keys(fVila.cotxe).find(s => s !== "e8") || Object.keys(fVila.cotxe)[0];
  const diaCond = fVila.cotxe[slotCond][0];
  const grauF = famDB("Grau");
  const nenG = DB.children.find(c => c.family_id === grauF.id);
  const rowM = DB.weekly_marks.find(m => m.family_id === grauF.id && m.slot === slotCond && m.day === diaCond);
  if (rowM){ if (rowM.type !== "request"){ rowM.type = "request"; rowM.children_ids = []; } if (!rowM.children_ids.includes(nenG.id)) rowM.children_ids.push(nenG.id); }
  else DB.weekly_marks.push({ id: randomUUID(), family_id: grauF.id, slot: slotCond, day: diaCond, type: "request", children_ids: [nenG.id], seats_override: null, updated_by: currentUserId, updated_at: new Date().toISOString() });
  await w.sincronitza(); await tic(30);
  T("la sincronització recarrega els canvis fets per un altre compte", w.doc.families.find(x => x.id === grauF.id).nens.some(n => w.te(n.marca, slotCond, diaCond)));
  w.selDia(diaCond); await tic(30);
  T("la vista dia avisa dels nens pendents de pujar al meu cotxe", cos().includes("demana pla\u00e7a") || cos().includes("demanen pla\u00e7a"));

  console.log("10c · NOVETATS v3.2 (tel/curs, codi família, El teu cotxe, límits, staff↛admin, self-heal)");
  const menuHtml2 = d.querySelector("#calaix").innerHTML;
  T("el menú té l'apartat «El teu cotxe»", menuHtml2.includes("El teu cotxe"));
  w.triaTab("perfil"); await tic();
  T("el perfil mostra el codi de la família (per convidar la parella)", cos().includes("Codi de la vostra fam") && cos().includes(codiDeFam(famDB("Vila Puig"))));
  T("v4.12: el codi de família en tres línies, amb el botó «Copia el codi» COMPARTIT amb el del grup",
    cos().includes("Copia el codi") && cos().includes("entrar a la fam") &&
    (html.match(/copiaCodiAmbAvis\(/g) || []).length === 4);   // grup + família + codis del panell (v4.24) + la definició
  w.copiaTextCodiFam(null); await tic();
  T("…i copiar avisa amb «Codi copiat: [codi]»",
    d.querySelector("#avis").textContent.includes("Codi copiat") && d.querySelector("#avis").textContent.includes(codiDeFam(famDB("Vila Puig"))));
  w.renomTel("600111222"); await tic();   // v4.1 va treure el curs de família (triaCurs): només queda el curs per nen
  // v3.6: canviar el curs pot deixar caselles noves per respondre (l'entrada passa a les 9.00); es reomplen
  const ompleForats = fx => ["e8", "e9", "r13", "e15", "r17"].forEach(s => ["dl", "dt", "dc", "dj", "dv"].forEach(dd => {
    if (w.estatCasella(fx, s, dd) !== "normal" || w.respon(fx, s, dd)) return;
    if (s === "e9" && w.estatCasella(fx, "e8", dd) === "normal" && w.respon(fx, "e8", dd)) return;
    if (s === "e8" && w.estatCasella(fx, "e9", dd) === "normal" && w.respon(fx, "e9", dd)) return;
    w.commuta(fx.propi, s, dd);
  }));
  ompleForats(famDoc("Vila Puig"));
  await w.desa(); await tic(30);
  T("el telèfon es desa a la BD", famDB("Vila Puig").phone === "600111222");
  w.triaTab("families"); await tic();
  T("a Famílies es veu el rol de cadascuna (+curs i telèfon)", cos().includes("· admin") && cos().includes("· staff") && cos().includes("2n ESO") && cos().includes("600111222"));
  w.triaTab("cotxe"); await tic();
  T("«El teu cotxe» llista els nens que hi puc carregar, amb caselles", cos().includes("Qui puges al teu cotxe?") && (cos().includes("demana pla") || cos().includes("demanen pla")));
  T("v4.30: la barra de dalt compta NOMÉS els viatges oferts (els 🙋 dels fills no hi són)", (function(){
    const stf = w.statsCoberturaFam(w.lameva());
    let oferts30 = 0;
    ["dl", "dt", "dc", "dj", "dv"].forEach(dd => ["e8", "e9", "r13", "e15", "r17"].forEach(ss => {
      if (w.te(w.lameva().cotxe, ss, dd) && w.estatCasella(w.lameva(), ss, dd) === "normal") oferts30++;
    }));
    return cos().includes("Trajectes coberts per tu") && stf.tot === oferts30 && stf.tot > 0 && cos().includes(stf.cob + " de " + stf.tot);
  })());
  T("v4.17: la barra del peu és la del grup (el mateix número que el Resum)", (function(){
    const st = w.statsCobertura();
    const peu = (d.querySelector("#peu-stats") || { innerHTML: "" }).innerHTML;
    return peu.includes("Trajectes coberts del grup") && st.dem > 0 && peu.includes(st.cob + " de " + st.dem);
  })());
  d.querySelector("#tab-cos").insertAdjacentHTML("beforeend", "<i id='sentinella-repintat'></i>");
  await w.desa(); await tic(30);
  T("v4.20: després de desar, la pestanya oberta es repinta sola (barra i Qui puja al dia)",
    !d.querySelector("#sentinella-repintat") && cos().includes("Trajectes coberts per tu"));
  T("v4.21: la base de comparació és la instantània carregada (portaBase)",
    w.doc.families.every(f2 => f2.portaBase !== undefined));
  const nAvAbans = DB.notifications.length;
  await w.desa(); await tic(30);
  T("v4.21: un desat sense canvis reals no genera CAP avís", DB.notifications.length === nAvAbans);
  // v4.27: el peu d'estadístiques — oferts, coberts al 100 %, ocupades i lliures, d'UNA sola font
  {
    w.pintaBarra(); await tic();
    const t27 = d.querySelector("#peu-stats").textContent;
    let oferts = 0, cob = 0, ocu = 0, ofertes = 0, completes = 0;
    w.doc.families.forEach(f2 => {
      if (!w.celesPendents(f2).length) completes++;
      ["dl", "dt", "dc", "dj", "dv"].forEach(dd => ["e8", "e9", "r13", "e15", "r17"].forEach(ss => {
        if (!w.te(f2.cotxe, ss, dd)) return;
        oferts++; ofertes += (f2.places || 0);
        const vc = w.viatgeCobert(f2, ss, dd);
        ocu += vc.ocupades; if (vc.cobert) cob++;
      }));
    });
    T("v4.27: el peu duu les 6 xifres en ordre i quadren amb viatgeCobert (cap tercer recompte)",
      t27.includes("(" + completes + " amb la setmana completa)") &&
      t27.includes("🚗 " + oferts + " viatge") && t27.includes("/setmana") &&
      t27.includes("✓ " + cob + " viatge") && t27.includes("al 100 %") &&
      t27.includes("🤝 " + ocu + " seient") && t27.includes("💺 " + Math.max(0, ofertes - ocu) + " seient") &&
      t27.includes("lliure"));
    T("v4.27: la regla del cobert és una sola funció compartida (barra per tu + peu)",
      (html.match(/viatgeCobert\(/g) || []).length === 3);
  }
  // v4.22: un canvi a Qui puja ha de repintar les barres A L'INSTANT (fallaria si no repinta)
  {
    const DIES_T = ["dl", "dt", "dc", "dj", "dv"], FRANGES_T = ["e8", "e9", "r13", "e15", "r17"];
    let cel22 = null;
    DIES_T.forEach(dd => FRANGES_T.forEach(fr => {
      if (cel22 || !w.te(w.lameva().cotxe, fr, dd)) return;
      const cand = w.balanc(fr, dd).nens.find(n2 => !n2.portadaPerId && n2.famId !== w.lameva().id);
      if (cand) cel22 = { s: fr, d: dd, n: cand };
    }));
    T("v4.22: hi ha un candidat pendent per provar el repintat", !!cel22);
    const pend0 = parseInt((cos().match(/(\d+) nens? deman/) || [0, "0"])[1], 10);
    const cob0 = w.statsCobertura().cob;
    w.assigna(cel22.s, cel22.d, cel22.n.famId, cel22.n.nenId, true); await tic();
    const esperat = pend0 - 1;
    T("v4.22: marcar un nen a Qui puja repinta la línia de pendents a l'instant",
      esperat === 0 ? cos().includes("cap nen pendent") : cos().includes("\u26a0 " + esperat + " nen"));
    T("v4.22: …i la barra del grup del peu també puja a l'instant",
      w.statsCobertura().cob === cob0 + 1 &&
      d.querySelector("#peu-stats").innerHTML.includes((cob0 + 1) + " de " + w.statsCobertura().dem));
    T("v4.22: una SOLA línia de pendents (fora la frase duplicada)",
      !cos().includes("esperen pla") && (cos().match(/deman(a|en) pla\u00e7a als teus viatges/g) || []).length <= 1);
    // v4.23: el viatge ofert compta com a cobert quan ningú hi espera (o el cotxe és ple)
    w.assigna(cel22.s, cel22.d, cel22.n.famId, cel22.n.nenId, false); await tic();   // tornem al punt de partida: ≥1 nen esperant
    const esperant23 = w.balanc(cel22.s, cel22.d).nens.filter(n2 => !n2.portadaPerId);
    const stfA = w.statsCoberturaFam(w.lameva());
    T("v4.23: amb nens esperant, el viatge ofert NO compta com a cobert", esperant23.length >= 1 && stfA.cob < stfA.tot);
    esperant23.forEach(n2 => w.assigna(cel22.s, cel22.d, n2.famId, n2.nenId, true)); await tic();
    const stfB = w.statsCoberturaFam(w.lameva());
    T("v4.23: en quedar el viatge sense ningú esperant (o ple), la barra «per tu» puja i es repinta",
      stfB.cob === stfA.cob + 1 && cos().includes(stfB.cob + " de " + stfB.tot));
    esperant23.forEach(n2 => w.assigna(cel22.s, cel22.d, n2.famId, n2.nenId, false)); await tic();   // desfem-ho tot
  }
  T("v4.10: cada viatge duu la capçalera del Quadre (hora gran + ENTRADA/RECOLLIDA + pastilla)",
    /class="m-tip [er]"/.test(cos()) && cos().includes('class="f-hora"') && /pla(ç|\u00e7)?a lliure|places lliures/.test(cos()));
  T("v4.10: cada nen surt amb la icona 🧒 i el nom en negreta", cos().includes("🧒 <b>"));
  T("v4.10: la capçalera de viatge és UNA funció compartida amb la vista Dia (capFranjaHtml)",
    (html.match(/capFranjaHtml\(/g) || []).length === 3);
  T("v4.10: sense candidats, el text és «Cap nen assignat (0/N)»", html.includes("Cap nen assignat ("));
  await w.copiaSeguretat(); await tic();
  T("la còpia de seguretat (ara també amb logs) no peta", true);
  const gId = famDB("Grau").id;
  while (DB.children.filter(c => c.family_id === gId).length < 5)
    DB.children.push({ id: randomUUID(), family_id: gId, name: "Extra" + DB.children.filter(c => c.family_id === gId).length });
  const rNen6 = await fakeSupabaseClient().from("children").insert({ family_id: gId, name: "Sisè" });
  T("límit de 5 fills per família (BD)", !!rNen6.error && rNen6.error.message.includes("5 fills"));
  await surtIentra("grau@test.cat", "grau123");
  const rTocaAdmin = await fakeSupabaseClient().from("families").update({ driver: "Intrús" }).eq("id", famDB("Vila Puig").id);
  T("l'staff NO pot editar la família de l'admin ni per codi", !!rTocaAdmin.error && famDB("Vila Puig").driver !== "Intrús");
  const rNenAdmin = await fakeSupabaseClient().from("children").insert({ family_id: famDB("Vila Puig").id, name: "Intrús" });
  T("ni afegir-hi fills", !!rNenAdmin.error);
  afegeixUsuari("f@test.cat", "fff123");
  await surtIentra("f@test.cat", "fff123");
  await acceptaConsentiment();
  await uneixAmbCodi(CODI);
  const pfHeal = DB.profiles.find(p => p.email === "f@test.cat"); // alta quedada a mitges (la RPC va vincular, la app no ho va saber)
  pfHeal.family_id = famDB("Grau").id; pfHeal.requested_group = famDB("Grau").group_id; pfHeal.status = "aprovat";
  ompleFamForm("Test", "Mitges", "", ["X"]);
  await w.creaFam(); await tic(30);
  T("«Aquest compte ja té família» es repara sol: entra a la família vinculada", pant().includes("Hola") && pant().includes("Grau"), d.querySelector("#avis").textContent + " || " + pant().slice(0, 200));

  console.log("10d · NOVETATS v3.3 (Dia només lectura, curs per nen, famílies desplegables, codi de grup al perfil)");
  await surtIentra("admin@test.cat", "admin123");
  w.triaTab("cal"); await tic(30); w.triaVistaCal("dia"); await tic(20); w.selDia("dl"); await tic(20);
  T("la vista Dia ja NO té caselles: és només de consulta", !cos().includes('type="checkbox"') && cos().includes("Vista de consulta"));
  T("el propi cotxe es veu amb comptador i s'assigna a «El teu cotxe»", cos().includes("Al teu cotxe") && cos().includes("/3"));
  w.triaTab("perfil"); await tic();
  T("el perfil mostra el grup i el seu codi d'invitació", cos().includes("El vostre grup") && cos().includes(CODI));
  T("v4.8: nom del grup i codi separats, amb botó de copiar i l'aclariment",
    cos().includes("El vostre grup: ") && cos().includes("Codi d'invitació:") && cos().includes("Copia el codi") && cos().includes("Només cal el codi, no el nom del grup"));
  w.copiaTextCodiGrup(null); await tic();
  T("…i copiar avisa amb «Codi copiat: [codi]»",
    d.querySelector("#avis").textContent.includes("Codi copiat") && d.querySelector("#avis").textContent.includes(CODI));
  const nenPerCurs = famDoc("Vila Puig").nens[0];
  w.triaCursNen(nenPerCurs.id, "1r ESO"); await tic();
  // v3.6: amb 1r ESO canvien les caselles vàlides (8.00 dt/dc, tardes de nou); es reomplen les noves
  ompleForats(famDoc("Vila Puig"));
  await w.desa(); await tic(30);
  T("el curs per nen es desa a la BD (children.curs)", nenDB(idVila, nenPerCurs.nom).curs === "1r ESO");
  w.triaTab("families"); await tic();
  T("Famílies: cada família és un desplegable amb nens, curs, conductor, places i telèfon", cos().includes("fam-det") && cos().includes("Places lliures") && cos().includes("Condueix") && cos().includes("1r ESO"));
  w.triaTab("cotxe"); await tic();
  T("«El teu cotxe» mostra la família de cada nen sota el nom", cos().includes("a-sub") && cos().includes("Grau"), cos().slice(0, 300));

  console.log("10e · NOVETATS v3.4 (grup a la Graella, perfil sense curs duplicat, reclamar amb dades actuals)");
  await surtIentra("admin@test.cat", "admin123");
  w.triaTab("graella"); await tic();
  T("la Graella porta el nom del grup al títol", (d.querySelector("#cap-titol") || { innerHTML: "" }).innerHTML.includes("EA 25/26"));
  w.triaTab("perfil"); await tic();
  T("al Perfil ja NO hi ha el curs de família duplicat (només curs per nen)", !cos().includes('onchange="triaCurs(this.value)"'));
  await surtIentra("c@test.cat", "ccc123");   // compte desvinculat de la secció 9
  await uneixAmbCodi(CODI);
  d.querySelector("#sel-fam").value = famDB("Vila Puig").id;
  w.selFamCanvia(); await tic();
  T("en triar la família es veuen les seves dades actuals (nens i conductor)", d.querySelector("#sel-preview").innerHTML.includes("Dades actuals") && d.querySelector("#sel-preview").innerHTML.includes("Jan") && d.querySelector("#sel-preview").innerHTML.includes("Marta"));
  T("…i el formulari de creació s'amaga", d.querySelector("#nf-wrap").style.display === "none");
  T("el botó verd acaba el registre", d.querySelector("#sel-bloc").innerHTML.includes("acaba el registre"));
  d.querySelector("#sel-fam").value = "__nova__"; w.selFamCanvia(); await tic();
  T("si la família no hi és, llavors sí que surt el formulari", d.querySelector("#nf-wrap").style.display === "" && !d.querySelector("#sel-preview").innerHTML);

  console.log("10f · LÒGICA DE CURSOS (v3.8: 1r/2n → 8.00 dt/dc i 9.00 la resta; 3r/4t → 8.00 TOTS els dies, dc/dv sense tarda)");
  await surtIentra("admin@test.cat", "admin123");
  w.triaTab("perfil"); await tic();
  w.triaCursNen(idJan(), "3r ESO"); await tic();
  ompleForats(famDoc("Vila Puig"));   // amb 3r ESO l'entrada passa a les 8.00 tots els dies
  await w.desa(); await tic(30);
  T("el curs del nen s'actualitza a la BD", nenDB(idVila, "Janot").curs === "3r ESO");

  // ── v4.2 · afegir un fill NO ha de tocar la graella dels germans ──
  {
    const fVP = famDoc("Vila Puig");
    const marquesAbans = JSON.stringify(fVP.nens[0].marca);
    const cotxeAbans = JSON.stringify(fVP.cotxe), propiAbans = JSON.stringify(fVP.propi);
    const nensAbans = fVP.nens.length;
    w.triaTab("perfil"); await tic();
    d.querySelector("#nou-nen").value = "Toni";
    w.afegeixNen(); await tic();
    const toni = famDoc("Vila Puig").nens.find(x => x.nom === "Toni");
    T("el fill nou s'afegeix a la família", !!toni && famDoc("Vila Puig").nens.length === nensAbans + 1);
    w.triaCursNen(toni.id, "1r ESO"); await tic();
    T("afegir un fill NO canvia les marques del germà",
      JSON.stringify(famDoc("Vila Puig").nens[0].marca) === marquesAbans);
    T("…ni el 🚗 ni el 🚫 de la família",
      JSON.stringify(famDoc("Vila Puig").cotxe) === cotxeAbans && JSON.stringify(famDoc("Vila Puig").propi) === propiAbans);
    T("…i no salta cap avís de canvi de curs (primera tria d'un fill nou)",
      !d.querySelector("#barra-avis").textContent.includes("Hem canviat el curs"));
    w.triaTab("graella"); await tic();
    T("…tampoc a la Graella", !cos().includes("Hem canviat el curs"));
    T("les caselles del fill nou surten pel camí normal (pendents de respondre)",
      w.celesPendents(famDoc("Vila Puig")).length > 0);

    // ── v4.5 · canvi de curs SENSE perdre la graella: cau només el que ja no existeix ──
    const gran = famDoc("Vila Puig").nens[0];
    w.posa(gran.marca, "e8", "dl");          // amb 3r ESO és vàlida (entren sempre a l'hora matinera)
    w.posa(gran.marca, "r13", "dl");         // el migdia val per a tots els cursos
    w.triaCursNen(gran.id, "1r ESO"); await tic();   // amb 1r, l'entrada matinera de dilluns ja no existeix
    T("v4.5: la marca d'una casella que ja no existeix amb el nou horari cau", !w.te(gran.marca, "e8", "dl"));
    T("…però les que segueixen sent vàlides es conserven", w.te(gran.marca, "r13", "dl"));
    const ba = d.querySelector("#barra-avis").textContent;
    T("…i s'avisa: «Hem canviat el curs de X. Falta respondre: …»",
      ba.includes("Hem canviat el curs de Janot") && ba.includes("Falta respondre"));
    w.triaTab("graella"); await tic();
    T("…i la Graella només ofereix l'esborrat per fill (res de tota la família)",
      cos().includes("esborraGraellaNen('" + gran.id + "')") && !cos().includes("Esborra tota la graella"));
    await surtIentra("admin@test.cat", "admin123");   // res d'això no s'ha desat: torna a l'estat de la BD
  }
  // Família de 4t ESO sense cap marca: la llista de pendents n'és la prova neta
  w.adminEdita(famDB("Família Nova").id); await tic(20);
  w.triaTab("perfil"); await tic();
  const polId = famDoc("Família Nova").nens[0].id;
  w.triaCursNen(polId, "4t ESO"); await tic();
  await w.desa(); await tic(30);
  T("v4.6: el canvi de curs es desa encara que quedin caselles pendents (abans el bloqueig ho impedia)",
    (DB.children.find(c => c.id === polId) || {}).curs === "4t ESO" &&
    d.querySelector("#barra-avis").textContent.includes("Es desa igualment"));
  const pendN = w.celesPendents(famDoc("Família Nova"));
  T("4t ESO: les tardes de dimecres i divendres NO són pendents", !pendN.some(x => /Dimecres (15|17)|Divendres (15|17)/.test(x)), pendN.join(" | "));
  T("però el migdia de dimecres SÍ que cal respondre'l", pendN.some(x => x.includes("Dimecres 13.00")), pendN.join(" | "));
  T("i la tarda de dilluns també", pendN.some(x => x.includes("Dilluns 14.35")), pendN.join(" | "));
  T("si el nen fos de 1r, dimecres a la tarda SÍ que caldria", (function(){ w.triaCursNen(polId, "1r ESO"); const p2 = w.celesPendents(famDoc("Família Nova")); w.triaCursNen(polId, "4t ESO"); return p2.some(x => x.includes("Dimecres 14.35")); })());
  await w.desa(); await tic(30);
  w.triaFam(famDB("Vila Puig").id); await tic(20);
  w.triaTab("graella"); await tic();
  w.obreCasella("e9", "dt"); await tic();
  T("família de 3r/4t: la casella de les 8.35 no s'obre MAI (entren sempre a les 7.35)", !d.querySelector("#cel-menu").classList.contains("obert") && d.querySelector("#avis").textContent.includes("entren sempre a les 7.35"));
  w.obreCasella("e9", "dv"); await tic();
  T("…tampoc divendres (cap dia)", !d.querySelector("#cel-menu").classList.contains("obert"));
  w.obreCasella("e8", "dl"); await tic();
  T("la de les 8.00 s'obre TOTS els dies (dilluns)", d.querySelector("#cel-menu").classList.contains("obert"));
  w.tancaCasella();
  w.obreCasella("e8", "dv"); await tic();
  T("…i divendres també", d.querySelector("#cel-menu").classList.contains("obert"));
  w.tancaCasella();
  w.obreCasella("e15", "dc"); await tic();
  T("dimecres a la tarda no (no tenen escola)", !d.querySelector("#cel-menu").classList.contains("obert") && d.querySelector("#avis").textContent.includes("tarda"));
  w.obreCasella("r13", "dc"); await tic();
  T("dimecres al migdia sí que s'obre", d.querySelector("#cel-menu").classList.contains("obert"));
  w.tancaCasella();
  T("la graella informa de les exempcions del curs", cos().includes("no cal respondre-les"));
  // ── v4.3 · una graella per fill ──
  {
    const fam = famDoc("Vila Puig");
    const gr = cos();
    T("hi ha un bloc de graella per cada fill", (gr.match(/class="gr-bloc"/g) || []).length === fam.nens.length);
    T("cada bloc porta el nom del fill i el seu curs",
      fam.nens.every(n => gr.includes(n.nom) && (!n.curs || gr.includes(n.curs))));
    T("cada bloc té el seu «Esborra la graella de [nom]»",
      fam.nens.every(n => gr.includes("esborraGraellaNen('" + n.id + "')")));
    T("les caselles porten l'id del fill (el 🙋 és seu, no de tota la família)",
      fam.nens.every(n => gr.includes("','" + n.id + "')")));
    T("l'avís de pendents diu de quin fill és",
      !gr.includes("Falta respondre de") || /Falta respondre de <b>/.test(gr));
    // el menú d'un bloc només toca aquell fill
    const n0 = fam.nens[0];
    w.obreCasella("r13", "dl", n0.id); await tic();
    T("el menú obert des d'un bloc és d'aquell fill",
      w.nensDelMenu(famDoc("Vila Puig"), "r13", "dl").length === 1);
    w.tancaCasella(); await tic();
  }
  w.triaTab("perfil"); await tic();
  w.triaCursNen(idJan(), "1r ESO"); await tic();
  w.triaTab("graella"); await tic();
  w.obreCasella("e8", "dt"); await tic();
  T("1r ESO: dimarts SÍ es pot respondre la 8.00", d.querySelector("#cel-menu").classList.contains("obert"));
  w.tancaCasella();
  w.obreCasella("e8", "dl"); await tic();
  T("però dilluns no (1r/2n entren a les 9.00)", !d.querySelector("#cel-menu").classList.contains("obert"));
  w.triaTab("perfil"); await tic();
  // v4.6: el desat amb pendents ara SÍ es desa — cal tornar el curs real d'en
  // Janot abans, que si no quedava 1r ESO a la BD (abans ho tapava el bloqueig)
  w.triaCursNen(idJan(), "3r ESO"); await tic();
  await w.desa(); await tic(30);

  console.log("10g · NOVETATS v4.4 (un sol botó d'esborrar: fora «Esborra tota la graella»)");
  w.triaTab("graella"); await tic();
  T("v4.4: la graella ja NO té el botó d'esborrar-ho tot", !cos().includes("Esborra tota la graella"));
  T("v4.4: el botó per fill segueix a la targeta de cada fill", cos().includes("Esborra la graella de"));
  T("v4.4: les funcions d'esborrat total ja no existeixen", !w.esborraGraella && !w.esborraGraellaDeDebò && !w.pintaGraellaAccions);
  // ── v4.14 · esborrar la graella d'un fill: pregunta pels 🚗/🚫 compartits, allibera cotxes i resumeix ──
  {
    // en Janot ocupa una plaça al cotxe de la família Grau (r17 de dilluns)
    DB.assignments.push({ id: randomUUID(), group_id: famDB("Grau").group_id, driver_family_id: famDB("Grau").id, child_id: idJan(), slot: "r17", day: "dl", updated_by: null });
    await w.sbGet(); await tic(10);   // sbGet reconstrueix doc: les referències es prenen DESPRÉS
    const fVPg = famDoc("Vila Puig");
    fVPg.nens.push({ id: "tmp-esb", nom: "Nil", curs: "1r ESO", marca: {} });   // germà: r13 compartit; e8-dl només d'en Janot; e9-dl només d'en Nil
    const janG = fVPg.nens.find(x => x.id === idJan());
    w.posa(fVPg.cotxe, "e8", "dl");     // exclusiva d'en Janot
    w.posa(fVPg.propi, "r13", "dl");    // compartida amb en Nil
    w.posa(fVPg.cotxe, "e9", "dl");     // NOMÉS d'en Nil: mai no es toca
    w.posa(janG.marca, "r17", "dl");    // 🙋 seu
    w.triaTab("graella"); await tic();
    T("v4.14: les caselles que no són seves NO mostren marques apagades (e9-dl és d'en Nil)",
      cos().includes('aria-label="Janot Dilluns 8.35"></button>'));
    // camí A · «Només el que és seu»
    w.esborraGraellaNen(janG.id); await tic(10);
    T("v4.14: amb germans i 🚗/🚫 compartit, el diàleg PREGUNTA i esmenta el germà",
      (d.querySelector("#conf-box") || { textContent: "" }).textContent.includes("Vols treure'ls també") &&
      d.querySelector("#conf-box").textContent.includes("Afectarà la graella de Nil") &&
      !!d.querySelector("#conf-si2"));
    d.querySelector("#conf-si2").click(); await tic(10);
    T("v4.14 «Només el que és seu»: cauen els 🙋 i el 🚗 exclusiu, però el 🚫 compartit es queda",
      !w.te(janG.marca, "r17", "dl") && !w.te(fVPg.cotxe, "e8", "dl") && w.te(fVPg.propi, "r13", "dl") && w.te(fVPg.cotxe, "e9", "dl"));
    // camí B · «Treu-ho tot»
    w.posa(fVPg.cotxe, "e8", "dl"); w.posa(janG.marca, "r17", "dl");
    w.esborraGraellaNen(janG.id); await tic(10);
    d.querySelector("#conf-si").click(); await tic(10);
    T("v4.14 «Treu-ho tot»: la targeta queda en blanc del tot (compartides incloses)",
      !w.te(janG.marca, "r17", "dl") && !w.te(fVPg.cotxe, "e8", "dl") && !w.te(fVPg.propi, "r13", "dl"));
    T("…i només es conserva el que és exclusiu del germà (e9-dl)", w.te(fVPg.cotxe, "e9", "dl"));
    T("…amb el missatge «Graella de X buida»", d.querySelector("#avis").textContent.includes("Graella de Janot buida"));
    fVPg.nens = fVPg.nens.filter(x => x.id !== "tmp-esb");   // el germà temporal fora ABANS de desar (que no s'insereixi a la BD)
    await w.desa(); await tic(40);
    T("v4.14: en desar, el fill surt del cotxe on estava assignat (les places s'alliberen)",
      !DB.assignments.some(a => a.child_id === idJan()));
    T("v4.14: el missatge final resumeix les places alliberades i el conductor",
      d.querySelector("#avis").textContent.includes("Graella de Janot esborrada") &&
      d.querySelector("#avis").textContent.includes("alliberad") &&
      d.querySelector("#avis").textContent.includes("Pere"));
    const grupG = famDB("Grau").group_id;
    T("v4.14: TOT el grup rep l'avís, amb la família, el fill i el conductor",
      DB.notifications.some(nt => nt.family_id === famDB("Grau").id && nt.message.includes("ha esborrat la graella de Janot") && nt.message.includes("Pere")) &&
      DB.notifications.filter(nt => nt.message.includes("ha esborrat la graella de Janot")).length >= DB.families.filter(x => x.group_id === grupG).length);
    w.triaTab("avisos"); await tic();
    T("…i l'apartat Avisos el mostra", cos().includes("ha esborrat la graella de Janot"));
    w.triaTab("graella"); await tic();
  }
  // les proves següents esperen la graella de Vila Puig buida (abans la buidava el botó): es buida directament a la BD
  DB.weekly_marks = DB.weekly_marks.filter(m => m.family_id !== idVila);
  DB.assignments = DB.assignments.filter(a => a.driver_family_id !== idVila);
  await w.sbGet(); await tic(20);
  w.triaTab("graella"); await tic();
  T("v4.4: amb la BD buida, la graella es repinta en blanc", !cos().includes("c-ico"));

  console.log("10h · NOVETATS v3.7 (fulls: nom del conductor a la casella, grup a la capçalera, print CSS)");
  const mp = html.slice(html.indexOf("@media print"), html.indexOf("@page"));
  T("print v3.9: #full-horari és FILL DIRECTE de <body> (l'espai de la resta s'allibera)", /<\/div>\s*(<!--[^]*?-->\s*)?<div id="full-horari"[^>]*><\/div>\s*<script>/.test(html) && mp.includes("body > *:not(#full-horari){display:none"));
  T("print v3.9: colors forçats (print-color-adjust:exact) i cap `vh` al bloc print", mp.includes("print-color-adjust:exact") && mp.includes("-webkit-print-color-adjust:exact") && !/[0-9]vh/.test(mp));
  T("print v3.9: el full fa exactament l'A4 útil i el cos es reparteix en grid", mp.includes("width:281mm") && mp.includes("height:194mm") && mp.includes("grid-template-rows:auto auto auto 1fr auto auto") && html.includes("fh-cos"));
  const fCond = famDoc("Vila Puig");
  fCond.nens.push({ id: "tmp-nen-full", nom: "Bet", curs: "3r ESO", marca: {} });   // segon nen (mateix curs que Janot), per provar la nota amb 2 noms
  w.commuta(fCond.cotxe, "e8", "dl");   // 3r/4t entren a les 8.00
  w.descarregaHorariConductor(); await tic();
  const fullC = d.querySelector("#full-horari").innerHTML;
  T("full del conductor: el títol de la casella és el nom del conductor, no «portes N»", !fullC.includes("portes ") && fullC.includes(w.nomConductor(fCond)));
  T("…la nota duu el recompte, els 2 noms i les places lliures", fullC.includes("porta 2:") && fullC.includes("Janot") && fullC.includes("Bet") && fullC.includes("lliure"));
  T("…i el grup a la capçalera (de doc.grupNom)", fullC.includes("Grup " + w.doc.grupNom));
  const condAbans = fCond.conductor; fCond.conductor = "";
  w.descarregaHorariConductor(); await tic();
  T("sense conductor informat, la casella cau al nom de la família", d.querySelector("#full-horari").innerHTML.includes("Vila Puig"));
  fCond.conductor = condAbans;
  w.descarregaHorariNen(fCond.id, idJan()); await tic();
  T("el full del nen també duu el grup a la capçalera", d.querySelector("#full-horari").innerHTML.includes("Grup " + w.doc.grupNom));
  w.tancaFull(); w.commuta(fCond.cotxe, "e8", "dl");   // es deixa la graella com estava (buida)
  fCond.nens = fCond.nens.filter(n => n.id !== "tmp-nen-full");

  console.log("10i · NOVETATS v3.8 (horari per curs a cada nen, un sol desar, vinculació robusta)");
  // ── A · horari: el text d'ajuda i la família tota de 3r/4t ──
  T("el text d'ajuda ja NO diu «sempre a les 8.35»", !html.includes("sempre a les 8.35"));
  T("…i diu que 3r i 4t entren sempre a l'hora matinera", html.includes("3r i 4t: entren sempre a les \" + horaDe(\"e8\")"));
  const f34 = { nens: [{ id: "a", nom: "Ona", curs: "4t ESO", marca: {} }], cotxe: {}, propi: {}, curs: "" };
  ["dl", "dt", "dc", "dj", "dv"].forEach(dd => { w.commuta(f34.propi, "e8", dd); w.commuta(f34.propi, "r13", dd); });
  ["dl", "dt", "dj"].forEach(dd => { w.commuta(f34.propi, "e15", dd); w.commuta(f34.propi, "r17", dd); });
  T("família tota de 3r/4t: setmana completa amb 5 entrades de 8.00 + migdies + les 3 tardes que toquen", w.celesPendents(f34).length === 0, w.celesPendents(f34).join(" | "));
  T("…i la de les 9.00 és en blanc TOTS els dies", ["dl", "dt", "dc", "dj", "dv"].every(dd => w.estatCasella(f34, "e9", dd) === "blanc-entrada"));
  // ── A · família mixta (2n + 4t): cada entrada és dels seus nens ──
  const fMix = { nens: [{ id: "n2", nom: "Pau", curs: "2n ESO", marca: {} }, { id: "n4", nom: "Bru2", curs: "4t ESO", marca: {} }], cotxe: {}, propi: {}, curs: "" };
  T("mixta 2n+4t: dilluns les DUES entrades són normals", w.estatCasella(fMix, "e8", "dl") === "normal" && w.estatCasella(fMix, "e9", "dl") === "normal");
  T("…però cadascuna és del seu nen (8.00 el de 4t, 9.00 el de 2n)", w.nensDeCasella(fMix, "e8", "dl").map(n => n.nom).join() === "Bru2" && w.nensDeCasella(fMix, "e9", "dl").map(n => n.nom).join() === "Pau");
  T("…dimarts tots dos a les 8.00 i la de les 9.00 en blanc", w.nensDeCasella(fMix, "e8", "dt").length === 2 && w.estatCasella(fMix, "e9", "dt") === "blanc-entrada");
  T("…i les dues entrades de dilluns són pendents per separat", w.celesPendents(fMix).filter(x => x.indexOf("Dilluns entrada") === 0).length === 2);
  // menú de casella: només el nen que hi entra
  const fV = famDoc("Vila Puig");
  fV.nens.push({ id: "tmp-mix", nom: "Nil", curs: "1r ESO", marca: {} });   // Janot 3r + Nil 1r = mixta
  w.triaTab("graella"); await tic();
  w.obreCasella("e9", "dl"); await tic();
  T("menú de la 9.00 de dilluns (mixta 3r+1r): només hi demana plaça el de 1r", d.querySelector("#cel-menu").innerHTML.includes("Nil demana") && !d.querySelector("#cel-menu").innerHTML.includes("Janot"));
  w.tancaCasella();
  w.obreCasella("e8", "dl"); await tic();
  T("…i al de les 8.00, només el de 3r", d.querySelector("#cel-menu").innerHTML.includes("Janot demana") && !d.querySelector("#cel-menu").innerHTML.includes("Nil"));
  w.tancaCasella();
  fV.nens = fV.nens.filter(n => n.id !== "tmp-mix");
  // ── B · un sol control de desar a la Graella ──
  w.triaPinzell("cotxe"); await tic(400); w.pinta("r13", "dl"); await tic();   // canvi pendent
  const graHtml = cos();
  T("amb canvis pendents: UN sol control de desar (la barra) i cap botó d'esborrar-ho tot", (graHtml.match(/Desa els canvis/g) || []).length === 0 && !graHtml.includes("Esborra tota la graella") && !d.querySelector("#barra").classList.contains("amaga"));
  await tic(400); w.pinta("r13", "dl"); await tic();   // desfà el canvi
  // ── C · vinculació robusta (claim idempotent, una altra família, desvincula, alta atòmica) ──
  const sbFake = fakeSupabaseClient();
  const rMateixa = await sbFake.rpc("claim_family", { p_family: mevaFamId(), p_token: "QUALSEVOL" });
  T("claim_family sobre la MATEIXA família: acaba bé sense error (idempotent)", !rMateixa.error);
  const rAltra = await sbFake.rpc("claim_family", { p_family: famDB("Grau").id, p_token: codiDeFam(famDB("Grau")) });
  T("claim_family sobre UNA ALTRA família: error amb el nom de la meva", !!rAltra.error && rAltra.error.message.includes("ja està vinculat a la família Vila Puig"));
  const rPerfil = await sbFake.rpc("el_meu_perfil");
  T("el_meu_perfil(): retorna la fila del MATEIX usuari del JWT", !rPerfil.error && rPerfil.data[0] && rPerfil.data[0].family_id === mevaFamId());
  // alta amb fallada de nens: NO queda cap perfil vinculat a mitges (transacció)
  afegeixUsuari("atomic@test.cat", "atomic123");
  await surtIentra("atomic@test.cat", "atomic123");
  await acceptaConsentiment();
  const rPeta = await fakeSupabaseClient().rpc("join_group_crea", { p_code: CODI, p_cognom1: "Atomic", p_cognom2: "", p_driver: "A", p_seats: 3, p_nens: [{ nom: "X", __peta: true }] });
  const prAtomic = DB.profiles.find(x => x.email === "atomic@test.cat");
  T("alta atòmica: si falla l'insert dels nens, el perfil NO queda vinculat", !!rPeta.error && prAtomic.family_id === null && !DB.families.some(x => x.name === "Atomic"));
  const rOk = await fakeSupabaseClient().rpc("join_group_crea", { p_code: CODI, p_cognom1: "Atomic", p_cognom2: "", p_driver: "A", p_seats: 3, p_nens: [{ nom: "Xus", curs: "1r ESO" }] });
  T("l'alta atòmica bona crea família i nens d'una tacada", !rOk.error && DB.children.some(c => c.name === "Xus" && c.curs === "1r ESO"));
  // desvincula_compte: només el perfil propi
  const abansAltres = DB.profiles.filter(x => x.email !== "atomic@test.cat").map(x => x.family_id).join("|");
  const rDesv = await fakeSupabaseClient().rpc("desvincula_compte");
  T("desvincula_compte(): el perfil propi queda a null · 'pendent'", !rDesv.error && prAtomic.family_id === null && prAtomic.status === "pendent");
  T("…i NO toca cap altre perfil", DB.profiles.filter(x => x.email !== "atomic@test.cat").map(x => x.family_id).join("|") === abansAltres);
  T("…i queda al registre d'activitat", DB.activity_log.some(l => l.action === "desvinculació"));
  await fakeSupabaseClient().rpc("esborra_familia", { p_family: (DB.families.find(x => x.name === "Atomic") || {}).id });
  await surtIentra("admin@test.cat", "admin123");

  console.log("10j · NOVETATS v3.9 (el codi de família sol vincula; una casella per als dos codis)");
  afegeixUsuari("codi8@test.cat", "codi8123");
  await surtIentra("codi8@test.cat", "codi8123");
  await acceptaConsentiment();
  T("la pantalla d'unió explica els DOS codis (grup 6 · família 8) en una sola casella", pant().includes("6 car") && pant().includes("8 car") && !!d.querySelector("#gg-codi"));
  await uneixAmbCodi("SETLLET");   // 7 caràcters
  T("7 caràcters → missatge de llargada", d.querySelector("#avis").textContent.includes("6 caràcters") && d.querySelector("#avis").textContent.includes("Revisa quin t'han passat"));
  await uneixAmbCodi("AAAAAAAA");  // 8 caràcters inexistents
  T("8 caràcters inexistents → missatge de família", d.querySelector("#avis").textContent.includes("Cap família amb aquest codi"));
  await uneixAmbCodi(codiDeFam(famDB("Família Nova")));   // 8 caràcters bons
  T("8 caràcters correctes → vincula i ENTRA, sense passar per «Qui sou?»", pant().includes("Hola") && !pant().includes("Qui sou?") && DB.profiles.find(x => x.email === "codi8@test.cat").family_id === famDB("Família Nova").id);
  T("…amb l'avís «Vinculat a la família X ✓» i el log «via codi de família»", d.querySelector("#avis").textContent.includes("Vinculat a la família") && DB.activity_log.some(l => (l.details || "").includes("via codi de família")));
  // tercer compte a la mateixa família → «ja té 2 comptes»
  afegeixUsuari("codi8b@test.cat", "codi8123");
  await surtIentra("codi8b@test.cat", "codi8123");
  await acceptaConsentiment();
  await uneixAmbCodi(codiDeFam(famDB("Família Nova")));   // 2n compte: entra
  T("el segon compte també hi entra pel codi de família", DB.profiles.find(x => x.email === "codi8b@test.cat").family_id === famDB("Família Nova").id);
  afegeixUsuari("codi8c@test.cat", "codi8123");
  await surtIentra("codi8c@test.cat", "codi8123");
  await acceptaConsentiment();
  await uneixAmbCodi(codiDeFam(famDB("Família Nova")));
  T("el TERCER compte és rebutjat: «ja té 2 comptes»", d.querySelector("#avis").textContent.includes("ja té 2 comptes") && DB.profiles.find(x => x.email === "codi8c@test.cat").family_id === null);
  await uneixAmbCodi(CODI);   // 6 caràcters: el flux del grup, intacte
  T("6 caràcters → el flux del grup segueix igual (arriba a «Qui sou?»)", pant().includes("Qui sou?"));
  await surtIentra("grau@test.cat", "grau123");   // usuari normal, membre del grup
  const rTok = await fakeSupabaseClient().from("families").select("*");
  T("un usuari normal NO pot llegir invite_token (la cerca per codi va dins del security definer)", (rTok.data || []).length > 0 && rTok.data.every(x => !("invite_token" in x)));
  const sql38 = fs.readFileSync(path.join(__dirname, "supabase-v38.sql"), "utf-8");
  T("SQL v38: cos únic de vinculació privat + claim_family_per_codi dins security definer", sql38.includes("vincula_compte_a_familia") && sql38.includes("revoke execute on function public.vincula_compte_a_familia") && sql38.includes("claim_family_per_codi") && sql38.includes("security definer"));
  await surtIentra("admin@test.cat", "admin123");

  console.log("10k · NOVETATS v4.5 (llista de comptes de l'admin: correu, família i rol)");
  await surtIentra("admin@test.cat", "admin123");
  afegeixUsuari("orfe@test.cat", "x");   // alta a mitges: és a auth.users però no té perfil — també ha de sortir
  w.obreAdmin(); await tic();
  T("el panell d'admin té l'apartat «Comptes registrats»", pant().includes("Comptes registrats") && pant().includes("mostraComptes()"));
  await w.mostraComptes(); await tic(10);
  const cbox = () => (d.querySelector("#comptes-box") || { innerHTML: "" }).innerHTML;
  T("la llista duu l'admin amb correu, la seva família i el rol de titular",
    cbox().includes("admin@test.cat") && cbox().includes("titular") && cbox().includes("Vila Puig"));
  T("…i també els comptes que encara no tenen família", cbox().includes("orfe@test.cat"));
  w.tancaAdmin(); await tic();
  await surtIentra("grau@test.cat", "grau123");
  w.obreAdmin(); await tic();
  T("un usuari normal no veu l'apartat al seu panell", !pant().includes("Comptes registrats"));
  const rNoAdmin = await fakeSupabaseClient().rpc("llista_comptes");
  T("…i l'RPC el rebutja (els correus són a auth.users)", !!rNoAdmin.error && rNoAdmin.error.message.includes("administrador"));
  const rEsbNo = await fakeSupabaseClient().rpc("esborra_compte", { p_correu: "orfe@test.cat" });
  T("v4.13: un usuari normal tampoc no pot esborrar comptes (RPC només admin)", !!rEsbNo.error);
  w.tancaAdmin(); await tic();
  await surtIentra("admin@test.cat", "admin123");

  console.log("10l · NOVETATS v4.13 (comptes en desplegable + esborrar un compte amb implicacions)");
  w.obreAdmin(); await tic();
  await w.mostraComptes(); await tic(10);
  const cb13 = () => (d.querySelector("#comptes-box") || { innerHTML: "" }).innerHTML;
  T("v4.13: cada compte és una fila desplegable amb el botó vermell d'esborrar",
    cb13().includes("<details") && cb13().includes("Esborra el compte"));
  T("v4.13: els comptes sense família van agrupats al final, rere un separador",
    cb13().indexOf("comptes sense fam") > cb13().indexOf("admin@test.cat"));
  const rowAdmin = cb13().split("</details>").find(x => x.includes("admin@test.cat")) || "";
  const rowOrfe = cb13().split("</details>").find(x => x.includes("orfe@test.cat")) || "";
  T("v4.13: el compte de l'admin connectat té el botó desactivat (els altres no)",
    rowAdmin.includes("disabled") && rowOrfe && !rowOrfe.includes("disabled"));
  // esborrar el compte sense família: diàleg + confirmació escrivint el correu
  const iOrfe = w.comptesCache.findIndex(x => x.correu === "orfe@test.cat");
  w.esborraCompteUI(iOrfe); await tic(5);
  T("v4.13: el diàleg demana escriure el correu i el botó comença desactivat",
    (d.querySelector("#conf-box") || { textContent: "" }).textContent.includes("escriu el correu") && d.querySelector("#conf-si").disabled);
  w.verificaCorreuEsb("malament@x.cat");
  T("…amb un correu equivocat continua desactivat", d.querySelector("#conf-si").disabled);
  w.verificaCorreuEsb("orfe@test.cat");
  T("…i amb el correu bo s'activa", !d.querySelector("#conf-si").disabled);
  d.querySelector("#conf-si").click(); await tic(30);
  T("v4.13: el compte sense família s'esborra i prou, amb el missatge i la llista",
    !Object.values(DB.users).some(x => x.email === "orfe@test.cat") &&
    d.querySelector("#avis").textContent.includes("orfe@test.cat") && d.querySelector("#avis").textContent.includes("esborrat"));
  // titular AMB progenitor: l'altre compte passa a titular (Família Nova té codi8 i codi8b)
  const fid8 = DB.profiles.find(x => x.email === "codi8@test.cat").family_id;
  const r1 = await fakeSupabaseClient().rpc("esborra_compte", { p_correu: "codi8@test.cat" });
  T("v4.13: en esborrar el titular amb 2n compte, l'altre passa a titular i la família es queda",
    !r1.error && (r1.data || []).some(x => x.includes("passa a titular")) &&
    DB.families.some(x => x.id === fid8) &&
    DB.families.find(x => x.id === fid8).owner_id === DB.profiles.find(x => x.email === "codi8b@test.cat").id);
  // titular ÚNIC: cau la família sencera
  const r2 = await fakeSupabaseClient().rpc("esborra_compte", { p_correu: "codi8b@test.cat" });
  T("v4.13: en esborrar l'últim titular, cau la família sencera (fills i graella inclosos)",
    !r2.error && !DB.families.some(x => x.id === fid8) && !DB.children.some(c => c.family_id === fid8) &&
    (r2.data || []).some(x => x.includes("família")));
  const rSelf = await fakeSupabaseClient().rpc("esborra_compte", { p_correu: "admin@test.cat" });
  T("v4.13: l'admin no es pot esborrar a si mateix (la funció ho refusa)", !!rSelf.error);
  T("v4.13: l'esborrat queda al registre d'activitat ('baixa compte')",
    DB.activity_log.some(l => l.action === "baixa compte"));

  console.log("10m · NOVETATS v4.16 (fila neta amb alta/últim accés + esborrat múltiple)");
  await w.mostraComptes(); await tic(10);
  const rowAdm16 = () => (cb13().split("</details>").find(x => x.includes("admin@test.cat")) || "");
  T("v4.16: la fila oberta duu Alta i Últim accés i NO repeteix la línia del correu",
    cb13().includes("Alta:") && cb13().includes("Últim accés:") &&
    (rowAdm16().match(/admin@test\.cat/g) || []).length === 1);
  T("v4.16: l'últim accés del compte connectat és informat (no —)",
    rowAdm16().includes("Últim accés:") && !rowAdm16().includes("Últim accés: —"));
  T("v4.16: l'avís de «no es pot esborrar» NOMÉS surt al compte connectat",
    cb13().split("</details>").filter(x => x.includes("no es pot esborrar")).length === 1 &&
    rowAdm16().includes("no es pot esborrar"));
  T("v4.16: cada fila té casella de selecció i la de l'admin està desactivada",
    (cb13().match(/class="cmp-sel"/g) || []).length >= 2 && /cmp-sel" data-i="\d+" disabled/.test(rowAdm16()));
  afegeixUsuari("orfe2@test.cat", "x"); afegeixUsuari("orfe3@test.cat", "x");
  await w.mostraComptes(); await tic(10);
  w.selComptesSenseFam();
  const nSel = d.querySelectorAll(".cmp-sel:checked").length;
  T("v4.16: «Selecciona tots els sense família» marca els orfes i activa el botó amb el recompte",
    nSel >= 2 && !d.querySelector("#esb-sel-btn").disabled &&
    d.querySelector("#esb-sel-btn").textContent.includes("(" + nSel + ")"));
  w.esborraSeleccionatsUI(); await tic(5);
  T("v4.16: el diàleg llista cada compte amb el seu cas i demana escriure ESBORRA",
    (d.querySelector("#conf-box") || { textContent: "" }).textContent.includes("orfe2@test.cat") &&
    d.querySelector("#conf-box").textContent.includes("orfe3@test.cat") &&
    d.querySelector("#conf-box").textContent.includes("ESBORRA") && d.querySelector("#conf-si").disabled);
  w.verificaEsborraTot("malament");
  T("…amb qualsevol altra cosa el botó segueix desactivat", d.querySelector("#conf-si").disabled);
  w.verificaEsborraTot("esborra");
  T("…i amb ESBORRA (majúscules o no) s'activa", !d.querySelector("#conf-si").disabled);
  d.querySelector("#conf-si").click(); await tic(40);
  T("v4.16: els seleccionats s'esborren amb la MATEIXA funció i el missatge resumeix què s'ha fet",
    !Object.values(DB.users).some(x => x.email === "orfe2@test.cat") &&
    !Object.values(DB.users).some(x => x.email === "orfe3@test.cat") &&
    d.querySelector("#avis").textContent.includes("orfe2@test.cat") &&
    d.querySelector("#avis").textContent.includes("orfe3@test.cat"));
  w.tancaAdmin(); await tic();

  console.log("10o · NOVETATS v4.24 (el «copia» dels codis copia només el codi)");
  w.obreAdmin(); await tic(30);
  const cbx = d.querySelector("#codis-box");
  T("v4.24: la llista de codis és carregada", !!(cbx && cbx._dades && cbx._dades.length));
  w.copiaCodiFamIdx(0, null); await tic();
  T("v4.24: «copia» copia NOMÉS el codi, amb l'avís",
    d.querySelector("#avis").textContent.includes("Codi copiat") &&
    d.querySelector("#avis").textContent.includes(cbx._dades[0].codi) &&
    !d.querySelector("#avis").textContent.includes(cbx._dades[0].nom));
  T("v4.24: el «copia-ho tot» es queda amb nom · codi per línia", html.includes('x.nom + " \\u00b7 " + x.codi).join("\\n")') || /copiaCodisTot/.test(html));
  w.tancaAdmin(); await tic();
  // comprovació: «Copia el codi» del Perfil copia el codi de la família ACTIVA (admin dins d'una altra)
  w.adminEdita(famDB("Grau").id); await tic(30);
  w.triaTab("perfil"); await tic(30);
  w.copiaTextCodiFam(null); await tic();
  T("v4.24: dins d'una altra família, «Copia el codi» copia el codi d'AQUELLA família (mai buit)",
    d.querySelector("#avis").textContent.includes(codiDeFam(famDB("Grau"))));
  await surtIentra("admin@test.cat", "admin123");

  console.log("10p · NOVETATS v4.25 (vincular amb codi coherent amb el perfil)");
  await surtIentra("grau@test.cat", "grau123");
  await w.pantallaGrup(); await tic(30);
  T("v4.25: amb família, la pantalla «Uneix-te» no es mostra mai: s'entra directament",
    pant().includes("Hola") && !pant().includes("Uneix-te amb un codi"));
  await w.recuperaIEntra(); await tic(30);
  T("v4.25: «Entra a la família» entra de debò (l'èxit és el d'entraApp, no el de tenir família)",
    pant().includes("Hola") && pant().includes("Grau"));
  T("v4.25: el missatge de conflicte és el pactat", html.includes("Un compte només pot ser d'una família"));
  await surtIentra("admin@test.cat", "admin123");

  console.log("10n · NOVETATS v4.18 (Estadístiques per a l'admin)");
  T("v4.18: el menú de l'admin té l'apartat Estadístiques", d.querySelector("#calaix").innerHTML.includes("Estadístiques"));
  w.triaTab("estad"); await tic();
  T("v4.18: a dalt la barra del grup i una barra per cada família",
    cos().includes("Trajectes coberts del grup") && (cos().match(/barra-cob/g) || []).length >= w.doc.families.length + 1);
  T("v4.27: Estadístiques duu la mateixa fila del peu a dalt de tot",
    /viatges? oferts?\/setmana/.test(cos()) && cos().includes("al 100 %") && cos().includes("amb la setmana completa"));
  T("v4.18: les barres de família són el càlcul d'El teu cotxe (statsCoberturaFam), reutilitzat", (function(){
    return w.doc.families.every(f2 => { const st2 = w.statsCoberturaFam(f2);
      return !st2.tot || cos().includes(st2.cob + " de " + st2.tot); });
  })());
  T("v4.18: ordenades de menys a més cobertura", (function(){
    const pcts = [...cos().matchAll(/\d+ de \d+ · (\d+) %/g)].slice(1).map(m => +m[1]);
    return pcts.length >= 1 && pcts.every((p2, i) => i === 0 || pcts[i - 1] <= p2);
  })());
  T("v4.18: cada família amb la seva línia d'estat de pendents", cos().includes("als seus viatges"));
  await surtIentra("grau@test.cat", "grau123");
  T("v4.18: fora de l'admin no hi ha Estadístiques al menú", !d.querySelector("#calaix").innerHTML.includes("Estadístiques"));
  w.triaTab("estad"); await tic();
  T("…i la pestanya el retorna a la Graella", cos().includes("Toca una casella"));
  await surtIentra("admin@test.cat", "admin123");

  console.log("10q · NOVETATS v4.26 (progenitor només lectura decidit pel servidor)");
  const famLliure = DB.families.find(f2 => f2.role !== "admin" &&
    DB.profiles.filter(x => x.family_id === f2.id).length === 0);
  // 1r compte: reclama la família (owner NULL → el primer compte és el titular)
  afegeixUsuari("titu@test.cat", "titu123");
  await surtIentra("titu@test.cat", "titu123");
  await acceptaConsentiment();
  const rTitu26 = await fakeSupabaseClient().rpc("claim_family", { p_family: famLliure.id, p_token: codiDeFam(famLliure) });
  // 2n compte: entra a la mateixa família → progenitor
  afegeixUsuari("pepe@test.cat", "pepe123");
  await surtIentra("pepe@test.cat", "pepe123");
  await acceptaConsentiment();
  const rClaim26 = await fakeSupabaseClient().rpc("claim_family", { p_family: famLliure.id, p_token: codiDeFam(famLliure) });
  T("v4.26: el segon compte es vincula a la família", !rTitu26.error && !rClaim26.error);
  await surtIentra("pepe@test.cat", "pepe123");
  T("v4.26: el servidor diu que NO és titular i entra en només lectura (banner d'adjunt)",
    pant().includes("adjunt") && !pant().includes(">progenitor<"));
  T("v4.31: cap «progenitor» visible per a l'usuari (només als noms interns)",
    !pant().includes("progenitor"));
  w.triaTab("graella"); await tic();
  T("v4.26: cap botó d'esborrar a la graella del progenitor", !cos().includes("Esborra la graella de"));
  await w.desa(); await tic(10);
  T("v4.26: «Desa» del progenitor queda aturat amb el missatge del titular",
    d.querySelector("#avis").textContent.includes("Només el titular"));
  T("v4.26: l'error de RLS es tradueix per a progenitors",
    w.msgNeta({ message: "new row violates row-level security policy" }).includes("Només el titular"));
  await surtIentra("admin@test.cat", "admin123");

  console.log("11 · TANCA LA SESSIÓ");
  await w.tancaSessio(true); await tic(10);
  T("tancar la sessió torna a la pantalla de login", pant().includes("Entra a l'app"));
  T("…i desconnecta la sincronització en viu", DB._canals.length === 0);
  const rAnon = await fakeSupabaseClient().from("families").select("*");
  T("sense sessió no es llegeix res (RLS)", rAnon.data.length === 0);

  console.log("\nRESULTAT: " + ok + " correctes · " + ko + " fallades · " + DB.activity_log.length + " entrades de log");
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error("ERROR DE LA SUITE:", e); process.exit(2); });
