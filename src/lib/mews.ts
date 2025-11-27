import axios from 'axios';

const MEWS_API_URL = 'https://api.mews.com/api/connector/v1';

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
        try {
            const response = await axios.post(`${MEWS_API_URL}/${endpoint}`, {
                ClientToken: this.config.clientToken,
                AccessToken: this.config.accessToken,
                ...data,
            });
            return response.data;
        } catch (error: any) {
            console.error(`Mews API Error [${endpoint}]:`, error.response?.data || error.message);
            throw error;
        }
    }

    async getReservations(startUtc: string, endUtc: string) {
        // https://mews-systems.gitbook.io/connector-api/operations/reservations#get-all-reservations
        return this.request('reservations/getAll', {
            StartUtc: startUtc,
            EndUtc: endUtc,
            Extent: {
                Products: true, // We need products to see the "Tree" upsells
                Items: true,
            },
        });
    }

    async getConfiguration() {
        // Useful to get services/products IDs if needed
        return this.request('configuration/get');
    }
}
