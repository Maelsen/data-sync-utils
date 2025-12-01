// Structured logging system for Mews certification
// Provides consistent log format and levels

export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
}

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    service: string;
    action: string;
    message: string;
    hotelId?: string;
    duration?: number;
    metadata?: Record<string, any>;
    error?: string;
}

class Logger {
    private serviceName: string;
    private minLevel: LogLevel;

    constructor(serviceName: string) {
        this.serviceName = serviceName;
        this.minLevel = (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO;
    }

    private shouldLog(level: LogLevel): boolean {
        const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
        return levels.indexOf(level) >= levels.indexOf(this.minLevel);
    }

    private formatLog(entry: LogEntry): string {
        return JSON.stringify(entry);
    }

    private log(level: LogLevel, action: string, message: string, metadata?: Record<string, any>) {
        if (!this.shouldLog(level)) return;

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            service: this.serviceName,
            action,
            message,
            ...metadata,
        };

        const formatted = this.formatLog(entry);

        switch (level) {
            case LogLevel.ERROR:
                console.error(formatted);
                break;
            case LogLevel.WARN:
                console.warn(formatted);
                break;
            default:
                console.log(formatted);
        }
    }

    debug(action: string, message: string, metadata?: Record<string, any>) {
        this.log(LogLevel.DEBUG, action, message, metadata);
    }

    info(action: string, message: string, metadata?: Record<string, any>) {
        this.log(LogLevel.INFO, action, message, metadata);
    }

    warn(action: string, message: string, metadata?: Record<string, any>) {
        this.log(LogLevel.WARN, action, message, metadata);
    }

    error(action: string, message: string, error?: Error, metadata?: Record<string, any>) {
        this.log(LogLevel.ERROR, action, message, {
            ...metadata,
            error: error?.message,
            stack: error?.stack,
        });
    }

    // Helper for timing operations
    async time<T>(
        action: string,
        fn: () => Promise<T>,
        metadata?: Record<string, any>
    ): Promise<T> {
        const start = Date.now();
        try {
            const result = await fn();
            const duration = Date.now() - start;
            this.info(action, 'Operation completed', { ...metadata, duration });
            return result;
        } catch (error) {
            const duration = Date.now() - start;
            this.error(action, 'Operation failed', error as Error, { ...metadata, duration });
            throw error;
        }
    }
}

// Export singleton instances for different services
export const mewsLogger = new Logger('mews-integration');
export const webhookLogger = new Logger('webhook-handler');
export const invoiceLogger = new Logger('invoice-generator');
export const apiLogger = new Logger('api');

export default Logger;
