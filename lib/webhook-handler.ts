// Webhook handler for processing Mews events
// Handles ServiceOrderCreated, ServiceOrderUpdated, etc.

import { prisma } from './prisma';
import { webhookLogger } from './logger';

export interface MewsWebhookEnvelope {
    EnterpriseId: string;
    IntegrationId: string;
    Events: Array<{
        Discriminator: string; // e.g. ServiceOrderUpdated
        Value: {
            Id: string;
        };
    }>;
    Entities: {
        ServiceOrders?: ServiceOrderData[];
        [key: string]: any;
    };
}

export interface ServiceOrderData {
    Id: string;
    ServiceId: string;
    // ... other fields matching previous interface, loosely typed to avoid breaks
    Count?: number;
    Amount?: {
        GrossValue: number;
        Currency: string;
        [key: string]: any;
    };
    State: string;
    [key: string]: any;
}

class WebhookHandler {
    async processEnvelope(envelope: MewsWebhookEnvelope): Promise<void> {
        webhookLogger.info('process_envelope', `Received envelope with ${envelope.Events.length} events`);

        for (const event of envelope.Events) {
            const eventId = event.Value.Id;
            const eventType = event.Discriminator;

            try {
                // Store event in database for audit trail
                // Note: We're storing individual events flattened
                const storedEvent = await prisma.webhookEvent.upsert({
                    where: { eventId: eventId },
                    create: {
                        eventId: eventId,
                        eventType: eventType,
                        payload: envelope as any, // Store full envelope for context
                        processed: false,
                    },
                    update: {
                        retryCount: { increment: 1 },
                    },
                });

                // Route to appropriate handler
                switch (eventType) {
                    case 'ServiceOrderCreated':
                    case 'ServiceOrderUpdated':
                    case 'ServiceOrderCanceled':
                        // Find entity in envelope
                        const entity = envelope.Entities?.ServiceOrders?.find(o => o.Id === eventId);
                        if (entity) {
                            if (eventType === 'ServiceOrderCreated') await this.handleServiceOrderCreated(entity);
                            if (eventType === 'ServiceOrderUpdated') await this.handleServiceOrderUpdated(entity);
                            if (eventType === 'ServiceOrderCanceled') await this.handleServiceOrderCanceled(entity);
                        } else {
                            webhookLogger.warn('entity_missing', `Entity for event ${eventId} not found in envelope`);
                        }
                        break;
                    default:
                        webhookLogger.warn('unknown_event', `Unknown event type: ${eventType}`, {
                            eventId: eventId,
                        });
                }

                // Mark as processed
                await prisma.webhookEvent.update({
                    where: { id: storedEvent.id },
                    data: {
                        processed: true,
                        processedAt: new Date(),
                    },
                });

            } catch (error) {
                webhookLogger.error('event_failed', `Failed to process ${eventType}`, error as Error, {
                    eventId: eventId,
                });
                // Continue to next event even if one fails
            }
        }
    }

    // Legacy method / Main entry point that detects format
    async processEvent(event: any): Promise<void> {
        // Redirect to envelope handler if it looks like an envelope
        if (event.events || event.Events) {
            // Handle case sensitivity just in case, though Mews is usually PascalCase
            const envelope = event as MewsWebhookEnvelope;
            return this.processEnvelope(envelope);
        }

        // Fallback for unexpected formats - log and ignore or try to process if it matches old single event format
        webhookLogger.warn('unknown_format', 'Received webhook with unknown format (not an envelope)', {
            keys: Object.keys(event),
        });
    }

    private async handleServiceOrderCreated(data: ServiceOrderData) {
        webhookLogger.info('order_created', 'New service order detected', {
            orderId: data.Id,
            serviceId: data.ServiceId,
            quantity: data.Count,
        });

        // TEMPORARY: Accept ALL service orders for testing
        // TODO: Later filter by TREE_SERVICE_ID
        webhookLogger.info('accepting_order', 'Processing order (all services accepted for testing)', {
            serviceId: data.ServiceId,
        });

        // Find or create hotel
        const hotel = await this.getOrCreateHotel(data);

        const quantity = data.Count || 1;
        const amount = data.Amount?.GrossValue || 0;
        const currency = data.Amount?.Currency || 'EUR';

        // Create tree order
        await prisma.treeOrder.upsert({
            where: { mewsId: data.Id },
            create: {
                mewsId: data.Id,
                hotelId: hotel.id,
                quantity: quantity,
                amount: amount,
                currency: currency,
                bookedAt: new Date(),
            },
            update: {
                quantity: quantity,
                amount: amount,
            },
        });

        webhookLogger.info('order_saved', 'Tree order saved to database', {
            orderId: data.Id,
            hotelId: hotel.id,
            quantity: quantity,
        });
    }

    private async handleServiceOrderUpdated(data: ServiceOrderData) {
        webhookLogger.info('order_updated', 'Tree order updated', {
            orderId: data.Id,
            quantity: data.Count,
        });

        // Update existing order
        const existingOrder = await prisma.treeOrder.findUnique({
            where: { mewsId: data.Id },
        });

        if (!existingOrder) {
            webhookLogger.warn('order_not_found', 'Order not found, creating new', {
                orderId: data.Id,
            });
            await this.handleServiceOrderCreated(data);
            return;
        }

        const quantity = data.Count || 1;
        const amount = data.Amount?.GrossValue || 0;

        await prisma.treeOrder.update({
            where: { mewsId: data.Id },
            data: {
                quantity: quantity,
                amount: amount,
            },
        });

        webhookLogger.info('order_updated_success', 'Tree order updated in database', {
            orderId: data.Id,
            quantity: quantity,
        });
    }

    private async handleServiceOrderCanceled(data: ServiceOrderData) {
        webhookLogger.info('order_canceled', 'Tree order canceled', {
            orderId: data.Id,
        });

        // Delete the order
        await prisma.treeOrder.deleteMany({
            where: { mewsId: data.Id },
        });

        webhookLogger.info('order_deleted', 'Tree order removed from database', {
            orderId: data.Id,
        });
    }

    private async getOrCreateHotel(data: ServiceOrderData): Promise<any> {
        // TODO: This needs to be enhanced to properly identify the hotel
        // For now, we'll use a default hotel from the database
        // In production, you'd extract hotel info from the reservation or use hotel config

        const defaultHotel = await prisma.hotel.findFirst();

        if (!defaultHotel) {
            throw new Error('No hotel configured - please set up hotel in database');
        }

        return defaultHotel;
    }

    // Process pending events (for retry logic)
    async processPendingEvents(): Promise<void> {
        const pendingEvents = await prisma.webhookEvent.findMany({
            where: {
                processed: false,
                retryCount: { lt: 5 }, // Max 5 retries
            },
            orderBy: { createdAt: 'asc' },
            take: 10,
        });

        webhookLogger.info('process_pending', `Processing ${pendingEvents.length} pending events`);

        for (const event of pendingEvents) {
            try {
                // Try to process as envelope
                await this.processEvent(event.payload);
            } catch (error) {
                webhookLogger.error('retry_failed', 'Failed to process pending event', error as Error, {
                    eventId: event.eventId,
                    retryCount: event.retryCount,
                });
            }
        }
    }
}

export const webhookHandler = new WebhookHandler();
export default WebhookHandler;
