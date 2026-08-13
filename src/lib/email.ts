import { Resend } from "resend";

const getResend = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY er ikke konfigureret.");
  }
  return new Resend(apiKey);
};

const getAppUrl = () => {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
};

const getFromAddress = () => {
  return process.env.SMTP_FROM ?? "DMU Feedback <noreply@resend.dev>";
};

export type SendSurveyInvitationParams = {
  toEmail: string;
  surveyName: string;
  token: string;
};

export async function sendSurveyInvitation({
  toEmail,
  surveyName,
  token,
}: SendSurveyInvitationParams): Promise<{ success: boolean; error?: string }> {
  const surveyUrl = `${getAppUrl()}/survey/${token}`;

  const html = `
<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Du er inviteret til at give din mening</title>
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
                Du har deltaget i <strong>${surveyName}</strong>, og vi håber du havde en god oplevelse.
              </p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;line-height:1.6;">
                Vi vil meget gerne høre din feedback – det hjælper os med at gøre motorsport i Danmark endnu bedre for alle. Det tager kun <strong>2-3 minutter</strong>.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background:#10244D;border-radius:10px;padding:0;">
                    <a href="${surveyUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">
                      Besvar undersøgelsen →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Info boxes -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#f4f4f5;border-radius:10px;padding:16px 20px;">
                    <p style="margin:0;color:#71717a;font-size:13px;line-height:1.6;">
                      🔒 <strong>Dine svar er 100% anonyme.</strong> Vi kan ikke se hvem der har svaret hvad – heller ikke DMU. Linket er personligt og kan kun bruges én gang.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;color:#a1a1aa;font-size:13px;">
                Kan du ikke klikke på knappen? Kopiér dette link ind i din browser:<br/>
                <span style="color:#10244D;word-break:break-all;">${surveyUrl}</span>
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

Du har deltaget i ${surveyName}, og vi vil gerne høre din mening.

Besvar undersøgelsen her (tager 2-3 minutter):
${surveyUrl}

Dine svar er 100% anonyme. Linket kan kun bruges én gang.

Med venlig hilsen
Danmarks Motor Union
  `.trim();

  try {
    const resend = getResend();
    const { error } = await resend.emails.send({
      from: getFromAddress(),
      to: toEmail,
      subject: `Din mening om ${surveyName}`,
      html,
      text,
    });

    if (error) {
      console.error(`[email] Fejl ved afsendelse til ${toEmail}:`, error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ukendt fejl";
    console.error(`[email] Uventet fejl ved afsendelse til ${toEmail}:`, message);
    return { success: false, error: message };
  }
}
