import { NextResponse } from 'next/server';
import axios from 'axios';

/**
 * Direct API test without MewsClient class
 */
export async function GET() {
  const clientToken = process.env.MEWS_CLIENT_TOKEN || '';
  const accessToken = process.env.MEWS_ACCESS_TOKEN || '';
  const apiUrl = process.env.MEWS_API_URL || 'https://api.mews.com/api/connector/v1';

  console.log('[direct-test] Testing with:');
  console.log(`  API URL: ${apiUrl}`);
  console.log(`  Client Token: ${clientToken.slice(0, 15)}... (len: ${clientToken.length})`);
  console.log(`  Access Token: ${accessToken.slice(0, 15)}... (len: ${accessToken.length})`);

  try {
    const response = await axios.post(`${apiUrl}/configuration/get`, {
      ClientToken: clientToken,
      AccessToken: accessToken,
      Client: 'Click A Tree Direct Test 1.0.0'
    });

    const enterprise = response.data.Enterprise;
    const services = response.data.Services || [];

    return NextResponse.json({
      success: true,
      hotel: {
        name: enterprise.Name,
        id: enterprise.Id
      },
      servicesCount: services.length,
      services: services.map((s: any) => ({ name: s.Name, id: s.Id }))
    });

  } catch (error: any) {
    console.error('[direct-test] Error:', error.response?.data || error.message);

    return NextResponse.json({
      success: false,
      error: error.response?.data?.Message || error.message,
      status: error.response?.status,
      details: error.response?.data
    }, { status: 500 });
  }
}
