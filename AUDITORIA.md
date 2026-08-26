# 🔁 AUDITORIA — Cotxes · Escola Anoia
Data: 26-08-2026 · Fitxer auditat: `index.html` (37 KB) · Mètode /loop: cada canvi
amb evidència, verificació executable i reversió clara.

## Canvis d'aquesta iteració (màx. 2)

**CANVI 1 — nova pestanya «Resum»** `[a petició]`
Un cop tothom ha omplert l'horari, mostra el veredicte de la setmana:
- L'estat del grup: famílies, nens, places ofertes i trajectes a cobrir,
  i les **famílies que encara no han marcat res** (per reclamar-los-ho).
- **❗ Falta cobrir**: cada franja amb dèficit (dia, hora, places/nens, −N).
  Tocant la línia saltes al detall del dia.
- **Va just**: franges plenes sense marge (si un cotxe falla, hi ha problema).
- **On sobren places**: el marge disponible per recol·locar.
*Verificació:* proves 6.1–6.3 de la suite. *Reversió:* versió anterior
d'`index.html` (historial del repo).

**CANVI 2 — cap.** La suite no ha destapat cap error a corregir.

## Resultat de la suite (`node audita.js`)

**29 comprovacions · 29 correctes · 0 fallades · 1 xoc d'edició resolt**

| Bloc | Què verifica |
|---|---|
| 0 Cablejat | 21 handlers → funcions existents · 20 ids referenciats → presents |
| 1 Entrada | clau dolenta refusada · clau bona entra · es recorda al mòbil |
| 2 Alta | família amb nens pel nom creada i desada a GitHub |
| 3 Horari | pinzell cotxe · escut anti-doble-toc · commutació passats 350 ms · pinzell per nen · un nen d'una família que condueix no compta com a necessitat |
| 4 Desar | barra de canvis · escriptura amb SHA · **409 per edició simultània → fusió sense trepitjar l'altra família** |
| 5 Calendari | setmana sencera per defecte · dèficit −3 visible · detall del dia amb noms i «falten 3» |
| 6 Resum | falta cobrir · sobren places · famílies pendents |
| 7 Gestió | treure un nen · esborrar família · oblidar la clau |

## Com repetir l'auditoria
Des d'aquesta carpeta: `npm install jsdom` (un cop) i `node audita.js`.
La suite aixeca l'app en un DOM real i simula GitHub fidelment
(clau bona/dolenta, SHA, conflictes 409). Passa-la sempre abans de pujar
una versió nova d'`index.html`.

## Què NO cobreix (i com tapar-ho en 5 minuts)
La suite no veu el renderitzat real de Safari/Chrome de mòbil ni l'API real
de GitHub. Comprovació manual al Pages publicat, amb dos mòbils:
1. Mòbil A: entra la clau, crea una família amb 2 nens.
2. Mòbil A: marca 🚗 i un nen, «Desa els canvis».
3. Mòbil B: entra i comprova que ho veu al Calendari.
4. Tots dos: editeu i deseu gairebé alhora → cap dels dos perd res.
5. Provoca un dèficit i mira que Resum el llisti en vermell.
6. «Afegeix a la pantalla d'inici» i reobre des de la icona.

## Backlog (regla del 3 — encara no es toca)
| Patró | Aparicions | Estat |
|---|---|---|
| Tecla Enter al camp de la clau no fa «Entra» | 1/3 | 🟢 observat a la suite, cap fricció real encara |
