# Skabelonoprettelse – 16. september 2026

## Rettelse

- Den løsrevne submitknap med permanent lokal loading-state er fjernet. Oprettelsen har nu én formular og spinneren følger den faktiske serverhandling.
- Valideringsfejl, afvist adgang og fejl ved gemning/forbindelse vises i formularen. Indtastninger og valgte spørgsmål bevares. En langsom handling får en status efter 15 sekunder, ikke en falsk bekræftelse eller automatisk genafsendelse.
- Formularen bruger eksplicit submit med useActionState, så Reacts automatiske form-reset ikke fjerner synlige afkrydsninger efter et fejlresultat.
- Spørgsmålsfilteret er lokalt og bevarer både indtastninger og valg på tværs af kategorier. Den valgte spørgsmålsrækkefølge følger spørgsmålsbankens visningsrækkefølge.
- Navn kræver mindst tre tegn, beskrivelse må ikke være blank, og mindst ét aktivt standardspørgsmål skal vælges. Utilgængelige/ikke-standardspørgsmål afvises i stedet for tavst at blive udeladt.
- Skabelon, spørgsmål og layout oprettes i én atomisk Prisma nested write. Formularens UUID genbruges ved retry og bruges som primærnøgle, så et tabt svar eller samtidig afsendelse ikke opretter dubletter. Et nyt UUID bruges efter bekræftet succes.
- Skabelonen oprettes som ikke-offentliggjort. Succes navigerer fortsat til `?created=...`, hvor den eksisterende markering/scroll bruges.

## Kontrol

- 85 automatiske tests bestået, inklusive fem nye tests af den faktiske oprettelseshandling med isolerede databaseadaptere: validering, atomisk payload/rækkefølge, retries/samtidighed, databasefejl og adgang/spørgsmålsvalg.
- Typekontrol, lint på ændrede filer og produktionsbuild med VERCEL=1 bestået. Build brugte en dummy-databaseadresse og deaktiveret mail.
- Faktisk React-formular afprøvet i browser med simuleret server via `node scripts/preview-template-form.mjs`: spinner/disabled, serverfejl, netværksfejl, bevarede inputs og afkrydsninger, filter og succes/nulstilling/navigation.
- Testserveren binder kun til 127.0.0.1 og har ingen database-, login- eller mailforbindelse. Browserprøven er ikke en fuld produktionsoprettelse.
- Ingen produktionsskabeloner eller testmails blev oprettet under rettelsen; brugerens spørgsmål er ikke ændret.
