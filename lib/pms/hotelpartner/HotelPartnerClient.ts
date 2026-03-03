/**
 * HotelPartner PMS Client
 *
 * Implements IPmsClient for HotelPartner / res-online.net (B.E. Quick WBE)
 *
 * Note: HotelPartner's API is a Web Booking Engine, not a traditional PMS.
 * There is no endpoint to query existing reservations.
 * Primary integration is PUSH-based via webhooks.
 * The syncOrders method validates the tree extra exists but returns []
 * since we rely on webhooks for actual order data.
 */

import { IPmsClient, TreeOrderData, HotelInfo } from '../interfaces/IPmsClient';
import { credentialManager, HotelPartnerCredentials } from '@/lib/credential-manager';
import { HotelPartnerClient as ApiClient } from '@/lib/hotelpartner';

export class HotelPartnerClient implements IPmsClient {
  private hotelId: string;
  private credentials: HotelPartnerCredentials | null = null;
  private apiClient: ApiClient | null = null;

  constructor(hotelId: string) {
    this.hotelId = hotelId;
  }

  /**
   * Get credentials (with caching)
   */
  private async getCredentials(): Promise<HotelPartnerCredentials> {
    if (!this.credentials) {
      this.credentials = await credentialManager.getHotelPartnerCredentials(this.hotelId);
    }
    return this.credentials;
  }

  /**
   * Get API client (with caching)
   */
  private async getApiClient(): Promise<ApiClient> {
    if (!this.apiClient) {
      const creds = await this.getCredentials();
      this.apiClient = new ApiClient(creds.username, creds.password, creds.hotelId);
    }
    return this.apiClient;
  }

  /**
   * Sync tree orders
   *
   * HotelPartner WBE API does not have a reservation query endpoint.
   * This method validates the tree extra exists and is properly configured.
   * Actual order data comes via webhooks (push-based).
   */
  async syncOrders(startDate: Date, endDate: Date): Promise<TreeOrderData[]> {
    console.log(
      `HotelPartner sync: validating tree extra for hotel ${this.hotelId} ` +
      `(period: ${startDate.toISOString()} to ${endDate.toISOString()})`
    );

    const client = await this.getApiClient();
    const creds = await this.getCredentials();

    // Validate the tree extra exists
    const treeExtra = await client.findTreeExtra(creds.extraId || undefined);
    if (treeExtra) {
      console.log(
        `HotelPartner: Tree extra found - "${treeExtra.internName}" ` +
        `(ID: ${treeExtra.id}, Price: ${treeExtra.price} EUR)`
      );
    } else {
      console.warn(
        `HotelPartner: Tree extra NOT found for hotel ${creds.hotelId}. ` +
        `Check extra configuration in res-online.`
      );
    }

    // WBE API has no reservation query endpoint - rely on webhooks
    return [];
  }

  /**
   * Get hotel information
   */
  async getHotelInfo(): Promise<HotelInfo> {
    const creds = await this.getCredentials();
    const client = await this.getApiClient();

    let name = `HotelPartner Hotel ${creds.hotelId}`;
    try {
      const content = await client.getContent();
      if (content.name) {
        name = content.name;
      }
    } catch {
      // Content endpoint might not return a name - use default
    }

    return {
      externalId: creds.hotelId,
      name,
      metadata: {
        pms: 'hotelpartner',
        hotelId: creds.hotelId,
        extraId: creds.extraId,
      },
    };
  }

  /**
   * Validate credentials by calling the extras endpoint
   */
  async validateCredentials(): Promise<boolean> {
    try {
      const client = await this.getApiClient();
      return await client.validateCredentials();
    } catch (error) {
      console.error('HotelPartner credential validation failed:', error);
      return false;
    }
  }
}
