# Oprydning før ny afprøvning — 8. september 2026

## Efterfølgende kluboprydning

Efter særskilt brugerønske blev den tomme Aarhus Motorsport Klub og dens klubadministrator også slettet. Før sletning blev relationstællere kontrolleret igen (alle indholdsrelationer 0), og begge slettede rækker blev krypteret med samme backupformat som nedenfor i `.local-backups/test-club-2026-09-08T08-30-24-883Z.json.enc`. Denne kopi indeholder også klubbrugerens password-hash og må ikke deles eller lægges i Git. Dekryptering er verificeret før sletning.

Efter transaktionen: 0 klubber og 1 bruger. Den eksisterende DMU-testadministrator er verificeret uændret. Ingen officiel DMU-administrator er oprettet. Den offentlige demo-loginboks og døde demo-surveylink er fjernet i koden; denne efterfølgende kodeændring er ikke pushet/deployet endnu. At skjule loginoplysninger deaktiverer ikke den bevarede DMU-testkonto. Allerede udstedte sessions bruger fortsat deres normale udløbstid; sessionmekanismen er ikke ændret i denne oprydning.

## Kodeudgivelse

Ændringerne blev pushet i `b946d69`. Vercels første build fejlede med `ENOENT .next/next-server.js.nft.json`, selv om lokal build bestod. Det matcher [Next.js #96646](https://github.com/vercel/next.js/issues/96646): Next.js 16.3's Vercel-adapter kombineret med `output: standalone`. Opfølgende rettelse slår kun standalone-output fra, når `VERCEL=1`; lokale/selvhostede builds bevarer det. Ingen sikkerhedsopdatering rulles tilbage. Datarydningen var allerede gennemført og er uafhængig af denne buildfejl.

Brugeren godkendte at fjerne alle tidligere testdata, alle skabeloner/begivenheder og også hele spørgsmålsbanken. Brugere og testklub skulle bevares til fortsat afprøvning.

## Udført på den tilknyttede database

Kontrolleret før sletning: én klub (Aarhus Motorsport Klub), markeret som test, to brugere og ingen igangværende mailafsendelser/klargøringer eller systemjobs. Der var ingen nyere, ikke-kvoteregistrerede mails, som ville miste deres plads i 24-timersgrænsen ved sletning.

Slettet i én transaktion med tabel-låse, verificeret sletteplan og kontrollerede antal:

| Indhold | Antal |
| --- | ---: |
| Skabeloner | 8 |
| Spørgeskemaudsendelser | 7 |
| Begivenheder | 7 |
| Spørgsmål / svarmuligheder | 10 / 14 |
| Besvarelser / enkelte spørgsmålssvar | 15 / 88 |
| Invitationer / mailhistorik | 5 / 5 |
| Planlagte udsendelser | 7 |
| Deltagere / testmedlemmer | 5 / 5 |
| Skabelon-spørgsmålsrelationer / udsendelses-spørgsmålsrelationer | 40 / 40 |

Alle disse indholdstabeller er efterkontrolleret tomme. To brugere og én testklub er bevaret. Loginbeskyttelse, systemjobhistorik, mailkvoter/-kontrol og databasens struktur er ikke nulstillet. Der er ikke sendt mails eller kørt seed/migration.

## Sikkerhedskopi og gendannelse

Før sletningen blev alle slettede rækker gemt krypteret i `.local-backups/test-cleanup-2026-09-08T08-10-46-428Z.json.enc`. Mappen er udelukket fra Git. Filen indeholder ikke brugernes adgangskode-hashes; brugere slettes ikke.

Kryptering: AES-256-GCM med tilfældig salt/IV, scrypt-nøgle fra den daværende `SESSION_SECRET`. Den samme hemmelighed skal bevares sikkert for at kunne dekryptere kopien. Hemmeligheden er ikke skrevet i denne dokumentation eller backupfilen.

Den gemte fil er læst tilbage, dekrypteret og sammenlignet byte-for-byte med eksporten før sletning. En fuld gendannelse til separat database er **ikke** afprøvet. Dette er en kopi af oprydningens data, ikke en komplet driftsbackup eller erstatning for Neon-backup/restore.

Ved behov for gendannelse: anvend en separat database først, kontrollér databasefingeraftryk og de bevarede bruger-/klub-id'er, og genindsæt rækker i omvendt rækkefølge af sletningen med oprindelige id'er og korrekt DateTime-konvertering. Kontroller planlagte udsendelser/invitationer før en eventuel live-gendannelse, så gamle testmails ikke udsendes.

`scripts/clear-pilot-test-data.mjs` er et separat engangsværktøj. Standardkørsel er kun læsning. Sletning kræver `--apply` og et nyt eksakt planfingeraftryk; værktøjet afviser ændret klub-/brugeropsætning og aktive mailjobs. Det kører aldrig som del af build eller deployment.
