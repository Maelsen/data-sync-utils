// Circuit breaker pattern to prevent cascading failures
// Stops calling Mews API if it's consistently failing

import { mewsLogger } from './logger';

export enum CircuitState {
    CLOSED = 'closed',     // Normal operation
    OPEN = 'open',         // API is down, reject immediately
    HALF_OPEN = 'half_open' // Testing if API recovered
}

interface CircuitBreakerConfig {
    failureThreshold: number; // Number of failures before opening
    successThreshold: number; // Number of successes to close from half-open
    timeout: number;          // Time to wait before trying again (ms)
}

class CircuitBreaker {
    private state: CircuitState = CircuitState.CLOSED;
    private failureCount: number = 0;
    private successCount: number = 0;
    private nextAttempt: number = Date.now();
    private config: CircuitBreakerConfig;

    constructor(config: Partial<CircuitBreakerConfig> = {}) {
        this.config = {
            failureThreshold: 5,
            successThreshold: 2,
            timeout: 60000, // 1 minute
            ...config,
        };
    }

    async execute<T>(fn: () => Promise<T>): Promise<T> {
        if (this.state === CircuitState.OPEN) {
            if (Date.now() < this.nextAttempt) {
                throw new Error('Circuit breaker is OPEN - API is unavailable');
            }
            // Try to recover
            this.state = CircuitState.HALF_OPEN;
            mewsLogger.info('circuit_breaker', 'Attempting to recover from OPEN state');
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    private onSuccess() {
        this.failureCount = 0;

        if (this.state === CircuitState.HALF_OPEN) {
            this.successCount++;
            if (this.successCount >= this.config.successThreshold) {
                this.state = CircuitState.CLOSED;
                this.successCount = 0;
                mewsLogger.info('circuit_breaker', 'Circuit breaker CLOSED - API recovered');
            }
        }
    }

    private onFailure() {
        this.failureCount++;
        this.successCount = 0;

        if (this.failureCount >= this.config.failureThreshold) {
            this.state = CircuitState.OPEN;
            this.nextAttempt = Date.now() + this.config.timeout;
            mewsLogger.error(
                'circuit_breaker',
                `Circuit breaker OPEN - Too many failures (${this.failureCount})`,
                undefined,
                { nextAttempt: new Date(this.nextAttempt).toISOString() }
            );
        }
    }

    getState(): CircuitState {
        return this.state;
    }

    reset() {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        mewsLogger.info('circuit_breaker', 'Circuit breaker manually reset');
    }
}

// Singleton instance for Mews API
export const mewsCircuitBreaker = new CircuitBreaker();

export default CircuitBreaker;
