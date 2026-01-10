import { NextResponse } from 'next/server';

/**
 * DEBUG: Shows which env vars are being used (masked)
 */
export async function GET() {
  const clientToken = process.env.MEWS_CLIENT_TOKEN || '';
  const accessToken = process.env.MEWS_ACCESS_TOKEN || '';
  const apiUrl = process.env.MEWS_API_URL || 'https://api.mews.com/api/connector/v1 (default)';

  return NextResponse.json({
    apiUrl,
    clientToken: clientToken ? `${clientToken.slice(0, 15)}...${clientToken.slice(-5)}` : '(not set)',
    accessToken: accessToken ? `${accessToken.slice(0, 15)}...${accessToken.slice(-5)}` : '(not set)',
    clientTokenLength: clientToken.length,
    accessTokenLength: accessToken.length,
    // Check for invisible characters
    clientTokenHasNewline: clientToken.includes('\n'),
    accessTokenHasNewline: accessToken.includes('\n'),
    clientTokenHasCarriageReturn: clientToken.includes('\r'),
    accessTokenHasCarriageReturn: accessToken.includes('\r'),
  });
}
