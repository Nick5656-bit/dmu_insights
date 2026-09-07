# Pilotdrift og release — 7. september 2026

## Hvad er færdigt i koden?

- `Indstillinger → Pilotopsætning`: opret en klub og dens første administrator atomisk; opret en personlig DMU-administrator separat. Formularerne sender ingen velkomstmail og ændrer ikke eksisterende konti. Adgangskoder hashes, minimum 12 tegn, højst 72 UTF-8 bytes.
- Datatype vælges ved oprettelse: test eller pilot. DMU-dashboardet viser pilot som standard og har et synligt link til testdata. Eksporter mærkes TESTDATA/PILOTDATA. Klubbenchmark sammenligner kun klubber af samme datatype. Historik ændres ikke ved en senere omklassificering: UI tilbyder bevidst ikke at omdanne en testklub til en rigtig klub.
- Migrationen mærker kun den kendte seed-klub `Aarhus Motorsport Klub` som test, og kun hvis den er knyttet til `klub1@dmu.dk`. Andre klubber klassificeres ikke ved gæt. Hvis demo-klubben er omdøbt, skal den identificeres og klassificeres særskilt før analyse af pilotdata.
- `Indstillinger → Manuel udsendelse`: viser fælles mailkapacitet, invitationer, planlagte påmindelser, fejl og seneste systemkørsel. Vælg også allerede klargjorte udsendelser for at fortsætte deres ventende invitationer. Ingen automatisk genudsendelse af mails med ukendt leveringsstatus.

## Mailregler

Brevo Free har 300 mails om dagen. Platformens sikkerhedsgrænse er bevidst mere konservativ: højst 300 reserverede afsendelsesforsøg i et **rullende 24-timers vindue**, ikke en antagelse om Brevos nulstillingstidspunkt. Reservationen og invitationens claim gemmes i samme PostgreSQL-transaktion under en fælles lås. Invitationer, påmindelser, manuelle klik, cron og genforsøg deler denne grænse. Historiske mailforsøg fra versionen før migrationen tælles med i overgangsdøgnet. [Brevos Free-plan](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan).

- `MAIL_DAILY_LIMIT` er valgfri: standard 300, højere værdier begrænses til 300, 0 stopper nye afsendelser. Lavere værdier er nyttige til kontrolleret test/vedligeholdelse.
- Reservationer frigives ikke ved usikre fejl. Det kan reducere den praktiske kapacitet under 300 mails.
- Mails sendt direkte fra Brevo eller andre apps tæller hos Brevo, men kan ikke medregnes sikkert i platformens lokale tæller. Brug en konto uden anden udsendelsestrafik. Et særskilt API-key i samme konto giver ikke en særskilt kvote.
- Brevo-fejlkoden `not_enough_credits` og HTTP 402 sætter kontoen på pause i 24 timer; invitationen bliver i køen uden at opbruge sit antal genforsøg. Kendte konto-/adgangsfejl pauser også kontoen og kræver kontrol af indstillingerne. [Brevos fejlkoder](https://developers.brevo.com/docs/how-it-works).
- HTTP 429 genforsøges med stigende dagbaserede intervaller (maksimum fem initialforsøg, tre påmindelsesforsøg). Netværks-/timeout-/serverfejl med mulig accept behandles som ukendt leveringsstatus. Disse og afbrudte claims ældre end 15 minutter markeres til kontrol og sendes **ikke** automatisk igen. Kontrollér modtager, tidspunkt og emne i Brevo før en eventuel særskilt genudsendelse.
- Accepteret af Brevo betyder ikke nødvendigvis leveret til indbakken. Brevo kan stadig kølægge, afvise senere eller få en bounce. Der er ikke implementeret webhook-baseret endelig leveringsstatus.
- Nye invitationer prioriteres før påmindelser i den daglige kørsel. Ved vedvarende fuld kø kan påmindelser derfor blive sprunget over. Der planlægges højst én påmindelse pr. invitation, tidligst tre dage efter accept, kun hvis ubesvaret og der er mere end 24 timer til lukning.
- Udsendelser uden modtagere bliver planlagt og vises som ventende; en tom årlig medlemsliste markeres ikke fejlagtigt som afsendt.
- Når spørgeskemaet lukker, sendes resterende invitationer ikke. De får en forklaring om, at lukketiden blev nået, og påmindelser springes over. Lukketiden forlænges ikke automatisk.
- En manuel handling behandler **kun valgte udsendelser** og deres initialkø/genforsøg, aldrig påmindelser eller andre undersøgelser. En tom liste er en tom handling. Klargøring låser både survey og schedule, så også flere historiske schedules til samme survey ikke kan oprette samme modtagerliste flere gange.

## Tidspunkter og kapacitet

`vercel.json` bevarer én daglig kørsel med `0 16 * * *`. Vercel Hobby kan starte når som helst i timen 16–17 UTC, dvs. kl. 18–19 dansk sommertid / 17–18 vintertid. Et indtastet tidspunkt er **tidligst**, ikke et garanteret sendeminut. Oprettelsen kræver en lukketid efter næste forventede automatiske vindue. [Vercels cron-grænser](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Hver behandling arbejder i op til ca. fire minutter plus igangværende database/API-operationer; resten bliver i køen. API-kald har 20 sekunders timeout. Cron og manuelle sider har `maxDuration = 300`; kontrollér at Vercel-projektets runtime/Fluid Compute understøtter dette. Ved en tidligere platformsafbrydelse kræver igangværende mails kontrol, mens ubehandlede mails stadig er i køen.

Rullende kapacitet og daglig cron kan give ekstra forsinkelse: Hvis gårsdagens mails blev forsøgt senere i timen end dagens kørsel, er alle pladser ikke nødvendigvis ledige endnu. De vises med tidligst ny kapacitet, og kan behandles manuelt derefter eller ved en senere daglig kørsel. Planlæg små pilotbatches og flere svardage; antag ikke at 600 invitationer med påmindelser altid er færdige på to dage. Overvåg siden dagligt under piloten.

Vercel Hobby er til personlig, ikke-kommerciel brug. Afklar passende plan før organisatorisk drift hos DMU; koden foretager ingen opgradering. [Vercels vilkår for Hobby](https://vercel.com/docs/plans/hobby).

## Sikker release — procedure

Status 7. september: den additive migration er nu anvendt på den eksisterende database efter brugerens godkendelse af push/deploy. Schema-diff og bevarede dataantal er kontrolleret; demo-adgangen bevares. Der er ikke gennemført separat databasegeneralprøve eller backup/restore-test. Se releaseopdateringen i `pilot-readiness.md`; punkterne herunder er den fulde procedure før organisatorisk pilotdrift.

1. Udpeg et testmiljø med **egen database**, egne sessions-/tokenhemmeligheder og ingen produktions-Brevo-nøgle. Brug `MAIL_DAILY_LIMIT=0`, indtil en afgrænset mailtest er godkendt. Preview må ikke pege på produktionsdatabasen.
2. Tag en backup/snapshot før migrationen. Bekræft database/projekt-id og ansvarlig. Brug aldrig `npm run db:seed`, `prisma migrate reset` eller `db push` mod produktion. Seed-scriptet sletter data.
3. I det kontrollerede testmiljø: `npx prisma migrate deploy`, derefter `npx prisma generate`. Bekræft den præcise `DATABASE_URL`-destination sikkert uden at skrive URL/adgangskode i log eller chat.
4. Kør `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. Gennemfør derefter browser- og PostgreSQL-smoketests nedenfor. En build/test i hukommelsen dokumenterer ikke i sig selv live-databasens låse eller migrationsstatus.
5. Ved brugerens godkendte release: stop cron og aftal ingen manuelle sends under skiftet; lad eksisterende workers afslutte. Gennemfør den samme additive migration på den verificerede produktionsdatabase **før** den nye kode sættes live. Migration: `20260907_pilot_operations`. Den tilføjer `Club.isTest`, `MailLog.quotaTracked`, `MailSendReservation` og `MailSendControl`. Ingen konti eller svar slettes. Koden kan ikke bruges mod det gamle schema.
6. Push/deploy først efter migrations- og testkontrol. Build-scriptet kører kun `prisma generate`, ikke migrationen. Kontrollér nye sider, testmærkning og logins; test ét godkendt mailflow og den næste automatiske kørsel.
7. Ved rollback: behold de additive tabeller/felter og testklassifikation. Slet ikke kvotereservationer. En rollback til den gamle mailkode ophæver den nye kapacitetsbeskyttelse; stop cron og manuelle sends under en sådan rollback. `MAIL_DAILY_LIMIT=0` virker kun med den nye kode.

## Generalprøve i isoleret database

- Opret to testklubber og en pilotklub med syntetiske testpersoner. Opret personlige DMU-/klubkonti. Test login i et privat vindue; prøv klub A's login med klub B's URL og eksportparametre.
- Kontrollér standardpilotdashboard, testvisning, begge klubdashboards, samme skabelon/år og CSV. Testsvaret må aldrig indgå i pilotens benchmark.
- Lav 0, 1, 4 og 5 svar på skala-, valg- og tekstspørgsmål. Kontrollér rå netværksdata, ikke kun skjulte grafer. Afprøv segmenter og lås/kopiér allerede brugte spørgsmål/skabeloner.
- Brug en test-mailadapter, ikke rigtige modtagere, til 301+ køposter. Kør to samtidige behandlinger og dobbeltklik. Kun op til det fælles budget må få et API-forsøg. Genstart proces og kontroller persistent restkvote. Simulér en allerede behandlet schedule, tomt udvalg, to schedules til samme survey og en fejl midt i klargøringen.
- Simulér quota-fejl, 429, timeout og afbrudt worker efter accept. Kontrollér henholdsvis ventende genforsøg og manuel kontrol, aldrig automatisk dobbeltmail ved ukendt status.
- Luk en undersøgelse med mails i kø. Kontrollér forklaringen på ikke-afsendte invitationer. Afprøv allerede besvarede invitationer og påmindelser tæt på lukning.
- Opret to surveys på én eventliste; kun det ene passerer først 90-dagesfristen. Oprydningen må ikke fjerne deltagerlisten for det nyere survey. Den skal senere kunne fjerne listen, selv om det ældre surveys invitationer allerede er redigeret.

## Backup og restore-test — kræver ejerens adgang

Dokumentér valgt Neon-projekt, planens faktiske restore-vindue, snapshot/backupmetode, opbevaring, ansvarlig og seneste afprøvning. Disse oplysninger kan ikke udledes af koden eller en database-URL.

Tag et kontrolleret snapshot/backup og gendan til **en separat gren/database**, uden at erstatte den aktive database. Neon understøtter gendannelse til en ny gren for kontrol før aktivering. [Neons restore-workflow](https://neon.com/docs/ai/ai-database-versioning).

Forbind kun det isolerede testmiljø til kopien, uden aktiv mailnøgle/cron. Kontrollér tabelantal, relationer, et kendt skema og login. Notér dato, backup-id, resultat, tidsforbrug og ansvarlig. En gendannet invitation må ikke udløse en ny mail. Afstem sletninger foretaget siden backuppen før en eventuel rigtig gendannelse. Backupfiler og kopier med persondata skal adgangsbegrænses og må aldrig gemmes i Git.

## DMU skal afklare før rigtige deltagere

- Endelig dataansvarlig/kontakt, behandlingsgrundlag og information til deltagere, herunder eventuelle mindreårige.
- Godkendte slettefrister og ansvar for medlemsregister, ekstra kontaktadresser og brugerkonti. De slettes ikke af surveyets 90-dagesjob.
- Leverandøraftaler, relevante overførselsvurderinger og backupfrister. Den gamle mailpåstand om aldrig at dele oplysninger med tredjeparter er fjernet; den var misvisende med eksterne databehandlere.
- Offentlig privatlivstekst er stadig et udkast, ikke juridisk godkendt. Koden beskriver nu de faktiske mekanismer for invitationer, fælles deltagerlister, svar og fritekst mere præcist.
- Gennemfør separat sikkerhedsopdatering af afhængigheder. Fjern demo-adgang **til sidst**, efter personlige konti er oprettet/afprøvet og brugeren har godkendt det.

Ingen af disse eksterne godkendelser er markeret udført alene på baggrund af kodeændringerne.
