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
  const orfes = [...usats].filter(u => !defs.has(u));
  T("tots els handlers (" + usats.size + ") apunten a funcions existents", orfes.length === 0, orfes.join(","));
  const idsRef = new Set([...html.matchAll(/\$\("#([\w-]+)"\)/g)].map(m => m[1]));
  const idsDef = new Set([...html.matchAll(/id=(?:'|\\?")([\w-]+)(?:'|\\?")/g)].map(m => m[1]));
  const idsOrfes = [...idsRef].filter(i => !idsDef.has(i));
  T("tots els ids referenciats (" + idsRef.size + ") existeixen", idsOrfes.length === 0, idsOrfes.join(","));
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
  T("arrenca demanant la clau del grup", pant().includes("Clau del grup"));
  d.querySelector("#inp-clau").value = "clau-dolenta";
  await w.provaClau(); await tic();
  T("clau dolenta → refusada amb missatge", pant().includes("no obre el grup"));
  d.querySelector("#inp-clau").value = CLAU;
  await w.provaClau(); await tic();
  T("clau bona → pantalla de tria", pant().includes("Crea la teva fam"));
  T("la clau queda recordada al mòbil", w.localStorage.getItem("cx_token") === CLAU);

  console.log("2 · ALTA DE LA FAMÍLIA (nens pel nom)");
  d.querySelector("#nf-nom").value = "Família Vila";
  let inp = d.querySelector("#nf-nens input");
  inp.value = "Jan"; inp.dispatchEvent(new w.Event("input"));
  w.nfAfegeixNen();
  const inps = d.querySelectorAll("#nf-nens input");
  inps[1].value = "Mia"; inps[1].dispatchEvent(new w.Event("input"));
  await w.creaFam(); await tic();
  const famS = () => store.data.families.find(f => f.id === "familia-vila");
  T("la família es crea i es desa a GitHub", store.data.families.length === 1 && famS().nens.map(n => n.nom).join(",") === "Jan,Mia");
  T("entra a l'app amb salutació", pant().includes("Hola"));

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
  T("pinzell d'un nen concret: en Jan necessita plaça", w.balanc("r17", "dl").nens.length === 1);
  w.pinta("e9", "dl"); // en Jan sobre franja on la família condueix
  T("nen d'una família que condueix NO compta com a necessitat", w.balanc("e9", "dl").nens.length === 0);
  await tic(400); w.pinta("e9", "dl"); // neteja la marca d'en Jan

  console.log("4 · DESAR I XOC D'EDICIONS");
  T("hi ha canvis → surt la barra de desar", !d.querySelector("#barra").classList.contains("amaga"));
  await w.desa(); await tic();
  T("desa → barra amagada i dades a GitHub", d.querySelector("#barra").classList.contains("amaga")
      && (famS().cotxe.e9 || []).includes("dl") && (famS().nens[0].marca.r17 || []).includes("dl"));
  // Una altra família desa pel seu compte (canvia el SHA)
  store.data.families.push({ id: "grau", nom: "Família Grau", places: 0, cotxe: {},
    nens: [{ id: "arlet", nom: "Arlet", marca: { r17: ["dl"] } }, { id: "bru", nom: "Bru", marca: { r17: ["dl"] } }] });
  store.sha = "sha" + (++shaN);
  w.triaPinzell("cotxe"); w.pinta("e8", "dt");
  await w.desa(); await tic();
  T("xoc detectat (409) i resolt fusionant", conflictes >= 1 && store.data.families.length === 2);
  T("els meus canvis hi són després de la fusió", (famS().cotxe.e8 || []).includes("dt"));
  T("els canvis de l'altra família no es trepitgen", store.data.families.find(f => f.id === "grau").nens.length === 2);

  console.log("5 · CALENDARI (setmana i dia)");
  await w.pintaCalendari(); await tic(20);
  T("vista de setmana sencera activa per defecte", cos().includes("Setmana sencera") && cos().includes("dcard"));
  T("el dèficit surt al mapa i a la setmana (−3 dl 17.00)", cos().includes("\u22123"));
  w.triaTab("cal"); await tic(30);
  w.selDia("dl"); await tic(20);
  T("detall del dia: nens pel nom i cognom de família", cos().includes("Arlet i Bru (Família Grau)"));
  T("detall del dia: badge de falten 3", cos().includes("falten 3"));

  console.log("6 · RESUM FINAL");
  store.data.families.push({ id: "nova", nom: "Família Nova", places: 2, cotxe: {},
    nens: [{ id: "pol", nom: "Pol", marca: {} }] });
  store.sha = "sha" + (++shaN);
  await w.pintaResum(); await tic(20);
  T("«Falta cobrir» amb dia i hora", cos().includes("Falta cobrir") && cos().includes("Dilluns") && cos().includes("17.00"));
  T("«On sobren places» amb el marge (+3)", cos().includes("On sobren places") && cos().includes("+3"));
  T("famílies pendents d'omplir detectades", cos().includes("Encara no han marcat res") && cos().includes("Família Nova"));

  console.log("7 · GESTIÓ DE LA FAMÍLIA");
  w.triaTab("horari"); await tic();
  w.treuNen("mia"); await w.desa(); await tic();
  T("treure un nen (amb les seves marques)", famS().nens.length === 1 && famS().nens[0].id === "jan");
  w.triaFam("nova"); await tic();
  await w.esborraFam(); await tic();
  T("esborrar una família del grup", store.data.families.length === 2 && !store.data.families.find(f => f.id === "nova"));
  T("torna a la pantalla de tria", pant().includes("Qui sou?"));
  w.canviaClau();
  T("canviar la clau: s'oblida del mòbil i la torna a demanar", w.localStorage.getItem("cx_token") === null || w.localStorage.getItem("cx_token") === "" ? pant().includes("Clau del grup") : false);

  console.log("\nRESULTAT: " + ok + " correctes · " + ko + " fallades · " + puts + " escriptures a GitHub simulades (" + conflictes + " xocs resolts)");
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error("ERROR DE LA SUITE:", e); process.exit(2); });
