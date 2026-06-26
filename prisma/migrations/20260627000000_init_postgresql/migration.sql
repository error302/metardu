-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SurveyType" AS ENUM ('CADASTRAL', 'TOPOGRAPHIC', 'ENGINEERING', 'CONTROL', 'HYDROGRAPHIC', 'MINING');

-- CreateEnum
CREATE TYPE "SurveyMethod" AS ENUM ('TRAVERSE', 'TRIANGULATION', 'TRILATERATION', 'GPS', 'LEVELING', 'TOTAL_STATION');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED', 'DRAFT');

-- CreateEnum
CREATE TYPE "ComputationStatus" AS ENUM ('PENDING', 'COMPUTING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "StationType" AS ENUM ('TRAVERSE', 'CONTROL', 'BEACON', 'BENCHMARK', 'INTERSECTION');

-- CreateEnum
CREATE TYPE "DatumType" AS ENUM ('ARC1960', 'WGS84');

-- CreateEnum
CREATE TYPE "ProjectionType" AS ENUM ('UTM36S', 'UTM37S', 'CASSINI_SOLDNER', 'LOCAL');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DEED_PLAN', 'FORM_C22', 'BEACON_CERTIFICATE', 'TRAVERSE_SHEET', 'SETTING_OUT', 'TOPO_PLAN', 'CONTOUR_PLAN', 'CROSS_SECTION');

-- CreateEnum
CREATE TYPE "PaperSize" AS ENUM ('A4', 'A3', 'A2', 'A1', 'A0');

-- CreateEnum
CREATE TYPE "Orientation" AS ENUM ('PORTRAIT', 'LANDSCAPE');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "surveyType" "SurveyType" NOT NULL DEFAULT 'CADASTRAL',
    "surveyOrder" INTEGER NOT NULL DEFAULT 3,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "county" TEXT,
    "subCounty" TEXT,
    "lrNumber" TEXT,
    "datum" "DatumType" NOT NULL DEFAULT 'ARC1960',
    "projection" "ProjectionType" NOT NULL DEFAULT 'UTM37S',
    "zone" INTEGER,
    "surveyorName" TEXT NOT NULL,
    "surveyorLicense" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "surveyType" "SurveyType" NOT NULL DEFAULT 'CADASTRAL',
    "method" "SurveyMethod" NOT NULL DEFAULT 'TRAVERSE',
    "order" INTEGER NOT NULL DEFAULT 3,
    "correctionsApplied" TEXT,
    "correctionParams" TEXT,
    "misclosureDistance" DOUBLE PRECISION,
    "misclosureRatio" TEXT,
    "accuracyAchieved" DOUBLE PRECISION,
    "status" "ComputationStatus" NOT NULL DEFAULT 'PENDING',
    "computedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StationType" NOT NULL DEFAULT 'TRAVERSE',
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "fromStationId" TEXT NOT NULL,
    "toStationId" TEXT NOT NULL,
    "rawHorizontalAngle" DOUBLE PRECISION,
    "rawVerticalAngle" DOUBLE PRECISION,
    "rawSlopeDistance" DOUBLE PRECISION,
    "edmConstant" DOUBLE PRECISION,
    "ppmSetting" DOUBLE PRECISION,
    "temperature" DOUBLE PRECISION,
    "pressure" DOUBLE PRECISION,
    "humidity" DOUBLE PRECISION,
    "instrumentHeight" DOUBLE PRECISION,
    "targetHeight" DOUBLE PRECISION,
    "correctedDistance" DOUBLE PRECISION,
    "correctedHd" DOUBLE PRECISION,
    "correctedVd" DOUBLE PRECISION,
    "correctedBearing" DOUBLE PRECISION,
    "correctionsLog" TEXT,
    "stdDevDistance" DOUBLE PRECISION,
    "stdDevAngle" DOUBLE PRECISION,
    "observationDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coordinate" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "easting" DOUBLE PRECISION NOT NULL,
    "northing" DOUBLE PRECISION NOT NULL,
    "elevation" DOUBLE PRECISION,
    "datum" "DatumType" NOT NULL DEFAULT 'ARC1960',
    "projection" "ProjectionType" NOT NULL DEFAULT 'UTM37S',
    "zone" INTEGER,
    "stdDevEasting" DOUBLE PRECISION,
    "stdDevNorthing" DOUBLE PRECISION,
    "stdDevElevation" DOUBLE PRECISION,
    "errorEllipseSemiMajor" DOUBLE PRECISION,
    "errorEllipseSemiMinor" DOUBLE PRECISION,
    "errorEllipseOrientation" DOUBLE PRECISION,
    "confidenceLevel" DOUBLE PRECISION,
    "pointScaleFactor" DOUBLE PRECISION,
    "gridConvergence" DOUBLE PRECISION,
    "isFixed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coordinate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "paperSize" "PaperSize" NOT NULL DEFAULT 'A4',
    "orientation" "Orientation" NOT NULL DEFAULT 'PORTRAIT',
    "scale" INTEGER,
    "filePath" TEXT,
    "fileSize" INTEGER,
    "checksum" TEXT,
    "pdfVersion" TEXT,
    "isVector" BOOLEAN NOT NULL DEFAULT false,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "changes" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoordinateSystem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "datum" "DatumType" NOT NULL,
    "projection" "ProjectionType" NOT NULL,
    "zone" INTEGER,
    "parameters" TEXT NOT NULL,
    "epsgCode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoordinateSystem_pkey" PRIMARY KEY ("id")
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

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coordinate" ADD CONSTRAINT "Coordinate_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coordinate" ADD CONSTRAINT "Coordinate_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
