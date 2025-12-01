import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateInvoice } from '@/lib/invoice';

export async function POST() {
    try {
        console.log("📝 Starte Rechnungsstellung...");

        const hotels = await prisma.hotel.findMany();
        const results = [];

        // ÄNDERUNG: Wir nehmen den VORMONAT, nicht den aktuellen
        const now = new Date();
        now.setMonth(now.getMonth() - 1); // Gehe einen Monat zurück (handhabt auch Jahreswechsel automatisch)
        
        const month = now.getMonth() + 1; // JS Monate sind 0-basiert, daher +1
        const year = now.getFullYear();

        console.log(`Generiere Rechnungen für Zeitraum: ${month}/${year}`);

        for (const hotel of hotels) {
            const pdfPath = await generateInvoice(hotel.id, year, month);

            if (pdfPath) {
                results.push({ hotel: hotel.name, status: 'created', path: pdfPath });
            } else {
                results.push({ hotel: hotel.name, status: 'skipped', reason: 'No trees found' });
            }
        }

        return NextResponse.json({
            success: true,
            message: `Rechnungen verarbeitet für ${hotels.length} Hotels (Zeitraum: ${month}/${year})`,
            details: results
        });

    } catch (error: any) {
        console.error("Invoice Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}