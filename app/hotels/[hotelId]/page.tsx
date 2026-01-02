'use client';

import { useEffect, useState, use } from 'react';
import axios from 'axios';
import Link from 'next/link';

export default function HotelDashboard({
  params,
}: {
  params: Promise<{ hotelId: string }>;
}) {
  const { hotelId } = use(params);
  const [hotel, setHotel] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHotelData();
  }, [hotelId]);

  const fetchHotelData = async () => {
    try {
      setLoading(true);
      // Note: This endpoint doesn't exist yet but would be created
      // For now, we redirect to main dashboard
      // In production, create /api/hotels/[hotelId]/stats
      const response = await axios.get(`/api/hotels/${hotelId}/stats`);
      setHotel(response.data.hotel);
      setStats(response.data);
    } catch (err) {
      console.error('Failed to fetch hotel data:', err);
      // Fallback: redirect to hotels list
      window.location.href = '/hotels';
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          <p className="mt-2 text-gray-500">Loading hotel dashboard...</p>
        </div>
      </div>
    );
  }

  if (!hotel) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Hotel Not Found</h1>
          <Link
            href="/hotels"
            className="mt-4 inline-block text-green-600 hover:text-green-700"
          >
            ← Back to Hotels
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4">
            <Link
              href="/hotels"
              className="text-gray-500 hover:text-gray-700 transition"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{hotel.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`px-2 py-1 rounded text-xs font-bold ${
                    hotel.pmsType === 'mews'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-purple-100 text-purple-700'
                  }`}
                >
                  {hotel.pmsType.toUpperCase()}
                </span>
                <span className="text-sm text-gray-500">•</span>
                <span className="text-sm text-gray-500">ID: {hotel.externalId}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Overview */}
        <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-8 text-white mb-8">
          <h2 className="text-sm font-medium uppercase tracking-wide opacity-90">
            Total Impact & Revenue
          </h2>
          <div className="mt-4 grid md:grid-cols-2 gap-8">
            <div>
              <div className="text-5xl font-bold">
                {stats?.totalTrees?.toLocaleString() || 0}
              </div>
              <div className="text-sm opacity-90 mt-1">Trees Planted</div>
            </div>
            <div>
              <div className="text-5xl font-bold">
                {stats?.totalRevenue?.toFixed(2) || '0.00'} {stats?.currency || 'EUR'}
              </div>
              <div className="text-sm opacity-90 mt-1">Total Revenue</div>
            </div>
          </div>
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Orders</h2>
          {stats?.recentOrders && stats.recentOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="text-left text-sm text-gray-500 border-b">
                  <tr>
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Quantity</th>
                    <th className="pb-3">Amount</th>
                    <th className="pb-3">PMS</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {stats.recentOrders.slice(0, 10).map((order: any) => (
                    <tr key={order.id} className="border-b last:border-0">
                      <td className="py-3">
                        {new Date(order.bookedAt).toLocaleDateString()}
                      </td>
                      <td className="py-3">{order.quantity} trees</td>
                      <td className="py-3">
                        {order.amount.toFixed(2)} {order.currency}
                      </td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold ${
                            order.pmsType === 'mews'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-purple-100 text-purple-700'
                          }`}
                        >
                          {order.pmsType}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No orders yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
