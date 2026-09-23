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
      const heading = surveyType === "EVENT" && kind === "REMINDER"
        ? "Din oplevelse kan gøre en forskel" : "Vi vil gerne høre din mening";
      assert.match(header, new RegExp(`<h1 style="[^"]*color:#10244D[^"]*">${heading}</h1>`));
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

test("event invitations and reminders use the event title without internal prefixes", async (t) => {
  const originalKey = process.env.BREVO_API_KEY;
  process.env.BREVO_API_KEY = "test-only";
  t.after(() => {
    if (originalKey === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = originalKey;
  });
  const payloads: { subject: string; htmlContent: string; textContent: string }[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    payloads.push(JSON.parse(String(init.body)));
    return new Response("{}", { status: 201 });
  });
  const { sendSurveyInvitation } = loadTestModule<typeof Email>("src/lib/email.ts", {});
  for (const kind of ["INITIAL", "REMINDER"] as const) {
    for (const eventName of [undefined, "Jysk/Fynsk <mesterskab>\r\n2026"]) {
      await sendSurveyInvitation({ toEmail: "test@example.invalid", surveyName: "Event feedback - Sjællandsk Mesterskab", eventName, token: "test-token", surveyType: "EVENT", kind });
      const payload = payloads.at(-1)!;
      assert.doesNotMatch(JSON.stringify(payload), /Event feedback/);
      assert.doesNotMatch(payload.subject, /[\r\n]/);
      const expected = eventName ? "Jysk/Fynsk <mesterskab> 2026" : "Sjællandsk Mesterskab";
      if (kind === "REMINDER") {
        assert.equal(payload.subject, "Har du 2 minutter? Vi vil gerne høre om din oplevelse");
      } else {
        assert.ok(payload.subject.endsWith(expected));
      }
      assert.ok(payload.textContent.includes(expected));
      assert.ok(payload.htmlContent.includes(expected.replace("<", "&lt;").replace(">", "&gt;")));
    }
  }
  await sendSurveyInvitation({ toEmail: "test@example.invalid", surveyName: "Event feedback - Årlig måling", token: "test-token", surveyType: "ANNUAL" });
  assert.equal(payloads.at(-1)!.subject, "Din mening om Event feedback - Årlig måling");
});

test("event reminders use the approved positive copy in HTML and plain text only", async (t) => {
  const originalKey = process.env.BREVO_API_KEY;
  process.env.BREVO_API_KEY = "test-only";
  t.after(() => {
    if (originalKey === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = originalKey;
  });
  const payloads: { subject: string; htmlContent: string; textContent: string }[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    payloads.push(JSON.parse(String(init.body)));
    return new Response("{}", { status: 201 });
  });
  const { sendSurveyInvitation, sendSurveyReminder } = loadTestModule<typeof Email>("src/lib/email.ts", {});
  const params = { toEmail: "test@example.invalid", surveyName: "Event feedback - Test", eventName: "Løb <A>", token: "test-token" };
  await sendSurveyReminder({ ...params, surveyType: "EVENT" });
  const reminder = payloads.at(-1)!;
  for (const content of [reminder.htmlContent, reminder.textContent]) {
    assert.match(content, /Din oplevelse kan gøre en forskel/);
    assert.match(content, /Tak for sidst til/);
    assert.match(content, /Hvad skal vi have mere af, og hvad kunne godt bruge en kærlig hånd\?/);
    assert.match(content, /Dine input kan give idéer til udvikling af banen, faciliteterne og fællesskabet\./);
    assert.match(content, /Sammen laver vi mere end larm – vi løfter sporten\./);
    assert.match(content, /Del din oplevelse →/);
    assert.match(content, /Tak for hjælpen — vi sætter pris på din mening\./);
    assert.match(content, /survey\/test-token/);
    assert.match(content, /\/privacy/);
    assert.doesNotMatch(content, /venlig påmindelse|se bort fra|højst denne ene|Event feedback|Du har deltaget/);
  }
  assert.match(reminder.htmlContent, /Løb &lt;A&gt;/);
  assert.doesNotMatch(reminder.htmlContent, /Løb <A>/);
  assert.match(reminder.htmlContent, /2–3 minutter<\/strong>\.<\/p>\s*<p[^>]*>Sammen laver/);
  for (const surveyType of ["EVENT", "ANNUAL"] as const) {
    await sendSurveyInvitation({ ...params, surveyType });
    const initial = payloads.at(-1)!;
    assert.match(initial.htmlContent, /Vi vil gerne høre din mening/);
    assert.match(initial.htmlContent, /Besvar undersøgelsen →/);
    assert.doesNotMatch(initial.htmlContent + initial.textContent, /Sammen laver vi mere end larm|Tak for sidst/);
  }
  await sendSurveyReminder({ ...params, surveyType: "ANNUAL" });
  assert.match(payloads.at(-1)!.htmlContent, /venlig påmindelse/);
  assert.doesNotMatch(payloads.at(-1)!.htmlContent, /Tak for sidst|udvikling af banen/);
});
