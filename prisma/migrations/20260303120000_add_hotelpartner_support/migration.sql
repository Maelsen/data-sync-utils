-- Add 'hotelpartner' to PmsType enum
ALTER TYPE "PmsType" ADD VALUE 'hotelpartner';

-- Add HotelPartner credential columns to HotelCredentials table
ALTER TABLE "HotelCredentials" ADD COLUMN "hotelpartnerUsername" TEXT;
ALTER TABLE "HotelCredentials" ADD COLUMN "hotelpartnerPassword" TEXT;
ALTER TABLE "HotelCredentials" ADD COLUMN "hotelpartnerHotelId" TEXT;
ALTER TABLE "HotelCredentials" ADD COLUMN "hotelpartnerExtraId" TEXT;
