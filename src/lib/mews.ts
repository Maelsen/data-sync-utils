import axios from 'axios';

// Demo endpoint for sandbox credentials
const MEWS_API_URL = 'https://api.mews-demo.com/api/connector/v1';

interface MewsConfig {
    clientToken: string;
    accessToken: string;
}

export class MewsClient {
    private config: MewsConfig;

    constructor(config: MewsConfig) {
        this.config = config;
    }

    private async request(endpoint: string, data: any = {}) {
        // --- DEBUG: SPION ---
        console.log(`📡 Mews Request an: ${MEWS_API_URL}/${endpoint}`);
        // --------------------

        try {
            const response = await axios.post(`${MEWS_API_URL}/${endpoint}`, {
                ClientToken: this.config.clientToken,
                AccessToken: this.config.accessToken,
                ...data,
            });
            return response.data;
        } catch (error: any) {
            console.error(`❌ Mews API Error [${endpoint}]:`, error.response?.data || error.message);
            throw error;
        }
    }

    async getReservations(startUtc: string, endUtc: string, cursor?: string) {
        const payload = cursor
            ? { Cursor: cursor }
            : {
                  StartUtc: startUtc,
                  EndUtc: endUtc,
                  Extent: {
                      Products: true,
                      Items: true, // posted charges
                      ProductAssignments: true, // pre-stay upsells
                      Orders: true,
                      OrderItems: true, // same products but in orders structure
                      Services: true,
                  },
              };

        return this.request('reservations/getAll', payload);
    }

    async getConfiguration() {
        return this.request('configuration/get');
    }
}

export default { MewsClient };
