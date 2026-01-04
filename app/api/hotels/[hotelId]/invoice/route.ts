/**
 * Invoice Generation API for Hotel Orders
 *
 * POST /api/hotels/[hotelId]/invoice
 * Generates a PDF invoice for the specified month/year
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import PDFDocument from 'pdfkit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/hotels/[hotelId]/invoice
 * Generate PDF invoice for specified month/year
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ hotelId: string }> }
) {
  try {
    const { hotelId } = await params;
    const body = await request.json();
    const { month, year } = body;

    if (!month || !year) {
      return NextResponse.json(
        { error: 'Missing required fields: month, year' },
        { status: 400 }
      );
    }

    // Fetch hotel
    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
    });

    if (!hotel) {
      return NextResponse.json({ error: 'Hotel not found' }, { status: 404 });
    }

    // Fetch orders for the specified month/year
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const orders = await prisma.treeOrder.findMany({
      where: {
        hotelId,
        bookedAt: {
          gte: startDate,
          lte: endDate,
        },
        amount: { gt: 0 }, // Only non-canceled orders
      },
      orderBy: { bookedAt: 'asc' },
    });

    if (orders.length === 0) {
      return NextResponse.json(
        { error: 'No orders found for this period' },
        { status: 404 }
      );
    }

    // Calculate totals with 5.90 per tree
    const totalAmount = orders.reduce((sum, order) => sum + order.amount, 0);
    const totalTrees = Math.round(totalAmount / 5.9);
    const currency = orders[0]?.currency || 'EUR';

    // Recalculate quantity for each order
    const ordersWithQuantity = orders.map(order => ({
      ...order,
      quantity: Math.round((order.amount || 0) / 5.9) || order.quantity
    }));

    // Generate PDF
    const pdfBuffer = await generateInvoicePDF({
      hotel,
      month,
      year,
      orders: ordersWithQuantity,
      totalTrees,
      totalAmount,
      currency,
    });

    // Return PDF as download
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${hotel.name.replace(/[^a-zA-Z0-9]/g, '-')}-${month}-${year}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('Error generating invoice:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate invoice' },
      { status: 500 }
    );
  }
}

/**
 * Generate PDF invoice using PDFKit
 */
async function generateInvoicePDF(data: {
  hotel: any;
  month: number;
  year: number;
  orders: any[];
  totalTrees: number;
  totalAmount: number;
  currency: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const monthName = new Date(0, data.month - 1).toLocaleString('en', {
      month: 'long',
    });

    // Header
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('Click A Tree', 50, 50)
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#666666')
      .text('Tree Planting Partner', 50, 80);

    // Title
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#000000')
      .text('Order Summary', 50, 120);

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#666666')
      .text(`Period: ${monthName} ${data.year}`, 50, 145)
      .text(`Generated: ${new Date().toLocaleDateString('de-DE')}`, 50, 160);

    // Hotel Information
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#000000')
      .text('Hotel Information', 50, 200);

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#333333')
      .text(`Name: ${data.hotel.name}`, 50, 220)
      .text(`PMS Type: ${data.hotel.pmsType.toUpperCase()}`, 50, 235)
      .text(`Hotel ID: ${data.hotel.externalId || data.hotel.id}`, 50, 250);

    // Summary Box
    const summaryY = 290;
    doc
      .rect(50, summaryY, 500, 80)
      .fillAndStroke('#f0f9ff', '#3b82f6');

    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#000000')
      .text('Summary', 60, summaryY + 15);

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#333333')
      .text(`Total Trees Planted: ${data.totalTrees}`, 60, summaryY + 35)
      .text(
        `Total Amount: ${data.totalAmount.toFixed(2)} ${data.currency}`,
        60,
        summaryY + 50
      );

    // Orders Table
    const tableTop = summaryY + 100;
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#000000')
      .text('Order Details', 50, tableTop);

    // Table Header
    const headerY = tableTop + 25;
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor('#666666')
      .text('Check-in Date', 50, headerY)
      .text('Order Created', 150, headerY)
      .text('Qty', 280, headerY)
      .text('Amount', 330, headerY)
      .text('Status', 420, headerY);

    doc
      .strokeColor('#cccccc')
      .lineWidth(1)
      .moveTo(50, headerY + 15)
      .lineTo(550, headerY + 15)
      .stroke();

    // Table Rows
    let currentY = headerY + 25;
    const maxRowsPerPage = 20;
    let rowCount = 0;

    data.orders.forEach((order, index) => {
      // Add new page if needed
      if (rowCount >= maxRowsPerPage) {
        doc.addPage();
        currentY = 50;
        rowCount = 0;
      }

      const bookedDate = new Date(order.bookedAt).toLocaleDateString('de-DE');
      const createdDate = new Date(order.createdAt).toLocaleDateString('de-DE');
      const createdTime = new Date(order.createdAt).toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
      });

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#000000')
        .text(bookedDate, 50, currentY)
        .text(`${createdDate} ${createdTime}`, 150, currentY, { width: 120 })
        .text(order.quantity.toString(), 280, currentY)
        .text(`${order.amount.toFixed(2)} ${order.currency}`, 330, currentY)
        .fillColor('#10b981')
        .text('Confirmed', 420, currentY);

      currentY += 20;
      rowCount++;

      // Separator line
      if (index < data.orders.length - 1) {
        doc
          .strokeColor('#eeeeee')
          .lineWidth(0.5)
          .moveTo(50, currentY - 5)
          .lineTo(550, currentY - 5)
          .stroke();
      }
    });

    // Footer
    doc
      .fontSize(8)
      .fillColor('#999999')
      .text(
        'This is an informational summary, not an official invoice.',
        50,
        doc.page.height - 50,
        { align: 'center', width: 500 }
      );

    doc.end();
  });
}
