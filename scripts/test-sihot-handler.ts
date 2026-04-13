/**
 * Lokaler End-to-End-Test des SIHOT-Webhook-Handlers.
 * Legt ein Test-Hotel an, feuert repräsentative SIHOT-Push-Payloads durch den Handler
 * und räumt danach wieder auf.
 *
 * Run: npx tsx scripts/test-sihot-handler.ts
 */

import { prisma } from '../lib/prisma';
import { processSihotNotification } from '../lib/sihot-webhook-handler';
import { encrypt } from '../lib/encryption';

const TEST_SIHOT_HOTEL_ID = 'test-99';
const TEST_PRODUCT_ID = '5806d28ff34f40359e20ba0398062061';

async function cleanup(hotelId: string | null) {
  if (!hotelId) return;
  await prisma.webhookEvent.deleteMany({ where: { hotelId } });
  await prisma.treeOrder.deleteMany({ where: { hotelId } });
  await prisma.hotelCredentials.deleteMany({ where: { hotelId } });
  await prisma.hotel.delete({ where: { id: hotelId } }).catch(() => {});
}

async function main() {
  console.log('--- Setup ---');
  // Create test hotel + credentials
  const hotel = await prisma.hotel.create({
    data: {
      name: 'SIHOT Test Hotel (auto-cleanup)',
      pmsType: 'sihot',
      externalId: TEST_SIHOT_HOTEL_ID,
      mewsId: `sihot-${TEST_SIHOT_HOTEL_ID}`,
      credentials: {
        create: {
          sihotUsername: encrypt('CR!'),
          sihotPassword: encrypt('Clickatree2026'),
          sihotHotelId: TEST_SIHOT_HOTEL_ID,
          sihotProductId: TEST_PRODUCT_ID,
        },
      },
    },
  });
  console.log(`Created test hotel: ${hotel.id} (externalId=${TEST_SIHOT_HOTEL_ID})`);

  try {
    // Test 1: RESERVATION_COMPLETE_PUSH with tree service
    console.log('\n--- Test 1: RESERVATION_COMPLETE_PUSH (with tree) ---');
    const createPayload = {
      AUTOTASK: {
        'TASK-OBJID': '900001',
        notificationid: 'S_RESERVATION_COMPLETE_PUSH',
        RESERVATION: {
          'RESERVATION-OBJID': 'RES-TEST-1',
          hotel: TEST_SIHOT_HOTEL_ID,
          'RES-DATE': '2026-04-13T09:00:00Z',
          ARR: '2026-04-20T14:00:00Z',
          SERVICE: [
            {
              'PRODUCT-OBJID': TEST_PRODUCT_ID,
              QTY: 2,
              PRICE: 5.95,
              'TOTAL-PRICE': 11.90,
              CURRENCY: 'EUR',
            },
            {
              'PRODUCT-OBJID': 'SOME-OTHER-PRODUCT',
              QTY: 1,
              'TOTAL-PRICE': 120.00,
              CURRENCY: 'EUR',
            },
          ],
        },
      },
    };
    const r1 = await processSihotNotification(createPayload);
    console.log(JSON.stringify(r1, null, 2));

    const order = await prisma.treeOrder.findUnique({
      where: { mewsId: `sihot-${hotel.id}-RES-TEST-1` },
    });
    console.log('TreeOrder created:', order ? { qty: order.quantity, amount: order.amount, currency: order.currency } : 'NONE');
    if (!order || order.quantity !== 2 || order.amount !== 11.9) throw new Error('Upsert did not produce correct TreeOrder');

    // Test 2: Reservation without tree product → skipped
    console.log('\n--- Test 2: RESERVATION_COMPLETE_PUSH (no tree → skipped) ---');
    const noTreePayload = {
      AUTOTASK: {
        'TASK-OBJID': '900002',
        notificationid: 'S_RESERVATION_COMPLETE_PUSH',
        RESERVATION: {
          'RESERVATION-OBJID': 'RES-TEST-2',
          hotel: TEST_SIHOT_HOTEL_ID,
          'RES-DATE': '2026-04-13T09:00:00Z',
          ARR: '2026-04-20T14:00:00Z',
          SERVICE: [
            {
              'PRODUCT-OBJID': 'NOT-OUR-PRODUCT',
              QTY: 1,
              'TOTAL-PRICE': 50,
              CURRENCY: 'EUR',
            },
          ],
        },
      },
    };
    const r2 = await processSihotNotification(noTreePayload);
    console.log(JSON.stringify(r2, null, 2));
    if (r2.action !== 'skipped') throw new Error('Expected skipped action');

    // Test 3: CI_ROOM_PUSH → updates actualCheckInAt
    console.log('\n--- Test 3: CI_ROOM_PUSH ---');
    const checkinPayload = {
      AUTOTASK: {
        'TASK-OBJID': '900003',
        notificationid: 'S_CI_ROOM_PUSH',
        RESERVATION: {
          'RESERVATION-OBJID': 'RES-TEST-1',
          hotel: TEST_SIHOT_HOTEL_ID,
          'ACT-ARR': '2026-04-20T15:30:00Z',
        },
      },
    };
    const r3 = await processSihotNotification(checkinPayload);
    console.log(JSON.stringify(r3, null, 2));
    const orderAfterCi = await prisma.treeOrder.findUnique({
      where: { mewsId: `sihot-${hotel.id}-RES-TEST-1` },
    });
    console.log('actualCheckInAt:', orderAfterCi?.actualCheckInAt);
    if (!orderAfterCi?.actualCheckInAt) throw new Error('actualCheckInAt was not set');

    // Test 4: RESERVATION_DELETED_PUSH → amount = 0
    console.log('\n--- Test 4: RESERVATION_DELETED_PUSH ---');
    const deletePayload = {
      AUTOTASK: {
        'TASK-OBJID': '900004',
        notificationid: 'S_RESERVATION_DELETED_PUSH',
        RESERVATION: {
          'RESERVATION-OBJID': 'RES-TEST-1',
          hotel: TEST_SIHOT_HOTEL_ID,
        },
      },
    };
    const r4 = await processSihotNotification(deletePayload);
    console.log(JSON.stringify(r4, null, 2));
    const orderAfterDel = await prisma.treeOrder.findUnique({
      where: { mewsId: `sihot-${hotel.id}-RES-TEST-1` },
    });
    console.log('amount after cancel:', orderAfterDel?.amount);
    if (orderAfterDel?.amount !== 0) throw new Error('Cancel did not zero the amount');

    // Test 5: Missing TASK-OBJID → error
    console.log('\n--- Test 5: Missing TASK-OBJID (error case) ---');
    const badPayload = { AUTOTASK: { notificationid: 'S_RESERVATION_COMPLETE_PUSH', RESERVATION: {} } };
    const r5 = await processSihotNotification(badPayload);
    console.log(JSON.stringify(r5, null, 2));
    if (r5.ok) throw new Error('Expected ok=false for missing TASK-OBJID');

    // Test 6: Unknown hotel → logged-only + ACK
    console.log('\n--- Test 6: Unknown SIHOT hotel id ---');
    const unknownHotelPayload = {
      AUTOTASK: {
        'TASK-OBJID': '900006',
        notificationid: 'S_RESERVATION_COMPLETE_PUSH',
        RESERVATION: {
          'RESERVATION-OBJID': 'RES-X',
          hotel: 'does-not-exist',
          SERVICE: [{ 'PRODUCT-OBJID': TEST_PRODUCT_ID, QTY: 1, 'TOTAL-PRICE': 5.95, CURRENCY: 'EUR' }],
        },
      },
    };
    const r6 = await processSihotNotification(unknownHotelPayload);
    console.log(JSON.stringify(r6, null, 2));
    if (r6.action !== 'logged-only') throw new Error('Expected logged-only for unknown hotel');

    // Test 7: Unknown notification type → logged-only
    console.log('\n--- Test 7: Unhandled notification type ---');
    const unknownTypePayload = {
      AUTOTASK: {
        'TASK-OBJID': '900007',
        notificationid: 'S_SOMETHING_ELSE',
        RESERVATION: { 'RESERVATION-OBJID': 'RES-7', hotel: TEST_SIHOT_HOTEL_ID },
      },
    };
    const r7 = await processSihotNotification(unknownTypePayload);
    console.log(JSON.stringify(r7, null, 2));
    if (r7.action !== 'logged-only') throw new Error('Expected logged-only for unknown type');

    console.log('\n✅ All 7 handler tests passed.');

    // Audit: count WebhookEvents logged
    const evtCount = await prisma.webhookEvent.count({ where: { hotelId: hotel.id } });
    const unknownHotelEvtCount = await prisma.webhookEvent.count({
      where: { pmsType: 'sihot', eventId: 'sihot-900006' },
    });
    console.log(`WebhookEvent records logged for hotel: ${evtCount}`);
    console.log(`WebhookEvent for unknown-hotel test: ${unknownHotelEvtCount}`);
  } finally {
    console.log('\n--- Cleanup ---');
    // Delete events from unknown-hotel test too (they have hotelId=null)
    await prisma.webhookEvent.deleteMany({
      where: {
        pmsType: 'sihot',
        eventId: { in: ['sihot-900001', 'sihot-900002', 'sihot-900003', 'sihot-900004', 'sihot-900006', 'sihot-900007'] },
      },
    });
    await cleanup(hotel.id);
    console.log('Cleaned up.');
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error('Test failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
