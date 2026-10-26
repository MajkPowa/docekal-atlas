# Dočekal · Atlas majetku

Interaktivní dashboard v češtině. MapLibre poskytuje geografický mapový pohled, Three.js vykresluje skutečné parcelní půdorysy a schematické objemy budov. Žádné hranice nejsou generované nebo odhadnuté.

Vizuální provedení podle dodané reference: tmavá skleněná mapová plocha, modrá parcelní paleta, jemné bílé hranice a oranžové akcenty. Filtry a lokality jsou ve vysouvacím panelu. Dekorativní vektorové kontury pozadí neznázorňují parcelní data; samotná mapa zachovává přesné zdrojové geometrie.

## Spuštění

```powershell
npm install
npm run dev
```

Produkční sestavení: `npm run build`. Výstup v `dist/` je statický web. Při lokálním spuštění je potřeba HTTP server, nikoli přímé otevření index.html ze souboru. Online podklady OSM a ortofoto ČÚZK vyžadují připojení. Geometrie, data, fotografie, PDF a mapové fonty jsou součástí projektu.

## GitHub Pages

Repozitář: `MajkPowa/docekal-atlas`. Publikační cesta je `/docekal-atlas/`. Workflow `.github/workflows/pages.yml` používá Node.js 24, instalaci z lockfile, testy a build Vite; poté nahraje celé `dist/` včetně PDF, fotografií, geometrií, hranic a fontů. Nasazení se spustí po push do `main` nebo ručně přes GitHub Actions, pokud je repository variable `PAGES_ENABLED=true` a Pages je nastavené na GitHub Actions.

`DEPLOY_BASE_PATH` určuje kořen webu. Výchozí `/` podporuje původní hosting i místní vývoj. Build pro Pages nastavuje `/docekal-atlas/`; média z JSON manifestů se překládají stejným resolverem. `VITE_PUBLIC_HOSTING=true` v publikovaném buildu vypíná označení soukromého hostingu. Samotná statická aplikace nemá přihlášení.

Zájmy a poznámky uložené v prohlížeči na jiné doméně se na adresu GitHub Pages automaticky nepřenášejí. Původní doména si své lokální záznamy ponechá; CSV export slouží jako záloha.

## Data a přesnost

- 393 parcel / 1 259 196 m², po podílech ekvivalent 1 204 015,2 m².
- Posudek 081650/2025, ocenění k 17. 10. 2025. Závěr 79 290 000 Kč.
- 370 polygonů majetku, 8 919 kontextových parcel, 1 110 skutečných půdorysů budov a pět hranic katastrálních území z ČÚZK. Načteno 26. 10. 2026.
- 23 původních parcel nemá ověřenou aktuální geometrii. Obnova operátu po pozemkových úpravách 17. 9. 2026 je doložena. Pro bezpečné přiřazení nástupnických parcel je třeba příloha č. 1 rozhodnutí SPÚ z 25. 8. 2026, která není ve veřejném PDF. Vymyšlené náhrady nejsou použity.
- Třináct rozdílů druhu pozemku a rozdíl výměry parcely Olšany 666 jsou zachovány a označeny. Barvy majetku používají druh z posudku, okolní krajina současný KN. Doplňkový filtr Les a remízky zahrnuje také kategorii využití podle posudku.
- Výšky v 3D jsou schematické. Nejde o výškový model ani zaměření skutečných budov.
- Čtyři parcely jsou dle posudku ve vlastnictví společností Field, nikoliv přímém vlastnictví fyzické osoby. Detail uvádí vlastníka ze zdroje.
- Ceny jednotlivých parcel jsou za celou parcelu; detail zohledňuje podíl. Ceny stavebních celků zahrnují související pozemky a nesmějí se násobit jejich počtem.

## Fotografie a úplné karty nemovitostí

Sekce Fotografie obsahuje 61 unikátních fotografií vlastního majetku (64 výskytů v posudku), 31 historických katastrálních výřezů, 6 plánů/legend a 370 skutečných ortofoto náhledů ČÚZK. Všech 393 parcel má alespoň jeden doložený obrazový podklad; některé snímky zachycují širší lokalitu nebo skupinu LV, což je vždy výslovně označeno. Srovnávací fotografie cizích nemovitostí nejsou zařazeny.

Každý z šesti stavebních celků má vlastní úplnou kartu s celou fotodokumentací, souvisejícími parcelami, zájemci a ověřenými technickými údaji; celkem bylo doplněno 304 citovaných faktů. Kliknutí na parcelní řádek otevře úplnou kartu, mapa nabízí zkrácený detail s tlačítkem pro úplný přehled.

Snímky lze rozkliknout, procházet šipkami či klávesami, zvětšit až na 500 %, posouvat a stáhnout v původním rozlišení posudku. Ortofota mají samostatné přepínatelné SVG hranic, shodně registrované s JPEG. Datum stažení ortofota a společné datum místního šetření jsou odlišeny od neověřeného data pořízení konkrétního snímku.

Manifesty: `public/data/photo-catalog.json`, `parcel-media.json`, `building-details.json`. Média: `public/photos/` a `public/media/ortho/`. Všechny obrázky jsou lokální součástí webu; galerie nenačítá nedoložené fotografie z cizích realitních nabídek.

## Evidence zájmů

78 záznamů z uživatelem dodaných e-mailů, 71 unikátních parcel majetku se zájmem. Tři žádosti o převod pachtu jsou samostatné souvislosti mimo oceňovaný soubor. Čtyři parcely mají dva zájemce. Zvažovaný, podmíněný a projevený zájem jsou odlišeny. Částka Pacalova e-mailu 3 402 172 Kč se liší od součtu sedmi položek posudku 3 027 261 Kč; dashboard uvádí obě.

Vlastní zájemce, poznámky a výběr se ukládají pouze v localStorage aktuálního prohlížeče a domény. Export CSV zahrnuje aktuální filtr i vlastní poznámky. Přesun mezi doménami ani sdílení těchto vlastních záznamů není automatické.

Tlačítko „Přidat nový zájem“ umožňuje hromadný zápis k označeným či filtrovaným parcelám nebo ke vloženému seznamu v jednom katastru. Náhled vyznačí duplicity, neznámé položky a existující zájmy; vynechání nerozpoznaných položek vyžaduje výslovné označení. Lze evidovat více vlastních zájemců, stav a společnou poznámku. Původní jednotlivé textové záznamy se načtou beze ztráty. Poslední přidání lze v dané relaci vrátit, jednotlivý vlastní zájem odstranit v detailu. CSV zahrnuje i stavy, data a poznámky nových zájmů.

Vyhledávání přímo nad mapou prochází celý soubor bez ohledu na aktivní filtry. Rozpozná parcelu s katastrem, stavební čísla, LV, lokalitu i název nebo popis domu, funguje bez diakritiky a nabízí ovládání šipkami a Enter. Výběr návrhu přiblíží přesné dostupné geometrie; nezmapované parcely zůstávají označené k ověření.

## Kontrola

Data byla porovnána se soupisem, cenovými tabulkami a závěrem PDF. Chybějící parcely jsou jednotlivě ověřené WFS dotazy. `public/data/interest-audit.json` a `geometry-status.json` uchovávají audit. Produkční build a kontrola závislostí musí projít před publikací. Zdrojové PDF a veřejné rozhodnutí SPÚ lze otevřít přímo z aplikace.

Testy evidence a vyhledávání: `node scripts/interest-store.test.mjs` a `node scripts/parcel-search.test.mjs`. V prohlížeči byl ověřen dávkový zápis vedle původního zájmu, vrácení dávky, zachování po obnovení stránky, odstranění jednotlivého záznamu, výběr z tabulky a mobilní vyhledání LV.
