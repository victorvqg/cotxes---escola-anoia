# 🔁 AUDITORIA — Cotxes · Escola Anoia
Data: 27-08-2026 (49a iteració · v2.29 — la icona de la família al cotxe) · Fitxer: `index.html`
Mètode /loop: evidència → canvi → verificació executable → reversió clara.

## v2.29 — LA ICONA DE LA FAMÍLIA AL COTXE `[art de l'usuari]`
Joc d'icones nou (família saludant des del cotxe, navy + sol groc):
favicon.ico + 16/32/48 png + android-chrome 512; les mides 192
(Android) i 180 (apple-touch-icon, la de la pantalla d'inici d'iOS)
es generen del 512 amb LANCZOS. Capçalera de l'index renovada,
manifest amb les icones noves (512 «any maskable») i theme-color
actualitzat al navy nou (#1d4a6e). A iOS, per veure la icona nova cal
reinstal·lar l'app a la pantalla d'inici.

## v2.28 — /LOOP DE DISSENY: TINTA NEGRA I A4 RECALCULAT `[skills activats]`
Amb els skills de disseny llegits, dues decisions d'impremta:
1. **La tinta mana**: els noms i conductors passen a negre d'impremta
   (#1a1a1a) a tots els estats — l'estat el diuen la barra, el fons i
   la vora, no el color del text. Notes en #47586a. Al full HTML i al
   canvas alhora (el — de les buides es queda fantasma).
2. **La retícula dins del paper**: la geometria del canvas tenia un
   error real — l'última fila (17.00) trepitjava la llegenda (fons
   1714 > 1662). Recalculada sencera: marges 80, rowH 206, grupH 52,
   salts 12 → contingut acaba a ~1586 amb aire fins a la llegenda
   (1668). Hores 46px, píndoles 58, tipografies de cel 31/23.
   Al print CSS, .fh-full omple l'A4 (max-width:none).

## v2.27 — IMPRIMIR A iOS: PRIMER DESA, DESPRÉS FOTOS `[proposta de l'usuari]`
`window.print()` és terreny pantanós a iOS (i mort en mode app), així
que el botó «Imprimeix» desapareix a TOT iOS (detecció per userAgent
+ iPad modern) i al seu lloc surt la guia del camí que sempre
funciona: «💡 Per imprimir: Desa / comparteix → Desa la imatge →
obre-la a Fotos → Imprimeix» (AirPrint des de Fotos). A ordinador i
Android, on print() és fiable, el botó es manté.

## v2.26 — EL DISSENY NOU DELS FULLS `[spec HTML de l'usuari]`
L'usuari aporta un disseny propi (bundle de doc-page A4 apaïsat) i es
porta IDÈNTIC a les tres superfícies: full HTML, CSS i canvas JPEG.
Novetats: paleta refinada (navy #1d4a6e, groc #f6c026, píndoles
#16324f, fons #fdfefe), distintiu groc «FULL DEL NEN / DEL
CONDUCTOR» a la capçalera, vora de tiquet fina (8px), **bandes per
franja amb subtítol** (🌅 ENTRADA · MATÍ · 🎒 RECOLLIDA ·
MIGDIA…), targetes 68px amb barra 4.5px i nota «amb Martí, Joan ·
2 places lliures», llegenda amb quadradets de color i peu discret.
Model de cel nou {pal, titol, nota} compartit per HTML i canvas.
La suite vigila el distintiu i la banda al full generat.

## v2.25 — /COUNCIL: LA GÀBIA STANDALONE I LA CLAU WEB SHARE
DIAGNÒSTIC DEFINITIU: l'app està INSTAL·LADA a la pantalla d'inici
(manifest de la v2.8) i el mode standalone d'iOS mata TOT el que hem
provat: `download`, `window.print()` (no fa res) i el desar-per-
mantenir-premut. No era el codi: era la gàbia. La clau que SÍ
funciona dins d'apps instal·lades: **Web Share API amb fitxers**.
Flux nou: el full HTML es queda com a vista prèvia; «📤 Desa /
comparteix» regenera el JPEG al canvas (2480×1754), el converteix a
Blob/File i el passa a `navigator.share({files})` → s'obre el full
natiu d'iOS: Desa la imatge (Fotos), Imprimeix (AirPrint), WhatsApp…
Escala de fallbacks: share → descàrrega clàssica per Blob (Android/
ordinador) → consell honest de la captura. El botó «Imprimeix»
s'amaga automàticament en mode app (inútil allà). Pla B si tot
fallés: obrir l'app al Safari normal, on print i download funcionen.

## v2.24 — /LOOP: EL FULL IMPRIMIBLE NATIU `[el canvas seguia mut a iOS]`
Dues rondes de canvas fallant en silenci al mòbil = pivot de mecanisme.
El motor JPEG desapareix; els horaris ara són un **full HTML** que
s'obre a pantalla amb el disseny complet (capçalera navy, zebra,
píndoles de dia, bandes Entrada/Recollida, targetes amb accent) i el
botó «🖨️ Imprimeix / desa en PDF» crida `window.print()` — el
diàleg NATIU del sistema, que a iOS i Android permet imprimir o desar
en PDF (millor que JPEG per a paper). CSS `@page A4 landscape` +
`@media print` que aïlla el full. I la segona petició: **l'horari del
nen es veu SEMPRE** — el botó ja no es bloqueja; els trajectes sense
conductor surten al full en vermell com «⏳ pendent» i un avís sota
el botó n'avisa. Provat: full del nen i del conductor s'obren amb el
contingut, i es tanquen.

## v2.23 — APARTAT «DESCARREGA» + BAIXADA MÒBIL `[no descarregava a iOS]`
1. **Per què no baixava**: iOS Safari ignora `download` amb data-URL.
   Solució nativa: en generar, el JPEG s'obre en un VISOR a pantalla
   («mantén el dit sobre la imatge → Desa a Fotos», el camí que iOS
   sempre respecta) + botó ⬇️ Descarrega per Blob/objectURL per a
   Android i ordinador. Visor persistent ocult al cos (mostra/amaga).
2. **Apartat «Descarrega» al menú** (🖨️, sota Avisos, per a tothom):
   un botó per cada nen de LA MEVA família (o la pista «falten N
   trajectes» amb recompte) + l'horari del conductor si conduïm. Els
   botons desapareixen de Calendaris → Per nen.

## v2.22 — IMPREMTA v2: AMB QUI VA `[feedback d'impressió real]`
Redisseny complet del motor pensant en el paper: A4 a 300 dpi
(2480×1754), píndoles de dia, bandes 🌅 Entrada / 🎒 Recollida,
targetes amb barra d'accent per estat, llegenda i data de generació.
El contingut respon la pregunta de la nevera: a cada casella, el
CONDUCTOR en gran i a sota «amb: {companys de viatge}» — germans i
altres nens del mateix cotxe (o «hi va sol»). El full del conductor:
«portes N» + tots els noms + les places que li queden a cada viatge.

## v2.21 — EL STAFF NO TOCA LA FAMÍLIA ADMIN `[forat d'usuari]`
El staff podia entrar amb «edita» a la família de l'administrador.
Tres portes tancades: (1) el botó «edita» de la fila de l'admin
desapareix per al staff (només l'admin el té); (2) adminEdita() refusa
en profunditat amb missatge; (3) el desplegable de la tria tampoc no
hi deixa passar el staff. Provat pels tres costats.

## v2.20 — HORARIS IMPRIMIBLES (JPEG A4 APAÏSAT) `[a petició]`
Motor de dibuix amb canvas (1754×1240, ~150 dpi) amb la identitat de
l'app: banda navy amb zebra, graella DL–DV × franges, colors per
estat i peu de marca. Dos generadors a Calendaris → Per nen:
1. **Horari setmanal del nen** — cada dia i franja: «el porta X» /
   «amb la família (conductor)» / «pel seu compte». El botó només
   apareix quan el nen té ZERO trajectes sense conductor; si en
   falten, una pista ho diu i en compta els pendents.
2. **Horari setmanal del conductor** — per cada viatge 🚗, els noms
   dels nens que porta (o «sense passatgers»), més els seus 🚫.
Baixada directa com a .jpg (nom del nen / del conductor al fitxer).
Entorn de proves sense canvas: els generadors responen amb un avís
elegant en lloc de petar (provat). pintaDia guanya guarda defensiva
(no repinta si el contenidor no existeix).

## v2.19 — «ADMIN» AL MENÚ `[a petició]`
L'accés d'administrador viu ara al menú lateral, sota Avisos, amb el
nom «Admin» — i NOMÉS el veu la família admin (Quintana Andreví),
sigui quin sigui l'estat del dispositiu. El botó del peu queda reduït
als casos que el necessiten: grup sense codi (bootstrap), staff amb el
mode actiu («Staff · gestiona») o família amb rol staff pendent
d'activar («Activa el mode staff»). Nota de sessió: cap codi de staff
establert al grup real fins avui — el camp és `staffPin` a dades.json.

## v2.18 — LES 4 DADES DEL GRUP `[a petició: «que sigui guai»]`
Sota la versió, quatre dades vives del grup: 👪 famílies ·
🧒 nens · 🚗 viatges en cotxe/setmana · 🤝 **places
compartides** — la mètrica amb ànima: nens pujant al cotxe d'una
altra família, la raó de ser de l'app. Es recalculen a cada canvi
(penjades de pintaBarra) i a cada pantalla. Lliçó tècnica gravada:
al JS en zona crua, emojis en parells subrogats; al Markdown i al
Python normal, \U de veritat. Cada zona, el seu dialecte.

## v2.17 — LA LLEGENDA DEIXA DE SURAR `[captura]`
L'sticky de la llegenda (punt 11 de la spec) tapava les targetes en
fer scroll: fora l'enganxós, torna al flux normal de la pàgina.

## v2.16 — ENTRADA ÚNICA: LA CASELLA SENCERA `[captura: 🚗 a les 8 i 🙋 a les 9]`
L'exclusió 8/9 puja de nivell: fins ara era per nen; ara és de
casella sencera. Respondre QUALSEVOL cosa a una de les dues hores
d'entrada (🚗, 🙋 o 🚫) buida automàticament l'altra del mateix
dia — cotxe (amb les places i assignacions), 🚫 i marques de nens
inclosos — amb l'avís groc de passatgers si el cotxe esborrat portava
nens d'altres famílies. Les contradiccions velles que ja visquin a les
dades es curen soles al primer toc de qualsevol de les dues caselles.
El doble-check del desar es queda com a xarxa de seguretat.

## v2.15 — LA TRIA ÉS UNA PORTA, NO UN PASSADÍS `[forat real d'usuari]`
El desplegable de «Qui sou?» deixava entrar qualsevol mòbil amb la
clau a QUALSEVOL família. Model nou de **reclamar i unir-se**: cada
família registra els seus mòbils (`usuaris[]`); una família lliure es
reclama en entrar-hi; una família OCUPADA demana confirmació explícita
(«ja està en marxa en un altre mòbil — només continua si n'ets») i
registra el mòbil que s'hi uneix; des de llavors, aquell mòbil hi
torna sol (el segon pare/mare inclòs — el retorn automàtic ara mira
creador O usuaris). Admin i staff passen sense porta, com toca.
HONESTEDAT: amb una clau compartida no hi ha pany perfecte al client;
això tanca el passeig casual i deixa rastre de cada unió. Si mai cal
pany dur: PIN per família (al backlog).

## v2.14 — EL RÈTOL DE LA GRAELLA, EN VIU `[captura: Dijous 15.00 amb 🚗 però acusat de buit]`
El comptador de compleció (⚠ Falten N… / ✓ Setmana completa) només
es calculava en entrar a la Graella: tocar caselles repintava la
graella però no el rètol, que quedava amb la foto vella — d'aquí la
contradicció de la captura. Ara viu en una caixa pròpia que es
recalcula A CADA canvi de casella (pinta i menú de casella inclosos):
graella i rètol ja no poden discrepar, i dues proves ho vigilen en
els dos sentits (buidar → Falten 1; respondre → Setmana completa).

## v2.13 — GESTIONA PER CAPES `[captura + petició]`
1. El botó de baix ara és de tres capes: «🛡️ Administrador ·
   gestiona» només per a l'admin (dispositiu o família admin, i
   bootstrap sense codi); «🛠️ Staff · gestiona» només amb el mode
   staff actiu; «🛠️ Activa el mode staff» només per a famílies amb
   el rol assignat que encara no han posat el codi. Usuaris normals: cap
   botó. Els «edita» que es vegin amb un dispositiu és perquè aquell
   mòbil porta un mode actiu (es desactiva des de «gestiona»).
2. La vista **Dies** s'obre amb la guia: és la vista dels conductors —
   si aquell dia conduïu, hi surt «Qui puges al teu cotxe?» amb
   caselles per marcar els nens que recollireu.

## v2.12 — TRES OPCIONS APILADES `[captura]`
El menú de casella queda amb tres files a tot l'ample, una sota
l'altra: 🚗 Conduïm (amb els nens i les places) · 🙋 demana/nen
plaça · 🚫 Pel nostre compte. «Buida la casella» desapareix: per
desmarcar, es toca l'opció encesa i s'apaga. L'exclusivitat de la
v2.11 (una decisió per casella) es manté intacta.

## v2.11 — UNA SOLA CASELLA DE TRANSPORT `[a petició, amb èmfasi]`
Les dues files (🚗 Conduïm / 🙋 demana plaça) es fusionen en un
control partit únic: esquerra «🚗 Conduïm — N places», dreta
«🙋 {nen} demana plaça» (o «Els nens demanen plaça» si n'hi ha més
d'un: es marquen TOTS de cop, simètric amb «conduïm = tots»). Tocar
un costat apaga l'altre; tornar a tocar el costat actiu el desmarca.
L'acció «demana» porta el seu propi escut anti-doble-toc i l'avís de
passatgers quan apaga un cotxe amb nens a bord.

## v2.10 — /LOOP DE PERMISOS `[captura: Rols visible dins d'una família usuari]`
**El forat**: la gestió de rols penjava del mode del dispositiu, no de
la família — l'admin editant una família usuari seguia veient i podent
tocar Rols «des de dins seu». **La regla nova**: Rols només existeix
(menú, pantalla i funció) quan ets admin **i** ets dins la família
admin. Revisió completa de portes feta al /loop:

| Porta | Veredicte |
|---|---|
| Assignar nens a un cotxe | ✓ només el conductor, sobre el seu cotxe |
| «edita» del directori | ✓ només admin i staff (provat) |
| Crear famílies | ✓ admin sí · staff no · usuari la seva |
| Esborrar família | ✓ la pròpia, o l'admin |
| Codi de staff / d'admin | ✓ rol staff assignat / família adminFam |
| Pantalla i botó de Rols | 🔧 FIXAT: només des de la família admin |
| canviaPin | 🔧 FIXAT: hi faltava la guarda d'admin |
| estableixPin | 🔧 FIXAT: només bootstrap (si no hi ha codi) |
| Porta dels Calendaris · desa validat · fantasmes | ✓ intactes |

## v2.9 — CONDUÏM ⇄ ELS NOSTRES NENS `[7 peticions d'usuari]`
1. **🚗 i nen propi són UNA decisió**: conduir vol dir que els vostres
   nens hi van. Posar 🚗 neteja les seves marques a la casella; marcar
   un nen apaga el vostre 🚗 (i allibera les places). L'etiqueta del
   menú ho diu: «els nens vénen amb nosaltres».
2. **Accés administrador només per a qui toca**: el botó de baix només
   surt a la família admin, a qui té mode actiu, a famílies amb rol
   staff (per activar el codi) o quan el grup encara no té codi.
3. **Avisos per data i en dues seccions**: 🆕 Nous (N) i Llegits.
4. **Actualitza només sense canvis**: quan hi ha canvis pendents,
   l'«↻ Actualitza» dels Calendaris s'amaga i mana «Desa».
5. **Un sol Actualitza**: fora el duplicat que vivia dins del Resum.
6. Confirmat amb prova: els usuaris no veuen «edita» al directori
   (només admin i staff).

## v2.8 — ADMIN CLAVAT + RESTYLING (spec markmap) `[captura + svg]`
**Admin de ferro**: nou camp `adminFam` a les dades — es fixa en
establir el codi d'administrador, i al grup real migra sol a
`quintana-andrevi`. A cada càrrega, `normalitzaRols()` força el rol
admin a aquesta família i degrada qualsevol rol admin extraviat (el
fantasma dels Noguera, herbes de les proves d'ahir, mor sol). El codi
d'admin només s'activa des de la família admin; a Rols surt fixa.

**Spec visual aplicada sencera** (22 punts + extra): benvinguda amb
🚗 i 3 passos, login i tria en columna, chip d'estat llegible amb
variants ok/err, CTA ambre de 48px, ombres suaus, barra de desar
sòlida (i el peu s'amaga quan hi ha canvis), subtabs amb scroll en una
fila, llegenda enganxosa, cel·les i mapa més llegibles, steppers de
44px, capçalera compacta un cop dins, escala tipogràfica unificada,
zebra més alta, transicions i focus visible, toast verd de «Desat»,
seccions Entrada/Recollida al detall del dia, dèficit gran al mapa, i
els chips dels nens amb estil. Més: **icona d'app** (svg + png 512/
192/180/32) i **manifest** — l'app és instal·lable a la pantalla
d'inici. Estratègia: un bloc CSS d'anul·lacions al final + cirurgia
mínima autoritzada per la mateixa spec; l'únic JS nou és d'estat
visual (classes al body) i el toast.

## v2.7 — EL MENÚ DE CASELLA `[dues rondes del mateix símptoma → canvi de model]`
El model de pinzell (tria una eina, toca caselles) ha causat dues
vegades el mateix problema al camp: tocs que no fan res perquè l'eina
seleccionada no és la que l'usuari creu. Substitut: **tocar una
casella obre el seu menú** (safata inferior) amb l'estat actual i
totes les opcions — 🚗 Conduïm (amb les places), 🙋 «{nen} demana
plaça» per cada fill, 🚫 Pel nostre compte, «Buida la casella» —
cada toc aplica i queda marcat en verd; «Fet» tanca. Sense modes, no
hi ha mode equivocat. Les regles de sempre (canvi 8/9 automàtic,
🚫↔nen excloents, avisos de passatgers, validacions del desar) hi
viuen intactes. L'escut anti-doble-toc ara és per casella+opció.
Honestedat: el toc mort exacte de la 2.6 no s'ha pogut reproduir a la
suite; el que sí sabem és que el patró d'eina-mode l'ha prov*ocat dues
vegades a la vida real, i aquest patró ja no existeix.

## v2.6 — PINZELL AUTOREPARAT I APARTAT ROLS `[bug d'usuari + petició]`
1. **El bug del 🙋 que no responia**: el pinzell és global i sobrevivia
   al canvi de família (o a esborrar un nen); si apuntava a un nen que
   no existeix a la família actual, cada toc moria en silenci i només
   🚗/🚫/Esborra responien. Ara la Graella s'autorepara a cada
   pintada (pinzell caducat → torna a 🚗, visible), i pinta() té la
   mateixa xarxa de seguretat.
2. **Apartat 🛡️ Rols al menú** (només el veu l'admin): llista de
   famílies amb el rol com a botó (usuari ↔ staff, desat a l'instant;
   el rol de l'admin és fix i es mostra apagat). La gestió de rols surt
   del directori 👥, que queda net (escuts + «edita»).

## v2.5 — CANVIS AMB PASSATGERS A BORD `[a petició + captura]`
1. Canviar una casella **no queda mai subjecte** a qui hi anava: el canvi
   passa, i l'app avisa a l'acte a la barra (estil informatiu groc):
   treure el 🚗 amb nens a bord → «{noms} es queden sense plaça; les
   seves famílies ho veuran als Avisos quan desis»; desmarcar un nen (o
   passar a 🚫 / posar-te a conduir) quan anava al cotxe d'un altre →
   «ja no puja al cotxe assignat; en desar, la plaça queda lliure».
   L'avís informatiu persisteix fins que el desat té èxit.
2. **Cap plaça fantasma**: les referències d'assignació es validen en
   lectura (nen marcat i família que no condueix aquell dia); comptador
   i vistes ignoren referències caduques a l'instant.
3. **Subtabs dels Calendaris a dalt de tot** (Quadre · Setmana · Dies ·
   Per nen · Resum), abans de la llegenda i el mapa.

Nota de mètode: el vermell inicial de la prova «fantasma» era de la
prova, no de l'app — mutava una còpia local que l'app, correctament,
refrescava del GitHub simulat. La prova ara muta el magatzem, com al
món real.

## v2.4 — L'AVÍS, ON ÉS EL DIT `[captura: l'error sortia dalt, fora de vista]`
La validació del desar (dobles 8/9 i franges buides) ara es mostra
DINS la barra de desar, enganxada al botó que has premut — al mòbil
l'avís de dalt quedava fora de pantalla. És persistent: no marxa fins
que la graella és correcta i completa, i llavors s'apaga sol (ho
recomprova a cada canvi de casella). Mentre és actiu, l'app et salta a
la Graella i els Calendaris segueixen tancats: no hi ha res més a fer
que completar-la.

## v2.3 — INTEGRITAT I TRAÇABILITAT `[a petició]`
1. **Desar verifica la regla 8/9**: si un nen té les 8.00 i les 9.00
   marcades el mateix dia (marques velles d'abans de la regla, o de
   qualsevol altra via), «Desa» es bloqueja i anomena el nen i el dia.
   L'exclusió en tocar ja evitava crear-ne de noves; ara cap doble pot
   arribar a GitHub.
2. **Versió al peu** («versió 2.3» sota el crèdit): traçabilitat de
   desplegament — si el peu no diu l'última versió, estàs veient una
   còpia vella. PROCEDIMENT: cada lliurament puja aquesta xifra i
   registra el canvi aquí.

## v2.2 — COHERÈNCIA DE DADES `[captures d'usuari]`
1. **🚫 neteja la casella**: marcar «pel nostre compte» treu les marques
   de nens d'aquella casella (era el bloqueig que es veia: el nen marcat
   «guanyava» i el 🚫 no es veia); i marcar un nen treu el 🚫.
2. **Desar exigeix la setmana completa**: si queda cap franja sense
   respondre, «Desa els canvis» es nega, diu quantes caselles falten i
   quina és la primera (les entrades 8/9 compten com una de sola), i et
   porta a la Graella.
3. **El nom de família és la suma dels cognoms**: fora el camp lliure;
   al Perfil es mostra compost (1r cognom del pare + 1r cognom de la
   mare) i es recompón sol quan canvies un cognom. La creació també
   demana els dos cognoms. Les famílies existents conserven el nom fins
   que omplen els dos camps.

## v2.1.1 — HOTFIX `[captures d'usuari: graella apilada en columna]`
En la reestructura v2, el contenidor de la graella es va recrear sense
la classe `graella` (la que porta el `display:grid`): tot es va apilar
en una columna i l'edició era inusable. Restaurada la classe i afegida
una prova que la vigila. **Lliçó**: la suite (jsdom) no veu CSS ni
maquetació — pot vigilar classes i estructura, però el cop d'ull humà
a la pantalla real segueix sent l'última línia de defensa.

## v2.1 — rols governats per l'admin `[a petició]`
1. **Botó de rol al directori 👥** (només admin): alterna usuari ↔ staff
   per a cada família, amb desat immediat. El rol de l'admin és fix.
2. **Els codis obeeixen el rol**: el codi de staff només activa el mode a
   famílies marcades com a staff; el codi d'admin, només a la família amb
   rol admin (és a dir, només el creador). Sense rol, el codi es refusa
   amb un missatge que explica el pas que falta.
3. El **rol sempre visible** al costat de «Hola, [família]» (usuari /
   staff / admin). 4. Botó «treu» → «esborra». 5. Lema: «De Montbui
   poble a l'Escola Anoia». 6. Peu de la web: «creat per Víctor
   Quintana».

## v2 — què ha canviat (a petició, en un sol paquet)

**1. Menú lateral ☰** amb 4 seccions: **Perfil** · **Graella** ·
**Calendaris** · **Avisos**. Les pestanyes de dalt desapareixen; cada
secció porta el seu títol.

**2. Perfil** (abans panell ⚙️): nom de família + **1r cognom del pare
i 1r cognom de la mare** (camps nous) + conductor + places (amb la frase
de comprovació) + nens (nom + 1r cognom). El requadre es marca **groc**
quan hi ha canvis sense desar i torna a la normalitat en desar.

**3. Graella**: només el teu horari, amb comptador de compleció
(⚠ falten N caselles / ✓ setmana completa) i la regla nova:
**cada nen entra a les 8.00 O a les 9.00** — marcar una hora li
desmarca l'altra automàticament.

**4. Porta dels Calendaris 🔒**: fins que Perfil i Graella no són
complets, els Calendaris queden bloquejats amb una pantalla que diu
exactament què falta i botons per anar-hi. (Admin i staff en queden
exempts per poder ajudar.)

**5. Calendaris**: tot el visual de sempre, ara amb **5 subtabs**:
Quadre · Setmana · Dies · Per nen · **Resum** (les targetes de Falta
cobrir / Va just / On sobren s'hi han mogut).

**6. Rol STAFF** 🛠️: segon codi (el fixa l'admin des de la seva
pantalla). El staff pot entrar a qualsevol família i posar-hi/treure'n
coses («canvia», «edita», bàner groc), però **no pot crear famílies**
ni tocar codis. La seva família surt amb 🛠️ al directori.

**7. Avisos 🔔**: registre dels canvis que afecten ELS TEUS nens
(«🚗 Biel · Dijous 17.00 → el porta Jordi FL» / «⏳ ja no té
cotxe»), amb data i hora de detecció i comptador vermell al menú.
Honestedat: es detecten AL TEU MÒBIL cada cop que l'app carrega les
dades — sense servidor no hi ha historial universal, i per a un grup
d'escola això és exactament el que cal.

## Resultat de la suite (`node audita.js`)

**117 comprovacions · 117 correctes · 0 fallades (v2.29) · 1 xoc d'edició resolt**

Noves (v2.1): rol assignable pel directori · codi de staff refusat sense rol · codi d'admin refusat fora de la família admin · rol a la salutació. Noves (v2): flux Perfil→Graella amb cognoms i requadre groc · exclusió
8/9 per nen · porta dels Calendaris (bloqueig i desbloqueig) · avisos
(primera visita neta, detecció de canvi, pàgina i comptador a zero) ·
rol staff sencer (codi, poders, límit de creació) · Resum com a subtab.

## Lliçons d'enginyeria d'aquesta iteració (honestedat)
1. Un bloc amb emojis escrits com a parells subrogats va fer petar
   l'escriptura A MIG FITXER i el va deixar a 0 bytes. Recuperat del
   repositori viu de GitHub (la còpia que el mateix usuari havia pujat).
   Des de llavors: **validació UTF-8 abans d'escriure + escriptura
   atòmica** (fitxer temporal + reemplaçament) a tots els parxes, i
   còpia de seguretat prèvia. El History del repo torna a demostrar
   que és la xarxa de seguretat real del projecte.
2. La guarda de «primera visita» dels avisos comparava amb null, però
   lsGet torna cadena buida: el xivato de la suite ho va destapar amb
   dades reals abans que cap usuari ho patis.

## Com repetir l'auditoria
`npm install jsdom` (un cop) i `node audita.js`. Sempre abans de pujar.

## Backlog (regla del 3)
| Patró | Aparicions | Estat |
|---|---|---|
| Canvi de pinzell + mateix toc en <350 ms s'ignora | 1/3 | 🟢 observat |
| El directori 👥 no es refresca fins a canviar de pantalla | 1/3 | 🟢 en disseny |
| Nens amb el mateix nom de pila als llistats (desambiguar) | 1/3 | 🟢 previst |
