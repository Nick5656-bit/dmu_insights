# Adgangstest mellem klubber — 8. september 2026

Status: udført lokalt; ikke pushet eller deployet. Ingen aktive data, konti eller mails er ændret.

## Metode

`src/lib/club-access.test.ts` tilføjer 20 automatiske tests. De kører de faktiske server-sider, serverhandlinger, CSV-rute, resultatberegning og rollebeskyttelse med eksplicitte database- og sessionsadaptere i hukommelsen. JWT-validering testes separat i `security-upgrade.test.ts`.

Begge fiktive klubber findes samtidig i testdata. Forespørgsler filtrerer disse data ud fra den kode, platformen faktisk udfører — adapteren begrænser ikke på forhånd til den indloggede klub. Hver klub har egne spørgsmål, fem svar, arrangement, medlem, ekstra mailmodtager og mailhistorik. Egne, tilladte opslag/ændringer bruges som positive kontroller.

## Kontrolleret

- Både A → B og B → A: dashboard, arrangementer, overblik, egne spørgsmål, mailhistorik og udsendelsesoversigt viser ikke den anden klubs private data.
- En anden klubs spørgeskema-id i direkte detalje-URL afvises. Manipulerede dashboard- og mailfiltre giver ikke adgang.
- CSV tilsidesætter ikke klubbens afgrænsning, selv med en anden `clubIds` eller `surveyInstanceId` i URL'en. Egne svar kan stadig eksporteres; respondent-id'er og modtageradresser følger ikke med.
- DMU-administrator kan fortsat læse begge klubbers resultater i dashboard og CSV, samt indsnævre eksport til én klub. De fiktive klubber er testklubber og vælges i testdatavisningen.
- Anonyme brugere afvises, og en klubadministrator får ikke DMU-dashboardadgang. Serverhandlinger kontrollerer login igen efter den oprindelige sidevisning.
- Klub A kan ikke redigere, slette eller kopiere B's egne spørgsmål, deaktivere B's ekstra mailmodtager eller tilføje B's spørgsmål til A's undersøgelse.
- Manipulerede formularer kan ikke ændre B's klarmelding, planlægning, udsendelsesstatus eller tilføje/fjerne spørgsmål i B's undersøgelse.

## Fund og rettelse

Kalenderen anvendte `clubId: session.clubId ?? undefined`. En session med rollen `CLUB_ADMIN`, men uden klubtilknytning, gav derfor et uafgrænset arrangementsopslag. Testen reproducerede, at begge klubbers arrangementer blev sendt til kalenderkomponenten. Klub-layoutet kontrollerede kun rollen og forhindrede ikke denne situation.

Efter brugerens godkendelse er `src/app/club/events/page.tsx` rettet til at afvise manglende klubtilknytning **før databaseopslag** med en synlig besked. Den normale forespørgsel kræver herefter det konkrete klub-id. Regressionstesten kontrollerer både fravær af fremmede arrangementer og nul databaseopslag uden tilknytning. Normale A/B-kalendere virker fortsat i testene.

## Resultat og afgrænsning

- Alle **75 tests** består, heraf 20 nye adgangstests. Ingen springes over.
- TypeScript-kontrol og lint af de ændrede kodefiler består.
- Ingen produktionsdatabase, konti, invitationer, mailudbyder eller cron er brugt. Demo-adgangen er bevaret.
- Dette er ikke en komplet sikkerhedsgodkendelse eller en browser-/PostgreSQL-generalprøve. Adapteren dækker de forespørgsler, der bruges i testene; den simulerer ikke alle Prisma-funktioner, samtidighed, relationelle constraints eller Next.js' HTTP-transport af serverhandlinger.
- Det tilsigtede aggregerede benchmark mod andre klubber er ikke det samme som adgang til deres private rådata. Eksisterende tests af femsvarsgrænsen og adskillelse af pilot-/testdata indgår fortsat i den samlede suite.
- Næste end-to-end-kontrol bør gennemføres med to særskilte klubkonti og DMU-konto mod en separat testdatabase, inklusive direkte URL'er, eksport, formularer og udløbet login.

Kør igen: `npm test` og `npx tsc --noEmit`.
