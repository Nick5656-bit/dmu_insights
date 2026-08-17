import assert from "node:assert/strict";
import test from "node:test";
import { createSurveyToken, decryptSurveyToken, encryptSurveyToken, hashSurveyToken } from "./survey-token";

process.env.SURVEY_TOKEN_ENCRYPTION_KEY = "test-only-token-encryption-key";

test("a survey token survives encrypted storage without exposing its hash", () => {
  const token = createSurveyToken();
  const encrypted = encryptSurveyToken(token);

  assert.notEqual(encrypted, token);
  assert.equal(decryptSurveyToken(encrypted), token);
  assert.equal(hashSurveyToken(token), hashSurveyToken(token));
});

test("tampered encrypted survey tokens cannot be decrypted", () => {
  const parts = encryptSurveyToken(createSurveyToken()).split(".");
  parts[3] = `${parts[3].startsWith("A") ? "B" : "A"}${parts[3].slice(1)}`;

  assert.throws(() => decryptSurveyToken(parts.join(".")));
});

test("links encrypted with the fallback key remain retryable after a dedicated key is added", () => {
  delete process.env.SURVEY_TOKEN_ENCRYPTION_KEY;
  process.env.SESSION_SECRET = "test-session-secret";
  const token = createSurveyToken();
  const encryptedWithFallback = encryptSurveyToken(token);

  process.env.SURVEY_TOKEN_ENCRYPTION_KEY = "test-dedicated-token-key";
  assert.equal(decryptSurveyToken(encryptedWithFallback), token);
});
