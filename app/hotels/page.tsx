'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import Link from 'next/link';

interface Hotel {
  id: string;
  name: string;
  pmsType: 'mews' | 'hotelspider';
  externalId: string | null;
  createdAt: string;
}

export default function HotelsPage() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [filter, setFilter] = useState<'all' | 'mews' | 'hotelspider'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHotels();
  }, []);

  const fetchHotels = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/hotels');
      setHotels(response.data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch hotels:', err);
      setError(err.response?.data?.error || 'Failed to load hotels');
    } finally {
      setLoading(false);
    }
  };

  const filteredHotels = hotels.filter(
    (h) => filter === 'all' || h.pmsType === filter
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Hotels</h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage your integrated hotels across multiple PMS systems
              </p>
            </div>
            <Link
              href="/hotels/new"
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition"
            >
              + Add Hotel
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filter Tabs */}
        <div className="mb-6 flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              filter === 'all'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            All Hotels ({hotels.length})
          </button>
          <button
            onClick={() => setFilter('mews')}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              filter === 'mews'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Mews ({hotels.filter((h) => h.pmsType === 'mews').length})
          </button>
          <button
            onClick={() => setFilter('hotelspider')}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              filter === 'hotelspider'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            HotelSpider ({hotels.filter((h) => h.pmsType === 'hotelspider').length})
          </button>
        </div>

        {/* Hotels Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
            <p className="mt-2 text-gray-500">Loading hotels...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            <p className="font-medium">Error loading hotels</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        ) : filteredHotels.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No hotels found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {filter === 'all'
                ? 'Get started by adding your first hotel'
                : `No ${filter} hotels found`}
            </p>
            {filter === 'all' && (
              <div className="mt-6">
                <Link
                  href="/hotels/new"
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                >
                  + Add Hotel
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredHotels.map((hotel) => (
              <Link key={hotel.id} href={`/hotels/${hotel.id}`}>
                <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg hover:border-green-300 transition cursor-pointer">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-bold text-gray-900">{hotel.name}</h3>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        hotel.pmsType === 'mews'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}
                    >
                      {hotel.pmsType.toUpperCase()}
                    </span>
                  </div>
                  <div className="space-y-2 text-sm text-gray-500">
                    <div>
                      <span className="font-medium">ID:</span>{' '}
                      {hotel.externalId || 'N/A'}
                    </div>
                    <div>
                      <span className="font-medium">Added:</span>{' '}
                      {new Date(hotel.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <span className="text-sm text-green-600 font-medium hover:text-green-700">
                      View Dashboard →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
