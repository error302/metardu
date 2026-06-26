-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "surveyType" TEXT NOT NULL DEFAULT 'CADASTRAL',
    "surveyOrder" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "county" TEXT,
    "subCounty" TEXT,
    "lrNumber" TEXT,
    "datum" TEXT NOT NULL DEFAULT 'ARC1960',
    "projection" TEXT NOT NULL DEFAULT 'UTM37S',
    "zone" INTEGER,
    "surveyorName" TEXT NOT NULL,
    "surveyorLicense" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "surveyType" TEXT NOT NULL DEFAULT 'CADASTRAL',
    "method" TEXT NOT NULL DEFAULT 'TRAVERSE',
    "order" INTEGER NOT NULL DEFAULT 3,
    "correctionsApplied" TEXT,
    "correctionParams" TEXT,
    "misclosureDistance" REAL,
    "misclosureRatio" TEXT,
    "accuracyAchieved" REAL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "computedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Survey_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "surveyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TRAVERSE',
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Station_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "surveyId" TEXT NOT NULL,
    "fromStationId" TEXT NOT NULL,
    "toStationId" TEXT NOT NULL,
    "rawHorizontalAngle" REAL,
    "rawVerticalAngle" REAL,
    "rawSlopeDistance" REAL,
    "edmConstant" REAL,
    "ppmSetting" REAL,
    "temperature" REAL,
    "pressure" REAL,
    "humidity" REAL,
    "instrumentHeight" REAL,
    "targetHeight" REAL,
    "correctedDistance" REAL,
    "correctedHd" REAL,
    "correctedVd" REAL,
    "correctedBearing" REAL,
    "correctionsLog" TEXT,
    "stdDevDistance" REAL,
    "stdDevAngle" REAL,
    "observationDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Observation_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Coordinate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "surveyId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "easting" REAL NOT NULL,
    "northing" REAL NOT NULL,
    "elevation" REAL,
    "datum" TEXT NOT NULL DEFAULT 'ARC1960',
    "projection" TEXT NOT NULL DEFAULT 'UTM37S',
    "zone" INTEGER,
    "stdDevEasting" REAL,
    "stdDevNorthing" REAL,
    "stdDevElevation" REAL,
    "errorEllipseSemiMajor" REAL,
    "errorEllipseSemiMinor" REAL,
    "errorEllipseOrientation" REAL,
    "confidenceLevel" REAL,
    "pointScaleFactor" REAL,
    "gridConvergence" REAL,
    "isFixed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Coordinate_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Coordinate_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "paperSize" TEXT NOT NULL DEFAULT 'A4',
    "orientation" TEXT NOT NULL DEFAULT 'PORTRAIT',
    "scale" INTEGER,
    "filePath" TEXT,
    "fileSize" INTEGER,
    "checksum" TEXT,
    "pdfVersion" TEXT,
    "isVector" BOOLEAN NOT NULL DEFAULT false,
    "generatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "changes" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CoordinateSystem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "datum" TEXT NOT NULL,
    "projection" TEXT NOT NULL,
    "zone" INTEGER,
    "parameters" TEXT NOT NULL,
    "epsgCode" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Project_surveyorLicense_idx" ON "Project"("surveyorLicense");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_createdAt_idx" ON "Project"("createdAt");

-- CreateIndex
CREATE INDEX "Survey_projectId_idx" ON "Survey"("projectId");

-- CreateIndex
CREATE INDEX "Survey_status_idx" ON "Survey"("status");

-- CreateIndex
CREATE INDEX "Station_surveyId_idx" ON "Station"("surveyId");

-- CreateIndex
CREATE INDEX "Station_name_idx" ON "Station"("name");

-- CreateIndex
CREATE INDEX "Observation_surveyId_idx" ON "Observation"("surveyId");

-- CreateIndex
CREATE INDEX "Observation_fromStationId_idx" ON "Observation"("fromStationId");

-- CreateIndex
CREATE INDEX "Observation_toStationId_idx" ON "Observation"("toStationId");

-- CreateIndex
CREATE UNIQUE INDEX "Coordinate_stationId_key" ON "Coordinate"("stationId");

-- CreateIndex
CREATE INDEX "Coordinate_surveyId_idx" ON "Coordinate"("surveyId");

-- CreateIndex
CREATE INDEX "Coordinate_easting_northing_idx" ON "Coordinate"("easting", "northing");

-- CreateIndex
CREATE INDEX "Document_projectId_idx" ON "Document"("projectId");

-- CreateIndex
CREATE INDEX "Document_documentType_idx" ON "Document"("documentType");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "CoordinateSystem_name_key" ON "CoordinateSystem"("name");
