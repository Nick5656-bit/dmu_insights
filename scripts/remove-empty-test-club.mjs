// Explicit one-off deletion of the verified empty demo club and its demo login.
// No automatic invocation, no broad club/user deletion, no credential output.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";

const clubId = "cmsralxmz00014w34nep1t5xh";
const userId = "cmsralxr900034w34tm11i9ty";
const adminId = "cmsralxl300004w34nl4lhgav";
const prisma = new PrismaClient();
try {
  if (!process.argv.includes(`--confirm=${clubId}`)) throw new Error("EXACT_CONFIRMATION_REQUIRED");
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error("BACKUP_SECRET_REQUIRED");
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Club" WHERE id = ${clubId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id IN (${userId}, ${adminId}) FOR UPDATE`;
    const club = await tx.club.findUnique({ where: { id: clubId }, include: { _count: { select: {
      users: true, members: true, createdQuestions: true, surveyInstances: true, events: true, surveyResponses: true, extraEmails: true,
    } } } });
    const user = await tx.user.findUnique({ where: { id: userId }, include: { _count: { select: { createdEvents: true, createdSurveyInstance: true } } } });
    const admin = await tx.user.findUnique({ where: { id: adminId } });
    if (!club?.isTest || club.name !== "Aarhus Motorsport Klub" || club._count.users !== 1 ||
      Object.entries(club._count).some(([key, count]) => key !== "users" && count !== 0) ||
      user?.role !== "CLUB_ADMIN" || user.clubId !== clubId || Object.values(user._count).some(Boolean) ||
      admin?.role !== "DMU_ADMIN") throw new Error("EXPECTED_EMPTY_TEST_CLUB_CHANGED");
    const { _count: clubCounts, ...clubRow } = club;
    const { _count: userCounts, ...userRow } = user;
    const plain = JSON.stringify({ version: 1, club: clubRow, user: userRow, counts: { clubCounts, userCounts } });
    const salt = randomBytes(32), iv = randomBytes(12);
    const key = scryptSync(process.env.SESSION_SECRET, salt, 32);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const directory = path.resolve(".local-backups");
    mkdirSync(directory, { recursive: true });
    const backup = path.join(directory, `test-club-${new Date().toISOString().replace(/[:.]/g, "-")}.json.enc`);
    writeFileSync(backup, JSON.stringify({ version: 1, cipher: "aes-256-gcm", kdf: "scrypt", salt: salt.toString("base64"),
      iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") }), { flag: "wx", mode: 0o600 });
    const saved = JSON.parse(readFileSync(backup, "utf8"));
    const decipher = createDecipheriv("aes-256-gcm", scryptSync(process.env.SESSION_SECRET, Buffer.from(saved.salt, "base64"), 32), Buffer.from(saved.iv, "base64"));
    decipher.setAuthTag(Buffer.from(saved.tag, "base64"));
    if (Buffer.concat([decipher.update(Buffer.from(saved.data, "base64")), decipher.final()]).toString("utf8") !== plain) throw new Error("BACKUP_VERIFICATION_FAILED");
    await tx.user.delete({ where: { id: userId } });
    await tx.club.delete({ where: { id: clubId } });
    if (JSON.stringify(await tx.user.findUnique({ where: { id: adminId } })) !== JSON.stringify(admin)) throw new Error("DMU_ADMIN_CHANGED");
    return { deletedClub: club.name, deletedClubUsers: 1, remainingClubs: await tx.club.count(), remainingUsers: await tx.user.count(), dmuAdminPreserved: true, backup };
  }, { isolationLevel: "Serializable", timeout: 30000 });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("Deletion aborted; transaction rolled back.", error.code ?? (error.message?.match(/^[A-Z_]+$/) ? error.message : error.name));
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
