/**
 * PMS Webhook Handler Interface
 *
 * Abstract interface for handling webhooks from different PMS systems
 * (Mews JSON webhooks, HotelSpider XML notifications, etc.)
 */

import { TreeOrderData } from './IPmsClient';

/**
 * Webhook processing result
 */
export interface WebhookProcessResult {
  success: boolean;                  // Whether processing succeeded
  processedOrders: TreeOrderData[];  // Tree orders extracted from webhook
  errors?: string[];                 // Error messages if processing failed
  metadata?: Record<string, any>;    // Optional processing metadata
}

/**
 * PMS Webhook Handler Interface
 */
export interface IPmsWebhookHandler {
  /**
   * Process incoming webhook payload
   * @param rawPayload - Raw request body (JSON string, XML string, etc.)
   * @param headers - Request headers for validation
   * @returns Processing result with extracted orders
   */
  processWebhook(
    rawPayload: string,
    headers: Record<string, string>
  ): Promise<WebhookProcessResult>;

  /**
   * Validate webhook authenticity (signature, auth, etc.)
   * @param rawPayload - Raw request body
   * @param headers - Request headers
   * @returns True if webhook is authentic
   */
  validateWebhook(rawPayload: string, headers: Record<string, string>): boolean;
}
