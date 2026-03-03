/**
 * HotelPartner / res-online.net API Client
 *
 * Wrapper for the Hopa API (B.E. Quick Web Booking Engine)
 * Base URL: https://api.res-online.net
 * Auth: HTTP Basic Authentication
 *
 * Key endpoints:
 *  - GET /api/extra?hotelId=X          → List extras (incl. "Baum pflanzen")
 *  - GET /api/content?hotelId=X        → Hotel content/info
 *  - POST /api/create/reservation      → Create reservation (write access required)
 *
 * Note: This API is a Web Booking Engine, not a PMS.
 * Reservations flow through to Apaleo (PMS).
 * There is no endpoint to query existing reservations.
 * Integration uses push-based webhooks for tree order tracking.
 */

const HOTELPARTNER_API_URL = process.env.HOTELPARTNER_API_URL || 'https://api.res-online.net';

export interface HotelPartnerExtra {
  id: number;
  linkHotel: number;
  internName: string;
  publicName: Record<string, string>;
  publicDescription: Record<string, string>;
  price: number;
  priceConfig: Array<{
    id: number;
    type: string;
    price: string;
    childPrice: any[];
    calculatedPrice: any;
  }>;
  quantityBase: number;
  quantityMax: number;
  wbeMode: number;
  platformDisplay: string[];
  included: boolean;
  tags: Array<{
    tag: { id: number; kind: string; label: string };
    value: { id: number; value: string; valueKey: string };
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface HotelPartnerApiResponse<T> {
  meta: {
    errors: string[];
    isCached: boolean;
    other: any[];
  };
  data: T;
}

export interface HotelPartnerContentInfo {
  name?: string;
  address?: string;
  city?: string;
  country?: string;
  [key: string]: any;
}

/**
 * Tree extra keywords for auto-detection
 */
const TREE_KEYWORDS = [
  'baum pflanzen',
  'plant a tree',
  'tree planting',
  'click a tree',
  'clickatree',
  'click-a-tree',
];

export class HotelPartnerClient {
  private username: string;
  private password: string;
  private hotelId: string;
  private baseUrl: string;

  constructor(username: string, password: string, hotelId: string) {
    this.username = username;
    this.password = password;
    this.hotelId = hotelId;
    this.baseUrl = HOTELPARTNER_API_URL;
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const authHeader = 'Basic ' + Buffer.from(`${this.username}:${this.password}`).toString('base64');

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HotelPartner API error ${response.status}: ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get all extras for this hotel
   */
  async getExtras(): Promise<HotelPartnerExtra[]> {
    const response = await this.request<HotelPartnerApiResponse<HotelPartnerExtra[]>>(
      `/api/extra?hotelId=${this.hotelId}`
    );

    if (response.meta.errors.length > 0) {
      throw new Error(`HotelPartner API errors: ${response.meta.errors.join(', ')}`);
    }

    return response.data || [];
  }

  /**
   * Find the tree planting extra by ID or name
   */
  async findTreeExtra(extraId?: string): Promise<HotelPartnerExtra | null> {
    const extras = await this.getExtras();

    // If we have a specific extra ID, find by ID
    if (extraId) {
      const found = extras.find(e => e.id.toString() === extraId);
      if (found) return found;
    }

    // Otherwise, search by name keywords
    for (const extra of extras) {
      const internName = (extra.internName || '').toLowerCase();
      const publicNameDe = (extra.publicName?.de || '').toLowerCase();
      const publicNameEn = (extra.publicName?.en || '').toLowerCase();

      for (const keyword of TREE_KEYWORDS) {
        if (
          internName.includes(keyword) ||
          publicNameDe.includes(keyword) ||
          publicNameEn.includes(keyword)
        ) {
          return extra;
        }
      }
    }

    return null;
  }

  /**
   * Get hotel content/info
   */
  async getContent(): Promise<HotelPartnerContentInfo> {
    const response = await this.request<HotelPartnerApiResponse<HotelPartnerContentInfo>>(
      `/api/content?hotelId=${this.hotelId}`
    );

    if (response.meta.errors.length > 0) {
      throw new Error(`HotelPartner API errors: ${response.meta.errors.join(', ')}`);
    }

    return response.data;
  }

  /**
   * Validate credentials by calling the extras endpoint
   */
  async validateCredentials(): Promise<boolean> {
    try {
      const extras = await this.getExtras();
      return Array.isArray(extras);
    } catch {
      return false;
    }
  }

  /**
   * Get localized name from a name object
   */
  static getLocalizedName(
    nameObj: Record<string, string> | string | null | undefined,
    preferredLang: string = 'de'
  ): string {
    if (!nameObj) return '';
    if (typeof nameObj === 'string') return nameObj;
    return nameObj[preferredLang] || nameObj['en'] || nameObj['de'] || Object.values(nameObj)[0] || '';
  }
}
