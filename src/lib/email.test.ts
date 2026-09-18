import assert from "node:assert/strict";
import test from "node:test";
import { loadTestModule } from "./test-module-loader";
import type * as Email from "./email";

test("invitations and reminders use a readable, image-independent header", async (t) => {
  const originalKey = process.env.BREVO_API_KEY;
  process.env.BREVO_API_KEY = "test-only";
  t.after(() => {
    if (originalKey === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = originalKey;
  });
  const payloads: { htmlContent: string; textContent: string; to: { email: string }[] }[] = [];
  // Capture requests locally: never send test messages to Brevo.
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    payloads.push(JSON.parse(String(init.body)));
    return new Response("{}", { status: 201 });
  });
  const { sendSurveyInvitation } = loadTestModule<typeof Email>("src/lib/email.ts", {});
  for (const surveyType of ["ANNUAL", "EVENT"] as const) {
    for (const kind of ["INITIAL", "REMINDER"] as const) {
      assert.deepEqual(await sendSurveyInvitation({
        toEmail: "test@example.invalid", surveyName: "Test <løb>", token: "test-token", surveyType, kind,
      }), { success: true });
      const payload = payloads.at(-1)!;
      const header = payload.htmlContent.split("<!-- Header -->")[1].split("<!-- Body -->")[0];
      assert.match(header, /bgcolor="#ffffff"/);
      assert.match(header, /background-color:#ffffff/);
      assert.match(header, /<p style="[^"]*color:#10244D[^"]*">Danmarks Motor Union<\/p>/);
      assert.match(header, /<h1 style="[^"]*color:#10244D[^"]*">Vi vil gerne høre din mening<\/h1>/);
      assert.doesNotMatch(header, /gradient|url\(|opacity:|;color:#ffffff/i);
      assert.match(header, /<img src="https?:\/\/[^"\s]+\/dmu-logo\.png" alt="Danmarks Motor Union" width="132" height="63"/);
      assert.ok(header.indexOf("<img") > header.indexOf("</h1>"));
      assert.doesNotMatch(payload.htmlContent, /dmu-insights-logo|Har du spørgsmål, kan du kontakte os|mailto:/);
      assert.doesNotMatch(payload.textContent, /Har du spørgsmål, kan du kontakte os/);
      assert.match(payload.htmlContent, /Denne mail kan ikke besvares\./);
      assert.match(payload.textContent, /Denne mail kan ikke besvares\./);
      assert.match(payload.htmlContent, /Test &lt;løb&gt;/);
      assert.match(payload.htmlContent, /background:#10244D;border-radius:10px/);
      assert.match(payload.textContent, /survey\/test-token/);
      assert.deepEqual(payload.to, [{ email: "test@example.invalid" }]);
    }
  }
  assert.equal(payloads.length, 4);
});
