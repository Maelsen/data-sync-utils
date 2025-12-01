import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateInvoice } from '@/lib/invoice';


export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
    try {
        // Daten aus dem Frontend lesen
        const body = await request.json().catch(() => ({}));
        
        let month = body.month ? parseInt(body.month) : null;
        let year = body.year ? parseInt(body.year) : null;

        // Fallback: Wenn nichts ausgewählt wurde, nimm den Vormonat
        if (!month || !year) {
            const now = new Date();
            now.setMonth(now.getMonth() - 1);
            month = now.getMonth() + 1;
            year = now.getFullYear();
        }

        console.log(`📝 Starte Rechnungsstellung für Zeitraum: ${month}/${year}...`);

        const hotels = await prisma.hotel.findMany();
        const results = [];

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