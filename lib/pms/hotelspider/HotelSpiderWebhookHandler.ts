/**
 * HotelSpider Webhook Handler
 *
 * Handles OTA_HotelResNotifRQ XML webhooks from HotelSpider
 * Parses XML and extracts tree order information
 */

import {
  IPmsWebhookHandler,
  WebhookProcessResult,
} from '../interfaces/IPmsWebhookHandler';
import { TreeOrderData } from '../interfaces/IPmsClient';
import { parseStringPromise } from 'xml2js';
import { credentialManager, HotelSpiderCredentials } from '@/lib/credential-manager';

export class HotelSpiderWebhookHandler implements IPmsWebhookHandler {
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
   * Validate webhook using HTTP Basic Auth
   */
  validateWebhook(rawPayload: string, headers: Record<string, string>): boolean {
    // HotelSpider uses HTTP Basic Authentication
    const authHeader = headers['authorization'] || headers['Authorization'] || '';

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      console.log('HotelSpider webhook: No Basic Auth header found');
      return false;
    }

    // Note: Full validation would require async credential fetch
    // This is a simplified check - the actual validation happens in processWebhook
    return true;
  }

  /**
   * Validate Basic Auth credentials
   */
  private async validateBasicAuth(headers: Record<string, string>): Promise<boolean> {
    try {
      const authHeader = headers['authorization'] || headers['Authorization'] || '';

      if (!authHeader || !authHeader.startsWith('Basic ')) {
        return false;
      }

      // Decode Base64 credentials
      const base64Credentials = authHeader.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      const [username, password] = credentials.split(':');

      // Get stored credentials
      const storedCreds = await this.getCredentials();

      // Compare (constant-time comparison would be better for production)
      return username === storedCreds.username && password === storedCreds.password;
    } catch (error) {
      console.error('Basic Auth validation error:', error);
      return false;
    }
  }

  /**
   * Process OTA_HotelResNotifRQ webhook
   */
  async processWebhook(
    rawPayload: string,
    headers: Record<string, string>
  ): Promise<WebhookProcessResult> {
    try {
      // Validate authentication
      const isAuthenticated = await this.validateBasicAuth(headers);
      if (!isAuthenticated) {
        return {
          success: false,
          processedOrders: [],
          errors: ['Authentication failed'],
        };
      }

      // Parse XML
      const parsed = await parseStringPromise(rawPayload, {
        explicitArray: false,
        mergeAttrs: true,
      });

      const orders: TreeOrderData[] = [];

      // Navigate XML structure: OTA_HotelResNotifRQ -> HotelReservations -> HotelReservation
      const otaRoot = parsed?.OTA_HotelResNotifRQ;
      if (!otaRoot) {
        throw new Error('Invalid XML: OTA_HotelResNotifRQ root not found');
      }

      const hotelReservations = otaRoot.HotelReservations?.HotelReservation;
      if (!hotelReservations) {
        // No reservations in this notification
        return {
          success: true,
          processedOrders: [],
        };
      }

      // Ensure hotelReservations is an array
      const reservations = Array.isArray(hotelReservations)
        ? hotelReservations
        : [hotelReservations];

      // Process each reservation
      for (const reservation of reservations) {
        // Get reservation ID
        const reservationId =
          reservation.UniqueID?.ID ||
          reservation.ResGlobalInfo?.HotelReservationIDs?.HotelReservationID?.ResID_Value ||
          'unknown';

        // Get booking date
        const createDateTime = reservation.CreateDateTime || reservation.TimeStamp || new Date().toISOString();
        const bookedAt = new Date(createDateTime);

        // Look for tree services in RoomStays -> Services
        const roomStays = reservation.RoomStays?.RoomStay;
        if (roomStays) {
          const roomStaysArray = Array.isArray(roomStays) ? roomStays : [roomStays];

          for (const roomStay of roomStaysArray) {
            const services = roomStay.Services?.Service;
            if (services) {
              const servicesArray = Array.isArray(services) ? services : [services];

              for (const service of servicesArray) {
                // Check if this is a tree service
                if (this.isTreeService(service)) {
                  const order: TreeOrderData = {
                    externalId: `${reservationId}-${service.ServiceRPH || service.Code || 'tree'}`,
                    quantity: parseInt(service.Quantity || '1', 10),
                    amount: parseFloat(service.Price?.Amount || service.TotalAmount || '0'),
                    currency: service.Price?.CurrencyCode || service.CurrencyCode || 'EUR',
                    bookedAt,
                    reservationId,
                    metadata: {
                      serviceCode: service.ServiceRPH || service.Code,
                      serviceName: service.ServiceName || service.Description,
                    },
                  };

                  orders.push(order);
                }
              }
            }
          }
        }

        // Also check for tree services in top-level Services
        const topLevelServices = reservation.Services?.Service;
        if (topLevelServices) {
          const servicesArray = Array.isArray(topLevelServices)
            ? topLevelServices
            : [topLevelServices];

          for (const service of servicesArray) {
            if (this.isTreeService(service)) {
              const order: TreeOrderData = {
                externalId: `${reservationId}-${service.ServiceRPH || service.Code || 'tree'}`,
                quantity: parseInt(service.Quantity || '1', 10),
                amount: parseFloat(service.Price?.Amount || service.TotalAmount || '0'),
                currency: service.Price?.CurrencyCode || service.CurrencyCode || 'EUR',
                bookedAt,
                reservationId,
                metadata: {
                  serviceCode: service.ServiceRPH || service.Code,
                  serviceName: service.ServiceName || service.Description,
                },
              };

              orders.push(order);
            }
          }
        }
      }

      return {
        success: true,
        processedOrders: orders,
        metadata: {
          reservationCount: reservations.length,
          treeOrderCount: orders.length,
        },
      };
    } catch (error: any) {
      console.error('HotelSpider webhook processing error:', error);
      return {
        success: false,
        processedOrders: [],
        errors: [error.message || 'Unknown error'],
      };
    }
  }

  /**
   * Check if a service is tree-related
   */
  private isTreeService(service: any): boolean {
    // Check various fields for tree-related keywords
    const serviceCode = (service.ServiceRPH || service.Code || '').toLowerCase();
    const serviceName = (service.ServiceName || service.Description || '').toLowerCase();

    const treeKeywords = ['tree', 'baum', 'bäume', 'plant', 'pflanzen', 'forest', 'wald'];

    return treeKeywords.some(
      (keyword) => serviceCode.includes(keyword) || serviceName.includes(keyword)
    );
  }
}
