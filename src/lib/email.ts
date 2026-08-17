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
  token: string;
};

export type SendSurveyInvitationResult =
  | { success: true }
  | { success: false; error: string; retryable: boolean };

export async function sendSurveyInvitation({
  toEmail,
  surveyName,
  token,
}: SendSurveyInvitationParams): Promise<SendSurveyInvitationResult> {
  const surveyUrl = `${getAppUrl()}/survey/${token}`;
  const privacyUrl = `${getAppUrl()}/privacy`;
  const safeSurveyName = escapeHtml(surveyName.replace(/[\r\n]+/g, " ").trim());
  const safeSurveyUrl = escapeHtml(surveyUrl);
  const safePrivacyUrl = escapeHtml(privacyUrl);
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
  <title>Din mening om ${safeSurveyName}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(145deg,#10244D,#243f7e);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;opacity:0.75;">Danmarks Motor Union</p>
              <h1 style="margin:8px 0 0;color:#ffffff;font-size:24px;font-weight:700;">Vi vil gerne høre din mening</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:40px;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;">
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;line-height:1.6;">
                Du har deltaget i <strong>${safeSurveyName}</strong>, og vi håber du havde en god oplevelse.
              </p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;line-height:1.6;">
                Vi vil meget gerne høre din feedback – det hjælper os med at gøre motorsport i Danmark endnu bedre for alle. Det tager kun <strong>2-3 minutter</strong>.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background:#10244D;border-radius:10px;">
                    <a href="${safeSurveyUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">
                      Besvar undersøgelsen →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Info box -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#f4f4f5;border-radius:10px;padding:16px 20px;">
                    <p style="margin:0;color:#71717a;font-size:13px;line-height:1.6;">
                      🔒 <strong>Dine svar behandles fortroligt.</strong> Invitationsoplysninger og svar behandles adskilt, og resultater vises kun samlet. Linket er personligt og kan kun bruges én gang.
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
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f4f4f5;border:1px solid #e4e4e7;border-top:none;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#a1a1aa;font-size:12px;line-height:1.6;">
                Denne mail er sendt via <strong>DMU's feedbacksystem</strong>.<br/>
                Dine oplysninger deles aldrig med tredjeparter.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `
Hej,

Du har deltaget i ${surveyName.replace(/[\r\n]+/g, " ").trim()}, og vi vil gerne høre din mening.

Besvar undersøgelsen her (tager 2-3 minutter):
${surveyUrl}

Dine svar behandles fortroligt, og resultater vises kun samlet. Linket kan kun bruges én gang.

Læs om behandling af dine oplysninger:
${privacyUrl}

Med venlig hilsen
Danmarks Motor Union
  `.trim();

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": getBrevoApiKey(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: toEmail }],
        subject: `Din mening om ${surveyName}`,
        htmlContent: html,
        textContent: text,
      }),
    });

    if (!response.ok) {
      // Do not retain Brevo's response body: it can contain personal information.
      console.error(`[email] Brevo fejl (HTTP ${response.status})`);
      return {
        success: false,
        error: `HTTP ${response.status}`,
        retryable: response.status === 429 || response.status >= 500,
      };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    console.error("[email] Uventet fejl ved afsendelse:", message);
    return {
      success: false,
      error: message,
      retryable: !message.includes("BREVO_API_KEY") && !message.includes("SMTP_FROM"),
    };
  }
}
