import { createHmac } from "node:crypto";

// Bind a login to current credentials and privileges without exposing the bcrypt
// hash in the readable JWT. No database migration or encryption-key rotation.
export function sessionVersion(user: {
  id: string; passwordHash: string; role: string; clubId: string | null; email: string;
}) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured.");
  return createHmac("sha256", secret)
    .update(JSON.stringify(["session-version-v1", user.id, user.passwordHash, user.role, user.clubId, user.email]))
    .digest("hex");
}
