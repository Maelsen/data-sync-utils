// Rate limiter to protect against Mews API rate limits (100 req/min)
// Uses token bucket algorithm

interface RateLimiterConfig {
    maxTokens: number; // Max requests per window
    refillRate: number; // Tokens added per second
    windowMs: number; // Time window in milliseconds
}

class RateLimiter {
    private tokens: number;
    private lastRefill: number;
    private config: RateLimiterConfig;
    private queue: Array<() => void> = [];

    constructor(config: Partial<RateLimiterConfig> = {}) {
        this.config = {
            maxTokens: parseInt(process.env.RATE_LIMIT_PER_MIN || '90'), // Conservative
            refillRate: 1.5, // 90 per minute = 1.5 per second
            windowMs: 60000, // 1 minute
            ...config,
        };
        this.tokens = this.config.maxTokens;
        this.lastRefill = Date.now();
    }

    private refill() {
        const now = Date.now();
        const timePassed = now - this.lastRefill;
        const tokensToAdd = (timePassed / 1000) * this.config.refillRate;

        this.tokens = Math.min(this.config.maxTokens, this.tokens + tokensToAdd);
        this.lastRefill = now;
    }

    async acquire(): Promise<void> {
        this.refill();

        if (this.tokens >= 1) {
            this.tokens -= 1;
            return Promise.resolve();
        }

        // Wait until a token is available
        return new Promise((resolve) => {
            const checkToken = () => {
                this.refill();
                if (this.tokens >= 1) {
                    this.tokens -= 1;
                    resolve();
                } else {
                    setTimeout(checkToken, 100); // Check every 100ms
                }
            };
            checkToken();
        });
    }

    async execute<T>(fn: () => Promise<T>): Promise<T> {
        await this.acquire();
        return fn();
    }

    getAvailableTokens(): number {
        this.refill();
        return Math.floor(this.tokens);
    }
}

// Singleton instance for Mews API calls
export const mewsRateLimiter = new RateLimiter();

export default RateLimiter;
