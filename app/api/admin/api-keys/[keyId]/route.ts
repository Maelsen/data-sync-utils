/**
 * Admin API Key Management - Single Key Operations
 *
 * PATCH  /api/admin/api-keys/{keyId}  - Activate or deactivate a key
 * DELETE /api/admin/api-keys/{keyId}  - Permanently delete a key
 *
 * Protected by ADMIN_SECRET environment variable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function verifyAdmin(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret) return false;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;

  return authHeader.slice(7) === adminSecret;
}

/**
 * PATCH - Activate or deactivate a key
 * Body: { active: boolean }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ keyId: string }> }
) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { keyId } = await params;

  let body: { active?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.active !== 'boolean') {
    return NextResponse.json(
      { error: 'active (boolean) is required' },
      { status: 400 }
    );
  }

  try {
    const updated = await prisma.apiKey.update({
      where: { id: keyId },
      data: { active: body.active },
      select: {
        id: true,
        pmsName: true,
        keyPrefix: true,
        active: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: `API key ${updated.active ? 'activated' : 'deactivated'} for "${updated.pmsName}"`,
      apiKey: updated,
    });
  } catch {
    return NextResponse.json({ error: 'API key not found' }, { status: 404 });
  }
}

/**
 * DELETE - Permanently delete a key
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ keyId: string }> }
) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { keyId } = await params;

  try {
    const deleted = await prisma.apiKey.delete({
      where: { id: keyId },
      select: { id: true, pmsName: true, keyPrefix: true },
    });

    return NextResponse.json({
      success: true,
      message: `API key permanently deleted for "${deleted.pmsName}" (prefix: ${deleted.keyPrefix}...)`,
    });
  } catch {
    return NextResponse.json({ error: 'API key not found' }, { status: 404 });
  }
}
