import type { Metadata } from "next";
import Link from "next/link";
import { DmuLogo } from "@/components/dmu-logo";
import { PII_RETENTION_DAYS, RESPONSE_RETENTION_YEARS } from "@/lib/data-retention";

export const metadata: Metadata = {
  title: "Privatliv | DMU Medlemsfeedback",
  description: "Information om behandling af personoplysninger i DMU Medlemsfeedback.",
};

export default function PrivacyPage() {
  const contactEmail = process.env.PRIVACY_CONTACT_EMAIL?.trim();

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-10">
      <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm sm:p-8">
        <DmuLogo compact />
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Privatliv</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sådan behandler DMU dine oplysninger</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Danmarks Motor Union (DMU) bruger dette system til at indsamle og analysere feedback efter arrangementer og i medlemsundersøgelser.
        </p>

        <div className="mt-8 space-y-7 text-sm leading-6 text-foreground">
          <section>
            <h2 className="text-lg font-semibold">Hvilke oplysninger behandles?</h2>
            <p className="mt-2 text-muted-foreground">
              Ved udsendelse behandles navn, e-mailadresse, arrangementstilknytning og teknisk status for invitationen. Dine survey-svar gemmes adskilt fra invitationsoplysningerne.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Formål og grundlag</h2>
            <p className="mt-2 text-muted-foreground">
              Formålet er at evaluere og forbedre arrangementer og medlemsoplevelser. DMU skal før offentlig ibrugtagning bekræfte det konkrete behandlingsgrundlag og databeskyttelsesansvarliges kontaktoplysninger.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Hvem kan se oplysningerne?</h2>
            <p className="mt-2 text-muted-foreground">
              Autoriserede DMU-administratorer håndterer udsendelser. Klubber ser kun aggregerede resultater, når anonymitetstærsklen er opfyldt. DMU anvender Neon til databasen, Vercel til hosting og Brevo til udsendelse af e-mail. De nødvendige databehandleraftaler og overførselsvurderinger skal være på plads før offentlig drift.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Trafikmåling og hastighed</h2>
            <p className="mt-2 text-muted-foreground">
              DMU bruger Vercel Web Analytics og Vercel Speed Insights til at se samlede tal for besøg, sidevisninger og tekniske hastighedsmål, så platformen kan forbedres. Personlige survey-links og selve besvarelsessiderne er udelukket fra begge målinger.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Opbevaring og sletning</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Navn, e-mail, deltagerlister og mailhistorik slettes eller anonymiseres {PII_RETENTION_DAYS} dage efter surveyets lukning.</li>
              <li>Survey-svar og aggregerede resultater slettes efter {RESPONSE_RETENTION_YEARS} år.</li>
              <li>Backups følger de dokumenterede opbevaringsperioder hos de valgte leverandører.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Dine rettigheder</h2>
            <p className="mt-2 text-muted-foreground">
              Du kan blandt andet bede om indsigt, rettelse eller sletning af dine personoplysninger og klage til Datatilsynet. Da svarene behandles adskilt fra invitationen, kan DMU ikke nødvendigvis finde eller ændre et enkelt svar.
            </p>
            <p className="mt-2 text-muted-foreground">
              {contactEmail ? (
                <>Kontakt DMU om personoplysninger på <a className="font-medium text-primary underline" href={`mailto:${contactEmail}`}>{contactEmail}</a>.</>
              ) : (
                <>Kontakt DMU gennem den officielle kontaktkanal og angiv, at henvendelsen handler om personoplysninger.</>
              )}
            </p>
          </section>
        </div>

        <Link href="/" className="mt-8 inline-flex rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
          Tilbage
        </Link>
      </section>
    </main>
  );
}
