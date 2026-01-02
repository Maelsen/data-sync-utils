/**
 * HotelSpider PMS Client
 *
 * Implements IPmsClient for HotelSpider PMS
 * Note: HotelSpider primarily uses push-based webhooks (OTA_HotelResNotifRQ)
 * so sync functionality may be limited
 */

import { IPmsClient, TreeOrderData, HotelInfo } from '../interfaces/IPmsClient';
import { credentialManager, HotelSpiderCredentials } from '@/lib/credential-manager';

export class HotelSpiderClient implements IPmsClient {
  private hotelId: string;
  private credentials: HotelSpiderCredentials | null = null;

  constructor(hotelId: string) {
    this.hotelId = hotelId;
  }

  /**
   * Get credentials for this hotel (with caching)
   */
  private async getCredentials(): Promise<HotelSpiderCredentials> {
    if (!this.credentials) {
      this.credentials = await credentialManager.getHotelSpiderCredentials(this.hotelId);
    }
    return this.credentials;
  }

  /**
   * Sync tree orders for a date range
   *
   * Note: HotelSpider is primarily PUSH-based via OTA_HotelResNotifRQ webhooks
   * This method may not be fully implemented as sync is not the primary integration method
   *
   * @param startDate - Start date for sync
   * @param endDate - End date for sync
   * @returns Array of tree orders (likely empty for push-only integration)
   */
  async syncOrders(startDate: Date, endDate: Date): Promise<TreeOrderData[]> {
    console.log(
      `HotelSpider sync not implemented - using push-only webhooks for hotel ${this.hotelId}`
    );
    console.log(`Requested sync period: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // HotelSpider uses OTA_HotelResNotifRQ push notifications
    // We rely on webhooks for tree order data
    // If needed in the future, this could query a local cache or HotelSpider's API

    return [];
  }

  /**
   * Get hotel information
   */
  async getHotelInfo(): Promise<HotelInfo> {
    const creds = await this.getCredentials();

    return {
      externalId: creds.hotelCode,
      name: `Hotel ${creds.hotelCode}`, // HotelSpider doesn't provide name via API, store in DB
      metadata: {
        pms: 'hotelspider',
        hotelCode: creds.hotelCode,
      },
    };
  }

  /**
   * Validate credentials
   * For HotelSpider, we just check if credentials exist and are properly formatted
   * A full validation would require a test API call, which HotelSpider may not provide
   */
  async validateCredentials(): Promise<boolean> {
    try {
      const creds = await this.getCredentials();

      // Check that all required fields are present
      const isValid =
        !!creds.username &&
        !!creds.password &&
        !!creds.hotelCode &&
        creds.username.length > 0 &&
        creds.password.length > 0 &&
        creds.hotelCode.length > 0;

      return isValid;
    } catch (error) {
      console.error('HotelSpider credential validation failed:', error);
      return false;
    }
  }
}
