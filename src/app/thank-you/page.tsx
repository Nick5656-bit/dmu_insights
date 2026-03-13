import { DmuLogo } from "@/components/dmu-logo";

export default function ThankYouPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-10">
      <section className="w-full rounded-xl border bg-background p-6 text-center">
        <div className="mb-4 flex justify-center">
          <DmuLogo compact />
        </div>
        <h1 className="text-2xl font-semibold">Tak for dit svar</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Din besvarelse er modtaget anonymt.
        </p>
      </section>
    </div>
  );
}
