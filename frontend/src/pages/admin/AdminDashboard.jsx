import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Users, IndianRupee, TrendingUp, Shield, Megaphone } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { ErrorState, LoadingBlock } from '../../components/StateBlock';

import BroadcastModal from '../../components/BroadcastModal';

const defaultStats = {
  totalEvents: 0,
  publishedEvents: 0,
  totalRegistrations: 0,
  totalRevenue: 0
};

const toFiniteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [stats, setStats] = useState(defaultStats);
  const [recentEvents, setRecentEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setLoadError('');

    try {
      const response = await api.get('/admin/events');
      const events = Array.isArray(response.data) ? response.data : [];

      setRecentEvents(events.slice(0, 5));

      const totalRegistrations = events.reduce(
        (sum, event) => sum + toFiniteNumber(event._count?.registrations),
        0
      );

      const totalRevenue = events.reduce(
        (sum, event) => sum + toFiniteNumber(event._count?.registrations) * toFiniteNumber(event.priceCents),
        0
      );

      setStats({
        totalEvents: events.length,
        publishedEvents: events.filter(e => e.published).length,
        totalRegistrations,
        totalRevenue: totalRevenue / 100
      });
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to load dashboard data';
      setLoadError(message);
      setRecentEvents([]);
      setStats(defaultStats);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingBlock title="Loading dashboard" message="Fetching admin totals and recent events." />;
  }

  if (loadError) {
    return (
      <ErrorState
        title="Could not load dashboard"
        message={loadError}
        action={(
          <button type="button" onClick={fetchDashboardData} className="admin-primary-action">
            Retry
          </button>
        )}
      />
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-3 mb-2">
            <h1 className="min-w-0 truncate text-3xl font-bold text-white">
              {isAdmin ? 'Super Admin Overview' : 'My Overview'}
            </h1>
            {isAdmin && (
              <span className="admin-chip border-[#E23744]/30 bg-[#E23744]/10 text-[#f2e7d8] flex items-center gap-1">
                <Shield size={12} /> ADMIN
              </span>
            )}
          </div>
          <p className="text-gray-400">
            {isAdmin
              ? 'Viewing all events across all organizers.'
              : 'Welcome to your command center.'}
          </p>
        </div>
        <button
          onClick={() => setIsBroadcastOpen(true)}
          className="admin-primary-action inline-flex w-full items-center justify-center gap-2 sm:w-auto"
        >
          <Megaphone size={16} />
          Broadcast Email
        </button>
      </div>

      <BroadcastModal isOpen={isBroadcastOpen} onClose={() => setIsBroadcastOpen(false)} />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={Calendar}
          label={isAdmin ? "All Events" : "Total Events"}
          value={stats.totalEvents}
          tone="brand"
        />
        <StatCard
          icon={TrendingUp}
          label="Published"
          value={stats.publishedEvents}
          tone="success"
        />
        <StatCard
          icon={Users}
          label="Registrations"
          value={stats.totalRegistrations}
          tone="neutral"
        />
        <StatCard
          icon={IndianRupee}
          label="Total Revenue"
          value={`₹${stats.totalRevenue.toFixed(2)}`}
          tone="warn"
        />
      </div>

      {/* Recent Events */}
      <div className="admin-card p-5 sm:p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">
            {isAdmin ? 'All Recent Events' : 'Recent Events'}
          </h2>
          <Link to="/admin/events" className="text-[#E23744] hover:text-[#E23744]/80 text-sm font-medium transition-colors">
            View All Events
          </Link>
        </div>

        {recentEvents.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="text-gray-500" size={24} />
            </div>
            <p className="text-gray-400 mb-4">No events created yet</p>
            <Link to="/admin/events/create" className="admin-primary-action inline-flex">
              Create Event
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {recentEvents.map((event) => (
              <div
                key={event.id}
                className="flex flex-col gap-3 p-4 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/5 group sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <h3 className="min-w-0 truncate font-semibold text-white group-hover:text-[#E23744] transition-colors sm:mb-1">{event.title}</h3>
                    {isAdmin && event.organizer && (
                      <span className="admin-chip max-w-full truncate border-white/10 bg-white/[0.04] text-[#aaa096] normal-case tracking-normal sm:max-w-[14rem]">
                        by {event.organizer.name || event.organizer.email}
                      </span>
                    )}
                  </div>
                  <div className="flex min-w-0 items-center text-sm text-gray-500 gap-3">
                    <span className="min-w-0 truncate">{event.location}</span>
                    <span className="shrink-0">•</span>
                    <span className={event.published ? 'text-green-500' : 'text-yellow-500'}>
                      {event.published ? 'Published' : 'Draft'}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-2xl font-bold text-gray-200">{event._count?.registrations || 0}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Sold</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }) {
  const tones = {
    brand: 'text-[#E23744] bg-[#E23744]/10 border-[#E23744]/20',
    success: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    neutral: 'text-[#f2e7d8] bg-[#f2e7d8]/10 border-white/10',
    warn: 'text-amber-400 bg-amber-500/10 border-amber-500/20'
  };

  return (
    <div className="admin-card admin-card-hover p-5 sm:p-6 flex items-center justify-between gap-4 min-w-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-400 mb-1">{label}</p>
        <p className="text-2xl font-bold text-white truncate">{value}</p>
      </div>
      <div className={`p-3 rounded-xl border ${tones[tone] || tones.neutral}`}>
        <Icon size={24} />
      </div>
    </div>
  );
}
