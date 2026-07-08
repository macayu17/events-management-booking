import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { ErrorState } from '../../components/StateBlock';
import { Skeleton, SkeletonStatGrid, SkeletonCardList } from '../../components/Skeleton';

import BroadcastModal from '../../components/BroadcastModal';

const toFiniteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);

  const isAdmin = user?.role === 'ADMIN';

  const { data: events = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'events'],
    queryFn: async () => {
      const res = await api.get('/admin/events');
      return Array.isArray(res.data) ? res.data : [];
    }
  });

  const recentEvents = events.slice(0, 5);
  const stats = {
    totalEvents: events.length,
    publishedEvents: events.filter(e => e.published).length,
    totalRegistrations: events.reduce(
      (sum, event) => sum + toFiniteNumber(event._count?.registrations),
      0
    ),
    totalRevenue: events.reduce(
      (sum, event) => sum + toFiniteNumber(event._count?.registrations) * toFiniteNumber(event.priceCents),
      0
    ) / 100
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-9 w-64" />
        <SkeletonStatGrid count={4} />
        <SkeletonCardList count={5} />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Could not load dashboard"
        message={error?.response?.data?.error || 'Failed to load dashboard data'}
        action={(
          <button type="button" onClick={() => refetch()} className="admin-primary-action">
            Retry
          </button>
        )}
      />
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mono-accent">★ {isAdmin ? 'Super admin' : 'Organizer'}{user?.name ? ` · ${user.name}` : ''}</p>
          <h1 className="mt-2 font-display text-5xl uppercase leading-none sm:text-[58px]">Box office.</h1>
        </div>
        <button onClick={() => setIsBroadcastOpen(true)} className="btn-accent inline-flex items-center justify-center gap-2">
          <Megaphone size={16} /> Broadcast email
        </button>
      </div>

      <BroadcastModal isOpen={isBroadcastOpen} onClose={() => setIsBroadcastOpen(false)} />

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={isAdmin ? 'All events' : 'Total events'} value={stats.totalEvents} />
        <StatCard label="Published" value={stats.publishedEvents} />
        <StatCard label="Registrations" value={stats.totalRegistrations} />
        <StatCard label="Total revenue" value={`₹${stats.totalRevenue.toLocaleString('en-IN')}`} />
      </div>

      {/* Recent events */}
      <div className="ticket-card-sm overflow-hidden">
        <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: 'var(--line20)' }}>
          <span className="mono-label">Your events</span>
          <Link to="/admin/events" className="mono-accent hover:opacity-80">View all →</Link>
        </div>

        {recentEvents.length === 0 ? (
          <div className="py-14 text-center">
            <p className="font-display text-2xl uppercase">No events yet</p>
            <Link to="/admin/events/create" className="btn-accent mt-5 inline-block">Create event</Link>
          </div>
        ) : (
          recentEvents.map((event) => (
            <div key={event.id} className="flex flex-col gap-3 border-b px-6 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--line20)' }}>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h3 className="font-display text-xl uppercase leading-none">{event.title}</h3>
                  {isAdmin && event.organizer && (
                    <span className="tchip tchip-ok normal-case">by {event.organizer.name || event.organizer.email}</span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-ink-55">
                  <span className="truncate">{event.location}</span>
                  <span>·</span>
                  <span className={event.published ? 'text-accent' : ''}>{event.published ? 'PUBLISHED' : 'DRAFT'}</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-display text-2xl">{event._count?.registrations || 0}</div>
                <div className="mono-label">Sold</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="ticket-card-sm relative p-5">
      <span className="ticket-notch top-1/2 h-[14px] w-[14px] -translate-y-1/2 border-[1.5px]" style={{ left: 'auto', right: '-8px' }} aria-hidden="true" />
      <p className="mono-label">{label}</p>
      <p className="mt-2 font-display text-4xl">{value}</p>
    </div>
  );
}
