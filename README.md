# Dočekal · Atlas majetku

Soukromý interaktivní dashboard v češtině. MapLibre poskytuje geografický mapový pohled, Three.js vykresluje skutečné parcelní půdorysy a schematické objemy budov. Žádné hranice nejsou generované nebo odhadnuté.

Vizuální provedení podle dodané reference: tmavá skleněná mapová plocha, modrá parcelní paleta, jemné bílé hranice a oranžové akcenty. Filtry a lokality jsou ve vysouvacím panelu. Dekorativní vektorové kontury pozadí neznázorňují parcelní data; samotná mapa zachovává přesné zdrojové geometrie.

## Spuštění

```powershell
npm install
npm run dev
```

Produkční sestavení: `npm run build`. Výstup v `dist/` je statický web. Při lokálním spuštění je potřeba HTTP server, nikoli přímé otevření index.html ze souboru. Online podklady OSM a ortofoto ČÚZK vyžadují připojení. Geometrie, data, fotografie, PDF a mapové fonty jsou součástí projektu.

## Data a přesnost

- 393 parcel / 1 259 196 m², po podílech ekvivalent 1 204 015,2 m².
- Posudek 081650/2025, ocenění k 17. 10. 2025. Závěr 79 290 000 Kč.
- 370 polygonů majetku, 8 919 kontextových parcel, 1 110 skutečných půdorysů budov a pět hranic katastrálních území z ČÚZK. Načteno 26. 10. 2026.
- 23 původních parcel nemá ověřenou aktuální geometrii. Obnova operátu po pozemkových úpravách 17. 9. 2026 je doložena. Pro bezpečné přiřazení nástupnických parcel je třeba příloha č. 1 rozhodnutí SPÚ z 25. 8. 2026, která není ve veřejném PDF. Vymyšlené náhrady nejsou použity.
- Třináct rozdílů druhu pozemku a rozdíl výměry parcely Olšany 666 jsou zachovány a označeny. Barvy majetku používají druh z posudku, okolní krajina současný KN. Doplňkový filtr Les a remízky zahrnuje také kategorii využití podle posudku.
- Výšky v 3D jsou schematické. Nejde o výškový model ani zaměření skutečných budov.
- Čtyři parcely jsou dle posudku ve vlastnictví společností Field, nikoliv přímém vlastnictví fyzické osoby. Detail uvádí vlastníka ze zdroje.
- Ceny jednotlivých parcel jsou za celou parcelu; detail zohledňuje podíl. Ceny stavebních celků zahrnují související pozemky a nesmějí se násobit jejich počtem.

## Zájmy a souvislosti

78 záznamů z uživatelem dodaných e-mailů, 71 unikátních parcel majetku se zájmem. Tři žádosti o převod pachtu jsou samostatné souvislosti mimo oceňovaný soubor. Čtyři parcely mají dva zájemce. Zvažovaný, podmíněný a projevený zájem jsou odlišeny. Částka Pacalova e-mailu 3 402 172 Kč se liší od součtu sedmi položek posudku 3 027 261 Kč; dashboard uvádí obě.

Vlastní zájemce, poznámky a výběr se ukládají pouze v localStorage aktuálního prohlížeče a domény. Export CSV zahrnuje aktuální filtr i vlastní poznámky. Přesun mezi doménami ani sdílení těchto vlastních záznamů není automatické.

## Kontrola

Data byla porovnána se soupisem, cenovými tabulkami a závěrem PDF. Chybějící parcely jsou jednotlivě ověřené WFS dotazy. `public/data/interest-audit.json` a `geometry-status.json` uchovávají audit. Produkční build a kontrola závislostí musí projít před publikací. Zdrojové PDF a veřejné rozhodnutí SPÚ lze otevřít přímo z aplikace.
