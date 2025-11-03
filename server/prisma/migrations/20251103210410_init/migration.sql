-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModelRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "config" TEXT NOT NULL,
    "metrics" TEXT,
    "artifactsDir" TEXT NOT NULL,
    "plots" TEXT,
    "gradePoints" TEXT,
    "bestModel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "supersededAt" DATETIME,
    CONSTRAINT "ModelRun_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "inputPath" TEXT NOT NULL,
    "results" TEXT NOT NULL,
    "outFile" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Prediction_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ModelRun_orgId_createdAt_idx" ON "ModelRun"("orgId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Prediction_orgId_createdAt_idx" ON "Prediction"("orgId", "createdAt" DESC);
