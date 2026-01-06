import axios from 'axios';

// Demo endpoint for sandbox credentials
const MEWS_API_URL = 'https://api.mews-demo.com/api/connector/v1';

interface MewsConfig {
    clientToken: string;
    accessToken: string;
    clientName?: string; // e.g. "Click A Tree Integration 1.0.0"
}

export class MewsClient {
    private config: MewsConfig;

    constructor(config: MewsConfig) {
        this.config = config;
    }

    private async request(endpoint: string, data: any = {}) {
        try {
            const response = await axios.post(`${MEWS_API_URL}/${endpoint}`, {
                ClientToken: this.config.clientToken,
                AccessToken: this.config.accessToken,
                Client: this.config.clientName || 'Click A Tree Integration 1.0.0',
                ...data,
            });
            return response.data;
        } catch (error: any) {
            console.error(`Mews API Error [${endpoint}]:`, error.response?.data || error.message);
            throw error;
        }
    }

    async getReservations(startUtc: string, endUtc: string, cursor?: string) {
        // https://mews-systems.gitbook.io/connector-api/operations/reservations#get-all-reservations-ver-2023-06-06
        // Version 2023-06-06 does NOT support Extent or TimeFilter parameters
        // Instead it uses UpdatedUtc as an object and Cursor goes inside Limitation

        const payload: any = cursor
            ? {
                // Pagination request: only Limitation with Cursor
                Limitation: {
                    Count: 1000,
                    Cursor: cursor
                }
            }
            : {
                // Initial request: UpdatedUtc interval + Limitation
                UpdatedUtc: {
                    StartUtc: startUtc,
                    EndUtc: endUtc
                },
                Limitation: { Count: 1000 }
            };

        return this.request('reservations/getAll/2023-06-06', payload);
    }

    async getConfiguration() {
        // Useful to get services/products IDs if needed
        return this.request('configuration/get');
    }
}

export default { MewsClient };
