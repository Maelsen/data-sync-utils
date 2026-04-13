/**
 * SIHOT@360° Open API Client
 *
 * REST wrapper for the SIHOT Connectivity API.
 * Base URL: partner-api.sihot.com/PDOCS/API/CBS/Services/v2.0
 * OpenAPI Spec: https://partner-api.sihot.com/PDOCS/API/CBS/Services/v2.0/openapi.json
 * Docs: https://partner.sihot.com/rest/v2.0/services/
 *
 * Auth flow:
 *   1. POST /S_AUTHENTICATE  with { AuthenticationInfos: { user, password, hotel, product } }
 *      → returns { Authentication: { SecurityID, ValidUntilUTC, DurationInSec } }
 *   2. Subsequent calls pass { Authentication: { SecurityID } } in their body.
 *
 * Notification lifecycle:
 *   - SIHOT pushes events to the URL we registered (we only implement receiver).
 *   - Each push contains AUTOTASK.TASK-OBJID.
 *   - After successful processing we POST /S_NOTIFICATION_CONFIRM  { NOTIFICATION-CONFIRM: { TASK-OBJID } }
 *   - On failure we POST /S_NOTIFICATION_ERROR_SET  { NOTIFICATION-ERROR: { TASK-OBJID, ErrorMsg } }
 *
 * Registration of notifications is done by SIHOT support (Joana) for the test environment.
 * For production we can call /S_NOTIFICATION_REGISTER ourselves — implemented here for completeness.
 */

import axios, { AxiosInstance } from 'axios';

const SIHOT_API_URL = process.env.SIHOT_API_URL
  || 'https://partner-api.sihot.com/PDOCS/API/CBS/Services/v2.0';

export interface SihotCredentials {
  username: string;   // e.g. "CR!"
  password: string;   // e.g. "Clickatree2026"
  hotelId: string;    // e.g. "1"
  productId: string;  // e.g. "5806d28ff34f40359e20ba0398062061"
}

interface CachedSession {
  securityId: string;
  validUntil: Date;
}

export class SihotClient {
  private creds: SihotCredentials;
  private http: AxiosInstance;
  private session: CachedSession | null = null;

  constructor(creds: SihotCredentials) {
    this.creds = creds;
    this.http = axios.create({
      baseURL: SIHOT_API_URL,
      timeout: 30_000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /** Get a valid SecurityID, authenticating if the cache is empty or expiring soon. */
  private async getSecurityId(): Promise<string> {
    // Refresh if token expires in less than 60 seconds
    if (this.session && this.session.validUntil.getTime() - Date.now() > 60_000) {
      return this.session.securityId;
    }

    const body = {
      TransactionID: `auth-${Date.now()}`,
      AuthenticationInfos: {
        user: this.creds.username,
        password: this.creds.password,
        hotel: Number(this.creds.hotelId),
        product: this.creds.productId,
      },
    };

    const res = await this.http.post('/S_AUTHENTICATE', body);
    const auth = res.data?.Authentication;
    if (!auth?.SecurityID) {
      throw new Error(`SIHOT authentication failed: ${JSON.stringify(res.data)}`);
    }

    this.session = {
      securityId: auth.SecurityID,
      validUntil: auth.ValidUntilUTC ? new Date(auth.ValidUntilUTC) : new Date(Date.now() + 60 * 60 * 1000),
    };
    return this.session.securityId;
  }

  /** Wrap any business call with authentication. */
  private async authed(endpoint: string, payload: Record<string, any>): Promise<any> {
    const securityId = await this.getSecurityId();
    const body = {
      TransactionID: `tx-${Date.now()}`,
      Authentication: { SecurityID: securityId },
      ...payload,
    };
    const res = await this.http.post(endpoint, body);
    return res.data;
  }

  /**
   * Confirm successful processing of a received notification.
   * Must be called for every inbound notification unless confirmationDisabled
   * was set at registration time.
   */
  async confirmNotification(taskObjId: string | number): Promise<void> {
    await this.authed('/S_NOTIFICATION_CONFIRM', {
      'NOTIFICATION-CONFIRM': { 'TASK-OBJID': Number(taskObjId) },
    });
  }

  /**
   * Report an error for a received notification. SIHOT will retry per its config.
   */
  async reportNotificationError(taskObjId: string | number, errorMsg: string): Promise<void> {
    await this.authed('/S_NOTIFICATION_ERROR_SET', {
      'NOTIFICATION-ERROR': {
        'TASK-OBJID': Number(taskObjId),
        ErrorMsg: errorMsg.slice(0, 500),
        SysMessage: false,
      },
    });
  }

  /**
   * Fetch full reservation details by objId. Used when a basic push lacks fields we need.
   * (Not mandatory for the minimal integration — COMPLETE push events already contain everything.)
   */
  async getReservation(reservationObjId: string | number): Promise<any> {
    return this.authed('/S_RESERVATION_GET', {
      'RESERVATION-GET': { 'RESERVATION-OBJID': Number(reservationObjId) },
    });
  }

  /**
   * Register for a notification type. Run once during onboarding.
   * Joana handles this for the test environment — this is provided for production usage.
   */
  async registerNotification(params: {
    notificationId: string; // e.g. "S_RESERVATION_COMPLETE_PUSH"
    notificationUrl: string;
    confirmationDisabled?: boolean;
    activeAllHotels?: boolean;
    apitype?: 'REST' | 'SOAP';
    triggers?: string[];
    constraints?: string[];
  }): Promise<any> {
    return this.authed('/S_NOTIFICATION_REGISTER', {
      'NOTIFICATION-REGISTER': {
        product: this.creds.productId,
        notificationid: params.notificationId,
        notificationurl: params.notificationUrl,
        confirmationdisabled: params.confirmationDisabled ?? false,
        activeallhotels: params.activeAllHotels ?? false,
        apitype: params.apitype ?? 'REST',
        TRIGGER: (params.triggers ?? []).map(key => ({ key })),
        CONSTRAINT: (params.constraints ?? []).map(key => ({ key })),
      },
    });
  }

  /** List available notification types (useful for debugging). */
  async searchAvailableNotifications(): Promise<any> {
    return this.authed('/S_NOTIFICATION_SEARCH', { 'NOTIFICATION-SEARCH': {} });
  }
}
