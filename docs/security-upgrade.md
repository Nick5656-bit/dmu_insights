# Sikkerhedsopdatering — 7. september 2026

## Omfang og status

Opgave 1 er gennemført lokalt: relevante pakker er sikkerhedsopdateret og kontrolleret. Intet er pushet/deployet i denne opgave. Den aktive platform bruger fortsat den tidligere lockfil, indtil en ny release godkendes.

Ingen ændring af database, migrationsfiler, demokonti, rigtige brugere, mailopsætning eller produktionshemmeligheder. Der er ikke sendt mails eller kørt cron. Databaseadressen var en lokal dummyadresse under Prisma-validering, build og HTTP-test; mail var deaktiveret.

## Valgte versioner

| Pakke | Før | Efter |
| --- | --- | --- |
| Next.js / eslint-config-next | 16.1.6 | 16.3.4 |
| React / React DOM | 19.2.3 | 19.2.8 |
| Prisma CLI / Prisma Client | 6.16.2 | 6.19.3 |
| tsx | 4.21.0 | 4.23.13 |
| PostCSS | 8.5.8 | 8.5.23 |
| sharp | 0.34.5 | 0.35.4 |

Derudover er kompatible sikkerhedsrettelser til underafhængigheder indarbejdet i `package-lock.json`. Der er ikke brugt `npm audit fix --force`, Prisma-majoropgradering eller automatisk omskrivning af applikationskoden. Installationen kørte med `--ignore-scripts`; den nødvendige Prisma-klient blev efterfølgende genereret eksplicit.

Next.js 16.3.4 følger sikkerhedsudgivelsen 16.3.3 og indeholder den efterfølgende billedoptimeringsrettelse. Kilder: [sikkerhedsudgivelsen](https://nextjs.org/blog/august-2026-security-release), [16.3.4 release notes](https://github.com/vercel/next.js/releases/tag/v16.3.4).

### Afgrænset Prisma-override

Prisma 6.19.3 fastlåser fortsat `deepmerge-ts` til sårbar version 7.1.5. `package.json` indeholder derfor en versionsafgrænset override for `@prisma/config@6.19.3` til `deepmerge-ts@8.0.0`. Det lukker [GHSA-ggr8-5vv4-36mx](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx).

Version 8 ændrer blandt andet Map-fletning. Projektets Prisma-konfiguration bruger kun simple objekter/strenge for schema og migrationssti, ikke Maps eller de ændrede TypeScript-hjælpetyper. Den faktiske konfigurationsindlæsning er kontrolleret med `prisma generate`, `prisma validate` og produktionsbuild. Override skal genvurderes ved næste Prisma-opdatering; en fremtidig konfiguration med Maps kræver ny kontrol. [Breaking changes](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0).

## Kontrolresultater

- `npm audit`: fra 26 berørte pakker (19 high, 3 moderate, 4 low) til **0 kendte sårbarheder**, inklusive udviklingsafhængigheder. Dette er antal berørte pakker, ikke nødvendigvis unikke sikkerhedsfejl.
- `npm ci --dry-run --ignore-scripts --no-audit --no-fund`: bestået; manifest og lockfil kan afstemmes. Det er ikke en fuld ren Linux-installation.
- `prisma generate` og `prisma validate`: bestået med 6.19.3. Ingen migration eller databaseforbindelse.
- **55 automatiske tests bestået**, inklusive de eksisterende 53 tests og to nye sikkerheds-/kompatibilitetstests.
- De nye tests bruger den faktiske login-route med en databaseadapter i hukommelsen samt rigtig bcrypt/JWT-behandling: begge roller, login-cookie, ugyldig adgangskode, ugyldigt input, rate limit, tidligere HS256-tokenformat, udløbne og manipulerede tokens.
- `npx tsc --noEmit` og `npm run lint`: bestået.
- `npm run build`: bestået med Next.js 16.3.4; alle 39 statiske genereringstrin fuldført.
- Lokal HTTP-test af det færdige build: `/login`, `/privacy`, `/thank-you` og login-sidens CSS gav 200. DMU-/klubsider, pilotopsætning, skabeloner og udsendelsesside sendte anonyme besøgende til login. Eksport uden login gav 401. Testserveren var kun bundet til 127.0.0.1.

## Hvad dette ikke dokumenterer

En ren pakkeaudit er ikke en fuld sikkerhedsgodkendelse. Testene erstatter ikke den planlagte browser-/databasegeneralprøve i isoleret miljø, live mailtest, backup/restore eller kontrol af adgang mellem to rigtige pilotklubber. Der er ikke udført en fuld visuel browsertest efter opdateringen. Demo-adgang skal fortsat først lukkes efter brugerens godkendelse.

Ved næste release: deploy denne lockfil, kontrollér Vercels build og gentag den afgrænsede smoke-test. Ingen ny databasemigration er nødvendig for denne opdatering.
