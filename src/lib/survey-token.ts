import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

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

function getTokenEncryptionKey() {
  const keyMaterial = process.env.SURVEY_TOKEN_ENCRYPTION_KEY ?? process.env.SESSION_SECRET;

  if (!keyMaterial) {
    throw new Error("SURVEY_TOKEN_ENCRYPTION_KEY eller SESSION_SECRET er ikke konfigureret.");
  }

  // A SHA-256-derived key lets the environment variable be a normal high-entropy secret
  // instead of imposing an error-prone encoding requirement on administrators.
  return createHash("sha256").update(keyMaterial).digest();
}

/**
 * A retry must reuse the exact same personal link. The raw token is therefore stored
 * encrypted (AES-256-GCM), while the searchable token column remains a one-way hash.
 */
export function encryptSurveyToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getTokenEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return ["v1", iv.toString("base64url"), authTag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSurveyToken(ciphertext: string) {
  const [version, ivValue, authTagValue, encryptedValue] = ciphertext.split(".");

  if (version !== "v1" || !ivValue || !authTagValue || !encryptedValue) {
    throw new Error("Ugyldigt krypteret survey-token.");
  }

  const decipher = createDecipheriv("aes-256-gcm", getTokenEncryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
