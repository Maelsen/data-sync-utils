import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateInvoice } from '@/lib/invoice';

export async function POST() {
    try {
        console.log("📝 Starte Rechnungsstellung...");

        // 1. Alle Hotels laden
        const hotels = await prisma.hotel.findMany();
        const results = [];

        // Aktueller Monat und Jahr
        const now = new Date();
        const month = now.getMonth() + 1; // JS Monate sind 0-basiert
        const year = now.getFullYear();

        // 2. Für jedes Hotel eine Rechnung generieren
        for (const hotel of hotels) {
            console.log(`Verarbeite Hotel: ${hotel.name}...`);

            // Ruft deine existierende Logik in lib/invoice.ts auf
            const pdfPath = await generateInvoice(hotel.id, year, month);

            if (pdfPath) {
                results.push({ hotel: hotel.name, status: 'created', path: pdfPath });
            } else {
                results.push({ hotel: hotel.name, status: 'skipped', reason: 'No trees found' });
            }
        }

        return NextResponse.json({
            success: true,
            message: `Rechnungen verarbeitet für ${hotels.length} Hotels`,
            details: results
        });

    } catch (error: any) {
        console.error("Invoice Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}