'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

export default function Dashboard() {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);

    // NEU: State für die Datumsauswahl (Standard: Heute)
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
            // NEU: Wir senden Monat und Jahr mit
            const response = await axios.post('/api/invoices/generate', {
                month: selectedMonth,
                year: selectedYear
            });
            alert(response.data.message || "Rechnungen erstellt!");
            await fetchStats();
        } catch (error: any) {
            console.error(error);
            alert("Fehler: " + (error.response?.data?.error || error.message));
        } finally {
            setGenerating(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    if (loading && !stats) return <div className="p-10">Loading...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                    {/* ÄNDERUNG: Version Bump für Deployment Check */}
                    <h1 className="text-3xl font-bold text-gray-800">Click A Tree Dashboard v2.1</h1>

                    <div className="flex items-center gap-2">
                        {/* NEU: Auswahl Dropdowns */}
                        <div className="flex gap-2 mr-2">
                            <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                className="border rounded px-2 py-2 text-gray-700"
                            >
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                    <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('de', { month: 'long' })}</option>
                                ))}
                            </select>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                                className="border rounded px-2 py-2 text-gray-700"
                            >
                                <option value="2024">2024</option>
                                <option value="2025">2025</option>
                                <option value="2026">2026</option>
                            </select>
                        </div>

                        <button
                            onClick={triggerSync}
                            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm"
                        >
                            Sync Data
                        </button>

                        <button
                            onClick={triggerInvoices}
                            disabled={generating}
                            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition disabled:opacity-50 text-sm whitespace-nowrap"
                        >
                            {generating ? 'Erstelle...' : 'Rechnung erstellen'}
                        </button>
                    </div>
                </div>

                {/* Statistik Kacheln */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h3 className="text-gray-500 text-sm uppercase">Total Trees Planted</h3>
                        <p className="text-4xl font-bold text-green-600">{stats?.totalTrees}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Linke Seite: Bestellungen */}
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
                                            <td className="py-2">{order.amount.toFixed(2)} {order.currency}</td>
                                        </tr>
                                    ))}
                                    {stats?.recentOrders.length === 0 && (
                                        <tr><td colSpan={4} className="py-4 text-center text-gray-500">No recent orders</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Rechte Seite: Rechnungen */}
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
                                            <td className="py-2">{inv.totalAmount.toFixed(2)} EUR</td>
                                            <td className="py-2">
                                                <a href={inv.pdfPath} target="_blank" className="text-blue-600 hover:underline font-medium">
                                                    Download PDF
                                                </a>
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