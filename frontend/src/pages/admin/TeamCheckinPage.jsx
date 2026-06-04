import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../utils/api';
import { ErrorState, LoadingBlock } from '../../components/StateBlock';

const getAttendeeStatus = (attendee) => {
  if (attendee.checkedOutAt) {
    return { label: 'Checked Out', className: 'badge-neutral' };
  }

  if (attendee.checkedInAt) {
    return { label: 'Inside', className: 'badge-success' };
  }

  return { label: 'Not Arrived', className: 'badge-warning' };
};

const statCards = [
  { key: 'total', label: 'Total Tickets', className: 'text-[#f7efe3]' },
  { key: 'checkedIn', label: 'Checked In', className: 'text-emerald-400' },
  { key: 'notCheckedIn', label: 'Not Arrived', className: 'text-amber-400' },
  { key: 'currentlyInside', label: 'Currently Inside', className: 'text-blue-400' },
];

export default function TeamCheckinPage() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attendeesError, setAttendeesError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const scanTimeoutRef = useRef(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchStats, 30000);

    return () => {
      clearInterval(interval);
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    };
  }, [id]);

  useEffect(() => {
    fetchAttendees();
  }, [id, filter, search]);

  const showScanResult = (result) => {
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    setScanResult(result);
    scanTimeoutRef.current = setTimeout(() => {
      setScanResult(null);
      scanTimeoutRef.current = null;
    }, 3000);
  };

  const errorMessage = (error, fallback) => error.response?.data?.error || error.message || fallback;

  const buildAttendeeQuery = () => {
    const params = new URLSearchParams();
    if (filter !== 'all') params.append('status', filter);
    if (search) params.append('search', search);
    return params.toString();
  };

  const fetchData = async () => {
    setLoading(true);
    setLoadError('');
    setAttendeesError('');

    try {
      const [eventResponse, statsResponse, attendeesResponse] = await Promise.all([
        api.get(`/team/events/${id}`),
        api.get(`/team/events/${id}/checkin-stats`),
        api.get(`/team/events/${id}/attendees?${buildAttendeeQuery()}`)
      ]);

      setEvent(eventResponse.data);
      setStats(statsResponse.data);
      setAttendees(attendeesResponse.data);
    } catch (err) {
      console.error('Failed to load team check-in:', err);
      setLoadError(errorMessage(err, 'Failed to load team check-in'));
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get(`/team/events/${id}/checkin-stats`);
      setStats(response.data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const fetchAttendees = async () => {
    setAttendeesError('');
    try {
      const response = await api.get(`/team/events/${id}/attendees?${buildAttendeeQuery()}`);
      setAttendees(response.data);
    } catch (err) {
      console.error('Failed to fetch attendees:', err);
      setAttendeesError(errorMessage(err, 'Failed to load attendees'));
    }
  };

  const handleCheckIn = async (ticketId) => {
    try {
      const response = await api.post(`/team/tickets/${ticketId}/checkin`);
      showScanResult({
        success: true,
        message: `Checked in: ${response.data.attendee?.name || 'Guest'}`
      });
      fetchStats();
      fetchAttendees();
    } catch (err) {
      showScanResult({
        success: false,
        message: err.response?.data?.error || 'Check-in failed'
      });
    }
  };

  const handleCheckOut = async (ticketId) => {
    try {
      await api.post(`/team/tickets/${ticketId}/checkout`);
      showScanResult({ success: true, message: 'Checked out' });
      fetchStats();
      fetchAttendees();
    } catch (err) {
      showScanResult({
        success: false,
        message: err.response?.data?.error || 'Check-out failed'
      });
    }
  };

  const renderActionButton = (attendee, { fullWidth = false } = {}) => {
    if (!attendee.checkedInAt) {
      return (
        <button
          type="button"
          onClick={() => handleCheckIn(attendee.ticketId)}
          className={`btn btn-primary min-h-10 px-4 py-2 text-sm ${fullWidth ? 'w-full' : ''}`}
        >
          Check In
        </button>
      );
    }

    if (!attendee.checkedOutAt) {
      return (
        <button
          type="button"
          onClick={() => handleCheckOut(attendee.ticketId)}
          className={`btn btn-secondary min-h-10 px-4 py-2 text-sm ${fullWidth ? 'w-full' : ''}`}
        >
          Check Out
        </button>
      );
    }

    return <span className="text-sm font-medium text-[#756d66]">Complete</span>;
  };

  if (loading) {
    return <LoadingBlock title="Loading team check-in" message="Fetching gate status and attendee access." />;
  }

  if (loadError) {
    return (
      <ErrorState
        title="Could not load team check-in"
        message={loadError}
        action={(
          <button type="button" onClick={fetchData} className="admin-primary-action inline-flex">
            Retry
          </button>
        )}
      />
    );
  }

  const hasAttendees = attendees.length > 0;

  return (
    <div className="space-y-6 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:p-6 lg:p-0">
      <div className="flex flex-col gap-3">
        <Link
          to="/admin/team-events"
          className="w-fit rounded-full text-sm font-semibold text-[#aaa096] transition-colors hover:text-[#f7efe3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
        >
          Back to Team Events
        </Link>
        <div>
          <p className="admin-eyebrow mb-2">Team gate</p>
          <h1 className="break-words text-2xl font-black tracking-tight text-[#f7efe3] sm:text-3xl">
            {event?.title || 'Team Check-in'}
          </h1>
          <p className="mt-1 text-sm text-[#aaa096]">Check-in dashboard</p>
        </div>
      </div>

      {scanResult && (
        <div
          data-testid="team-checkin-scan-result"
          role={scanResult.success ? 'status' : 'alert'}
          aria-live={scanResult.success ? 'polite' : 'assertive'}
          aria-atomic="true"
          className={`fixed left-4 right-4 top-[calc(4.75rem+env(safe-area-inset-top))] z-50 rounded-2xl border px-4 py-3 text-sm font-bold shadow-2xl sm:left-auto sm:right-4 sm:top-4 sm:max-w-sm ${
            scanResult.success
              ? 'border-emerald-500/25 bg-emerald-500/15 text-emerald-100'
              : 'border-red-500/25 bg-red-500/15 text-red-100'
          }`}
        >
          {scanResult.message}
        </div>
      )}

      {stats && (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Check-in summary">
          {statCards.map((stat) => (
            <div key={stat.key} className="card p-4">
              <div className={`tabular-nums text-2xl font-black sm:text-3xl ${stat.className}`}>
                {stats[stat.key] ?? 0}
              </div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#8f877f]">
                {stat.label}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="min-w-0 flex-1">
            <label htmlFor="team-checkin-search" className="sr-only">Search attendees</label>
            <input
              id="team-checkin-search"
              name="teamCheckinSearch"
              type="search"
              autoComplete="off"
              placeholder="Search by name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input"
            />
          </div>
          <div className="sm:w-56">
            <label htmlFor="team-checkin-status" className="sr-only">Filter by check-in status</label>
            <select
              id="team-checkin-status"
              name="teamCheckinStatus"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="input"
            >
              <option value="all">All attendees</option>
              <option value="not-checked-in">Not Checked In</option>
              <option value="checked-in">Checked In</option>
              <option value="checked-out">Checked Out</option>
            </select>
          </div>
        </div>
      </section>

      {attendeesError ? (
        <div className="card border-red-500/20 bg-red-500/10 p-5 text-sm text-red-100" role="alert">
          <p className="font-bold">Could not load attendees</p>
          <p className="mt-1 text-red-100/80">{attendeesError}</p>
          <button type="button" onClick={fetchAttendees} className="mt-3 rounded-full border border-red-200/20 px-4 py-2 text-xs font-bold text-red-100 transition-colors hover:bg-red-200/10">
            Retry attendees
          </button>
        </div>
      ) : !hasAttendees ? (
        <div className="card py-12 text-center text-sm font-medium text-[#aaa096]">
          No attendees found
        </div>
      ) : (
        <>
          <section data-testid="team-checkin-mobile-list" className="space-y-3 md:hidden" aria-label="Attendees">
            {attendees.map((attendee) => {
              const status = getAttendeeStatus(attendee);

              return (
                <article
                  key={attendee.id}
                  data-testid="team-checkin-mobile-card"
                  className="card min-w-0 space-y-4 p-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="min-w-0 break-words text-base font-bold text-[#f7efe3]">
                        {attendee.name}
                      </h2>
                      <span className={`badge shrink-0 ${status.className}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="break-all text-sm text-[#aaa096]">{attendee.email}</p>
                  </div>
                  {renderActionButton(attendee, { fullWidth: true })}
                </article>
              );
            })}
          </section>

          <div data-testid="team-checkin-desktop-table" className="hidden overflow-hidden rounded-2xl border border-white/10 bg-[#18181b]/50 md:block">
            <table className="w-full" aria-label="Team check-in attendees">
              <thead className="bg-white/[0.03]">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-[#aaa096]">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-[#aaa096]">Email</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-[#aaa096]">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-[#aaa096]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {attendees.map((attendee) => {
                  const status = getAttendeeStatus(attendee);

                  return (
                    <tr key={attendee.id} className="transition-colors hover:bg-white/[0.03]">
                      <td className="max-w-xs break-words px-4 py-4 font-semibold text-[#f7efe3]">
                        {attendee.name}
                      </td>
                      <td className="max-w-sm break-all px-4 py-4 text-[#aaa096]">{attendee.email}</td>
                      <td className="px-4 py-4">
                        <span className={`badge ${status.className}`}>{status.label}</span>
                      </td>
                      <td className="px-4 py-4">{renderActionButton(attendee)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
