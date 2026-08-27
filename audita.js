// AUDITORIA FUNCIONAL — Cotxes · Escola Anoia
// Aixeca l'app en un DOM real (jsdom) amb un GitHub simulat (clau, SHA, 409)
// i recorre el flux complet d'un pare. Executa: node audita.js [ruta index.html]
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { TextEncoder, TextDecoder } = require("util");

const RUTA = process.argv[2] || path.join(__dirname, "index.html");
let html = fs.readFileSync(RUTA, "utf-8");
html = html.replace('OWNER: "EL-TEU-USUARI-GITHUB"', 'OWNER: "grup-test"');

let ok = 0, ko = 0;
const T = (nom, cond, extra) => { if (cond){ ok++; console.log("  ✓ " + nom); } else { ko++; console.log("  ✗ " + nom + (extra ? " — " + extra : "")); } };
const tic = (ms) => new Promise(r => setTimeout(r, ms || 5));

/* ── 0 · Cablejat estàtic (cometes dobles i simples) ── */
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
  T("lema i peu amb versió", html.includes("Montbui → Escola Anoia") && html.includes("creat per Víctor Quintana") && html.includes("versió 2.29"));
}

/* ── GitHub simulat ── */
const b64e = s => Buffer.from(s, "utf-8").toString("base64");
const b64d = s => Buffer.from(s, "base64").toString("utf-8");
const CLAU = "github_pat_test_bona";
let store = { data: { versio: 1, actualitzat: null, families: [] }, sha: "sha0" };
let shaN = 0, puts = 0, conflictes = 0;
async function fakeFetch(url, opts){
  opts = opts || {};
  const h = opts.headers || {};
  const auth = h.Authorization || h.authorization || "";
  const resp = (st, cos) => ({ ok: st >= 200 && st < 300, status: st, json: async () => cos });
  if (auth !== "Bearer " + CLAU) return resp(401, {});
  if (!opts.method || opts.method === "GET")
    return resp(200, { content: b64e(JSON.stringify(store.data)), sha: store.sha });
  if (opts.method === "PUT"){
    puts++;
    const cos = JSON.parse(opts.body);
    if (cos.sha !== store.sha){ conflictes++; return resp(409, {}); }
    store.data = JSON.parse(b64d(cos.content));
    store.sha = "sha" + (++shaN);
    return resp(200, { content: { sha: store.sha } });
  }
  return resp(500, {});
}

(async () => {
  const dom = new JSDOM(html, {
    url: "https://test.local/",
    runScripts: "dangerously",
    beforeParse(w){
      w.fetch = fakeFetch;
      w.confirm = () => true;
      w.TextEncoder = TextEncoder;
      w.TextDecoder = TextDecoder;
    }
  });
  const w = dom.window, d = w.document;
  const pant = () => d.querySelector("#pantalla").innerHTML;
  const cos = () => (d.querySelector("#tab-cos") || { innerHTML: "" }).innerHTML;
  await new Promise(r => { if (d.readyState !== "loading") r(); else d.addEventListener("DOMContentLoaded", r); });
  await tic(20);

  console.log("1 · ENTRADA AL GRUP");
  T("la benvinguda porta els 3 passos i el login en columna", pant().includes("COM FUNCIONA") && pant().includes("apila"));
  T("arrenca demanant la clau del grup", pant().includes("Clau del grup"));
  d.querySelector("#inp-clau").value = "clau-dolenta";
  await w.provaClau(); await tic();
  T("clau dolenta → refusada amb missatge", pant().includes("no obre el grup"));
  const ic = d.querySelector("#inp-clau");
  ic.value = CLAU;
  ic.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await tic(30);
  T("clau bona amb tecla Enter → pantalla de tria", pant().includes("Crea la teva fam"));
  T("la clau queda recordada al mòbil", w.localStorage.getItem("cx_token") === CLAU);

  console.log("2 · ALTA DE LA FAMÍLIA (nens pel nom)");
  d.querySelector("#nf-cpare").value = "Vila";
  d.querySelector("#nf-cmare").value = "Prat";
  d.querySelector("#nf-cond").value = "Marta";
  let inp = d.querySelector("#nf-nens input");
  inp.value = "Jan"; inp.dispatchEvent(new w.Event("input"));
  w.nfAfegeixNen();
  const inps = d.querySelectorAll("#nf-nens input");
  inps[1].value = "Mia"; inps[1].dispatchEvent(new w.Event("input"));
  await w.creaFam(); await tic();
  const famS = () => store.data.families.find(f => f.id === "vila-prat");
  T("la família es crea i es desa a GitHub", store.data.families.length === 1 && famS().nens.map(n => n.nom).join(",") === "Jan,Mia");
  T("entra a l'app amb salutació", pant().includes("Hola"));
  T("usuari identificat: id i rol per defecte", famS().rol === "usuari" && famS().creadaPer === w.localStorage.getItem("cx_usuari"));
  T("conductor desat i nom compost dels dos cognoms", famS().conductor === "Marta" && famS().nom === "Vila Prat" && famS().cognomPare === "Vila" && famS().cognomMare === "Prat");
  T("amb el perfil complet de sortida, entra directe a la Graella", cos().includes("Toca una casella") && cos().includes("g-estat"));
  T("el contenidor de la graella porta la classe del grid", d.querySelector("#graella") && d.querySelector("#graella").className.includes("graella"));

  console.log("3 · PINTAR L'HORARI");
  w.triaPinzell("cotxe"); w.pinta("e9", "dl");
  let b = w.balanc("e9", "dl");
  T("pinzell cotxe: la família condueix (3 places)", b.conds.length === 1 && b.places === 3);
  w.pinta("e9", "dl"); // toc fantasma immediat
  T("escut anti-doble-toc: el 2n toc s'ignora", w.balanc("e9", "dl").conds.length === 1);
  await tic(400); w.pinta("e9", "dl");
  T("passat el guard, el toc commuta (treu la marca)", w.balanc("e9", "dl").conds.length === 0);
  await tic(400); w.pinta("e9", "dl"); // la tornem a posar
  w.triaPinzell("jan"); w.pinta("r17", "dl");
  T("marcar un nen: en Jan necessita plaça", w.balanc("r17", "dl").nens.length === 1);
  w.pinta("e9", "dl"); // en Jan on la família conduïa
  T("marcar un nen APAGA el cotxe propi (són excloents)", w.balanc("e9", "dl").nens.length === 1 && w.balanc("e9", "dl").conds.length === 0);
  await tic(400); w.triaPinzell("cotxe"); w.pinta("e9", "dl"); // el cotxe torna…
  T("…i conduir neteja els propis nens de la casella", w.balanc("e9", "dl").conds.length === 1 && w.balanc("e9", "dl").nens.length === 0);
  w.triaPinzell("jan");

  await tic(400); w.pinta("e8", "dj");
  await tic(400); w.pinta("e9", "dj");
  const janViu = () => w.doc.families.find(x => x.id === "vila-prat").nens.find(n => n.id === "jan");
  T("un nen entra a les 8 O a les 9: marcar una li desmarca l'altra", w.te(janViu().marca, "e9", "dj") && !w.te(janViu().marca, "e8", "dj"));
  await tic(400); w.pinta("e9", "dj");
  await tic(400); w.triaPinzell("propi"); w.pinta("e8", "dj");
  await tic(400); w.triaPinzell("cotxe"); w.pinta("e9", "dj");
  const vFam = () => w.doc.families.find(x => x.id === "vila-prat");
  T("respondre les 9.00 buida TOT el de les 8.00 del mateix dia (i al revés)", !w.te(vFam().propi, "e8", "dj") && w.te(vFam().cotxe, "e9", "dj"));
  await tic(400); w.pinta("e9", "dj");

  console.log("3b · PEL NOSTRE COMPTE (🚫)");
  w.triaPinzell("jan"); await tic(400); w.pinta("e15", "dc");
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
  await w.desa(); await tic();
  T("no es deixa desar amb franges buides — l'avís surt A LA BARRA", !d.querySelector("#barra-avis").classList.contains("ocult") && d.querySelector("#barra-avis").textContent.includes("No es pot desar") && !d.querySelector("#barra").classList.contains("amaga"));
  const vv = w.doc.families.find(x => x.id === "vila-prat");
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
  await w.desa(); await tic();
  T("setmana completa: ara sí que desa (dades a GitHub)", d.querySelector("#barra").classList.contains("amaga")
      && w.graellaCompleta(vv) && (famS().cotxe.e9 || []).includes("dl") && (famS().nens[0].marca.r17 || []).includes("dl"));
  const jj = vv.nens.find(n => n.id === "jan");
  w.commuta(jj.marca, "e8", "dv"); w.commuta(jj.marca, "e9", "dv");
  await w.desa(); await tic();
  T("un nen amb les 8 i les 9 el mateix dia: desar bloquejat a la barra", d.querySelector("#barra-avis").textContent.includes("Jan") && !d.querySelector("#barra-avis").classList.contains("ocult"));
  w.commuta(jj.marca, "e8", "dv"); w.commuta(jj.marca, "e9", "dv");
  await w.desa(); await tic();

  console.log("4 · XOC D'EDICIONS");
  // Una altra família desa pel seu compte (canvia el SHA)
  store.data.families.push({ id: "grau", nom: "Família Grau", places: 0, cotxe: {}, creadaPer: "un-altre-mobil",
    nens: [{ id: "arlet", nom: "Arlet", marca: { r17: ["dl"] } }, { id: "bru", nom: "Bru", marca: { r17: ["dl"] } }] });
  store.sha = "sha" + (++shaN);
  w.triaPinzell("cotxe"); w.pinta("e8", "dt");
  await w.desa(); await tic();
  T("xoc detectat (409) i resolt fusionant", conflictes >= 1 && store.data.families.length === 2);
  T("els meus canvis hi són després de la fusió", (famS().cotxe.e8 || []).includes("dt"));
  T("els canvis de l'altra família no es trepitgen", store.data.families.find(f => f.id === "grau").nens.length === 2);

  console.log("4b · LA PORTA DELS CALENDARIS");
  w.triaFam("grau"); await tic();
  w.triaTab("cal"); await tic(30);
  T("una família amb la feina a mitges té els Calendaris bloquejats", cos().includes("Calendaris bloquejats") && cos().includes("Perfil incomplet"));
  w.triaFam("vila-prat"); await tic();
  T("la família completa té la porta oberta", w.potCal());

  console.log("5 · CALENDARI (setmana i dia)");
  await w.pintaCalendari(); await tic(20);
  T("el Quadre (qui porta qui) s'obre per defecte", cos().includes(">Quadre<") && cos().includes("veure i assignar"));
  T("els subtabs són a dalt de tot, abans del mapa", cos().indexOf(">Quadre<") < cos().indexOf("llegenda"));
  w.triaVistaCal("set"); await tic(20);
  T("la vista de setmana segueix disponible", cos().includes("dcard"));
  T("el dèficit surt al mapa i a la setmana (−3 dl 17.00)", cos().includes("\u22123"));
  w.triaTab("cal"); await tic(30);
  w.selDia("dl"); await tic(20);
  T("detall del dia: explicació de recollida i cada nen amb el seu estat", cos().includes("recollireu") && cos().includes("Arlet") && cos().includes("Bru") && !cos().includes("Arlet (") && cos().includes("pendent"));
  T("si no condueixes, la targeta t'explica qui assigna", cos().includes("Qui puges al teu cotxe?» amb caselles"));
  T("detall del dia: badge de falten 3", cos().includes("falten 3"));
  T("línia de conductor completa: qui condueix, amb qui i places lliures", cos().includes("condueix Marta") && cos().includes("amb Jan i Mia") && cos().includes("places lliures"));

  console.log("6 · RESUM FINAL");
  store.data.families.push({ id: "nova", nom: "Família Nova", places: 2, cotxe: {},
    nens: [{ id: "pol", nom: "Pol", marca: {} }] });
  store.sha = "sha" + (++shaN);
  store.data.families.push({ id: "soltera", nom: "Família Soltera", places: 1, cotxe: {}, propi: { e9: ["dl"] },
    nens: [{ id: "kim", nom: "Kim", marca: {} }] });
  store.sha = "sha" + (++shaN);
  await w.pintaResum(); await tic(20);
  T("«Falta cobrir» amb dia i hora", cos().includes("Falta cobrir") && cos().includes("Dilluns") && cos().includes("17.00"));
  T("«On sobren places» amb el marge (+3)", cos().includes("On sobren places") && cos().includes("+3"));
  T("famílies pendents d'omplir detectades", cos().includes("Encara no han marcat res") && cos().includes("Família Nova"));
  T("una família amb només 🚫 NO surt com a pendent", !cos().includes("Família Soltera"));
  T("cada línia de dèficit desplega els nens a col·locar", cos().includes("r-det") && cos().includes("Arlet") && cos().includes("Bru") && cos().includes("obre el dia"));
  T("«On sobren» desplega conductor i places lliures", cos().includes("Vila Prat (Marta · 3 lliures)"));

  console.log("6b · ASSIGNACIONS (qui puja a quin cotxe)");
  w.triaTab("graella"); await tic();
  w.triaPinzell("cotxe"); await tic(400); w.pinta("r17", "dl"); await tic();
  await w.desa(); await tic();
  w.triaTab("cal"); await tic(30); w.triaVistaCal("dia"); await tic(20); w.selDia("dl"); await tic(20);
  w.assigna("r17", "dl", "grau", "arlet", true); await tic();
  await w.desa(); await tic();
  T("el conductor assigna un nen i queda desat al grup", (famS().porta["r17-dl"] || []).some(r => r.fam === "grau" && r.nen === "arlet"));
  T("el dia mostra qui porta cada nen (persona: nom + inicials)", cos().includes("el porta Marta VP") && cos().includes("pendent"));
  w.assigna("r17", "dl", "grau", "bru", true); await tic();
  T("comptador de places del cotxe (2/3)", cos().includes("2/3"));
  w.triaTab("perfil"); await tic();
  w.canviaPlaces(-1); w.canviaPlaces(-1); await tic();
  w.triaTab("cal"); await tic(30);
  T("si les places baixen, el comptador avisa del sobreeiximent (2/1)", cos().includes("2/1"));
  T("el peu llueix les 4 dades del grup, en viu", (function(){ const s = d.querySelector("#peu-stats").textContent; return s.includes("4 famílies") && s.includes("6 nens") && s.includes("3 viatges") && s.includes("2 places compartides"); })());
  T("amb canvis pendents, l'Actualitza dels calendaris s'amaga (mana el Desa)", d.body.classList.contains("amb-barra") && cos().includes("cal-actualitza"));
  w.triaTab("perfil"); await tic();
  w.canviaPlaces(1); w.canviaPlaces(1); await tic();
  w.triaTab("cal"); await tic(30); w.triaVistaCal("nen"); await tic(20);
  w.selNenCanvia("grau|arlet"); await tic();
  T("calendari per nen: es veu qui el porta (persona)", cos().includes("el porta Marta VP"));
  w.triaTab("descarrega"); await tic();
  T("apartat «Descarrega» al menú: horaris dels meus nens i del conductor", pant().includes("Descarrega") && cos().includes("Horari de Jan") && cos().includes("Horari de Mia") && cos().includes("Horari del conductor"));
  const miaViu = w.doc.families.find(x => x.id === "vila-prat").nens.find(n => n.id === "mia");
  w.commuta(miaViu.marca, "r13", "dl"); w.triaTab("descarrega"); await tic();
  T("nen amb pendents: el botó hi és SEMPRE, amb l'avís del vermell", cos().includes("Horari de Mia") && cos().includes("1 trajecte") && cos().includes("pendent"));
  w.commuta(miaViu.marca, "r13", "dl"); w.triaTab("descarrega"); await tic();
  w.descarregaHorariNen("vila-prat", "jan"); await tic();
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
  w.triaVistaCal("set"); await tic(20);

  console.log("6c · AVISOS (canvis que afecten els teus nens)");
  w.triaFam("grau"); await tic();
  w.detectaAvisos();
  T("primera visita: es fixa la foto, sense avisos falsos", w.avisosNous() === 0);
  w.triaFam("vila-prat"); await tic();
  w.triaTab("cal"); await tic(30); w.triaVistaCal("dia"); await tic(20);
  w.assigna("r17", "dl", "grau", "bru", false); await tic();
  await w.desa(); await tic();
  w.triaFam("grau"); await tic();
  w.detectaAvisos();
  T("canvi detectat: en Bru ha perdut el cotxe", w.avisosNous() >= 1);
  w.triaTab("avisos"); await tic();
  T("la pàgina d'avisos: secció Nous, amb nom, dia i franja", cos().includes("Nous (") && cos().includes("Bru") && cos().includes("ja no té cotxe") && cos().includes("abans Marta VP") && cos().includes("Dilluns 17.00"));
  T("un cop llegits, el comptador es posa a zero", w.avisosNous() === 0);
  w.triaFam("vila-prat"); await tic();
  const gzS = store.data.families.find(x => x.id === "grau");
  gzS.nens[0].marca.r17 = (gzS.nens[0].marca.r17 || []).filter(x => x !== "dl");
  w.triaTab("cal"); await tic(30); w.triaVistaCal("dia"); await tic(20); w.selDia("dl"); await tic(20);
  T("si un nen es desmarca, la seva plaça no compta al cotxe de l'altre (0/3)", cos().includes("0/3") && !cos().includes("Arlet"));

  console.log("6d · CANVIS AMB PASSATGERS A BORD");
  w.assigna("r17", "dl", "grau", "bru", true); await tic();
  await w.desa(); await tic();
  w.triaTab("graella"); await tic();
  w.triaPinzell("cotxe"); await tic(400); w.pinta("r17", "dl"); await tic();
  T("treure el cotxe amb nens a bord: avís immediat a la barra", d.querySelector("#barra-avis").textContent.includes("Bru") && d.querySelector("#barra-avis").textContent.includes("sense plaça") && d.querySelector("#barra-avis").classList.contains("info"));
  await tic(400); w.triaPinzell("propi"); w.pinta("r17", "dl"); await tic(); // la família respon la franja
  await w.desa(); await tic();
  T("desar amb èxit neteja també l'avís informatiu", d.querySelector("#barra-avis").classList.contains("ocult"));

  console.log("7 · GESTIÓ DE LA FAMÍLIA");
  w.triaTab("perfil"); await tic();
  w.canviaPlaces(1); await tic();
  T("el requadre del Perfil es marca en groc en editar (places 3→4)", d.querySelector("#pl-num").textContent === "4" && cos().includes("perfil pendent"));
  w.treuNen("mia"); await w.desa(); await tic();
  T("treure un nen (amb les seves marques)", famS().nens.length === 1 && famS().nens[0].id === "jan");
  T("en desar, el requadre del Perfil torna a la normalitat", !d.querySelector(".targeta.perfil").classList.contains("pendent"));
  w.renomCognomMare("Puig"); await tic();
  await w.desa(); await tic();
  T("canviar un cognom recompon el nom (id intacte, salutació al dia)", famS() && famS().nom === "Vila Puig" && famS().id === "vila-prat" && pant().includes("Vila Puig"));
  w.triaTab("graella"); await tic(); w.triaPinzell("jan"); await tic(400); w.pinta("r13", "dv"); await tic();
  w.renomNen("jan", "Janot"); await tic();
  await w.desa(); await tic();
  T("canviar el nom d'un nen (les marques es conserven)", famS().nens[0].nom === "Janot" && (famS().nens[0].marca.r13 || []).includes("dv"));

  console.log("7b · MODE ADMINISTRADOR (pantalla pròpia)");
  w.obreAdmin(); await tic();
  T("l'accés admin té pantalla pròpia, fora del panell familiar", pant().includes("Accés d'administrador") && !pant().includes("Places lliures"));
  d.querySelector("#pin-nou").value = "clau-mestra";
  await w.estableixPin(); await tic();
  T("establir el codi: desat, família admin fixada i «canvia»", store.data.adminPin === "clau-mestra" && store.data.adminFam === "vila-prat" && pant().includes(">canvia<"));
  T("la família de l'admin passa a rol admin", famS().rol === "admin");
  w.surtAdmin(); await tic();
  w.tancaAdmin(); await tic();
  w.canviaFam();
  T("sense mode admin: ni «canvia», ni «edita», ni sortir", !pant().includes(">canvia<") && !pant().includes(">edita<") && pant().includes("Hola"));
  w.obreAdmin(); await tic();
  d.querySelector("#pin-admin").value = "malament";
  w.entraAdmin();
  T("codi incorrecte refusat", d.querySelector("#avis").textContent.includes("incorrecte"));
  d.querySelector("#pin-admin").value = "clau-mestra";
  w.entraAdmin(); await tic();
  T("codi correcte: mode admin actiu de nou", pant().includes(">canvia<"));
  T("l'admin té «edita» a cada família del directori", pant().includes(">edita<"));
  w.adminEdita("grau"); await tic();
  T("edita: entra a l'altra família amb avís i camí de tornada", pant().includes("Família Grau") && pant().includes("una altra família") && pant().includes("torna a la meva"));
  T("dins d'una altra família, ni Rols ni Admin al menú", !pant().includes("Rols") && !pant().includes("🛡️ Admin<"));
  w.triaTab("graella"); await tic();
  w.obreCasella("e8", "dc"); await tic();
  T("el menú de casella: 3 opcions apilades, sense «Buida»", pant().includes("Conduïm nosaltres") && pant().includes("demanen plaça") && pant().includes("Anem pel nostre compte") && !pant().includes("Buida la casella") && !pant().includes("cseg"));
  w.celAccio("demana"); await tic();
  T("«Demanem plaça» marca tots els nens de cop", (function(){ const g = w.doc.families.find(x => x.id === "grau"); return w.te(g.nens[0].marca, "e8", "dc") && w.te(g.nens[1].marca, "e8", "dc"); })() && pant().includes("cbtn on"));
  await tic(400); w.celAccio("demana"); await tic();
  T("tornar-hi ho desmarca tot", (function(){ const g = w.doc.families.find(x => x.id === "grau"); return !w.te(g.nens[0].marca, "e8", "dc") && !w.te(g.nens[1].marca, "e8", "dc"); })());
  w.tancaCasella(); await tic();
  w.triaFam("vila-prat"); await tic();
  w.obreAdmin(); await tic();
  d.querySelector("#pin-canvi").value = "nou-codi-9";
  await w.canviaPin(); await tic();
  T("l'admin pot canviar el codi del grup", store.data.adminPin === "nou-codi-9");

  console.log("7c · ROL STAFF (corregeix, però no crea)");
  w.obreAdmin(); await tic();
  d.querySelector("#staff-nou").value = "equip-2026";
  await w.estableixStaff(); await tic();
  T("l'admin estableix el codi de staff", store.data.staffPin === "equip-2026");
  w.surtAdmin(); await tic();
  d.querySelector("#pin-admin").value = "equip-2026";
  w.entraAdmin(); await tic();
  T("el codi de staff NO funciona sense el rol assignat", d.querySelector("#avis").textContent.includes("assignar el rol de staff"));
  d.querySelector("#pin-admin").value = "nou-codi-9";
  w.entraAdmin(); await tic();
  await w.rolFam("grau"); await tic();
  T("l'admin assigna el rol de staff des del directori", store.data.families.find(x => x.id === "grau").rol === "staff");
  w.surtAdmin(); await tic();
  w.triaFam("grau"); await tic();
  T("el rol surt al costat de la salutació", pant().includes("· staff"));
  T("família amb rol staff sense mode: botó «Activa el mode staff» (i cap Administrador)", pant().includes("Activa el mode staff") && !pant().includes("Administrador"));
  w.obreAdmin(); await tic();
  d.querySelector("#pin-admin").value = "nou-codi-9";
  w.entraAdmin(); await tic();
  T("el codi d'admin NO funciona en una altra família", d.querySelector("#avis").textContent.includes("Només la família de l'administrador"));
  d.querySelector("#pin-admin").value = "equip-2026";
  w.entraAdmin(); await tic();
  T("amb rol + codi: mode staff amb «canvia» i «edita»", pant().includes("· staff") && pant().includes(">canvia<") && pant().includes(">edita<"));
  T("el staff veu «Staff · gestiona», mai «Administrador»", pant().includes("Staff · gestiona") && !pant().includes("Administrador"));
  T("el staff NO té «edita» a la família de l'admin (3 de 4)", (pant().match(/>edita</g) || []).length === 3);
  w.adminEdita("vila-prat"); await tic();
  T("i si ho intenta per la porta del darrere, refusat", pant().includes("Família Grau") && d.querySelector("#avis").textContent.includes("només la gestiona l'administrador"));
  T("el staff no veu l'apartat Rols al menú", !pant().includes("Rols"));
  w.canviaFam(); await tic();
  T("a la tria, el staff no veu el formulari de crear", pant().includes("targeta ocult"));
  await w.creaFam(); await tic();
  T("i si ho intenta, bloquejat amb missatge", d.querySelector("#avis").textContent.includes("no crear") && store.data.families.length === 4);
  w.triaFam("vila-prat"); await tic();
  w.obreAdmin(); await tic();
  w.surtAdmin(); await tic();
  d.querySelector("#pin-admin").value = "nou-codi-9";
  w.entraAdmin(); await tic();
  T("torna al mode admin per continuar", pant().includes("· admin"));
  T("l'admin té Rols i Admin al menú (a casa seva)", pant().includes("Rols") && pant().includes("🛡️ Admin<"));
  store.data.families.find(x => x.id === "soltera").rol = "admin";
  w.triaTab("cal"); await tic(40);
  T("un rol admin extraviat es normalitza sol en carregar", w.doc.families.find(x => x.id === "soltera").rol === "usuari" && w.doc.families.find(x => x.id === "vila-prat").rol === "admin");
  w.triaTab("rols"); await tic();
  T("la pantalla de Rols llista les famílies amb el rol per alternar", cos().includes("Rols del grup") && cos().includes("Grau") && cos().includes("staff") && cos().includes("usuari") && cos().includes("rolbt fixe"));
  w.triaFam("nova"); await tic();
  await w.esborraFam(); await tic();
  T("esborrar una família del grup", store.data.families.length === 3 && !store.data.families.find(f => f.id === "nova"));
  T("torna a la pantalla de tria", pant().includes("Qui sou?"));
  d.querySelector("#sel-fam").value = "grau";
  w.entraSel(); await tic();
  T("el desplegable de famílies entra a la família triada", pant().includes("Hola") && pant().includes("Família Grau"));
  w.canviaFam(); await tic();
  T("per a l'admin, crear és una opció plegada, no la portada", pant().includes("Crear una família nova") && pant().includes("<details"));
  d.querySelector("#nf-cpare").value = "Família";
  d.querySelector("#nf-cmare").value = "Grau";
  let inpT = d.querySelector("#nf-nens input");
  inpT.value = "Duplicat"; inpT.dispatchEvent(new w.Event("input"));
  await w.creaFam(); await tic();
  T("nom de família duplicat: bloquejat amb avís", store.data.families.length === 3 && d.querySelector("#avis").textContent.includes("Ja existeix"));
  d.querySelector("#nf-cpare").value = "Ajudada";
  d.querySelector("#nf-cmare").value = "Extra";
  inpT = d.querySelector("#nf-nens input");
  inpT.value = "Pau"; inpT.dispatchEvent(new w.Event("input"));
  await w.creaFam(); await tic();
  const aj = store.data.families.find(f => f.id === "ajudada-extra");
  T("l'admin SÍ pot crear una segona família (per a altres, sense propietari)", store.data.families.length === 4 && aj && aj.creadaPer === "");
  w.surtAdmin(); await tic();
  await w.esborraFam(); await tic();
  T("sense admin, en quedar sense família torna sol a la SEVA (creador)", store.data.families.length === 3 && pant().includes("Hola") && pant().includes("Vila Puig"));
  const uidX = w.localStorage.getItem("cx_usuari");
  const vilaS = w.doc.families.find(x => x.id === "vila-prat");
  vilaS.creadaPer = "propietari-antic"; vilaS.usuaris = []; // ens vestim de desconegut
  w.pantallaTria(); await tic();
  d.querySelector("#sel-fam").value = "grau";
  w.confirm = () => false;
  await w.entraSel(); await tic();
  T("un usuari NO entra a una família ocupada si no ho confirma", pant().includes("Qui sou?") && !(store.data.families.find(x => x.id === "grau").usuaris || []).length);
  w.confirm = () => true;
  await w.entraSel(); await tic();
  T("amb confirmació explícita: entra i el mòbil queda registrat", pant().includes("Família Grau") && (store.data.families.find(x => x.id === "grau").usuaris || []).includes(uidX));
  vilaS.creadaPer = uidX; vilaS.usuaris = [uidX]; // tornem a casa
  w.triaFam("vila-prat"); await tic();
  w.canviaClau();
  T("canviar la clau: s'oblida del mòbil i la torna a demanar", w.localStorage.getItem("cx_token") === null || w.localStorage.getItem("cx_token") === "" ? pant().includes("Clau del grup") : false);

  console.log("\nRESULTAT: " + ok + " correctes · " + ko + " fallades · " + puts + " escriptures a GitHub simulades (" + conflictes + " xocs resolts)");
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error("ERROR DE LA SUITE:", e); process.exit(2); });
