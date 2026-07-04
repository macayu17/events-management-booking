import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Download, CheckCircle, XCircle, Clock, Trash2, LogIn, RotateCcw } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import useConfirmDialog from '../../hooks/useConfirmDialog';
import { ErrorState } from '../../components/StateBlock';
import { Skeleton, SkeletonStatGrid, SkeletonTable } from '../../components/Skeleton';

const encodeCsvCell = (value) => {
  const text = value == null ? '' : String(value);
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
};

const buildCsv = (headers, rows) => [
  headers.map(encodeCsvCell).join(','),
  ...rows.map(row => row.map(encodeCsvCell).join(','))
].join('\r\n');

const PAGE_SIZE = 50;

export default function RegistrationsPage() {
  const { id } = useParams();
  const [registrations, setRegistrations] = useState([]);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [summary, setSummary] = useState({ paidRegistrations: 0, totalRevenueCents: 0 });
  const [exporting, setExporting] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

  useEffect(() => {
    fetchData({ showSpinner: true });
  }, [id, page]);

  const fetchData = async ({ showSpinner = false } = {}) => {
    if (showSpinner) setLoading(true);
    setLoadError('');

    try {
      const [eventRes, regRes] = await Promise.all([
        api.get(`/admin/events/${id}`),
        api.get(`/admin/events/${id}/registrations`, { params: { page, pageSize: PAGE_SIZE } })
      ]);

      setEvent(eventRes.data);
      setRegistrations(regRes.data.data || []);
      setPagination(regRes.data.pagination || { total: 0, totalPages: 1 });
      if (regRes.data.summary) setSummary(regRes.data.summary);
    } catch (error) {
      setLoadError(error.response?.data?.error || 'Failed to fetch registrations');
      toast.error('Failed to fetch registrations');
    } finally {
      setLoading(false);
    }
  };

  const deleteRegistration = async (regId, attendeeName) => {
    const confirmed = await confirm({
      title: 'Delete registration?',
      message: `Delete the registration for ${attendeeName || 'this attendee'} and its generated ticket?`,
      confirmLabel: 'Delete registration',
    });
    if (!confirmed) return;

    try {
      await api.delete(`/admin/registrations/${regId}`);
      toast.success('Registration deleted successfully');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete registration');
    }
  };

  const handleCheckIn = async (ticketId, attendeeName) => {
    try {
      await api.post(`/admin/tickets/${ticketId}/checkin`);
      toast.success(`${attendeeName || 'Attendee'} checked in!`);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Check-in failed');
    }
  };

  const handleResetCheckin = async (ticketId) => {
    const confirmed = await confirm({
      title: 'Reset check-in?',
      message: 'This attendee will move back to not checked in for this event.',
      confirmLabel: 'Reset check-in',
      tone: 'warning',
    });
    if (!confirmed) return;
    try {
      await api.post(`/admin/tickets/${ticketId}/reset-checkin`);
      toast.success('Check-in reset');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Reset failed');
    }
  };

  const exportToCSV = async () => {
    if (pagination.total === 0) {
      toast.error('No registrations to export');
      return;
    }

    setExporting(true);
    let exportRows = [];
    try {
      // Pull the full (bounded) set rather than just the current page.
      const res = await api.get(`/admin/events/${id}/registrations`, { params: { all: true } });
      exportRows = res.data.data || [];
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to export registrations');
      setExporting(false);
      return;
    }

    // Get all unique form fields
    const allFields = new Set();
    exportRows.forEach(reg => {
      Object.keys(reg.formResponse || {}).forEach(key => allFields.add(key));
    });

    const headers = ['Registration ID', 'Status', 'Date', ...Array.from(allFields), 'Payment Status', 'Check-in Status', 'Check-in Time'];
    const rows = exportRows.map(reg => {
      const firstOrder = reg.orders?.[0];
      const ticket = firstOrder?.ticket;

      return [
        reg.id,
        reg.status,
        format(new Date(reg.createdAt), 'PPP'),
        ...Array.from(allFields).map(field => reg.formResponse?.[field] || ''),
        firstOrder?.status || 'N/A',
        ticket?.scannedAt ? 'Checked In' : ticket ? 'Not Checked In' : 'No Ticket',
        ticket?.scannedAt ? format(new Date(ticket.scannedAt), 'PPp') : '-'
      ];
    });

    const csvContent = buildCsv(headers, rows);

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `registrations-${event?.slug || 'event'}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    setExporting(false);
    toast.success('CSV downloaded successfully');
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-9 w-72" />
        <SkeletonStatGrid count={3} />
        <SkeletonTable rows={8} columns={7} />
      </div>
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Could not load registrations"
        message={loadError}
        action={(
          <button type="button" onClick={() => fetchData({ showSpinner: true })} className="admin-primary-action">
            Retry
          </button>
        )}
      />
    );
  }

  const paidRegistrations = summary.paidRegistrations;
  const totalRevenue = (summary.totalRevenueCents || 0) / 100;

  return (
    <div>
      {dialog}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-bold text-[#f7efe3]">{event?.title || 'Event registrations'}</h1>
          <p className="admin-muted mt-2">Event Registrations</p>
        </div>
        <button onClick={exportToCSV} disabled={exporting} className="admin-primary-action inline-flex items-center gap-2 self-start sm:self-auto disabled:opacity-60">
          <Download size={20} />
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="admin-card admin-card-hover min-w-0 p-5 sm:p-6">
          <p className="admin-muted mb-1 text-sm">Total Registrations</p>
          <p className="truncate text-3xl font-bold text-[#f7efe3]">{pagination.total}</p>
        </div>
        <div className="admin-card admin-card-hover min-w-0 p-5 sm:p-6">
          <p className="admin-muted mb-1 text-sm">Paid Registrations</p>
          <p className="truncate text-3xl font-bold text-emerald-400">{paidRegistrations}</p>
        </div>
        <div className="admin-card admin-card-hover min-w-0 p-5 sm:p-6">
          <p className="admin-muted mb-1 text-sm">Total Revenue</p>
          <p className="truncate text-3xl font-bold text-[#E23744]">₹{totalRevenue.toFixed(2)}</p>
        </div>
      </div>

      {/* Registrations Table */}
      <div className="admin-card overflow-hidden p-4 sm:p-6">
        {registrations.length === 0 ? (
          <div className="text-center py-12">
            <p className="admin-muted">No registrations yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] table-fixed">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="w-[17%] px-4 py-3 text-left font-semibold text-[#aaa096]">Attendee</th>
                  <th className="w-[22%] px-4 py-3 text-left font-semibold text-[#aaa096]">Email</th>
                  <th className="w-[11%] px-4 py-3 text-left font-semibold text-[#aaa096]">Status</th>
                  <th className="w-[13%] px-4 py-3 text-left font-semibold text-[#aaa096]">Date</th>
                  <th className="w-[12%] px-4 py-3 text-left font-semibold text-[#aaa096]">Ticket</th>
                  <th className="w-[13%] px-4 py-3 text-left font-semibold text-[#aaa096]">Check-in</th>
                  <th className="w-[12%] px-4 py-3 text-left font-semibold text-[#aaa096]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {registrations.map((registration) => {
                  const firstOrder = registration.orders?.[0];
                  const ticket = firstOrder?.ticket;
                  const attendeeName = registration.formResponse?.name || 'N/A';
                  const attendeeEmail = registration.userEmail || 'No email';
                  const attendeeLabel = registration.formResponse?.name || registration.userEmail || 'this attendee';

                  return (
                    <tr key={registration.id} className="border-b border-white/5 transition-colors hover:bg-white/5">
                      <td className="px-4 py-3 text-[#f7efe3]">
                        <div className="min-w-0 truncate" title={attendeeName}>
                          {attendeeName}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#aaa096]">
                        <div className="min-w-0 break-all" title={attendeeEmail}>
                          {attendeeEmail}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={registration.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-[#aaa096]">
                        {format(new Date(registration.createdAt), 'PPP')}
                      </td>
                      <td className="px-4 py-3">
                        {ticket ? (
                          <span className="admin-chip border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                            <CheckCircle size={14} className="mr-1" />
                            Generated
                          </span>
                        ) : (
                          <span className="admin-chip border-amber-500/20 bg-amber-500/10 text-amber-400">
                            <Clock size={14} className="mr-1" />
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {ticket?.scannedAt ? (
                          <div className="flex min-w-0 flex-col">
                            <span className="admin-chip border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                              <CheckCircle size={14} className="mr-1" />
                              Checked In
                            </span>
                            <span className="mt-1 truncate text-xs text-[#7f766d]">
                              {format(new Date(ticket.scannedAt), 'PPp')}
                            </span>
                          </div>
                        ) : ticket ? (
                          <span className="admin-chip border-white/10 bg-white/[0.04] text-[#aaa096]">
                            <XCircle size={14} className="mr-1" />
                            Not Checked In
                          </span>
                        ) : (
                          <span className="text-sm text-[#7f766d]">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {ticket && !ticket?.scannedAt && (
                            <button
                              type="button"
                              onClick={() => handleCheckIn(ticket.id, attendeeLabel)}
                              className="admin-icon-button text-emerald-400"
                              title="Manual Check-in"
                              aria-label={`Manually check in ${attendeeLabel}`}
                            >
                              <LogIn size={18} />
                            </button>
                          )}
                          {ticket?.scannedAt && (
                            <button
                              type="button"
                              onClick={() => handleResetCheckin(ticket.id)}
                              className="admin-icon-button text-amber-400"
                              title="Reset Check-in"
                              aria-label={`Reset check-in for ${attendeeLabel}`}
                            >
                              <RotateCcw size={18} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteRegistration(registration.id, attendeeLabel)}
                            className="admin-icon-button text-red-400"
                            title="Delete registration"
                            aria-label={`Delete registration for ${attendeeLabel}`}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pagination.totalPages > 1 && (
        <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="admin-muted text-sm">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, pagination.total)} of {pagination.total}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn btn-secondary disabled:opacity-50"
            >
              Previous
            </button>
            <span className="admin-muted text-sm">Page {page} of {pagination.totalPages}</span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
              className="btn btn-secondary disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const variants = {
    PAID: { className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400', icon: CheckCircle, text: 'Paid' },
    PENDING: { className: 'border-amber-500/20 bg-amber-500/10 text-amber-400', icon: Clock, text: 'Pending' },
    CANCELLED: { className: 'border-red-500/20 bg-red-500/10 text-red-400', icon: XCircle, text: 'Cancelled' }
  };

  const variant = variants[status] || variants.PENDING;
  const Icon = variant.icon;

  return (
    <span className={`admin-chip ${variant.className}`}>
      <Icon size={14} className="mr-1" />
      {variant.text}
    </span>
  );
}
