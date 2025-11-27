'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Dashboard() {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchStats = async () => {
        try {
            const res = await axios.get('/api/stats');
            setStats(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const triggerSync = async () => {
        setLoading(true);
        await axios.get('/api/sync');
        await fetchStats();
    };

    useEffect(() => {
        fetchStats();
    }, []);

    if (loading && !stats) return <div className="p-10">Loading...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-800">Click A Tree Dashboard</h1>
                    <button
                        onClick={triggerSync}
                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
                    >
                        Sync Now
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h3 className="text-gray-500 text-sm uppercase">Total Trees Planted</h3>
                        <p className="text-4xl font-bold text-green-600">{stats?.totalTrees}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h2 className="text-xl font-semibold mb-4">Recent Orders</h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b">
                                        <th className="pb-2">Date</th>
                                        <th className="pb-2">Hotel</th>
                                        <th className="pb-2">Qty</th>
                                        <th className="pb-2">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats?.recentOrders.map((order: any) => (
                                        <tr key={order.id} className="border-b last:border-0">
                                            <td className="py-2">{new Date(order.bookedAt).toLocaleDateString()}</td>
                                            <td className="py-2">{order.hotel.name}</td>
                                            <td className="py-2">{order.quantity}</td>
                                            <td className="py-2">{order.amount} {order.currency}</td>
                                        </tr>
                                    ))}
                                    {stats?.recentOrders.length === 0 && (
                                        <tr><td colSpan={4} className="py-4 text-center text-gray-500">No recent orders</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow">
                        <h2 className="text-xl font-semibold mb-4">Recent Invoices</h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b">
                                        <th className="pb-2">Period</th>
                                        <th className="pb-2">Hotel</th>
                                        <th className="pb-2">Total</th>
                                        <th className="pb-2">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats?.invoices.map((inv: any) => (
                                        <tr key={inv.id} className="border-b last:border-0">
                                            <td className="py-2">{inv.month}/{inv.year}</td>
                                            <td className="py-2">{inv.hotel.name}</td>
                                            <td className="py-2">{inv.totalAmount} EUR</td>
                                            <td className="py-2">
                                                <a href={inv.pdfPath} target="_blank" className="text-blue-600 hover:underline">Download</a>
                                            </td>
                                        </tr>
                                    ))}
                                    {stats?.invoices.length === 0 && (
                                        <tr><td colSpan={4} className="py-4 text-center text-gray-500">No invoices generated</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
