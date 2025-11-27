import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { prisma } from './prisma';
import { startOfMonth, endOfMonth } from 'date-fns';

export async function generateInvoice(hotelId: string, year: number, month: number) {
    // Date range for the month (0-indexed month in JS Date)
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
        return null; // No invoice needed
    }

    const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
    if (!hotel) throw new Error('Hotel not found');

    const doc = new PDFDocument();
    const fileName = `invoice_${hotel.mewsId}_${year}_${month}.pdf`;
    const filePath = path.join(process.cwd(), 'public', 'invoices', fileName);

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // PDF Content
    doc.fontSize(25).text('Click A Tree Invoice', { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Hotel: ${hotel.name}`);
    doc.text(`Date: ${new Date().toLocaleDateString()}`);
    doc.text(`Period: ${month}/${year}`);
    doc.moveDown();

    doc.text(`Total Trees Planted: ${totalTrees}`);
    doc.text(`Total Amount: ${totalAmount.toFixed(2)} EUR`); // Assuming EUR for now

    doc.moveDown();
    doc.text('Thank you for making the world greener!');

    doc.end();

    // Save invoice record to DB
    await prisma.invoice.create({
        data: {
            hotelId,
            month,
            year,
            totalTrees,
            totalAmount,
            pdfPath: `/invoices/${fileName}`,
        },
    });

    return `/invoices/${fileName}`;
}
