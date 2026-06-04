import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, TrendingDown, IndianRupee, Calendar, Ticket, RefreshCw } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { ErrorState, LoadingBlock } from '../../components/StateBlock';

const defaultFinancials = {
    totalRevenue: 0,
    totalTickets: 0,
    activeEvents: 0,
    revenueGrowth: 0,
    revenueChart: []
};

const toFiniteNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

const normalizeFinancials = (payload = {}) => ({
    totalRevenue: toFiniteNumber(payload.totalRevenue),
    totalTickets: toFiniteNumber(payload.totalTickets),
    activeEvents: toFiniteNumber(payload.activeEvents),
    revenueGrowth: toFiniteNumber(payload.revenueGrowth),
    revenueChart: Array.isArray(payload.revenueChart)
        ? payload.revenueChart.map((item, index) => ({
            month: typeof item?.month === 'string' ? item.month : '',
            revenue: toFiniteNumber(item?.revenue),
            key: item?.month || `month-${index}`
        }))
        : []
});

export default function FinancialsPage() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [data, setData] = useState(defaultFinancials);

    useEffect(() => {
        fetchFinancials();
    }, []);

    const fetchFinancials = async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        if (!isRefresh) setLoading(true);
        setLoadError('');

        try {
            const response = await api.get('/admin/financials');
            setData(normalizeFinancials(response.data));
            if (isRefresh) toast.success('Financial data updated');
        } catch (error) {
            const message = error.response?.data?.error || 'Failed to load financial data';
            if (!isRefresh) {
                setLoadError(message);
                setData(defaultFinancials);
            }
            toast.error(message);
            console.error(error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(toFiniteNumber(amount));
    };

    const formatMonth = (monthStr) => {
        if (typeof monthStr !== 'string' || !monthStr.includes('-')) return 'N/A';
        const [year, month] = monthStr.split('-');
        const date = new Date(Number(year), Number.parseInt(month, 10) - 1);
        if (!Number.isFinite(date.getTime())) return 'N/A';
        return date.toLocaleDateString('en-US', { month: 'short' });
    };

    // Get max revenue for chart scaling
    const maxRevenue = Math.max(...data.revenueChart.map(d => d.revenue), 1);

    if (loading) {
        return <LoadingBlock title="Loading financials" message="Fetching revenue and ticket totals." />;
    }

    if (loadError) {
        return (
            <ErrorState
                title="Could not load financials"
                message={loadError}
                action={(
                    <button type="button" onClick={() => fetchFinancials()} className="admin-primary-action">
                        Retry
                    </button>
                )}
            />
        );
    }

    return (
        <div className="space-y-8 relative">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">Financial Analytics</h2>
                    <p className="admin-muted mt-1">Track your revenue and sales performance</p>
                </div>
                <button
                    onClick={() => fetchFinancials(true)}
                    disabled={refreshing}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#f7efe3] transition-all hover:border-[#f2e7d8]/25 hover:bg-white/[0.07] disabled:opacity-50"
                >
                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                    {refreshing ? 'Updating...' : 'Refresh Data'}
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="admin-card admin-card-hover p-5 sm:p-6 relative overflow-hidden min-w-0">
                    <div className="flex items-center justify-between mb-6 relative">
                        <div className="p-3 rounded-xl bg-[#E23744]/10 text-[#E23744] ring-1 ring-[#E23744]/20">
                            <IndianRupee size={24} />
                        </div>
                        {data.revenueGrowth !== 0 && (
                            <span className={`text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5
                                ${data.revenueGrowth >= 0
                                    ? 'text-emerald-400 bg-emerald-400/10 border border-emerald-400/20'
                                    : 'text-red-400 bg-red-400/10 border border-red-400/20'}`}>
                                {data.revenueGrowth >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                {data.revenueGrowth >= 0 ? '+' : ''}{data.revenueGrowth}%
                            </span>
                        )}
                    </div>
                    <p className="admin-eyebrow">Total Revenue</p>
                    <p className="text-4xl font-bold text-white mt-2 tracking-tight truncate">{formatCurrency(data.totalRevenue)}</p>
                </div>

                <div className="admin-card admin-card-hover p-5 sm:p-6 relative overflow-hidden min-w-0">
                    <div className="flex items-center justify-between mb-6 relative">
                        <div className="p-3 rounded-xl bg-[#f2e7d8]/10 text-[#f2e7d8] ring-1 ring-white/10">
                            <Ticket size={24} />
                        </div>
                    </div>
                    <p className="admin-eyebrow">Tickets Sold</p>
                    <p className="text-4xl font-bold text-white mt-2 tracking-tight">{data.totalTickets.toLocaleString()}</p>
                </div>

                <div className="admin-card admin-card-hover p-5 sm:p-6 relative overflow-hidden min-w-0">
                    <div className="flex items-center justify-between mb-6 relative">
                        <div className="p-3 rounded-xl bg-[#f2e7d8]/10 text-[#f2e7d8] ring-1 ring-white/10">
                            <Calendar size={24} />
                        </div>
                    </div>
                    <p className="admin-eyebrow">Active Events</p>
                    <p className="text-4xl font-bold text-white mt-2 tracking-tight">{data.activeEvents}</p>
                </div>
            </div>

            {/* Revenue Chart */}
            <div className="admin-card p-5 sm:p-6 lg:p-8">
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-2 bg-[#E23744]/10 rounded-lg text-[#E23744]">
                        <BarChart3 size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">Revenue Overview</h3>
                        <p className="text-sm admin-muted">Monthly revenue breakdown</p>
                    </div>
                    <span className="admin-chip border-white/10 bg-white/[0.04] text-[#aaa096] ml-auto">Last 6 months</span>
                </div>

                {data.revenueChart.length > 0 ? (
                    <div className="space-y-6">
                        {/* Chart */}
                        <div className="flex items-end justify-between gap-2 md:gap-4 h-80 px-4 pb-2 border-b border-white/5 relative">
                            {/* Grid lines (visual only) */}
                            <div className="absolute inset-0 pointer-events-none flex flex-col justify-between opacity-10">
                                <div className="border-t border-white w-full h-px"></div>
                                <div className="border-t border-white w-full h-px"></div>
                                <div className="border-t border-white w-full h-px"></div>
                                <div className="border-t border-white w-full h-px"></div>
                                <div className="border-t border-white w-full h-px"></div>
                            </div>

                            {data.revenueChart.map((item) => {
                                const height = maxRevenue > 0 ? (item.revenue / maxRevenue) * 100 : 0;
                                const monthLabel = formatMonth(item.month);
                                const revenueLabel = formatCurrency(item.revenue);

                                return (
                                    <div
                                        key={item.key}
                                        className="flex-1 flex flex-col items-center gap-3 z-10 group rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744] focus-visible:ring-offset-2 focus-visible:ring-offset-[#18181b]"
                                        tabIndex={0}
                                        role="img"
                                        aria-label={`${monthLabel} revenue ${revenueLabel}`}
                                    >
                                        <div className="relative w-full flex justify-end flex-col h-full group-hover:-translate-y-1 transition-transform duration-300">
                                            <div
                                                className="w-full rounded-t-md bg-[#E23744]/85 transition-all duration-700 relative overflow-hidden"
                                                style={{
                                                    height: `${Math.max(height, 2)}%`,
                                                    minHeight: item.revenue > 0 ? '20px' : '4px'
                                                }}
                                            >
                                                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>

                                            {/* Tooltip */}
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[#18181b] border border-white/10 text-white text-xs font-bold px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-all shadow-xl whitespace-nowrap z-20 pointer-events-none transform translate-y-2 group-hover:translate-y-0 group-focus:translate-y-0">
                                                {revenueLabel}
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-[#18181b]"></div>
                                            </div>
                                        </div>
                                        <span className="text-xs font-medium text-gray-500 group-hover:text-white transition-colors uppercase">{monthLabel}</span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {data.revenueChart.map(item => (
                                <div key={`${item.key}-summary`} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-sm">
                                    <span className="font-medium uppercase text-gray-400">{formatMonth(item.month)}</span>
                                    <span className="font-bold text-white">{formatCurrency(item.revenue)}</span>
                                </div>
                            ))}
                        </div>

                        {/* Summary */}
                        <div className="flex items-center justify-between pt-2">
                            <div className="text-sm text-gray-400">
                                Total Period Revenue: <span className="text-white font-bold ml-1">{formatCurrency(data.totalRevenue)}</span>
                            </div>
                            <div className="text-sm text-gray-400">
                                Monthly Average: <span className="text-white font-bold ml-1">
                                    {formatCurrency(data.totalRevenue / Math.max(data.revenueChart.length, 1))}
                                </span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-80 text-gray-500 bg-white/5 rounded-2xl border border-white/5 border-dashed">
                        <div className="p-4 rounded-full bg-white/5 mb-4">
                            <BarChart3 size={32} className="opacity-50" />
                        </div>
                        <p className="font-medium text-white">No revenue data available</p>
                        <p className="text-sm mt-1 mb-6 max-w-xs text-center">Start selling tickets to visualize your financial growth here.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
