# Fantasy Hölle 26/27 – Full version

Detta är en komplett lokal PWA-prototyp. Den fungerar direkt i Safari/Chrome och kan installeras på hemskärmen.

## Funktioner
- 45,0 m budget
- 1 målvakt, 2 backar, 3 forwards
- Alla spelare/priser från ert Google Sheet
- Fem fantasyomgångar för 22 seriematcher: 5 + 5 + 5 + 5 + 2
- Separata lag per omgång
- Kopiera föregående lag
- Lås/lås upp omgång
- Adminpanel med matchstatistik för varje spelare
- Automatisk fantasy-poäng
- Ligatabell per omgång och totalt
- Böteskassa: tre sämsta per omgång +100 kr
- Jumbo efter säsongen +200 kr
- Prisavdrag: 300 / 150 / 75 kr
- Lägg till/ta bort managers
- Backup via export/import av JSON
- Data sparas lokalt i webbläsaren
- PWA-stöd via manifest + service worker

## Admin
Standard-PIN: 2627

## Managers i demon
- Lukas: 7373
- Jens: 1111
- Pippi: 2222

PIN-koderna är bara demonstration i denna lokala version; de är inte säker autentisering.

## Så startar du
Enklast på dator:
1. Packa upp ZIP-filen.
2. Starta en lokal webbserver i mappen:
   `python3 -m http.server 8000`
3. Öppna `http://localhost:8000`

Att dubbelklicka på index.html fungerar för mycket, men PWA/offline-läge kräver en webbserver.

## iPhone
När appen ligger på en webbserver:
1. Öppna den i Safari.
2. Tryck Dela.
3. Välj "Lägg till på hemskärmen".

## Viktigt om flera mobiler
Den här versionen sparar data på varje enhet. För att alla i laget ska se samma liga i realtid behövs en gemensam backend/databas (t.ex. Supabase/Firebase). Frontenden är byggd så att nästa steg kan kopplas mot en sådan backend utan att designen behöver göras om.
