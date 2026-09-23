import { mailFailure } from "@/lib/mail-policy";

const getBrevoApiKey = () => {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    throw new Error("BREVO_API_KEY er ikke konfigureret.");
  }
  return key;
};

const getAppUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const getFromAddress = () =>
  process.env.SMTP_FROM ?? "DMU Feedback <noreply@dmu.dk>";

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);

export type SendSurveyInvitationParams = {
  toEmail: string;
  surveyName: string;
  eventName?: string;
  token: string;
  kind?: "INITIAL" | "REMINDER";
  surveyType?: "ANNUAL" | "EVENT";
};

export type SendSurveyInvitationResult =
  | { success: true }
  | { success: false; error: string; retryable: boolean; quotaBlocked?: boolean; accountBlocked?: boolean; uncertain?: boolean };

export async function sendSurveyInvitation({
  toEmail,
  surveyName,
  eventName,
  token,
  kind = "INITIAL",
  surveyType = "EVENT",
}: SendSurveyInvitationParams): Promise<SendSurveyInvitationResult> {
  const surveyUrl = `${getAppUrl()}/survey/${token}`;
  const privacyUrl = `${getAppUrl()}/privacy`;
  // Prefer the actual event title. The fallback also fixes existing queued
  // invitations/reminders whose internal survey name includes this prefix.
  const displayName = surveyType === "EVENT"
    ? eventName ?? surveyName.trim().replace(/^Event feedback\s*[-–—]\s*/i, "")
    : surveyName;
  const cleanSurveyName = displayName.replace(/[\r\n]+/g, " ").trim();
  const safeSurveyName = escapeHtml(cleanSurveyName);
  const safeSurveyUrl = escapeHtml(surveyUrl);
  const safePrivacyUrl = escapeHtml(privacyUrl);
  const safeLogoUrl = escapeHtml(`${getAppUrl().replace(/\/$/, "")}/dmu-logo.png`);
  const isReminder = kind === "REMINDER";
  const isEventReminder = isReminder && surveyType === "EVENT";
  const subject = isEventReminder
    ? "Har du 2 minutter? Vi vil gerne høre om din oplevelse"
    : `${isReminder ? "Påmindelse: " : ""}Din mening om ${cleanSurveyName}`;
  const heading = isEventReminder ? "Din oplevelse kan gøre en forskel" : "Vi vil gerne høre din mening";
  const buttonLabel = isEventReminder ? "Del din oplevelse →" : "Besvar undersøgelsen →";
  const reminderNotice = isReminder && !isEventReminder
    ? '<p style="margin:0 0 16px;color:#3f3f46;font-size:15px;line-height:1.6;"><strong>Dette er en venlig påmindelse.</strong> Du modtager højst denne ene påmindelse, og du kan se bort fra mailen, hvis du allerede har svaret.</p>'
    : "";
  const fromRaw = getFromAddress();

  // Parse "Navn <email@domane.dk>" format
  const fromMatch = fromRaw.match(/^(.*?)\s*<(.+?)>$/);
  const senderName = fromMatch ? fromMatch[1].trim() : "DMU Feedback";
  const senderEmail = fromMatch ? fromMatch[2].trim() : fromRaw;

  const html = `
<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #e4e4e7;border-bottom:0;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
              <p style="margin:0;color:#10244D;font-size:13px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;">Danmarks Motor Union</p>
              <h1 style="margin:8px 0 0;color:#10244D;font-size:24px;font-weight:700;">${heading}</h1>
              <img src="${safeLogoUrl}" alt="Danmarks Motor Union" width="132" height="63" style="display:block;width:132px;max-width:100%;height:auto;margin:20px auto 0;border:0;color:#10244D;font-size:12px;" />
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:40px;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;">
              ${isEventReminder ? `
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;line-height:1.6;">Tak for sidst til <strong>${safeSurveyName}</strong>!</p>
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;line-height:1.6;">Vi håber, du har lyst til at fortælle lidt om din dag. Hvad skal vi have mere af, og hvad kunne godt bruge en kærlig hånd?</p>
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;line-height:1.6;">Når du deler din oplevelse, hjælper du klubben med at prioritere det, der betyder noget for dig og de andre deltagere. Dine input kan give idéer til udvikling af banen, faciliteterne og fællesskabet. På den måde er du med til at udvikle motorsporten i Danmark.</p>
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;line-height:1.6;">Spørgeskemaet tager kun <strong>2–3 minutter</strong>.</p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;line-height:1.6;">Sammen laver vi mere end larm – vi løfter sporten.</p>
              ` : `${reminderNotice}
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;line-height:1.6;">
                ${surveyType === "ANNUAL" ? `Vi inviterer dig til <strong>${safeSurveyName}</strong> om dit medlemskab og din klub.` : `Du har deltaget i <strong>${safeSurveyName}</strong>, og vi håber du havde en god oplevelse.`}
              </p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;line-height:1.6;">
                Vi vil meget gerne høre din feedback – det hjælper os med at gøre motorsport i Danmark endnu bedre for alle. Det tager kun <strong>2-3 minutter</strong>.
              </p>
              `}

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background:#10244D;border-radius:10px;">
                    <a href="${safeSurveyUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">
                      ${buttonLabel}
                    </a>
                  </td>
                </tr>
              </table>

              ${isEventReminder ? '<p style="margin:0 0 24px;color:#3f3f46;font-size:15px;line-height:1.6;">Tak for hjælpen — vi sætter pris på din mening.</p>' : ""}

              <!-- Info box -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#f4f4f5;border-radius:10px;padding:16px 20px;">
                    <p style="margin:0;color:#71717a;font-size:13px;line-height:1.6;">
                      <strong>Dine svar behandles fortroligt.</strong> Invitationsoplysninger og svar behandles adskilt, og resultater vises kun samlet. Linket er personligt og kan kun bruges én gang.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;color:#a1a1aa;font-size:13px;">
                Kan du ikke klikke på knappen? Kopiér dette link ind i din browser:<br/>
                <span style="color:#10244D;word-break:break-all;">${safeSurveyUrl}</span>
              </p>
              <p style="margin:16px 0 0;color:#71717a;font-size:13px;line-height:1.6;">
                Læs om behandling af dine oplysninger: <a href="${safePrivacyUrl}" style="color:#10244D;">${safePrivacyUrl}</a>
              </p>
              <p style="margin:16px 0 0;color:#71717a;font-size:13px;line-height:1.6;">
                Denne mail kan ikke besvares.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f4f4f5;border:1px solid #e4e4e7;border-top:none;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#a1a1aa;font-size:12px;line-height:1.6;">
                Denne mail er sendt via <strong>DMU's feedbacksystem</strong>.<br/>
                Læs om behandling af dine oplysninger via privatlivslinket ovenfor.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = isEventReminder ? `
Danmarks Motor Union

Din oplevelse kan gøre en forskel

Tak for sidst til ${cleanSurveyName}!

Vi håber, du har lyst til at fortælle lidt om din dag. Hvad skal vi have mere af, og hvad kunne godt bruge en kærlig hånd?

Når du deler din oplevelse, hjælper du klubben med at prioritere det, der betyder noget for dig og de andre deltagere. Dine input kan give idéer til udvikling af banen, faciliteterne og fællesskabet. På den måde er du med til at udvikle motorsporten i Danmark.

Spørgeskemaet tager kun 2–3 minutter.

Sammen laver vi mere end larm – vi løfter sporten.

Del din oplevelse →
${surveyUrl}

Tak for hjælpen — vi sætter pris på din mening.

Dine svar behandles fortroligt, og resultater vises kun samlet. Linket er personligt og kan kun bruges én gang.

Læs om behandling af dine oplysninger:
${privacyUrl}

Denne mail kan ikke besvares.
  `.trim() : `
Hej,

${isReminder ? "Dette er en venlig påmindelse. Du kan se bort fra mailen, hvis du allerede har svaret.\n" : ""}

${surveyType === "ANNUAL" ? `Vi inviterer dig til ${cleanSurveyName} om dit medlemskab og din klub.` : `Du har deltaget i ${cleanSurveyName}, og vi vil gerne høre din mening.`}

Besvar undersøgelsen her (tager 2-3 minutter):
${surveyUrl}

Dine svar behandles fortroligt, og resultater vises kun samlet. Linket kan kun bruges én gang.

Læs om behandling af dine oplysninger:
${privacyUrl}

Denne mail kan ikke besvares.

Med venlig hilsen
Danmarks Motor Union
  `.trim();

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "api-key": getBrevoApiKey(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: toEmail }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });

    if (!response.ok) {
      // Inspect only the machine-readable code; never retain provider messages or recipient data.
      const body: unknown = await response.json().catch(() => null);
      const code = body && typeof body === "object" && "code" in body ? body.code : undefined;
      const failure = mailFailure(response.status, code);
      console.error(`[email] Brevo fejl (HTTP ${response.status})`);
      return {
        success: false,
        error: failure.uncertain
          ? "Ukendt leveringsstatus. Kontrollér Brevo før eventuel genudsendelse."
          : `Brevo HTTP ${response.status}${failure.quotaBlocked ? ": mailkvote opbrugt" : failure.accountBlocked ? ": kontoen kræver kontrol" : ""}`,
        ...failure,
      };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    console.error("[email] Afsendelsen kunne ikke bekræftes.");
    return {
      success: false,
      error: message.includes("BREVO_API_KEY") ? "BREVO_API_KEY mangler. Kontrollér konfigurationen." : "Ukendt leveringsstatus. Kontrollér Brevo før eventuel genudsendelse.",
      retryable: message.includes("BREVO_API_KEY"),
      accountBlocked: message.includes("BREVO_API_KEY"),
      uncertain: !message.includes("BREVO_API_KEY"),
    };
  }
}

export function sendSurveyReminder(params: Omit<SendSurveyInvitationParams, "kind">) {
  return sendSurveyInvitation({ ...params, kind: "REMINDER" });
}
