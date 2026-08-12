PRAGMA foreign_keys=OFF;

CREATE TABLE "new_SurveyInvitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "surveyInstanceId" TEXT NOT NULL,
    "memberId" TEXT,
    "emailSnapshot" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "sentAt" DATETIME,
    "openedAt" DATETIME,
    "answeredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SurveyInvitation_surveyInstanceId_fkey" FOREIGN KEY ("surveyInstanceId") REFERENCES "SurveyInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SurveyInvitation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_SurveyInvitation" (
    "id",
    "surveyInstanceId",
    "memberId",
    "emailSnapshot",
    "token",
    "status",
    "sentAt",
    "openedAt",
    "answeredAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "surveyInstanceId",
    "memberId",
    "emailSnapshot",
    "token",
    "status",
    "sentAt",
    "openedAt",
    "answeredAt",
    "createdAt",
    "updatedAt"
FROM "SurveyInvitation";

DROP TABLE "SurveyInvitation";
ALTER TABLE "new_SurveyInvitation" RENAME TO "SurveyInvitation";
CREATE UNIQUE INDEX "SurveyInvitation_token_key" ON "SurveyInvitation"("token");

PRAGMA foreign_keys=ON;
