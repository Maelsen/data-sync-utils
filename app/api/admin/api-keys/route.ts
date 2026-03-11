/**
 * Admin API Key Management
 *
 * POST /api/admin/api-keys        - Create a new API key for a PMS developer
 * GET  /api/admin/api-keys         - List all API keys (without revealing the full key)
 *
 * Protected by ADMIN_SECRET environment variable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomBytes, createHash } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * Verify admin access via Bearer token matching ADMIN_SECRET env var
 */
function verifyAdmin(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret) return false;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;

  return authHeader.slice(7) === adminSecret;
}

/**
 * Hash an API key using SHA-256
 */
function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * POST - Create a new API key for a PMS developer
 *
 * Body: { pmsName: string, contactName?: string, contactEmail?: string }
 * Returns the plain-text key ONCE (it's hashed in DB and can never be retrieved again)
 */
export async function POST(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { pmsName?: string; contactName?: string; contactEmail?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.pmsName || typeof body.pmsName !== 'string' || body.pmsName.trim().length < 2) {
    return NextResponse.json(
      { error: 'pmsName is required (min 2 characters)' },
      { status: 400 }
    );
  }

  const pmsName = body.pmsName.toLowerCase().trim();

  // Generate a secure random API key (64 hex chars = 32 bytes)
  const plainKey = randomBytes(32).toString('hex');
  const keyHash = hashKey(plainKey);
  const keyPrefix = plainKey.substring(0, 8);

  const apiKey = await prisma.apiKey.create({
    data: {
      pmsName,
      keyHash,
      keyPrefix,
      contactName: body.contactName || null,
      contactEmail: body.contactEmail || null,
    },
  });

  return NextResponse.json({
    success: true,
    message: `API key created for "${pmsName}". IMPORTANT: Save this key now - it cannot be retrieved later.`,
    apiKey: {
      id: apiKey.id,
      pmsName: apiKey.pmsName,
      key: plainKey, // Only returned ONCE at creation
      keyPrefix: apiKey.keyPrefix,
      contactName: apiKey.contactName,
      contactEmail: apiKey.contactEmail,
      createdAt: apiKey.createdAt,
    },
  });
}

/**
 * GET - List all API keys (without revealing the full key)
 */
export async function GET(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const keys = await prisma.apiKey.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      pmsName: true,
      keyPrefix: true,
      contactName: true,
      contactEmail: true,
      active: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ keys });
}
