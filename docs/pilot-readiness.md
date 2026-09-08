# Pilotklargøring — status 8. september 2026

## Release og nulstilling til afprøvning

Brugeren har nu godkendt push af sikkerhedsopdatering og adgangsrettelse. Tidligere bemærkninger om, at ændringerne ikke er pushet, beskriver status ved de respektive kontroller. Testindholdet er ryddet fra den tilknyttede database efter krypteret sikkerhedskopi; de to loginbrugere og testklubben er bevaret. Se [oprydningsrapporten](test-data-cleanup.md). Ingen migration er nødvendig for denne kode-release. Vercels release-status kontrolleres særskilt efter push.

## Seneste kontrol: adgang mellem klubber

20 nye automatiske adgangstests med to fiktive klubber består; samlet består 75 tests. Testene fandt en kalenderfejl ved manglende klubtilknytning, som efter brugerens godkendelse er rettet til at afvise adgang før databaseopslag. Normale klubkonti og DMU's adgang består de testede scenarier. Dette er **lokale ændringer, endnu ikke pushet/deployet**; ingen aktive data eller mails er ændret. Se [adgangstesten](club-access-check.md) for dækning og begrænsninger. Generalprøven med separat testdatabase og rigtige browser-sessioner udestår fortsat.

## Seneste kontrol: sikkerhedsopdatering

Opgave 1 er nu gennemført **lokalt, endnu ikke deployet**. Next.js, React, Prisma og relevante underafhængigheder er opdateret; `npm audit` finder 0 kendte sårbarheder. 55 tests, TypeScript, lint, Prisma-validering og produktionsbuild består. Lokal HTTP-kontrol af offentlige sider og adgangsafvisning består. Se [sikkerhedsopdateringen](security-upgrade.md) for versioner, den afgrænsede Prisma-override og resterende generalprøve. Tidligere punkter om udestående pakkeopdatering nedenfor er historisk status; testmiljø, backup/restore, organisatoriske godkendelser og udfasning af demo-adgang udestår fortsat.

## Releaseopdatering 7. september

Brugeren har godkendt push/deploy til afprøvning. Før push er migrationerne `20260904123000_add_survey_response_segments` og `20260907_pilot_operations` anvendt på projektets eksisterende Neon-database. Segmentfelterne fandtes allerede; den idempotente migration er nu også registreret i migrationshistorikken. Prisma schema-diff viser ingen forskelle efter migrationen.

Der var ingen aktive mailclaims eller klargøringer ved skiftet. Kontrol før/efter viste uændret 2 brugere, 15 besvarelser, 88 spørgsmålssvar og 5 invitationer. Aarhus Motorsport Klub er nu mærket som test. Demo-login er bevaret, og der er ikke sendt testmails eller startet cron manuelt. De 52 tests er genkørt og består. Vercels deployment af denne commit skal kontrolleres efter push.

Nedenstående leverancestatus beskriver de tidligere lokale kontroltrin. Separat databasegeneralprøve, backup/restore-test, personlige pilotkonti, sikkerhedsopdateringer og DMU's godkendelser udestår fortsat; denne publicering er til brugerens afprøvning, ikke en erklæring om fuld pilotgodkendelse.

## Leverance 1: kodeændringer, endnu ikke publiceret

- Resultater beregnes fælles for DMU, klub og CSV i `survey-results.ts` / `survey-results.server.ts`.
- Under fem gyldige, forskellige besvarelser af et spørgsmål giver ingen gennemsnit, fordeling, tekst eller præcist spørgsmålssvarantal i det serialiserede resultat.
- Besvarelsens id bruges kun på serveren til at undgå dobbeltoptælling. Ingen id'er eller tidsstempler følger med tekstsvar.
- Skala, enkeltvalg og alle tekstspørgsmål indgår, også lokale spørgsmål og historiske inaktive spørgsmål, hvis de har været i en undersøgelse.
- Klubbens svarprocent bruger sendte invitationer. Den er uden segmentfiltre, fordi invitationer ikke indeholder de selvrapporterede segmenter. Manglende/inkonsistent historisk invitationsgrundlag vises som `—`.
- Klubbens benchmark kræver en valgt undersøgelse og sammenligner samme spørgsmål, skabelon og udsendelsesår med andre klubber. Der kræves fem svar på begge sider.
- DMU's klubsammenligning kræver en skabelon, et år og mindst to valgte klubber. Det viste sammenligningsspørgsmål er navngivet. Kun klubber med mindst fem svar på spørgsmålet bidrager til benchmark.
- Spørgsmål med undersøgelsestilknytning eller svar kan ikke ændres/slettes. Kontrollen foretages igen i serverfunktionen under en transaktion med rækkelås. Kopiering ændrer ikke originalen.
- En brugt skabelons indhold låses også, fordi eksisterende undersøgelser læser dens afsnit. Den kan fortsat skjules/offentliggøres eller kopieres. En skabelonkopi genbruger spørgsmål: kopiér også spørgsmålet og udskift det i skabelonkopien, hvis ordlyden skal ændres.
- Deltagerens gemning validerer alle spørgsmål og segmenter, returnerer konkrete fejl og beholder indtastninger ved netværksfejl. Gentagne indsendelser håndteres af den eksisterende atomiske invitationskontrol.
- Automatisk fremrykning annulleres ved navigation og kan kun flytte det trin, som startede timeren.
- Medlemssidens bekræftelsesdialog håndteres på klientsiden med en serialiserbar tekst.
- Demo-login, konti, databaseindhold og udsendelsesopsætning er ikke ændret.

## Kontrol

Kør `npm test`, `npx tsc --noEmit`, `npm run lint` og `npm run build`.
Den første leverance er kontrolleret med 35 beståede tests samt TypeScript, lint og produktionsbuild. Buildet krævede netværksadgang til projektets eksisterende Google Fonts. Ingen databaseændring eller mailudsendelse indgik i testene.
Regressionstestene kører de faktiske servermoduler med eksplicitte databaseadaptere i hukommelsen; de må ikke forbinde til produktionsdatabasen eller sende mail.

Efter leverance 2: **52 tests bestået**, TypeScript, lint, Prisma-validering og produktionsbuild bestået (39 prerenderingstrin). `git diff --check` er ren. Schema/migration er ikke afprøvet mod en separat PostgreSQL-database eller anvendt på produktion; browser-generalprøve, maillevering og backup/restore skal derfor stadig kontrolleres efter den beskrevne releaseprocedure. Der er ikke pushet, deployet, oprettet rigtige konti eller sendt testmails i dette arbejde.

Efter publicering på et testmiljø kontrolleres også manuelt:

1. Log ind med begge roller. Vælg undersøgelse, alder, rolle og klasse. Kontrollér eksport mod de viste resultater.
2. Test spørgsmål med 0, 1, 4 og 5 gyldige svar; også et frivilligt spørgsmål med ét svar i en undersøgelse med fem indsendelser.
3. Kontrollér netværksdata: smågruppers svarværdier og tekst må ikke følge med, selv når grafen er skjult.
4. Kopiér et låst spørgsmål/en skabelon. Ændr kopien og kontrollér, at originalens undersøgelser ikke ændrer ordlyd, svarmuligheder eller afsnit.
5. Besvar på mobil og desktop. Dobbeltklik, vælg svar og tryk straks Næste/Tilbage, indsend med manglende svar, afbryd forbindelsen og prøv igen. Der må ikke oprettes to besvarelser for samme invitation.
6. Åbn medlemssiden med faktiske testmedlemmer, og kontrollér bekræftelse/annullering ved fjernelse.

Grænsen på fem er en grundbeskyttelse, ikke en garanti for matematisk anonymitet. Gentagne overlappende filtre, genkendelig fritekst og samme person i flere undersøgelser kan give mulighed for genkendelse. Besvarelserne indeholder bevidst ikke en stabil personidentitet til deduplikering på tværs af undersøgelser. DMU skal aftale, hvilke udsnit og fritekster der må deles.

## Leverance 2: implementeret lokalt (punkt 6 og teknisk del af 8)

- Persistent fælles 300-forsøgsgrænse over 24 timer, atomisk claim, køstatus, afgrænsede manuelle sends og synlig daglig tidsramme.
- Atomic klargøring med lås på survey/schedule; tomme modtagerlister forbliver ventende. Opbrugt kvote taber ikke invitationer.
- Ukendt leveringsstatus genudsendes ikke automatisk. Udløbne mails stoppes med forklaring.
- Ny pilotopsætningsside: klub + administrator samt personlig DMU-administrator. Demo-adgang bevares.
- Testklubber adskilles fra pilotresultater og benchmarks, inklusive eksport. Additiv migration forberedt; **ikke kørt mod produktion**.
- Privatlivstekst korrigeret til faktisk sletning, og delte eventlister slettes først efter alle tilknyttede surveys' frister.
- Se [drifts- og releasevejledning](pilot-operations.md) for implementeringsdetaljer, begrænsninger, migration, generalprøve, backup/restore og oplysninger, der stadig kræver DMU's godkendelse.

## Sidste trin før rigtige deltagere

- Sikkerhedsopdatér Next.js og relevante afhængigheder (ikke udført i denne leverance).
- Opret og afprøv personlige administratorlogins, og fjern/udfas derefter demo-adgang efter brugerens godkendelse.
- Generalprøve med to testklubber og kendte svarfordelinger, inklusive mindst fem svar i de segmenter, der skal demonstreres.
