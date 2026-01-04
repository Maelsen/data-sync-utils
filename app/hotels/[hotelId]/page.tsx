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
  const [syncing, setSyncing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  useEffect(() => {
    fetchHotelData();
  }, [hotelId]);

  const fetchHotelData = async () => {
    try {
      setLoading(true);
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

  const handleSync = async () => {
    try {
      setSyncing(true);
      // Use hotel-specific sync endpoint with this hotel's credentials
      await axios.get(`/api/hotels/${hotelId}/sync`);
      // Refresh the data after sync - no alerts, just smooth update
      await fetchHotelData();
    } catch (err: any) {
      console.error('Sync failed:', err);
      // Only show alert on error
      alert('Sync failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setSyncing(false);
    }
  };

  const handleGenerateInvoice = async () => {
    if (!selectedMonth || !selectedYear) {
      alert('Please select a month and year first');
      return;
    }

    try {
      setGenerating(true);
      const response = await axios.post(
        `/api/hotels/${hotelId}/invoice`,
        {
          month: selectedMonth,
          year: selectedYear,
        },
        {
          responseType: 'blob', // Important for PDF download
        }
      );

      // Create a download link for the PDF
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const monthName = new Date(0, selectedMonth - 1).toLocaleString('en', {
        month: 'long',
      });
      link.download = `invoice-${hotel.name.replace(/[^a-zA-Z0-9]/g, '-')}-${monthName}-${selectedYear}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Invoice generation failed:', err);
      alert('Failed to generate invoice: ' + (err.response?.data?.error || err.message));
    } finally {
      setGenerating(false);
    }
  };

  // Filter orders by selected month/year
  const filteredOrders = stats?.recentOrders?.filter((order: any) => {
    if (!selectedMonth || !selectedYear) return true; // Show all if no filter
    const orderDate = new Date(order.bookedAt);
    return (
      orderDate.getMonth() + 1 === selectedMonth &&
      orderDate.getFullYear() === selectedYear
    );
  }) || [];

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
          <div className="flex items-center justify-between gap-4">
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

            {/* Filter and Actions - Only for Mews hotels */}
            {hotel.pmsType === 'mews' && (
              <div className="flex items-center gap-3">
                {/* Month/Year Filter */}
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <select
                    value={selectedMonth || ''}
                    onChange={(e) => setSelectedMonth(e.target.value ? Number(e.target.value) : null)}
                    className="bg-transparent text-sm font-medium text-gray-700 cursor-pointer focus:outline-none"
                  >
                    <option value="">All Months</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>
                        {new Date(0, m - 1).toLocaleString('en', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                  <span className="text-gray-300">/</span>
                  <select
                    value={selectedYear || ''}
                    onChange={(e) => setSelectedYear(e.target.value ? Number(e.target.value) : null)}
                    className="bg-transparent text-sm font-medium text-gray-700 cursor-pointer focus:outline-none"
                  >
                    <option value="">All Years</option>
                    <option value="2024">2024</option>
                    <option value="2025">2025</option>
                    <option value="2026">2026</option>
                  </select>
                </div>

                {/* Invoice Button */}
                <button
                  onClick={handleGenerateInvoice}
                  disabled={generating || !selectedMonth || !selectedYear}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Generate invoice for selected period"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {generating ? 'Generating...' : 'Invoice'}
                </button>

                {/* Sync Button */}
                <button
                  onClick={handleSync}
                  disabled={syncing || loading}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Sync data from Mews"
                >
                  <svg
                    className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  {syncing ? 'Syncing...' : 'Sync'}
                </button>
              </div>
            )}
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
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-900">Orders</h2>
            <span className="text-sm text-gray-500">
              Showing {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'}
            </span>
          </div>
          {filteredOrders && filteredOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="text-left text-sm text-gray-500 border-b">
                  <tr>
                    <th className="pb-3">Date (Check-in)</th>
                    <th className="pb-3">Order Created</th>
                    <th className="pb-3">Quantity</th>
                    <th className="pb-3">Amount</th>
                    <th className="pb-3">PMS</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {filteredOrders.map((order: any) => (
                    <tr key={order.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3">
                        <div className="font-medium text-gray-900">
                          {new Date(order.bookedAt).toLocaleDateString('de-DE')}
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="text-gray-600">
                          {new Date(order.createdAt).toLocaleDateString('de-DE')}
                        </div>
                        <div className="text-xs text-gray-400">
                          {new Date(order.createdAt).toLocaleTimeString('de-DE', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="font-medium text-gray-900">
                          {order.quantity} 🌳
                        </span>
                      </td>
                      <td className="py-3 font-medium text-gray-900">
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
            <p className="text-gray-500 text-sm">
              {selectedMonth && selectedYear
                ? `No orders found for ${new Date(0, selectedMonth - 1).toLocaleString('en', { month: 'long' })} ${selectedYear}`
                : 'No orders yet'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
