import PDFDocument from 'pdfkit';
import { prisma } from './prisma';
import { startOfMonth, endOfMonth } from 'date-fns';
import { put } from '@vercel/blob';

export async function generateInvoice(hotelId: string, year: number, month: number) {
    // 1. Daten holen
    const startDate = startOfMonth(new Date(year, month - 1));
    const endDate = endOfMonth(new Date(year, month - 1));

    const orders = await prisma.treeOrder.findMany({
        where: {
            hotelId,
            bookedAt: {
                gte: startDate,
                lte: endDate,
            },
        },
    });

    const totalTrees = orders.reduce((sum: number, order: any) => sum + order.quantity, 0);
    const totalAmount = orders.reduce((sum: number, order: any) => sum + order.amount, 0);

    if (totalTrees === 0) {
        return { status: 'skipped', reason: 'No trees found' };
    }

    const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
    if (!hotel) throw new Error('Hotel not found');

    // 2. Prüfen ob Rechnung schon existiert -> Löschen um Duplikate zu vermeiden
    const existingInvoice = await prisma.invoice.findFirst({
        where: {
            hotelId,
            month,
            year
        }
    });

    if (existingInvoice) {
        console.log(`🗑️ Lösche alte Rechnung für ${hotel.name} (${month}/${year})`);
        await prisma.invoice.delete({
            where: { id: existingInvoice.id }
        });
    }

    // 3. PDF im Buffer (Arbeitsspeicher) generieren
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument();
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // --- PDF INHALT START ---
        doc.fontSize(25).text('Click A Tree Invoice', { align: 'center' });
        doc.moveDown();
        doc.fontSize(14).text(`Hotel: ${hotel.name}`);
        doc.text(`Date: ${new Date().toLocaleDateString()}`);
        doc.text(`Period: ${month}/${year}`);
        doc.moveDown();

        doc.text(`Total Trees Planted: ${totalTrees}`);
        doc.text(`Total Amount: ${totalAmount.toFixed(2)} EUR`);

        doc.moveDown();
        doc.text('Thank you for making the world greener!');
        // --- PDF INHALT ENDE ---

        doc.end();
    });

    // 4. PDF zu Vercel Blob hochladen
    const fileName = `invoices/${hotel.mewsId}_${year}_${month}.pdf`;

    const blob = await put(fileName, pdfBuffer, {
        access: 'public',
        addRandomSuffix: false // Überschreiben erzwingen
    });

    // 5. Datenbank Eintrag erstellen
    await prisma.invoice.create({
        data: {
            hotelId,
            month,
            year,
            totalTrees,
            totalAmount,
            pdfPath: blob.url,
        },
    });

    return { status: 'created', path: blob.url };
}