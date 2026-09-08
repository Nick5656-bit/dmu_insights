import assert from "node:assert/strict";
import test from "node:test";
import { findElements, loadTestModule } from "./test-module-loader";

const Widget = () => null;
test("public login keeps the login form and error messages but never advertises demo credentials", async () => {
  const page = loadTestModule<{ default: (props: { searchParams: Promise<{ error?: string }> }) => Promise<unknown> }>("src/app/login/page.tsx", {
    "next/image": Widget,
    "@/components/dmu-logo": { DmuLogo: Widget },
    "@/components/login-form": { LoginForm: Widget },
  });
  for (const error of [undefined, "invalid_credentials"]) {
    const tree = await page.default({ searchParams: Promise.resolve({ error }) });
    const output = JSON.stringify(tree);
    assert.doesNotMatch(output, /Demo-login|admin@dmu\.dk|klub1@dmu\.dk|demo1234|demo-token/);
    const form = findElements(tree, Widget).find(element => Object.hasOwn(element.props, "error"));
    assert.ok(form, "Normal login form remains available");
    assert.equal(form.props.error, error ? "Forkert e-mail eller adgangskode." : undefined);
  }
});
