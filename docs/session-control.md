# Sessionskontrol og pilotadgang – 8. september 2026

Implementeret lokalt; ikke pushet/deployet som del af denne opgave.

## Login

- Almindeligt login: browser-session-cookie og højst 12 timers gyldighed. Browserens egen sessionsgendannelse kan bevare en session-cookie; 12-timersgrænsen kontrolleres altid på serveren.
- Tilvalget “Forbliv logget ind i 30 dage” giver en vedvarende cookie og en fast 30-dages udløbstid, uden automatisk forlængelse. Ikke valgt som standard. Kun til egen enhed.
- Cookies bevarer HttpOnly, SameSite=Lax, Path=/ og Secure i produktion.
- Hver beskyttet serverforespørgsel/server action kontrollerer den aktuelle bruger i databasen. Slettede brugere, ændret adgangskode/e-mail/rolle/klubtilknytning og inaktive/manglende klubber afvises. Databasefejl giver ikke adgang på baggrund af token alene.
- Sessionen indeholder en formålsopdelt HMAC-version af brugerens relevante kontooplysninger, aldrig selve adgangskodehashen. Versionsberegningen kræver ingen skemaændring eller rotation af SESSION_SECRET.
- Eksisterende tokens uden version afvises efter deployment: alle skal logge ind igen. Eksisterende brugere og adgangskoder ændres ikke. Den gamle demo-adgangskode skal stadig erstattes inden rigtige pilotdata.
- Log ud fjerner denne browsers cookie. Der er ikke tilføjet en enhedsoversigt eller særskilt “log ud på alle enheder”. Adgangskodeskift afviser alle tidligere logins ved næste beskyttede forespørgsel; allerede leveret sideindhold kan ikke trækkes tilbage.

## Adgangskoder og gamle funktioner

- Oprettelse og redigering bruger samme servervalidering: mindst 12 tegn, højst 72 UTF-8 bytes, så bcrypt ikke tavst afkorter koden. Et tomt adgangskodefelt ved redigering bevarer den eksisterende kode. Login håndhæver ikke et nyt længdekrav på eksisterende konti.
- De gamle klubfunktioner er bevaret i koden. Ud over middleware-spærringen er der nu en server-side adgangsspærre i spørgsmål, spørgeskemaer, mailhistorik og udbakke, også i deres server actions. Genåbning kræver en kodeændring og gennemgang af den gamle testudsendelse; ingen miljøvariabel kan slå den til ved en fejl.
- Klubbens pilotoversigt, dashboard og kalender samt DMU's centrale udsendelsesfunktion er ikke lukket.

## Verifikation

- 80 automatiske tests bestået: herunder slettet bruger, ændrede legitimationsoplysninger/rettigheder, inaktiv klub, databasefejl, 12 timer/30 dage, begge cookievalg, faktisk adgangskoderedigering og legacy-sider/server actions.
- De eksisterende klubadskillelsestests afprøver fortsat den bevarede kode med adgangsspærren isoleret i test; en separat test bruger den rigtige spærring.
- Typekontrol, lint på berørte områder og fuldt produktionsbuild med VERCEL=1 bestået. Build bruger en lokal dummy-databaseadresse og deaktiveret mailafsendelse.
- Ingen ændringer i produktionsdata, adgangskoder, nøgler eller database-skema og ingen testmails afsendt. Ikke en fuld browser-/produktionsrepetition.
