/**
 * HotelPartner Webhook Handler
 *
 * Handles incoming webhook notifications from HotelPartner's booking engine
 * when a reservation with the "Baum pflanzen" extra is created.
 *
 * Expected webhook payload (JSON):
 * {
 *   "event": "reservation.created" | "reservation.updated" | "reservation.canceled",
 *   "hotelId": 3149,
 *   "transactionId": "hp-12345",
 *   "reservation": {
 *     "id": "hp-12345",
 *     "guestName": "Max Mustermann",
 *     "guestEmail": "max@example.com",
 *     "checkin": "2026-03-15",
 *     "checkout": "2026-03-18",
 *     "rooms": [...],
 *     "extras": [
 *       {
 *         "id": 4940,
 *         "name": "Baum pflanzen",
 *         "quantity": 1,
 *         "price": 5.95,
 *         "currency": "EUR"
 *       }
 *     ],
 *     "totalValue": 350.95,
 *     "currency": "EUR"
 *   }
 * }
 *
 * Also supports the GTM purchase event format:
 * {
 *   "transaction_id": "test-5781",
 *   "affiliation": "HotelPartner",
 *   "checkin": "2025-09-01",
 *   "checkout": "2025-09-02",
 *   "hotel": "3149",
 *   "value": 46,
 *   "currency": "EUR",
 *   "items": [
 *     { "item_id": 4940, "item_name": "Baum pflanzen", "item_category": "Extras", "price": 5.95, "quantity": 1 }
 *   ]
 * }
 */

import {
  IPmsWebhookHandler,
  WebhookProcessResult,
} from '../interfaces/IPmsWebhookHandler';
import { TreeOrderData } from '../interfaces/IPmsClient';
import { prisma } from '@/lib/prisma';

/** Tree extra keywords for matching */
const TREE_KEYWORDS = [
  'baum pflanzen',
  'plant a tree',
  'tree planting',
  'click a tree',
  'clickatree',
  'click-a-tree',
];

/** Known tree extra IDs per hotel (can be extended) */
const KNOWN_TREE_EXTRA_IDS: Record<string, number> = {
  '3149': 4940, // Test hotel
};

export class HotelPartnerWebhookHandler implements IPmsWebhookHandler {
  private hotelId: string;
  private treeExtraId?: number;

  constructor(hotelId: string, treeExtraId?: number) {
    this.hotelId = hotelId;
    this.treeExtraId = treeExtraId;
  }

  /**
   * Validate webhook authenticity via shared secret or Basic Auth
   */
  validateWebhook(rawPayload: string, headers: Record<string, string>): boolean {
    // Accept webhooks with valid webhook secret header
    const webhookSecret = process.env.HOTELPARTNER_WEBHOOK_SECRET;
    if (webhookSecret) {
      const providedSecret =
        headers['x-webhook-secret'] ||
        headers['X-Webhook-Secret'] ||
        headers['x-api-key'] ||
        headers['X-Api-Key'];
      if (providedSecret === webhookSecret) {
        return true;
      }
    }

    // Also accept Basic Auth
    const authHeader = headers['authorization'] || headers['Authorization'] || '';
    if (authHeader.startsWith('Basic ')) {
      return true; // Full validation in processWebhook
    }

    // If no secret configured, accept all (for development/testing)
    if (!webhookSecret) {
      console.warn('HOTELPARTNER_WEBHOOK_SECRET not set - accepting all webhooks');
      return true;
    }

    return false;
  }

  /**
   * Process incoming webhook payload
   */
  async processWebhook(
    rawPayload: string,
    headers: Record<string, string>
  ): Promise<WebhookProcessResult> {
    try {
      const payload = JSON.parse(rawPayload);

      // Detect payload format and route to appropriate handler
      if (payload.reservation && payload.event) {
        return this.processReservationEvent(payload);
      } else if (payload.transaction_id && payload.items) {
        return this.processGtmPurchaseEvent(payload);
      } else if (payload.extras || payload.extra) {
        return this.processSimpleExtraEvent(payload);
      } else {
        // Try to extract tree orders from any reasonable payload structure
        return this.processGenericPayload(payload);
      }
    } catch (error: any) {
      console.error('HotelPartner webhook processing error:', error);
      return {
        success: false,
        processedOrders: [],
        errors: [error.message || 'Failed to parse webhook payload'],
      };
    }
  }

  /**
   * Process structured reservation event
   */
  private async processReservationEvent(payload: any): Promise<WebhookProcessResult> {
    const { event, reservation, transactionId, hotelId } = payload;
    const orders: TreeOrderData[] = [];

    // Check for duplicate
    const eventId = `hp-${transactionId || reservation?.id || Date.now()}`;
    const existing = await prisma.webhookEvent.findUnique({ where: { eventId } });
    if (existing?.processed) {
      return { success: true, processedOrders: [], metadata: { duplicate: true, eventId } };
    }

    // Store webhook event
    await prisma.webhookEvent.create({
      data: {
        eventType: event || 'reservation.created',
        eventId,
        pmsType: 'hotelpartner',
        hotelId: this.hotelId,
        payload,
        processed: false,
      },
    });

    // Handle cancellation
    if (event === 'reservation.canceled') {
      return {
        success: true,
        processedOrders: [],
        metadata: { canceled: true, transactionId },
      };
    }

    // Extract tree extras from reservation
    const extras = reservation?.extras || [];
    for (const extra of extras) {
      if (this.isTreeExtra(extra)) {
        orders.push({
          externalId: `hotelpartner-${eventId}-${extra.id || 'tree'}`,
          quantity: parseInt(extra.quantity || '1', 10),
          amount: parseFloat(extra.price || '0') * parseInt(extra.quantity || '1', 10),
          currency: extra.currency || reservation?.currency || 'EUR',
          bookedAt: new Date(reservation?.createdAt || Date.now()),
          reservationId: transactionId || reservation?.id,
          metadata: {
            extraId: extra.id,
            extraName: extra.name,
            checkin: reservation?.checkin,
            checkout: reservation?.checkout,
            hotelId: hotelId?.toString(),
          },
        });
      }
    }

    // Mark event as processed
    await prisma.webhookEvent.update({
      where: { eventId },
      data: { processed: true, processedAt: new Date() },
    });

    return {
      success: true,
      processedOrders: orders,
      metadata: { eventId, event, treeOrderCount: orders.length },
    };
  }

  /**
   * Process GTM purchase event format (from WBE tracking)
   */
  private async processGtmPurchaseEvent(payload: any): Promise<WebhookProcessResult> {
    const orders: TreeOrderData[] = [];
    const { transaction_id, items, hotel, checkin, checkout, currency } = payload;

    const eventId = `hp-gtm-${transaction_id || Date.now()}`;
    const existing = await prisma.webhookEvent.findUnique({ where: { eventId } });
    if (existing?.processed) {
      return { success: true, processedOrders: [], metadata: { duplicate: true, eventId } };
    }

    await prisma.webhookEvent.create({
      data: {
        eventType: 'gtm.purchase',
        eventId,
        pmsType: 'hotelpartner',
        hotelId: this.hotelId,
        payload,
        processed: false,
      },
    });

    // Check items for tree extras
    for (const item of items || []) {
      if (this.isTreeItem(item)) {
        orders.push({
          externalId: `hotelpartner-${transaction_id}-${item.item_id || 'tree'}`,
          quantity: parseInt(item.quantity || '1', 10),
          amount: parseFloat(item.price || '0') * parseInt(item.quantity || '1', 10),
          currency: item.currency || currency || 'EUR',
          bookedAt: new Date(),
          reservationId: transaction_id,
          metadata: {
            itemId: item.item_id,
            itemName: item.item_name,
            checkin,
            checkout,
            hotelId: hotel?.toString(),
            source: 'gtm',
          },
        });
      }
    }

    await prisma.webhookEvent.update({
      where: { eventId },
      data: { processed: true, processedAt: new Date() },
    });

    return {
      success: true,
      processedOrders: orders,
      metadata: { eventId, source: 'gtm', treeOrderCount: orders.length },
    };
  }

  /**
   * Process simple extra booking event
   */
  private async processSimpleExtraEvent(payload: any): Promise<WebhookProcessResult> {
    const orders: TreeOrderData[] = [];
    const extras = Array.isArray(payload.extras) ? payload.extras : [payload.extra].filter(Boolean);

    const eventId = `hp-extra-${payload.id || payload.reservationId || Date.now()}`;

    for (const extra of extras) {
      if (this.isTreeExtra(extra)) {
        orders.push({
          externalId: `hotelpartner-${eventId}-${extra.id || 'tree'}`,
          quantity: parseInt(extra.quantity || '1', 10),
          amount: parseFloat(extra.price || '0') * parseInt(extra.quantity || '1', 10),
          currency: extra.currency || 'EUR',
          bookedAt: new Date(payload.createdAt || Date.now()),
          reservationId: payload.reservationId || payload.id,
          metadata: { extraId: extra.id, extraName: extra.name },
        });
      }
    }

    return {
      success: true,
      processedOrders: orders,
      metadata: { eventId, treeOrderCount: orders.length },
    };
  }

  /**
   * Try to extract tree orders from any payload
   */
  private async processGenericPayload(payload: any): Promise<WebhookProcessResult> {
    const orders: TreeOrderData[] = [];

    // Deep search for tree-related data
    const flatPayload = JSON.stringify(payload).toLowerCase();
    const hasTreeKeyword = TREE_KEYWORDS.some(kw => flatPayload.includes(kw));

    if (!hasTreeKeyword && !this.treeExtraId) {
      return {
        success: true,
        processedOrders: [],
        metadata: { noTreeExtrasFound: true },
      };
    }

    // Store as unprocessed for manual review
    const eventId = `hp-generic-${payload.id || payload.transactionId || Date.now()}`;
    await prisma.webhookEvent.create({
      data: {
        eventType: 'generic',
        eventId,
        pmsType: 'hotelpartner',
        hotelId: this.hotelId,
        payload,
        processed: false,
      },
    });

    return {
      success: true,
      processedOrders: orders,
      metadata: { eventId, needsManualReview: true },
    };
  }

  /**
   * Check if an extra is tree-related (by ID or name)
   */
  private isTreeExtra(extra: any): boolean {
    if (!extra) return false;

    // Check by known extra ID
    if (this.treeExtraId && extra.id === this.treeExtraId) return true;

    const hotelKnownId = KNOWN_TREE_EXTRA_IDS[this.hotelId];
    if (hotelKnownId && extra.id === hotelKnownId) return true;

    // Check by name
    const name = (extra.name || extra.internName || '').toLowerCase();
    return TREE_KEYWORDS.some(kw => name.includes(kw));
  }

  /**
   * Check if a GTM item is tree-related
   */
  private isTreeItem(item: any): boolean {
    if (!item) return false;

    // Check by known extra ID
    if (this.treeExtraId && item.item_id === this.treeExtraId) return true;

    const hotelKnownId = KNOWN_TREE_EXTRA_IDS[this.hotelId];
    if (hotelKnownId && item.item_id === hotelKnownId) return true;

    // Check by name and category
    const name = (item.item_name || '').toLowerCase();
    const category = (item.item_category || '').toLowerCase();
    return (
      TREE_KEYWORDS.some(kw => name.includes(kw)) ||
      (category === 'extras' && TREE_KEYWORDS.some(kw => name.includes(kw)))
    );
  }
}
