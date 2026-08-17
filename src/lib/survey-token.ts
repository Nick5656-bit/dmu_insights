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

function getTokenEncryptionKeys() {
  const keyMaterials = [process.env.SURVEY_TOKEN_ENCRYPTION_KEY, process.env.SESSION_SECRET].filter(
    (value): value is string => Boolean(value)
  );

  if (keyMaterials.length === 0) {
    throw new Error("SURVEY_TOKEN_ENCRYPTION_KEY eller SESSION_SECRET er ikke konfigureret.");
  }

  // A SHA-256-derived key lets the environment variable be a normal high-entropy secret
  // instead of imposing an error-prone encoding requirement on administrators.
  return [...new Set(keyMaterials)].map((keyMaterial) => createHash("sha256").update(keyMaterial).digest());
}

/**
 * A retry must reuse the exact same personal link. The raw token is therefore stored
 * encrypted (AES-256-GCM), while the searchable token column remains a one-way hash.
 */
export function encryptSurveyToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getTokenEncryptionKeys()[0], iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return ["v1", iv.toString("base64url"), authTag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSurveyToken(ciphertext: string) {
  const [version, ivValue, authTagValue, encryptedValue] = ciphertext.split(".");

  if (version !== "v1" || !ivValue || !authTagValue || !encryptedValue) {
    throw new Error("Ugyldigt krypteret survey-token.");
  }

  for (const key of getTokenEncryptionKeys()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
      decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));

      return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      // A previously encrypted invitation may use SESSION_SECRET as its fallback key.
    }
  }

  throw new Error("Krypteret survey-token kunne ikke dekrypteres.");
}
