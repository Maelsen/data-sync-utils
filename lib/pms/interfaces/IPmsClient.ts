/**
 * PMS Client Interface
 *
 * Abstract interface for PMS API clients (Mews, HotelSpider, etc.)
 * Provides common methods for syncing orders and managing hotel data
 */

/**
 * Tree order data structure (normalized across all PMS systems)
 */
export interface TreeOrderData {
  externalId: string;       // PMS-specific order ID (will be prefixed with pmsType)
  quantity: number;          // Number of trees
  amount: number;            // Total amount
  currency: string;          // Currency code (EUR, USD, etc.)
  bookedAt: Date;            // When the order was booked
  guestName?: string;        // Optional guest name
  reservationId?: string;    // Optional reservation ID
  metadata?: Record<string, any>; // Optional PMS-specific metadata
}

/**
 * Hotel information from PMS
 */
export interface HotelInfo {
  externalId: string;        // PMS-specific hotel ID
  name: string;              // Hotel name
  metadata?: Record<string, any>; // Optional PMS-specific metadata
}

/**
 * PMS Client Interface
 */
export interface IPmsClient {
  /**
   * Sync tree orders for a date range
   * @param startDate - Start date for sync
   * @param endDate - End date for sync
   * @returns Array of tree orders
   */
  syncOrders(startDate: Date, endDate: Date): Promise<TreeOrderData[]>;

  /**
   * Get hotel information from PMS
   * @returns Hotel information
   */
  getHotelInfo(): Promise<HotelInfo>;

  /**
   * Validate credentials by attempting to connect to PMS
   * @returns True if credentials are valid
   */
  validateCredentials(): Promise<boolean>;
}
