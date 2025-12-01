// Webhook handler for processing Mews events
// Handles ServiceOrderCreated, ServiceOrderUpdated, etc.

import { prisma } from './prisma';
import { webhookLogger } from './logger';

export interface MewsWebhookEvent {
    Id: string;
    Type: string; // ServiceOrderCreated, ServiceOrderUpdated, etc.
    CreatedUtc: string;
    Data: any;
}

export interface ServiceOrderData {
    Id: string;
    ServiceId: string;
    ReservationId?: string;
    AccountingCategoryId?: string;
    Amount: {
        Currency: string;
        NetValue: number;
        GrossValue: number;
        TaxValues: Array<{
            Code: string;
            Value: number;
        }>;
    };
    Count: number; // Quantity
    UnitCost: {
        Currency: string;
        NetValue: number;
        GrossValue: number;
    };
    State: string; // Confirmed, Canceled, etc.
}

class WebhookHandler {
    async processEvent(event: MewsWebhookEvent): Promise<void> {
        webhookLogger.info('process_event', `Processing ${event.Type}`, {
            eventId: event.Id,
            eventType: event.Type,
        });

        try {
            // Store event in database for audit trail
            const storedEvent = await prisma.webhookEvent.upsert({
                where: { eventId: event.Id },
                create: {
                    eventId: event.Id,
                    eventType: event.Type,
                    payload: event as any,
                    processed: false,
                },
                update: {
                    retryCount: { increment: 1 },
                },
            });

            // Route to appropriate handler
            switch (event.Type) {
                case 'ServiceOrderCreated':
                    await this.handleServiceOrderCreated(event.Data);
                    break;
                case 'ServiceOrderUpdated':
                    await this.handleServiceOrderUpdated(event.Data);
                    break;
                case 'ServiceOrderCanceled':
                    await this.handleServiceOrderCanceled(event.Data);
                    break;
                default:
                    webhookLogger.warn('unknown_event', `Unknown event type: ${event.Type}`, {
                        eventId: event.Id,
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

            webhookLogger.info('event_processed', `Successfully processed ${event.Type}`, {
                eventId: event.Id,
            });
        } catch (error) {
            webhookLogger.error('event_failed', `Failed to process ${event.Type}`, error as Error, {
                eventId: event.Id,
            });

            // Store error in database
            await prisma.webhookEvent.updateMany({
                where: { eventId: event.Id },
                data: {
                    error: (error as Error).message,
                },
            });

            throw error;
        }
    }

    private async handleServiceOrderCreated(data: ServiceOrderData) {
        webhookLogger.info('order_created', 'New tree order detected', {
            orderId: data.Id,
            quantity: data.Count,
        });

        // Check if this is a tree order (you'll need to configure the ServiceId)
        const treeServiceId = process.env.TREE_SERVICE_ID;
        if (data.ServiceId !== treeServiceId) {
            webhookLogger.debug('skip_order', 'Not a tree order, skipping', {
                serviceId: data.ServiceId,
            });
            return;
        }

        // Find or create hotel
        // Note: We need to get hotel info from the reservation or configuration
        // For now, we'll use a placeholder - this needs to be enhanced
        const hotel = await this.getOrCreateHotel(data);

        // Create tree order
        await prisma.treeOrder.upsert({
            where: { mewsId: data.Id },
            create: {
                mewsId: data.Id,
                hotelId: hotel.id,
                quantity: data.Count,
                amount: data.Amount.GrossValue,
                currency: data.Amount.Currency,
                bookedAt: new Date(),
            },
            update: {
                quantity: data.Count,
                amount: data.Amount.GrossValue,
            },
        });

        webhookLogger.info('order_saved', 'Tree order saved to database', {
            orderId: data.Id,
            hotelId: hotel.id,
            quantity: data.Count,
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

        await prisma.treeOrder.update({
            where: { mewsId: data.Id },
            data: {
                quantity: data.Count,
                amount: data.Amount.GrossValue,
            },
        });

        webhookLogger.info('order_updated_success', 'Tree order updated in database', {
            orderId: data.Id,
            quantity: data.Count,
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
                await this.processEvent(event.payload as MewsWebhookEvent);
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
