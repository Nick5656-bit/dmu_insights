BEGIN;

ALTER TABLE "Club" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MailLog" ADD COLUMN "quotaTracked" BOOLEAN NOT NULL DEFAULT false;

-- Only the known fictitious seed club with its demo login is classified automatically.
-- No clubs, logins, answers or invitations are deleted.
UPDATE "Club" SET "isTest" = true
WHERE "name" = 'Aarhus Motorsport Klub'
  AND EXISTS (SELECT 1 FROM "User" WHERE "User"."clubId" = "Club"."id" AND "User"."email" = 'klub1@dmu.dk');

CREATE TABLE "MailSendReservation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MailSendReservation_createdAt_idx" ON "MailSendReservation"("createdAt");
CREATE TABLE "MailSendControl" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "blockedUntil" TIMESTAMP(3)
);

COMMIT;
