// One-off, explicitly approved cleanup. Read-only unless --apply --confirm=<plan hash>.
// Does not run at build/deploy and never seeds or deletes users/clubs.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes, scryptSync, createCipheriv, createDecipheriv } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";

const TEST_CLUB_ID = "cmsralxmz00014w34nep1t5xh";
const tables = [
  ["surveyAnswer", "SurveyAnswer"], ["surveyResponse", "SurveyResponse"],
  ["mailLog", "MailLog"], ["surveyInvitation", "SurveyInvitation"],
  ["scheduledSend", "ScheduledSend"], ["surveyInstanceQuestion", "SurveyInstanceQuestion"],
  ["surveyInstance", "SurveyInstance"], ["eventParticipant", "EventParticipant"],
  ["event", "Event"], ["surveyTemplateQuestion", "SurveyTemplateQuestion"],
  ["surveyTemplate", "SurveyTemplate"], ["questionOption", "QuestionOption"],
  ["question", "Question"], ["clubExtraEmail", "ClubExtraEmail"], ["member", "Member"],
];
const apply = process.argv.includes("--apply");
const confirmation = process.argv.find(arg => arg.startsWith("--confirm="))?.slice(10);
const prisma = new PrismaClient();
const hash = value => createHash("sha256").update(value).digest("hex");

function protectBackup(snapshot) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error("BACKUP_SECRET_REQUIRED");
  const plaintext = JSON.stringify(snapshot);
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const key = scryptSync(process.env.SESSION_SECRET, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const envelope = { version: 1, cipher: "aes-256-gcm", kdf: "scrypt", salt: salt.toString("base64"),
    iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: ciphertext.toString("base64") };
  const directory = path.resolve(".local-backups");
  mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, `test-cleanup-${new Date().toISOString().replace(/[:.]/g, "-")}.json.enc`);
  writeFileSync(filename, JSON.stringify(envelope), { flag: "wx", mode: 0o600 });
  const saved = JSON.parse(readFileSync(filename, "utf8"));
  const decipher = createDecipheriv("aes-256-gcm", scryptSync(process.env.SESSION_SECRET, Buffer.from(saved.salt, "base64"), 32), Buffer.from(saved.iv, "base64"));
  decipher.setAuthTag(Buffer.from(saved.tag, "base64"));
  const restored = Buffer.concat([decipher.update(Buffer.from(saved.data, "base64")), decipher.final()]).toString("utf8");
  if (restored !== plaintext) throw new Error("BACKUP_VERIFICATION_FAILED");
  return filename;
}

try {
  const result = await prisma.$transaction(async tx => {
    if (apply) {
      // Fixed schema identifiers only. Block writes/claims while verifying, backing up
      // and deleting, so a cron worker cannot send a deleted invitation concurrently.
      const lockedTables = [...tables.map(([, table]) => table), "User", "Club", "SystemJobRun", "MailSendReservation", "MailSendControl"];
      await tx.$executeRawUnsafe(`LOCK TABLE ${lockedTables.map(table => `"${table}"`).join(", ")} IN SHARE ROW EXCLUSIVE MODE`);
    }
    const clubs = await tx.club.findMany({ orderBy: { id: "asc" } });
    const users = await tx.user.findMany({ orderBy: { id: "asc" }, select: { id: true, role: true, clubId: true } });
    if (clubs.length !== 1 || clubs[0].id !== TEST_CLUB_ID || !clubs[0].isTest || users.length !== 2) throw new Error("EXPECTED_TEST_ENVIRONMENT_CHANGED");
    const data = {};
    for (const [model] of tables) data[model] = await tx[model].findMany({ orderBy: { id: "asc" } });
    for (const model of ["surveyInstance", "event", "surveyResponse", "member", "clubExtraEmail"]) {
      if (data[model].some(row => row.clubId !== TEST_CLUB_ID)) throw new Error("FOREIGN_CLUB_DATA_FOUND");
    }
    if (data.question.some(row => row.createdByClubId && row.createdByClubId !== TEST_CLUB_ID)) throw new Error("FOREIGN_QUESTION_FOUND");
    if (data.surveyInvitation.some(row => row.deliveryStatus === "SENDING" || row.reminderStatus === "SENDING") ||
      data.scheduledSend.some(row => row.processingStartedAt) ||
      await tx.systemJobRun.count({ where: { status: "RUNNING" } })) throw new Error("MAIL_WORKER_ACTIVE");
    // Removing old logs must never reset the actual rolling mail allowance.
    if (data.mailLog.some(row => !row.quotaTracked && row.sentAt > new Date(Date.now() - 86400000))) throw new Error("RECENT_LEGACY_MAIL_BUDGET_MUST_BE_PRESERVED");
    const url = new URL(process.env.DATABASE_URL);
    const databaseFingerprint = hash(`${url.hostname}${url.pathname}`);
    const plan = hash(JSON.stringify({ databaseFingerprint, clubs, users, data }));
    const counts = Object.fromEntries(tables.map(([model]) => [model, data[model].length]));
    if (!apply) return { mode: "read-only", plan, counts, preserved: { users: users.length, clubs: clubs.length } };
    if (confirmation !== plan) throw new Error("PLAN_CHANGED_OR_NOT_CONFIRMED");
    const backup = protectBackup({ version: 1, createdAt: new Date().toISOString(), databaseFingerprint, plan, preserved: { clubs, users }, data });
    const deleted = {};
    for (const [model] of tables) {
      const ids = data[model].map(row => row.id);
      deleted[model] = (await tx[model].deleteMany({ where: { id: { in: ids } } })).count;
      if (deleted[model] !== ids.length) throw new Error("DELETE_COUNT_MISMATCH");
    }
    for (const [model] of tables) if (await tx[model].count()) throw new Error("CLEANUP_NOT_EMPTY");
    const remainingUsers = await tx.user.findMany({ orderBy: { id: "asc" }, select: { id: true, role: true, clubId: true } });
    if (JSON.stringify(remainingUsers) !== JSON.stringify(users) || await tx.club.count() !== clubs.length) throw new Error("PRESERVED_DATA_CHANGED");
    return { mode: "committed-on-success", backup, deleted, preserved: { users: users.length, clubs: clubs.length } };
  }, { maxWait: 10000, timeout: 60000, isolationLevel: "RepeatableRead" });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  // Do not dump connection strings, recipient data, tokens or SQL parameters.
  console.error("Cleanup aborted; no transaction changes committed.", error.code ?? (error.message?.match(/^[A-Z_]+$/) ? error.message : error.name));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
