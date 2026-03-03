import { prisma } from './prisma';
import { decrypt } from './encryption';
import { PmsType } from '@prisma/client';

/**
 * Mews credentials interface
 */
export interface MewsCredentials {
  clientToken: string;
  accessToken: string;
}

/**
 * HotelSpider credentials interface
 */
export interface HotelSpiderCredentials {
  username: string;
  password: string;
  hotelCode: string;
}

/**
 * HotelPartner / res-online credentials interface
 */
export interface HotelPartnerCredentials {
  username: string;
  password: string;
  hotelId: string;
  extraId: string | null;
}

/**
 * Generic PMS credentials type
 */
export type PmsCredentials = MewsCredentials | HotelSpiderCredentials | HotelPartnerCredentials;

/**
 * Credential Manager
 * Handles retrieving and decrypting hotel credentials from the database
 */
export class CredentialManager {
  /**
   * Get Mews credentials for a hotel
   * @param hotelId - The hotel ID
   * @returns Decrypted Mews credentials
   * @throws Error if credentials not found or invalid
   */
  async getMewsCredentials(hotelId: string): Promise<MewsCredentials> {
    try {
      const creds = await prisma.hotelCredentials.findUnique({
        where: { hotelId },
      });

      if (!creds || !creds.mewsClientToken || !creds.mewsAccessToken) {
        throw new Error(`Mews credentials not found for hotel ${hotelId}`);
      }

      // Decrypt the credentials
      const clientToken = decrypt(creds.mewsClientToken);
      const accessToken = decrypt(creds.mewsAccessToken);

      return {
        clientToken,
        accessToken,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get Mews credentials: ${error.message}`);
      }
      throw new Error('Failed to get Mews credentials: Unknown error');
    }
  }

  /**
   * Get HotelSpider credentials for a hotel
   * @param hotelId - The hotel ID
   * @returns Decrypted HotelSpider credentials
   * @throws Error if credentials not found or invalid
   */
  async getHotelSpiderCredentials(hotelId: string): Promise<HotelSpiderCredentials> {
    try {
      const creds = await prisma.hotelCredentials.findUnique({
        where: { hotelId },
      });

      if (
        !creds ||
        !creds.hotelspiderUsername ||
        !creds.hotelspiderPassword ||
        !creds.hotelspiderHotelCode
      ) {
        throw new Error(`HotelSpider credentials not found for hotel ${hotelId}`);
      }

      // Decrypt the credentials (hotelCode is stored in plaintext)
      const username = decrypt(creds.hotelspiderUsername);
      const password = decrypt(creds.hotelspiderPassword);
      const hotelCode = creds.hotelspiderHotelCode;

      return {
        username,
        password,
        hotelCode,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get HotelSpider credentials: ${error.message}`);
      }
      throw new Error('Failed to get HotelSpider credentials: Unknown error');
    }
  }

  /**
   * Get HotelPartner credentials for a hotel
   * @param hotelId - The hotel ID
   * @returns Decrypted HotelPartner credentials
   * @throws Error if credentials not found or invalid
   */
  async getHotelPartnerCredentials(hotelId: string): Promise<HotelPartnerCredentials> {
    try {
      const creds = await prisma.hotelCredentials.findUnique({
        where: { hotelId },
      });

      if (
        !creds ||
        !creds.hotelpartnerUsername ||
        !creds.hotelpartnerPassword ||
        !creds.hotelpartnerHotelId
      ) {
        throw new Error(`HotelPartner credentials not found for hotel ${hotelId}`);
      }

      // Decrypt the credentials (hotelId and extraId are stored in plaintext)
      const username = decrypt(creds.hotelpartnerUsername);
      const password = decrypt(creds.hotelpartnerPassword);
      const hpHotelId = creds.hotelpartnerHotelId;
      const extraId = creds.hotelpartnerExtraId || null;

      return {
        username,
        password,
        hotelId: hpHotelId,
        extraId,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get HotelPartner credentials: ${error.message}`);
      }
      throw new Error('Failed to get HotelPartner credentials: Unknown error');
    }
  }

  /**
   * Get credentials for a hotel based on its PMS type
   * @param hotelId - The hotel ID
   * @param pmsType - The PMS type (mews, hotelspider, or hotelpartner)
   * @returns Decrypted PMS credentials
   * @throws Error if credentials not found or invalid
   */
  async getCredentialsForPms(
    hotelId: string,
    pmsType: PmsType
  ): Promise<PmsCredentials> {
    if (pmsType === 'mews') {
      return this.getMewsCredentials(hotelId);
    } else if (pmsType === 'hotelspider') {
      return this.getHotelSpiderCredentials(hotelId);
    } else if (pmsType === 'hotelpartner') {
      return this.getHotelPartnerCredentials(hotelId);
    } else {
      throw new Error(`Unknown PMS type: ${pmsType}`);
    }
  }

  /**
   * Check if credentials exist for a hotel
   * @param hotelId - The hotel ID
   * @returns True if credentials exist
   */
  async hasCredentials(hotelId: string): Promise<boolean> {
    const creds = await prisma.hotelCredentials.findUnique({
      where: { hotelId },
    });
    return creds !== null;
  }

  /**
   * Validate credentials format (without connecting to PMS)
   * @param hotelId - The hotel ID
   * @param pmsType - The PMS type
   * @returns True if credentials are properly formatted
   */
  async validateCredentialsFormat(hotelId: string, pmsType: PmsType): Promise<boolean> {
    try {
      const creds = await this.getCredentialsForPms(hotelId, pmsType);

      if (pmsType === 'mews') {
        const mewsCreds = creds as MewsCredentials;
        return !!mewsCreds.clientToken && !!mewsCreds.accessToken;
      } else if (pmsType === 'hotelspider') {
        const spiderCreds = creds as HotelSpiderCredentials;
        return (
          !!spiderCreds.username &&
          !!spiderCreds.password &&
          !!spiderCreds.hotelCode
        );
      } else if (pmsType === 'hotelpartner') {
        const hpCreds = creds as HotelPartnerCredentials;
        return (
          !!hpCreds.username &&
          !!hpCreds.password &&
          !!hpCreds.hotelId
        );
      }

      return false;
    } catch {
      return false;
    }
  }
}

/**
 * Singleton instance of CredentialManager
 */
export const credentialManager = new CredentialManager();
