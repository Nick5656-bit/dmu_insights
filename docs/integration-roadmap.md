# DMU integrations-roadmap (produktion)

## Mål

Koble systemet til en autoritativ datakilde, der leverer:

- aktive klubber
- aktive medlemmer pr. klub
- e-mails pr. medlem
- segmentfelter (aldersgruppe, klasse, rolle)

Målet er, at klub- og medlemsdata ikke vedligeholdes manuelt i appen.

## Anbefalet integrationsmodel

- System-of-record: ekstern medlemsdatabase/CRM hos DMU
- Synkmodel: planlagt import (fx hver nat) + manuel "synk nu" i admin
- Metode: REST API eller SFTP/CSV afhængigt af DMU’s nuværende setup

## Datamapping (eksempel)

- externalClubId -> Club.id (nyt felt: externalId)
- clubName -> Club.name
- clubCity -> Club.city
- externalMemberId -> Member.id (nyt felt: externalId)
- memberEmail -> Member.email
- memberName -> Member.name
- ageSegment -> Member.ageGroup
- raceClass -> Member.raceClass
- role -> Member.memberRole
- activeFlag -> Member.active

## Foreslåede schema-udvidelser

- Club.externalId (unik, nullable)
- Member.externalId (unik, nullable)
- Member.lastSyncedAt
- SyncJob (id, source, startedAt, finishedAt, status, createdCount, updatedCount, errorCount)
- SyncIssue (id, syncJobId, entityType, externalId, reason)

## Synk-regler

- Upsert-klubber via externalId
- Upsert-medlemmer via externalId
- Hvis medlem ikke findes i feed: sæt active=false (soft deaktivering)
- E-mail valideres før import; ugyldige e-mails logges i SyncIssue
- Ingen sletning af historiske svar; kun deaktivering af medlemsprofil

## Drift og sikkerhed

- Adgang til datakilde via servicekonto
- Secrets i miljøvariabler
- Audit-log for hver synk
- Alarmer ved fejlrate over tærskel
- Retry-strategi på transient fejl

## API-kontrakt (minimum)

### Clubs endpoint

- externalId: string
- name: string
- city: string
- active: boolean

### Members endpoint

- externalId: string
- clubExternalId: string
- name: string
- email: string
- ageGroup: UNDER_18 | AGE_18_30 | AGE_31_50 | AGE_51_PLUS
- raceClass: MOTOCROSS | ENDURO | SPEEDWAY | TRIAL
- memberRole: RIDER | VOLUNTEER
- active: boolean

## Implementeringsfaser

1. Opret schemafelter + SyncJob tabeller
2. Byg importservice og mappinglag
3. Byg admin-side: "Dataintegration" (seneste synk, fejl, kør synk)
4. Pilot med én klub + datavalidering
5. Udrulning til alle klubber

## Afklaringer med DMU før udvikling

- Hvad er system-of-record for medlemmer og klubber?
- Hvor ofte skal data være opdateret?
- Hvem ejer datakvalitet ved fejl i kilde?
- Skal der være near-real-time eller er daglig synk nok?
- Hvem må trigge manuel synk?
