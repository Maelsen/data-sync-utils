'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Dashboard() {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);

    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

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
        setLoading(false);
    };

    const triggerInvoices = async () => {
        setGenerating(true);
        try {
            const response = await axios.post('/api/invoices/generate', {
                month: selectedMonth,
                year: selectedYear
            });
            alert(response.data.message || "Invoices created!");
            await fetchStats();
        } catch (error: any) {
            console.error(error);
            alert("Error: " + (error.response?.data?.error || error.message));
        } finally {
            setGenerating(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    if (loading && !stats) return <div className="p-10">Loading...</div>;

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#eaf6ea] to-white p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                    <div className="flex items-center gap-6">
                        {/* Logo Placeholder */}
                        <div className="w-16 h-16 bg-white rounded-xl shadow-md flex items-center justify-center border-2 border-[#669933]">
                            <div className="text-[#669933] font-bold text-xs text-center px-2">
                                LOGO<br />HERE
                            </div>
                        </div>
                        <div>
                            <h1 className="text-4xl font-bold text-gray-800 mb-1">Click A Tree Integration Dashboard</h1>
                            <p className="text-gray-600">Monitor your environmental impact in real-time</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                        {/* Date Selection */}
                        <div className="flex gap-2">
                            <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                className="border-2 border-gray-200 rounded-lg px-4 py-2.5 text-gray-700 bg-white hover:border-[#669933] transition-colors focus:outline-none focus:border-[#669933] focus:ring-2 focus:ring-[#669933]/20"
                            >
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                    <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('en', { month: 'long' })}</option>
                                ))}
                            </select>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                                className="border-2 border-gray-200 rounded-lg px-4 py-2.5 text-gray-700 bg-white hover:border-[#669933] transition-colors focus:outline-none focus:border-[#669933] focus:ring-2 focus:ring-[#669933]/20"
                            >
                                <option value="2024">2024</option>
                                <option value="2025">2025</option>
                                <option value="2026">2026</option>
                            </select>
                        </div>

                        <button
                            onClick={triggerSync}
                            className="bg-[#669933] text-white px-6 py-2.5 rounded-lg hover:bg-[#88B36A] transition-all shadow-md hover:shadow-lg font-medium"
                        >
                            Sync Data
                        </button>

                        <button
                            onClick={triggerInvoices}
                            disabled={generating}
                            className="bg-[#669933] text-white px-6 py-2.5 rounded-lg hover:bg-[#88B36A] transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium whitespace-nowrap"
                        >
                            {generating ? 'Generating...' : 'Generate Invoice'}
                        </button>
                    </div>
                </div>

                {/* Stats Card */}
                <div className="mb-10">
                    <div className="bg-gradient-to-r from-[#669933] to-[#88B36A] p-8 rounded-2xl shadow-xl text-white">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-white/90 text-sm uppercase tracking-wider font-medium mb-2">Total Trees Planted</h3>
                                <p className="text-6xl font-bold">{stats?.totalTrees || 0}</p>
                                <p className="text-white/80 mt-2">Making a difference, one tree at a time 🌱</p>
                            </div>
                            <div className="hidden md:block text-8xl opacity-20">🌳</div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Recent Orders */}
                    <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
                        <h2 className="text-2xl font-bold mb-6 text-gray-800 flex items-center gap-2">
                            <span className="w-1.5 h-8 bg-[#669933] rounded-full"></span>
                            Recent Orders
                        </h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b-2 border-gray-200">
                                        <th className="pb-4 text-sm font-semibold text-gray-600 uppercase tracking-wider">Date & Time</th>
                                        <th className="pb-4 text-sm font-semibold text-gray-600 uppercase tracking-wider">Hotel</th>
                                        <th className="pb-4 text-sm font-semibold text-gray-600 uppercase tracking-wider">Qty</th>
                                        <th className="pb-4 text-sm font-semibold text-gray-600 uppercase tracking-wider">Amount</th>
                                        <th className="pb-4 text-sm font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats?.recentOrders.map((order: any) => {
                                        const isCanceled = order.amount === 0;
                                        const date = new Date(order.bookedAt);
                                        const dateStr = date.toLocaleDateString('en-GB');
                                        const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

                                        return (
                                            <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                                <td className="py-4 text-gray-700">
                                                    <div className="font-medium">{dateStr}</div>
                                                    <div className="text-sm text-gray-500">{timeStr}</div>
                                                </td>
                                                <td className="py-4 text-gray-700 font-medium">{order.hotel.name}</td>
                                                <td className="py-4">
                                                    <span className="inline-flex items-center justify-center w-10 h-10 bg-[#eaf6ea] text-[#669933] font-bold rounded-lg">
                                                        {order.quantity}
                                                    </span>
                                                </td>
                                                <td className="py-4">
                                                    {isCanceled ? (
                                                        <div>
                                                            <span className="line-through text-red-500 font-medium">5.90 USD</span>
                                                        </div>
                                                    ) : (
                                                        <span className="font-semibold text-gray-800">{order.amount.toFixed(2)} {order.currency}</span>
                                                    )}
                                                </td>
                                                <td className="py-4">
                                                    {isCanceled ? (
                                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                                                            Canceled
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                                                            Completed
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {stats?.recentOrders.length === 0 && (
                                        <tr><td colSpan={5} className="py-8 text-center text-gray-500">No recent orders</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Recent Invoices */}
                    <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
                        <h2 className="text-2xl font-bold mb-6 text-gray-800 flex items-center gap-2">
                            <span className="w-1.5 h-8 bg-[#669933] rounded-full"></span>
                            Recent Invoices
                        </h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b-2 border-gray-200">
                                        <th className="pb-4 text-sm font-semibold text-gray-600 uppercase tracking-wider">Period</th>
                                        <th className="pb-4 text-sm font-semibold text-gray-600 uppercase tracking-wider">Hotel</th>
                                        <th className="pb-4 text-sm font-semibold text-gray-600 uppercase tracking-wider">Total</th>
                                        <th className="pb-4 text-sm font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Sample Invoice for Screenshot */}
                                    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                        <td className="py-4 text-gray-700 font-medium">December 2025</td>
                                        <td className="py-4 text-gray-700 font-medium">Mews Demo Hotel</td>
                                        <td className="py-4 font-semibold text-gray-800">35.40 USD</td>
                                        <td className="py-4">
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                                                Sent to Hotel
                                            </span>
                                        </td>
                                    </tr>
                                    {stats?.invoices.map((inv: any) => (
                                        <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                            <td className="py-4 text-gray-700 font-medium">{inv.month}/{inv.year}</td>
                                            <td className="py-4 text-gray-700 font-medium">{inv.hotel.name}</td>
                                            <td className="py-4 font-semibold text-gray-800">{inv.totalAmount.toFixed(2)} EUR</td>
                                            <td className="py-4">
                                                <a href={inv.pdfPath} target="_blank" className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-[#669933] text-white hover:bg-[#88B36A] transition-colors">
                                                    Download PDF
                                                </a>
                                            </td>
                                        </tr>
                                    ))}
                                    {stats?.invoices.length === 0 && (
                                        <tr><td colSpan={4} className="py-8 text-center text-gray-500">Sample invoice shown above</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Footer Note */}
                <div className="mt-8 text-center text-gray-500 text-sm">
                    <p>🌍 Powered by Click A Tree - Sustainability made simple</p>
                </div>
            </div>
        </div>
    );
}