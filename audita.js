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
  T("lema i peu amb versió 3.2", html.includes("Montbui → Escola Anoia") && html.includes("creat per Víctor Quintana") && html.includes("versió 3.2"));
  T("ja no queda res del backend GitHub", !html.includes("api.github.com") && !html.includes("github_pat") && !html.includes("ghGet") && !html.includes("ghPut"));
  T("Google fora del tot (ni botó, ni text, ni funció)", !html.includes("Google") && !html.includes("fesGoogle") && !html.includes("GOOGLE_OAUTH"));
  // v3.2: l'SQL ha d'incloure el codi de família, el bloqueig staff→admin i els límits
  const sql = fs.readFileSync(path.join(__dirname, "supabase-fase1.sql"), "utf-8");
  T("SQL: claim_family exigeix el codi de la família (p_token)", /claim_family\(p_family uuid, p_token text\)/.test(sql) && sql.includes("Codi de la família incorrecte"));
  T("SQL: can_touch_family (staff no toca l'admin) + límits 100/5", sql.includes("can_touch_family") && sql.includes("limita_families") && sql.includes("limita_nens"));
  T("la URL del projecte Supabase és al CONFIG", html.includes("https://jbfjrgddsywpmwabvbtb.supabase.co"));
  T("la llibreria supabase-js es carrega per CDN", html.includes("@supabase/supabase-js"));
  // Regressió: a create_group, l'override del trigger de rols ha d'anar ABANS de l'insert de la família
  const cg = sql.slice(sql.indexOf("function create_group"), sql.indexOf("$$ language", sql.indexOf("function create_group")));
  T("SQL: create_group posa l'admin_override ABANS d'inserir la família", cg.indexOf("admin_override") > -1 && cg.indexOf("admin_override") < cg.indexOf("insert into families"));
}

/* ══ Supabase simulat (taules + RLS bàsica + triggers + rpc) ══ */
const DB = {
  users: {}, groups: [], profiles: [], families: [], children: [],
  weekly_marks: [], assignments: [], notifications: [], notification_reads: [],
  activity_log: [], join_requests: [], _canals: []
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
    else if (t === "families") rows = socMembre() ? DB.families.filter(r => r.group_id === grupMeu()) : [];
    else if (t === "children"){ const g = grupMeu(); rows = socMembre() ? DB.children.filter(r => { const f = famPerId(r.family_id); return f && f.group_id === g; }) : []; }
    else if (t === "weekly_marks"){ const g = grupMeu(); rows = socMembre() ? DB.weekly_marks.filter(r => { const f = famPerId(r.family_id); return f && f.group_id === g; }) : []; }
    else if (t === "assignments") rows = socMembre() ? DB.assignments.filter(r => r.group_id === grupMeu()) : [];
    else if (t === "activity_log") rows = socAdmin() ? DB.activity_log.filter(r => r.group_id === grupMeu()) : [];
    else if (t === "notifications") rows = DB.notifications.filter(r => r.family_id === mevaFamId() || socStaffAdmin());
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
        DB.notifications.push(Object.assign({ id: randomUUID(), created_at: new Date().toISOString() }, row));
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
      if (t === "assignments" && !potTocarFam(row.driver_family_id)) return true;
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
  if (nom === "grup_per_codi"){
    const g = DB.groups.filter(x => x.invite_code === String(p.p_code || "").trim().toUpperCase() && x.status === "actiu").map(x => ({ id: x.id, name: x.name }));
    return dades(g);
  }
  if (nom === "families_per_reclamar"){
    const r = DB.families.filter(f => f.group_id === p.p_group && DB.profiles.filter(x => x.family_id === f.id).length < 2)
      .map(f => ({ id: f.id, name: f.name }));
    return dades(r);
  }
  if (nom === "claim_family"){
    const f = famPerId(p.p_family);
    if (!f) return err("Família inexistent");
    if (codiDeFam(f) !== String(p.p_token || "").trim().toUpperCase()) return err("Codi de la família incorrecte");
    if (DB.profiles.filter(x => x.family_id === f.id).length >= 2) return err("Aquesta família ja té 2 comptes");
    const pr = meu();
    if (pr && pr.family_id) return err("Aquest compte ja té família");
    pr.family_id = f.id; pr.requested_group = f.group_id; pr.status = "aprovat";
    logBD(f.group_id, "aprovació d'accés", f.id, "Compte vinculat a " + f.name);
    return dades(null);
  }
  if (nom === "join_group_crea"){
    const g = DB.groups.find(x => x.invite_code === String(p.p_code || "").trim().toUpperCase() && x.status === "actiu");
    if (!g) return err("Codi d'invitació no vàlid");
    const pr = meu();
    if (pr && pr.family_id) return err("Aquest compte ja té família");
    const fid = randomUUID();
    DB.families.push({ id: fid, group_id: g.id, cognom1: p.p_cognom1, cognom2: p.p_cognom2 || "", name: (p.p_cognom1 + " " + (p.p_cognom2 || "")).trim(), driver: p.p_driver || "", phone: "", phone_visible: true, seats: p.p_seats == null ? 3 : p.p_seats, role: "usuari", invite_token: randomUUID(), created_at: new Date().toISOString() });
    pr.family_id = fid; pr.requested_group = g.id; pr.status = "aprovat";
    logBD(g.id, "alta família", fid, "Alta amb codi d'invitació");
    return dades(fid);
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

  console.log("3c · LA SETMANA S'HA DE COMPLETAR PER DESAR");
  T("hi ha canvis → surt la barra de desar", !d.querySelector("#barra").classList.contains("amaga"));
  await w.desa(); await tic(10);
  T("no es deixa desar amb franges buides — l'avís surt A LA BARRA", !d.querySelector("#barra-avis").classList.contains("ocult") && d.querySelector("#barra-avis").textContent.includes("No es pot desar") && !d.querySelector("#barra").classList.contains("amaga"));
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
  T("el Quadre (qui porta qui) s'obre per defecte", cos().includes(">Quadre<") && cos().includes("veure i assignar"));
  T("els subtabs són a dalt de tot, abans del mapa", cos().indexOf(">Quadre<") < cos().indexOf("llegenda"));
  w.triaVistaCal("set"); await tic(20);
  T("la vista de setmana segueix disponible", cos().includes("dcard"));
  T("el dèficit surt al mapa i a la setmana (−3 dl 17.00)", cos().includes("−3"));
  w.triaTab("cal"); await tic(30);
  w.selDia("dl"); await tic(20);
  T("detall del dia: explicació de recollida i cada nen amb el seu estat", cos().includes("recollireu") && cos().includes("Arlet") && cos().includes("Bru") && cos().includes("pendent"));
  T("si no condueixes, la targeta t'explica qui assigna", cos().includes("Qui puges al teu cotxe?» amb caselles"));
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
  T("el peu llueix les dades del grup, en viu", (function(){ const s = d.querySelector("#peu-stats").textContent; return s.includes("5 famílies") && s.includes("7 nens") && s.includes("4 viatges") && s.includes("3 places compartides"); })());
  T("amb canvis pendents, l'Actualitza dels calendaris s'amaga (mana el Desa)", d.body.classList.contains("amb-barra") && cos().includes("cal-actualitza"));
  w.triaTab("perfil"); await tic();
  w.canviaPlaces(1); w.canviaPlaces(1); await tic();
  w.triaTab("cal"); await tic(30); w.triaVistaCal("nen"); await tic(20);
  w.selNenCanvia(famDoc("Grau").id + "|" + idArlet); await tic();
  T("calendari per nen: es veu qui el porta (persona)", cos().includes("el porta Marta VP"));
  w.triaTab("descarrega"); await tic();
  T("apartat «Descarrega»: horaris dels meus nens i del conductor", pant().includes("Descarrega") && cos().includes("Horari de Jan") && cos().includes("Horari de Mia") && cos().includes("Horari del conductor"));
  const miaViu = famDoc("Vila Prat").nens.find(n => n.nom === "Mia");
  w.commuta(miaViu.marca, "r13", "dl"); w.triaTab("descarrega"); await tic();
  T("nen amb pendents: el botó hi és SEMPRE, amb l'avís del vermell", cos().includes("Horari de Mia") && cos().includes("1 trajecte") && cos().includes("pendent"));
  w.commuta(miaViu.marca, "r13", "dl"); w.triaTab("descarrega"); await tic();
  w.descarregaHorariNen(famDoc("Vila Prat").id, idJan()); await tic();
  T("el full del nen s'obre a pantalla, llest per imprimir o desar en PDF", !d.querySelector("#full-horari").classList.contains("ocult") && d.querySelector("#full-horari").innerHTML.includes("Horari de Jan") && d.querySelector("#full-horari").innerHTML.includes("Imprimeix") && d.querySelector("#full-horari").innerHTML.includes("FULL DEL NEN") && d.querySelector("#full-horari").innerHTML.includes("ENTRADA · MATÍ"));
  w.tancaFull(); await tic();
  w.descarregaHorariConductor(); await tic();
  T("el full del conductor: qui puja a cada viatge", d.querySelector("#full-horari").innerHTML.includes("Horari del conductor") && d.querySelector("#full-horari").innerHTML.includes("portes"));
  await w.comparteixFull(); await tic();
  T("sense canvas ni share (laboratori): consell honest de la captura", d.querySelector("#avis").textContent.includes("captura de pantalla"));
  w.tancaFull(); await tic();
  T("en tancar, el full desapareix", d.querySelector("#full-horari").classList.contains("ocult"));
  w.triaTab("cal"); await tic(30); w.triaVistaCal("nen"); await tic(20);
  w.triaVistaCal("quadre"); await tic(20);
  T("el quadre diu qui porta qui amb noms de pila", cos().includes("Marta VP") && cos().includes("porta") && cos().includes("Arlet"));

  console.log("6c · AVISOS ENTRE COMPTES (el pare i la mare ho veuen)");
  await surtIentra("grau@test.cat", "grau123");
  T("en entrar, les assignacions noves han generat avisos", w.avisosNous() >= 1 && w.avisosMeus().some(a => a.m.includes("el porta Marta Vila Prat")));
  w.triaTab("avisos"); await tic();
  T("la pàgina d'avisos llista qui porta els nens", cos().includes("Nous (") && cos().includes("Bru") && cos().includes("Dilluns 17.00"));
  T("un cop llegits, el comptador es posa a zero", w.avisosNous() === 0);
  await surtIentra("admin@test.cat", "admin123");
  w.triaTab("cal"); await tic(30); w.triaVistaCal("dia"); await tic(20); w.selDia("dl"); await tic(20);
  w.assigna("r17", "dl", famDoc("Grau").id, idBru, false); await tic();
  await w.desa(); await tic(30);
  T("la desassignació queda a Supabase", !DB.assignments.some(a => a.child_id === nenDB(famDB("Grau").id, "Bru").id));
  await surtIentra("grau@test.cat", "grau123");
  T("canvi detectat en entrar: en Bru ha perdut el cotxe", w.avisosNous() >= 1 && w.avisosMeus().some(a => a.m.includes("ja no t\u00e9 cotxe")), JSON.stringify(w.avisosMeus().slice(0,3)));
  w.triaTab("avisos"); await tic();
  T("la pàgina d'avisos: secció Nous, amb nom, dia i franja", cos().includes("Nous (") && cos().includes("Bru") && cos().includes("ja no té cotxe") && cos().includes("abans Marta Vila Prat") && cos().includes("Dilluns 17.00"), cos().slice(0, 400));
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
  T("el panell de l'admin explica el codi d'invitació i la importació", pant().includes("Codi d'invitació del grup") && pant().includes("Importa les dades antigues") && pant().includes("dades.json"));
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
  await w.esborraFam(); await tic(30);
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
  T("la pestanya Famílies llista totes les famílies del grup", cos().includes("Les famílies del grup") && (cos().match(/dir-fila/g) || []).length === 5);
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
  T("Descarrega explica cada viatge del conductor (quants nens i places lliures)", cos().includes("Horari del conductor") && /portes <b>\d+ nen/.test(cos()) && cos().includes("lliure"));
  w.obreAdmin(); await tic();
  T("el panell admin té logs i còpia de seguretat", pant().includes("Mostra els logs") && pant().includes("seguretat (JSON)"));
  await w.mostraLogs(); await tic(20);
  T("els logs es llisten amb família, acció i detall", d.querySelector("#logs-box").innerHTML.includes("canvi de rol") || d.querySelector("#logs-box").innerHTML.includes("alta fam"));
  w.copiaSeguretat(); await tic();
  T("la còpia de seguretat no peta ni tan sols sense createObjectURL (jsdom)", true);
  w.tancaAdmin(); await tic();
  // Sincronització: un altre compte (p. ex. la parella) demana plaça on l'admin condueix
  const fVila = famDoc("Vila Puig");
  const slotCond = Object.keys(fVila.cotxe)[0];
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
  w.renomTel("600111222"); w.triaCurs("3r ESO"); await tic();
  await w.desa(); await tic(30);
  T("telèfon i curs es desen a la BD", famDB("Vila Puig").phone === "600111222" && famDB("Vila Puig").curs === "3r ESO");
  w.triaTab("families"); await tic();
  T("a Famílies es veu el rol de cadascuna (+curs i telèfon)", cos().includes("· admin") && cos().includes("· staff") && cos().includes("3r ESO") && cos().includes("600111222"));
  w.triaTab("cotxe"); await tic();
  T("«El teu cotxe» llista els nens que hi puc carregar, amb caselles", cos().includes("Qui puges al teu cotxe?") && (cos().includes("demana pla") || cos().includes("demanen pla")));
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

  console.log("11 · TANCA LA SESSIÓ");
  await w.tancaSessio(true); await tic(10);
  T("tancar la sessió torna a la pantalla de login", pant().includes("Entra a l'app"));
  T("…i desconnecta la sincronització en viu", DB._canals.length === 0);
  const rAnon = await fakeSupabaseClient().from("families").select("*");
  T("sense sessió no es llegeix res (RLS)", rAnon.data.length === 0);

  console.log("\nRESULTAT: " + ok + " correctes · " + ko + " fallades · " + DB.activity_log.length + " entrades de log");
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error("ERROR DE LA SUITE:", e); process.exit(2); });
