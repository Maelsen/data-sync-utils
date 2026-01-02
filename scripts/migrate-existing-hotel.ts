/**
 * Migration Script: Move Mews Credentials from .env to Database
 *
 * This script migrates the existing Mews hotel credentials from environment
 * variables to the encrypted database storage.
 *
 * IMPORTANT: Run this BEFORE deploying the multi-PMS changes!
 *
 * Usage:
 *   npx tsx scripts/migrate-existing-hotel.ts
 */

import { prisma } from '../lib/prisma';
import { encrypt } from '../lib/encryption';

async function migrateExistingHotel() {
  console.log('🌳 Click A Tree - Hotel Credentials Migration');
  console.log('==============================================\n');

  try {
    // Step 1: Check for environment variables
    console.log('Step 1: Checking environment variables...');
    const MEWS_CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
    const MEWS_ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';
    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';

    if (!ENCRYPTION_KEY) {
      console.error('❌ ERROR: ENCRYPTION_KEY not found in environment!');
      console.error('   Generate one with: openssl rand -hex 32');
      console.error('   Then add it to your .env file');
      process.exit(1);
    }

    if (!MEWS_CLIENT_TOKEN || !MEWS_ACCESS_TOKEN) {
      console.error('❌ ERROR: Mews credentials not found in environment!');
      console.error('   MEWS_CLIENT_TOKEN and MEWS_ACCESS_TOKEN must be set');
      process.exit(1);
    }

    console.log('✅ Environment variables found\n');

    // Step 2: Find existing Mews hotel
    console.log('Step 2: Looking for existing Mews hotel...');
    const hotel = await prisma.hotel.findFirst({
      where: { pmsType: 'mews' },
      include: { credentials: true },
    });

    if (!hotel) {
      console.log('⚠️  No Mews hotel found in database');
      console.log('   This is normal if you haven\'t created any hotels yet');
      console.log('   You can skip this migration\n');
      process.exit(0);
    }

    console.log(`✅ Found hotel: ${hotel.name} (ID: ${hotel.id})\n`);

    // Step 3: Check if credentials already exist
    if (hotel.credentials) {
      console.log('⚠️  Credentials already exist for this hotel!');
      console.log('   Do you want to overwrite them? (y/N)');

      // For automation, we'll skip overwriting
      console.log('   Skipping migration (credentials already exist)\n');
      process.exit(0);
    }

    // Step 4: Encrypt and store credentials
    console.log('Step 3: Encrypting credentials...');
    const encryptedClientToken = encrypt(MEWS_CLIENT_TOKEN);
    const encryptedAccessToken = encrypt(MEWS_ACCESS_TOKEN);
    console.log('✅ Credentials encrypted\n');

    // Step 5: Save to database
    console.log('Step 4: Saving to database...');
    await prisma.hotelCredentials.create({
      data: {
        hotelId: hotel.id,
        mewsClientToken: encryptedClientToken,
        mewsAccessToken: encryptedAccessToken,
      },
    });
    console.log('✅ Credentials saved to database\n');

    // Step 6: Verify
    console.log('Step 5: Verifying...');
    const verifyCredentials = await prisma.hotelCredentials.findUnique({
      where: { hotelId: hotel.id },
    });

    if (verifyCredentials) {
      console.log('✅ Migration successful!\n');
      console.log('==============================================');
      console.log('NEXT STEPS:');
      console.log('1. Test that the Mews integration still works');
      console.log('2. After testing, you can remove these from .env:');
      console.log('   - MEWS_CLIENT_TOKEN');
      console.log('   - MEWS_ACCESS_TOKEN');
      console.log('3. Deploy the multi-PMS changes');
      console.log('==============================================\n');
    } else {
      console.error('❌ ERROR: Verification failed!');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateExistingHotel()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
