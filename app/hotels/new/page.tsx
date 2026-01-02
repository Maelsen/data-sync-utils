'use client';

import { useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AddHotelPage() {
  const router = useRouter();
  const [pmsType, setPmsType] = useState<'mews' | 'hotelspider'>('mews');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    // Mews fields
    mewsClientToken: '',
    mewsAccessToken: '',
    // HotelSpider fields
    hotelspiderUsername: '',
    hotelspiderPassword: '',
    hotelspiderHotelCode: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const credentials =
        pmsType === 'mews'
          ? {
              mewsClientToken: formData.mewsClientToken,
              mewsAccessToken: formData.mewsAccessToken,
            }
          : {
              hotelspiderUsername: formData.hotelspiderUsername,
              hotelspiderPassword: formData.hotelspiderPassword,
              hotelspiderHotelCode: formData.hotelspiderHotelCode,
            };

      await axios.post('/api/hotels', {
        name: formData.name,
        pmsType,
        credentials,
      });

      // Redirect to hotels list
      router.push('/hotels');
    } catch (err: any) {
      console.error('Error creating hotel:', err);
      setError(err.response?.data?.error || 'Failed to create hotel');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
              <h1 className="text-3xl font-bold text-gray-900">Add New Hotel</h1>
              <p className="mt-1 text-sm text-gray-500">
                Connect a hotel to start tracking tree plantings
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
              <p className="font-medium">Error</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Hotel Name */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hotel Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Grand Hotel Example"
                required
              />
            </div>

            {/* PMS Type */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                PMS System *
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setPmsType('mews')}
                  className={`p-4 border-2 rounded-lg text-left transition ${
                    pmsType === 'mews'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-bold text-lg">Mews</div>
                  <div className="text-sm text-gray-500 mt-1">
                    REST API with webhooks
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setPmsType('hotelspider')}
                  className={`p-4 border-2 rounded-lg text-left transition ${
                    pmsType === 'hotelspider'
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-bold text-lg">HotelSpider</div>
                  <div className="text-sm text-gray-500 mt-1">
                    OTA XML notifications
                  </div>
                </button>
              </div>
            </div>

            {/* Mews Credentials */}
            {pmsType === 'mews' && (
              <>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mews Client Token *
                  </label>
                  <input
                    type="text"
                    value={formData.mewsClientToken}
                    onChange={(e) =>
                      setFormData({ ...formData, mewsClientToken: e.target.value })
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
                    placeholder="E0D1815DE8A74D0FBA8C..."
                    required
                  />
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mews Access Token *
                  </label>
                  <input
                    type="text"
                    value={formData.mewsAccessToken}
                    onChange={(e) =>
                      setFormData({ ...formData, mewsAccessToken: e.target.value })
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
                    placeholder="C66EF7B239D24632943D..."
                    required
                  />
                </div>
              </>
            )}

            {/* HotelSpider Credentials */}
            {pmsType === 'hotelspider' && (
              <>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Hotel Code *
                  </label>
                  <input
                    type="text"
                    value={formData.hotelspiderHotelCode}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        hotelspiderHotelCode: e.target.value,
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="HOTEL123"
                    required
                  />
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Username *
                  </label>
                  <input
                    type="text"
                    value={formData.hotelspiderUsername}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        hotelspiderUsername: e.target.value,
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="username"
                    required
                  />
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password *
                  </label>
                  <input
                    type="password"
                    value={formData.hotelspiderPassword}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        hotelspiderPassword: e.target.value,
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </>
            )}

            {/* Info Box */}
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Security Note:</strong> All credentials are encrypted using
                AES-256-GCM before being stored in the database.
              </p>
            </div>

            {/* Submit Button */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium transition"
              >
                {loading ? 'Creating Hotel...' : 'Create Hotel'}
              </button>
              <Link
                href="/hotels"
                className="px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition text-center"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
