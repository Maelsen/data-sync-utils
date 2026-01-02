/**
 * PMS Factory
 *
 * Factory pattern for creating PMS-specific clients and webhook handlers
 * Supports Mews, HotelSpider, and future PMS systems
 */

import { PmsType } from '@prisma/client';
import { IPmsClient } from './interfaces/IPmsClient';
import { IPmsWebhookHandler } from './interfaces/IPmsWebhookHandler';

// Import concrete implementations
// import { MewsClient } from './mews/MewsClient';
// import { MewsWebhookHandler } from './mews/MewsWebhookHandler';
import { HotelSpiderClient } from './hotelspider/HotelSpiderClient';
import { HotelSpiderWebhookHandler } from './hotelspider/HotelSpiderWebhookHandler';

/**
 * PMS Factory
 */
export class PmsFactory {
  /**
   * Create a PMS client for a specific hotel
   * @param hotelId - The hotel ID
   * @param pmsType - The PMS type (mews, hotelspider, etc.)
   * @returns PMS client instance
   */
  static createClient(hotelId: string, pmsType: PmsType): IPmsClient {
    switch (pmsType) {
      case 'mews':
        // return new MewsClient(hotelId);
        throw new Error('MewsClient not yet implemented - use legacy code for now');

      case 'hotelspider':
        return new HotelSpiderClient(hotelId);

      default:
        throw new Error(`Unknown PMS type: ${pmsType}`);
    }
  }

  /**
   * Create a webhook handler for a specific hotel
   * @param hotelId - The hotel ID
   * @param pmsType - The PMS type (mews, hotelspider, etc.)
   * @returns Webhook handler instance
   */
  static createWebhookHandler(
    hotelId: string,
    pmsType: PmsType
  ): IPmsWebhookHandler {
    switch (pmsType) {
      case 'mews':
        // return new MewsWebhookHandler(hotelId);
        throw new Error('MewsWebhookHandler not yet implemented - use legacy code for now');

      case 'hotelspider':
        return new HotelSpiderWebhookHandler(hotelId);

      default:
        throw new Error(`Unknown PMS type: ${pmsType}`);
    }
  }

  /**
   * Check if a PMS type is supported
   * @param pmsType - The PMS type to check
   * @returns True if supported
   */
  static isSupported(pmsType: PmsType): boolean {
    return pmsType === 'mews' || pmsType === 'hotelspider';
  }

  /**
   * Get list of supported PMS types
   * @returns Array of supported PMS types
   */
  static getSupportedPmsTypes(): PmsType[] {
    return ['mews', 'hotelspider'];
  }
}
