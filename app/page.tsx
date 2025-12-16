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

    if (loading && !stats) return (
        <div className="flex h-screen items-center justify-center bg-[#f4f9f4] text-[#669933]">
            Loading...
        </div>
    );

    return (
        <div className="min-h-screen bg-[#f4f9f4] text-slate-800 pb-20">

            {/* Navigation / Top Bar */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {/* Logo Platzhalter */}
                        <div className="w-10 h-10 bg-[#669933] rounded-lg flex items-center justify-center text-2xl shadow-sm text-white">
                            🌳
                        </div>
                        <div>
                            <h1 className="font-bold text-xl text-gray-900 leading-none">Click A Tree</h1>
                            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Integration Admin</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="text-right hidden sm:block mr-2">
                            <div className="text-sm font-bold text-gray-900">Grand Hotel Test</div>
                            <div className="text-xs text-[#669933] font-medium bg-[#eaf6ea] px-2 py-0.5 rounded-full inline-block">
                                ● Connected
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-6 py-10">

                {/* Header Actions */}
                <div className="flex flex-col md:flex-row justify-between items-end gap-4 mb-8">
                    <div>
                        <h2 className="text-3xl font-bold text-gray-900">Dashboard</h2>
                        <p className="text-gray-500 mt-1">Overview of your tree planting performance.</p>
                    </div>

                    <div className="flex items-center gap-3 bg-white p-2 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center px-2">
                            <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                className="bg-transparent text-sm font-semibold text-gray-700 py-2 cursor-pointer focus:outline-none"
                            >
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                    <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('en', { month: 'short' })}</option>
                                ))}
                            </select>
                            <span className="text-gray-300 mx-2">/</span>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                                className="bg-transparent text-sm font-semibold text-gray-700 py-2 cursor-pointer focus:outline-none"
                            >
                                <option value="2024">2024</option>
                                <option value="2025">2025</option>
                                <option value="2026">2026</option>
                            </select>
                        </div>
                        <div className="h-6 w-px bg-gray-200"></div>
                        <button
                            onClick={triggerSync}
                            className="p-2 text-gray-400 hover:text-[#669933] transition-colors"
                            title="Sync"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        </button>
                        <button
                            onClick={triggerInvoices}
                            disabled={generating}
                            className="bg-[#669933] hover:bg-[#55802b] text-white text-sm font-semibold px-4 py-2 rounded-lg shadow transition-all disabled:opacity-50"
                        >
                            {generating ? 'Generating...' : 'Generate Invoice'}
                        </button>
                    </div>
                </div>

                {/* Big Stat Card */}
                <div className="bg-gradient-to-br from-[#669933] to-[#88B36A] rounded-2xl p-8 text-white shadow-lg mb-10 relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="text-green-100 text-sm font-bold uppercase tracking-wider mb-2">Total Impact</div>
                        <div className="flex items-baseline gap-3">
                            <span className="text-7xl font-extrabold tracking-tight">{stats?.totalTrees || 0}</span>
                            <span className="text-2xl font-medium text-green-50">Trees</span>
                        </div>
                        <p className="text-green-50 mt-4 max-w-2xl text-lg">
                            Your guests have helped capture approximately <span className="font-bold text-white">{((stats?.totalTrees || 0) * 12).toLocaleString()} kg</span> of CO₂.
                        </p>
                    </div>
                    {/* Decorative Circle */}
                    <div className="absolute -top-24 -right-24 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl"></div>
                </div>

                {/* Tables Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                    {/* Orders Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="font-bold text-gray-800">Recent Orders</h3>
                            <span className="text-xs font-medium text-gray-500 bg-white border border-gray-200 px-2 py-1 rounded">Last 10</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 text-xs uppercase text-gray-400 font-semibold">
                                    <tr>
                                        <th className="px-6 py-3">Date</th>
                                        <th className="px-6 py-3">Details</th>
                                        <th className="px-6 py-3 text-right">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-sm">
                                    {stats?.recentOrders.map((order: any) => (
                                        <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                                                {new Date(order.bookedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-800 flex items-center gap-2">
                                                    <span>🌳</span> {order.quantity} Tree{order.quantity > 1 ? 's' : ''}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {order.amount === 0 ? (
                                                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-red-50 text-red-600">Canceled</span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-[#eaf6ea] text-[#669933]">Confirmed</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {stats?.recentOrders.length === 0 && (
                                        <tr><td colSpan={3} className="px-6 py-8 text-center text-gray-400">No recent orders</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Invoices Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="font-bold text-gray-800">Invoices</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 text-xs uppercase text-gray-400 font-semibold">
                                    <tr>
                                        <th className="px-6 py-3">Period</th>
                                        <th className="px-6 py-3">Amount</th>
                                        <th className="px-6 py-3">Status</th>
                                        <th className="px-6 py-3 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-sm">
                                    {/* FAKE ROW FOR SCREENSHOT */}
                                    <tr className="hover:bg-gray-50 transition-colors bg-blue-50/30">
                                        <td className="px-6 py-4 font-bold text-gray-900">December 2025</td>
                                        <td className="px-6 py-4 font-bold text-gray-900">€ 125.00</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
                                                Sent to Hotel
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button disabled className="text-gray-300">
                                                ⬇
                                            </button>
                                        </td>
                                    </tr>
                                    {/* END FAKE ROW */}

                                    {stats?.invoices.map((inv: any) => (
                                        <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 text-gray-600">
                                                {new Date(0, inv.month - 1).toLocaleString('en', { month: 'long' })} {inv.year}
                                            </td>
                                            <td className="px-6 py-4 font-medium">€ {inv.totalAmount.toFixed(2)}</td>
                                            <td className="px-6 py-4">
                                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-gray-100 text-gray-500">Archived</span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <a href={inv.pdfPath} target="_blank" className="text-[#669933] hover:text-[#55802b] font-bold">PDF</a>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="mt-12 text-center border-t border-gray-200 pt-8">
                    <p className="text-sm text-gray-400">Powered by <span className="font-bold text-[#669933]">Click A Tree</span></p>
                </div>

            </main>
        </div>
    );
}