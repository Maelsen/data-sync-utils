import axios from 'axios';

// API URL: defaults to production, can override via env for demo/testing
const MEWS_API_URL = process.env.MEWS_API_URL || 'https://api.mews.com/api/connector/v1';

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

    /**
     * Get all products
     * https://mews-systems.gitbook.io/connector-api/operations/products#get-all-products
     *
     * CRITICAL: IncludeDefault must be true to get ALL products (default + extra products)
     */
    async getProducts(serviceIds: string[], cursor?: string) {
        const payload: any = cursor
            ? {
                // Pagination request: only Limitation with Cursor
                Limitation: {
                    Count: 1000,
                    Cursor: cursor
                }
            }
            : {
                // Initial request: ServiceIds + IncludeDefault + Limitation
                ServiceIds: serviceIds,
                IncludeDefault: true, // ESSENTIAL! Without this, default products are excluded
                Limitation: { Count: 1000 }
            };

        return this.request('products/getAll', payload);
    }

    /**
     * Get all order items (replaces deprecated Items, OrderItems, ProductAssignments)
     * https://mews-systems.gitbook.io/connector-api/operations/orderitems#get-all-order-items
     *
     * NOTE: Using unversioned endpoint for compatibility with demo environment
     * IMPORTANT: UpdatedUtc must be included in ALL requests, even with cursor
     */
    async getOrderItems(
        serviceIds: string[],
        updatedUtc: { StartUtc: string; EndUtc: string },
        cursor?: string
    ) {
        const payload: any = {
            // UpdatedUtc is required in ALL requests (initial + pagination)
            UpdatedUtc: {
                StartUtc: updatedUtc.StartUtc,
                EndUtc: updatedUtc.EndUtc
            },
            Limitation: cursor
                ? { Count: 1000, Cursor: cursor }
                : { Count: 1000 }
        };

        // ServiceIds is optional - omit to get all services
        // if (serviceIds.length > 0) {
        //     payload.ServiceIds = serviceIds;
        // }

        return this.request('orderitems/getAll', payload);
    }

    async getConfiguration() {
        // Useful to get services/products IDs if needed
        return this.request('configuration/get');
    }

    /**
     * Get all services
     * Fallback when configuration/get returns no Services
     */
    async getServices() {
        return this.request('services/getAll');
    }

    /**
     * Get reservations by IDs (to get check-in dates)
     * https://mews-systems.gitbook.io/connector-api/operations/reservations#get-all-reservations-ver-2023-06-06
     *
     * NOTE: OrderItem.ServiceOrderId = ReservationId
     * Use ScheduledStartUtc from response for check-in date
     */
    async getReservationsByIds(reservationIds: string[], cursor?: string) {
        const payload: any = cursor
            ? {
                // Pagination request: only Limitation with Cursor
                Limitation: {
                    Count: 1000,
                    Cursor: cursor
                }
            }
            : {
                // Initial request: ReservationIds + Limitation
                // NOTE: Parameter is ReservationIds (NOT ServiceOrderIds)
                ReservationIds: reservationIds,
                Limitation: { Count: 1000 }
            };

        return this.request('reservations/getAll/2023-06-06', payload);
    }
}

export default { MewsClient };
