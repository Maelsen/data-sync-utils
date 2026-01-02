-- CreateEnum
CREATE TYPE "PmsType" AS ENUM ('mews', 'hotelspider');

-- AlterTable: Add new columns to Hotel table (nullable for backward compatibility)
ALTER TABLE "Hotel" ADD COLUMN "pmsType" "PmsType";
ALTER TABLE "Hotel" ADD COLUMN "externalId" TEXT;

-- Set default values for existing hotels
UPDATE "Hotel" SET "pmsType" = 'mews' WHERE "pmsType" IS NULL;
UPDATE "Hotel" SET "externalId" = "mewsId" WHERE "externalId" IS NULL;

-- Make pmsType non-nullable with default
ALTER TABLE "Hotel" ALTER COLUMN "pmsType" SET NOT NULL;
ALTER TABLE "Hotel" ALTER COLUMN "pmsType" SET DEFAULT 'mews';

-- Create indexes on Hotel
CREATE INDEX "Hotel_pmsType_idx" ON "Hotel"("pmsType");
CREATE UNIQUE INDEX "Hotel_pmsType_externalId_key" ON "Hotel"("pmsType", "externalId");

-- CreateTable: HotelCredentials
CREATE TABLE "HotelCredentials" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "mewsClientToken" TEXT,
    "mewsAccessToken" TEXT,
    "hotelspiderUsername" TEXT,
    "hotelspiderPassword" TEXT,
    "hotelspiderHotelCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelCredentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HotelCredentials_hotelId_key" ON "HotelCredentials"("hotelId");

-- AddForeignKey
ALTER TABLE "HotelCredentials" ADD CONSTRAINT "HotelCredentials_hotelId_fkey"
    FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Add pmsType to TreeOrder
ALTER TABLE "TreeOrder" ADD COLUMN "pmsType" "PmsType";

-- Set default values for existing tree orders
UPDATE "TreeOrder" SET "pmsType" = 'mews' WHERE "pmsType" IS NULL;

-- Make pmsType non-nullable with default
ALTER TABLE "TreeOrder" ALTER COLUMN "pmsType" SET NOT NULL;
ALTER TABLE "TreeOrder" ALTER COLUMN "pmsType" SET DEFAULT 'mews';

-- CreateIndex on TreeOrder
CREATE INDEX "TreeOrder_pmsType_hotelId_idx" ON "TreeOrder"("pmsType", "hotelId");

-- AlterTable: Add pmsType and hotelId to WebhookEvent
ALTER TABLE "WebhookEvent" ADD COLUMN "pmsType" "PmsType";
ALTER TABLE "WebhookEvent" ADD COLUMN "hotelId" TEXT;

-- Set default values for existing webhook events
UPDATE "WebhookEvent" SET "pmsType" = 'mews' WHERE "pmsType" IS NULL;

-- Make pmsType non-nullable with default
ALTER TABLE "WebhookEvent" ALTER COLUMN "pmsType" SET NOT NULL;
ALTER TABLE "WebhookEvent" ALTER COLUMN "pmsType" SET DEFAULT 'mews';

-- CreateIndex on WebhookEvent
CREATE INDEX "WebhookEvent_pmsType_hotelId_idx" ON "WebhookEvent"("pmsType", "hotelId");
