import { createHash, randomBytes } from "node:crypto";

/**
 * Survey links are bearer credentials: anybody holding one can submit once.
 * Store only a SHA-256 digest in the database and send the raw value by email.
 */
export function createSurveyToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSurveyToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
