// API client wrapper with retry logic, rate limiting, and circuit breaker
// Centralizes all Mews API calls for certification review

import { mewsRateLimiter } from './rate-limiter';
import { mewsCircuitBreaker } from './circuit-breaker';
import { mewsLogger } from './logger';
import { prisma } from './prisma';

export class MewsAPIError extends Error {
    constructor(
        message: string,
        public code: string,
        public statusCode: number,
        public retryable: boolean = false
    ) {
        super(message);
        this.name = 'MewsAPIError';
    }
}

interface MewsAPIOptions {
    maxRetries?: number;
    retryDelay?: number;
    timeout?: number;
}

class MewsAPIClient {
    private baseURL = 'https://api.mews.com';
    private clientToken: string;
    private accessToken: string;

    constructor() {
        this.clientToken = process.env.MEWS_CLIENT_TOKEN || '';
        this.accessToken = process.env.MEWS_ACCESS_TOKEN || '';

        if (!this.clientToken || !this.accessToken) {
            throw new Error('Mews API credentials not configured');
        }
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private isRetryable(statusCode: number): boolean {
        // Retry on server errors and rate limits
        return statusCode === 429 || statusCode >= 500;
    }

    async call<T>(
        endpoint: string,
        method: 'GET' | 'POST' = 'POST',
        body?: any,
        options: MewsAPIOptions = {}
    ): Promise<T> {
        const {
            maxRetries = 3,
            retryDelay = 1000,
            timeout = 30000,
        } = options;

        const url = `${this.baseURL}${endpoint}`;
        const startTime = Date.now();
        let lastError: Error | null = null;

        // Log API call
        mewsLogger.debug('api_call', `Calling ${method} ${endpoint}`, { body });

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // Rate limiting
                await mewsRateLimiter.acquire();

                // Circuit breaker
                const response = await mewsCircuitBreaker.execute(async () => {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), timeout);

                    try {
                        const res = await fetch(url, {
                            method,
                            headers: {
                                'Content-Type': 'application/json',
                                'Client-Token': this.clientToken,
                                'Access-Token': this.accessToken,
                            },
                            body: body ? JSON.stringify(body) : undefined,
                            signal: controller.signal,
                        });

                        clearTimeout(timeoutId);
                        return res;
                    } catch (error) {
                        clearTimeout(timeoutId);
                        throw error;
                    }
                });

                const duration = Date.now() - startTime;
                const responseData = await response.json();

                // Log to database for certification review
                await this.logAPICall(endpoint, method, response.status, duration, true);

                if (!response.ok) {
                    const error = new MewsAPIError(
                        responseData.Message || 'Mews API error',
                        responseData.Code || 'UNKNOWN_ERROR',
                        response.status,
                        this.isRetryable(response.status)
                    );

                    if (error.retryable && attempt < maxRetries) {
                        const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
                        mewsLogger.warn(
                            'api_retry',
                            `Retrying ${endpoint} (attempt ${attempt + 1}/${maxRetries})`,
                            { statusCode: response.status, delay }
                        );
                        await this.sleep(delay);
                        continue;
                    }

                    throw error;
                }

                mewsLogger.info('api_success', `${method} ${endpoint} succeeded`, {
                    duration,
                    statusCode: response.status,
                });

                return responseData as T;

            } catch (error) {
                lastError = error as Error;
                const duration = Date.now() - startTime;

                // Log failed attempt
                await this.logAPICall(endpoint, method, 0, duration, false, lastError.message);

                if (error instanceof MewsAPIError && !error.retryable) {
                    throw error;
                }

                if (attempt === maxRetries) {
                    mewsLogger.error(
                        'api_failed',
                        `${method} ${endpoint} failed after ${maxRetries} retries`,
                        lastError,
                        { duration }
                    );
                    throw error;
                }

                // Exponential backoff
                const delay = retryDelay * Math.pow(2, attempt);
                await this.sleep(delay);
            }
        }

        throw lastError || new Error('Unknown error');
    }

    private async logAPICall(
        endpoint: string,
        method: string,
        statusCode: number,
        duration: number,
        success: boolean,
        error?: string
    ) {
        try {
            await prisma.apiLog.create({
                data: {
                    endpoint,
                    method,
                    statusCode,
                    duration,
                    success,
                    error,
                    timestamp: new Date(),
                },
            });
        } catch (err) {
            // Don't fail the API call if logging fails
            mewsLogger.error('log_failed', 'Failed to log API call', err as Error);
        }
    }

    // Convenience methods for common endpoints
    async getOrders(serviceId: string, startUtc: string, endUtc: string) {
        return this.call('/api/connector/v1/orders/getAll', 'POST', {
            ClientToken: this.clientToken,
            AccessToken: this.accessToken,
            ServiceIds: [serviceId],
            CreatedUtc: {
                StartUtc: startUtc,
                EndUtc: endUtc,
            },
        });
    }

    async getReservations(startUtc: string, endUtc: string) {
        return this.call('/api/connector/v1/reservations/getAll', 'POST', {
            ClientToken: this.clientToken,
            AccessToken: this.accessToken,
            TimeFilter: {
                StartUtc: startUtc,
                EndUtc: endUtc,
            },
        });
    }
}

// Singleton instance
export const mewsAPI = new MewsAPIClient();

export default MewsAPIClient;
