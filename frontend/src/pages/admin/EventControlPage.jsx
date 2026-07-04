import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
    ArrowLeft, Users, UserCog, QrCode, BarChart3, Palette,
    Search, Check, RotateCcw, LogIn, LogOut,
    Clock, UserCheck, UserX, RefreshCw, MessageSquare,
    Mic, Ticket, Bell, Award
} from 'lucide-react';
import api from '../../utils/api';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import Dock from '../../components/Dock';
import TeamManagement from '../../components/TeamManagement';
import { ErrorState, LoadingBlock } from '../../components/StateBlock';
import FormField from './event-control/FormField';
import PollsTab from './event-control/PollsTab';
import TiersTab from './event-control/TiersTab';
import SpeakersTab from './event-control/SpeakersTab';
import RemindersTab from './event-control/RemindersTab';
import CertificatesTab from './event-control/CertificatesTab';


const TABS = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'checkin', label: 'Check-in', icon: QrCode },
    { id: 'attendees', label: 'Attendees', icon: Users },
    { id: 'team', label: 'Team', icon: UserCog },
    { id: 'tiers', label: 'Ticket Tiers', icon: Ticket },
    { id: 'speakers', label: 'Speakers', icon: Mic },
    { id: 'reminders', label: 'Reminders', icon: Bell },
    { id: 'polls', label: 'Polls', icon: MessageSquare },
    { id: 'style', label: 'Ticket Style', icon: Palette },
    { id: 'certificates', label: 'Certificates', icon: Award }
];

const isCanceledRequest = (error) => error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError';

export default function EventControlPage() {
    const { eventId } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const [event, setEvent] = useState(null);
    const [activeTab, setActiveTabState] = useState(() => {
        const tabFromUrl = searchParams.get('tab');
        return TABS.some(tab => tab.id === tabFromUrl) ? tabFromUrl : 'overview';
    });
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [eventError, setEventError] = useState('');
    const [statsError, setStatsError] = useState('');
    const [attendeesError, setAttendeesError] = useState('');
    const [attendees, setAttendees] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setEvent(null);
        setStats(null);
        setAttendees([]);
        setEventError('');
        setStatsError('');
        setAttendeesError('');
        setSearchTerm('');
        setStatusFilter('all');
        fetchEvent(controller.signal);
        fetchStats(controller.signal);
        return () => controller.abort();
    }, [eventId]);

    useEffect(() => {
        const tabFromUrl = searchParams.get('tab');
        const nextTab = TABS.some(tab => tab.id === tabFromUrl) ? tabFromUrl : 'overview';

        if (nextTab !== activeTab) {
            setActiveTabState(nextTab);
        }

        if (tabFromUrl && nextTab === 'overview') {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete('tab');
            setSearchParams(nextParams, { replace: true });
        }
    }, [activeTab, searchParams, setSearchParams]);

    useEffect(() => {
        if (activeTab === 'attendees' || activeTab === 'checkin') {
            const controller = new AbortController();
            fetchAttendees(controller.signal);
            return () => controller.abort();
        }
    }, [activeTab, statusFilter, eventId]);

    const fetchEvent = async (signal) => {
        try {
            const res = await api.get(`/admin/events/${eventId}`, { signal });
            setEvent(res.data);
            setEventError('');
        } catch (error) {
            if (isCanceledRequest(error)) return;
            const message = error.response?.data?.error || 'Failed to load event';
            setEventError(message);
            toast.error(message);
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    };

    const fetchStats = async (signal) => {
        try {
            setStatsError('');
            const res = await api.get(`/admin/events/${eventId}/checkin-stats`, { signal });
            setStats(res.data);
        } catch (error) {
            if (isCanceledRequest(error)) return;
            setStatsError(error.response?.data?.error || 'Failed to load check-in stats');
        }
    };

    const fetchAttendees = async (signal) => {
        try {
            setAttendeesError('');
            const status = statusFilter !== 'all' ? statusFilter : undefined;
            // Attendees drive instant client-side search + the check-in tab, so
            // load the full (server-bounded) set rather than a single page.
            const res = await api.get(`/admin/events/${eventId}/attendees`, {
                params: { status, all: true },
                signal
            });
            setAttendees(res.data.data || []);
        } catch (error) {
            if (isCanceledRequest(error)) return;
            setAttendeesError(error.response?.data?.error || 'Failed to load attendees');
        }
    };

    const handleCheckIn = async (ticketId) => {
        try {
            await api.post(`/admin/tickets/${ticketId}/checkin`);
            toast.success('Checked in');
            fetchAttendees();
            fetchStats();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Check-in failed');
        }
    };

    const handleCheckOut = async (ticketId) => {
        try {
            await api.post(`/admin/tickets/${ticketId}/checkout`);
            toast.success('Checked out');
            fetchAttendees();
            fetchStats();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Check-out failed');
        }
    };

    const handleReset = async (ticketId) => {
        try {
            await api.post(`/admin/tickets/${ticketId}/reset-checkin`);
            toast.success('Reset successful');
            fetchAttendees();
            fetchStats();
        } catch (error) {
            toast.error('Reset failed');
        }
    };

    const selectTab = (tabId) => {
        setActiveTabState(tabId);
        const nextParams = new URLSearchParams(searchParams);
        if (tabId === 'overview') nextParams.delete('tab');
        else nextParams.set('tab', tabId);
        setSearchParams(nextParams, { replace: true });
    };

    const filteredAttendees = attendees.filter(a =>
        a.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const activeTabMeta = TABS.find(tab => tab.id === activeTab) || TABS[0];
    const activeTabLabel = activeTabMeta.label;

    if (loading) {
        return <LoadingBlock title="Loading event control" message="Fetching event operations and live check-in status." />;
    }

    if (eventError) {
        return (
            <ErrorState
                title="Could not load event control"
                message={eventError}
                action={(
                    <button type="button" onClick={() => { setLoading(true); fetchEvent(); fetchStats(); }} className="btn btn-primary">
                        <RefreshCw size={16} />
                        Retry
                    </button>
                )}
            />
        );
    }

    return (
        <div className="space-y-6 pb-4 md:pb-[calc(10rem+env(safe-area-inset-bottom))]">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                    <Link to="/admin/events" className="btn btn-ghost" aria-label="Back to event list">
                        <ArrowLeft size={20} />
                    </Link>
                    <div className="min-w-0">
                        <h1 className="break-words text-2xl font-bold text-white">{event?.title}</h1>
                        <p className="text-gray-400 text-sm">Event Control Center</p>
                    </div>
                </div>
                <button onClick={() => { fetchStats(); fetchAttendees(); }} className="btn btn-secondary w-full sm:w-auto">
                    <RefreshCw size={18} />
                    Refresh
                </button>
            </div>

            <nav
                className="rounded-[1.4rem] border border-white/10 bg-[#100e0c]/80 p-2 shadow-[0_16px_60px_rgba(0,0,0,0.2)] md:hidden"
                role="tablist"
                aria-label="Event control sections"
            >
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;

                        return (
                            <button
                                key={tab.id}
                                id={`event-control-tab-${tab.id}`}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                aria-controls={`event-control-panel-${tab.id}`}
                                onClick={() => selectTab(tab.id)}
                                className={`flex min-h-12 items-center gap-3 rounded-2xl border px-3 py-2.5 text-left text-sm font-bold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E23744] ${
                                    isActive
                                        ? 'border-[#f2e7d8]/40 bg-[#f2e7d8] text-[#17110d] shadow-lg shadow-black/20'
                                        : 'border-white/10 bg-white/[0.035] text-[#aaa096] hover:border-[#f2e7d8]/25 hover:bg-white/[0.07] hover:text-[#f7efe3]'
                                }`}
                            >
                                <Icon size={18} className="shrink-0" />
                                <span className="truncate">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </nav>

            {/* Floating Dock Navigation */}
            <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-50 hidden w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 md:block lg:bottom-[calc(2rem+env(safe-area-inset-bottom))] lg:left-[calc(50%+9rem)]">
                <Dock
                    items={TABS.map(tab => ({
                        icon: <tab.icon size={22} />,
                        label: tab.label,
                        ariaLabel: `Open ${tab.label} section${activeTab === tab.id ? ', current section' : ''}`,
                        active: activeTab === tab.id,
                        onClick: () => selectTab(tab.id)
                    }))}
                    className="mx-auto"
                    role="navigation"
                    ariaLabel="Event control shortcuts"
                    magnification={65}
                    baseItemSize={48}
                    distance={120}
                    panelHeight={102}
                    minimal
                />
            </div>

            <section
                id={`event-control-panel-${activeTab}`}
                role="tabpanel"
                aria-labelledby={`event-control-tab-${activeTab}`}
                aria-label={`${activeTabLabel} panel`}
            >
                {/* Tab Content */}
                {activeTab === 'overview' && (
                    <OverviewTab
                        event={event}
                        stats={stats}
                        statsError={statsError}
                        onRetryStats={() => fetchStats()}
                        onSelectTab={selectTab}
                    />
                )}

                {activeTab === 'checkin' && (
                    <CheckinTab
                        attendees={filteredAttendees}
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        statusFilter={statusFilter}
                        setStatusFilter={setStatusFilter}
                        onCheckIn={handleCheckIn}
                        onCheckOut={handleCheckOut}
                        onReset={handleReset}
                        stats={stats}
                        statsError={statsError}
                        attendeesError={attendeesError}
                        onRetryStats={() => fetchStats()}
                        onRetryAttendees={() => fetchAttendees()}
                    />
                )}

                {activeTab === 'attendees' && (
                    <AttendeesTab
                        attendees={filteredAttendees}
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        statusFilter={statusFilter}
                        setStatusFilter={setStatusFilter}
                        attendeesError={attendeesError}
                        onRetryAttendees={() => fetchAttendees()}
                    />
                )}

                {activeTab === 'polls' && (
                    <PollsTab eventId={eventId} />
                )}

                {activeTab === 'team' && (
                    <TeamManagement eventId={eventId} />
                )}

                {activeTab === 'tiers' && (
                    <TiersTab eventId={eventId} />
                )}

                {activeTab === 'speakers' && (
                    <SpeakersTab eventId={eventId} />
                )}

                {activeTab === 'reminders' && (
                    <RemindersTab eventId={eventId} />
                )}

                {activeTab === 'style' && (
                    <TicketStyleTab eventId={eventId} event={event} currentStyle={event?.ticketStyle} />
                )}

                {activeTab === 'certificates' && (
                    <CertificatesTab eventId={eventId} event={event} />
                )}
            </section>
        </div>
    );
}

// Overview Tab Component
function OverviewTab({ event, stats, statsError, onRetryStats, onSelectTab }) {
    const startsAt = event?.startTime ? format(new Date(event.startTime), 'MMM d, h:mm a') : 'Not scheduled';
    const endsAt = event?.endTime ? format(new Date(event.endTime), 'MMM d, h:mm a') : 'Not scheduled';
    const capacity = Number(event?.capacity || 0);
    const registrationCount = Number(stats?.total || 0);
    const capacityLabel = capacity > 0 ? `${registrationCount}/${capacity}` : `${registrationCount}`;
    const eventStatus = event?.published ? 'Published' : 'Draft';

    return (
        <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="card p-5">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <p className="admin-eyebrow mb-2">Event status</p>
                            <h2 className="text-xl font-black text-white">{event?.title || 'Untitled event'}</h2>
                            <p className="mt-1 text-sm text-gray-400">{event?.location || 'Location not set'}</p>
                        </div>
                        <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold ${event?.published ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-orange-500/25 bg-orange-500/10 text-orange-300'}`}>
                            {eventStatus}
                        </span>
                    </div>

                    <dl className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                            <dt className="text-xs font-semibold text-gray-500">Starts</dt>
                            <dd className="mt-1 text-sm font-bold text-gray-100">{startsAt}</dd>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                            <dt className="text-xs font-semibold text-gray-500">Ends</dt>
                            <dd className="mt-1 text-sm font-bold text-gray-100">{endsAt}</dd>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                            <dt className="text-xs font-semibold text-gray-500">Capacity used</dt>
                            <dd className="mt-1 text-sm font-bold text-gray-100">{capacityLabel}</dd>
                        </div>
                    </dl>
                </div>

                <div className="card p-5">
                    <p className="admin-eyebrow mb-3">Next actions</p>
                    <div className="grid gap-2">
                        <button type="button" onClick={() => onSelectTab('checkin')} className="btn btn-primary justify-start">
                            <QrCode size={17} />
                            Open check-in desk
                        </button>
                        <button type="button" onClick={() => onSelectTab('attendees')} className="btn btn-secondary justify-start">
                            <Users size={17} />
                            Review attendees
                        </button>
                        <button type="button" onClick={() => onSelectTab('certificates')} className="btn btn-secondary justify-start">
                            <Award size={17} />
                            Manage certificates
                        </button>
                    </div>
                </div>
            </div>

            {statsError ? (
                <ErrorState
                    title="Could not load check-in stats"
                    message={statsError}
                    action={(
                        <button type="button" onClick={onRetryStats} className="btn btn-primary">
                            <RefreshCw size={16} />
                            Retry stats
                        </button>
                    )}
                    className="min-h-[320px]"
                />
            ) : !stats ? (
                <LoadingBlock title="Loading stats" message="Fetching ticket and check-in totals." />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                        label="Total Tickets"
                        value={stats.total}
                        icon={Users}
                    />
                    <StatCard
                        label="Checked In"
                        value={stats.checkedIn}
                        subtext={`${stats.checkInRate}%`}
                        icon={UserCheck}
                        color="green"
                    />
                    <StatCard
                        label="Not Checked In"
                        value={stats.notCheckedIn}
                        icon={UserX}
                        color="orange"
                    />
                    <StatCard
                        label="Currently Inside"
                        value={stats.currentlyInside}
                        icon={LogIn}
                        color="blue"
                    />
                </div>
            )}
        </div>
    );
}

function StatCard({ label, value, subtext, icon: Icon, color = 'gray' }) {
    const colors = {
        gray: 'bg-white/5 text-white',
        green: 'bg-emerald-500/10 text-emerald-400',
        orange: 'bg-orange-500/10 text-orange-400',
        blue: 'bg-blue-500/10 text-blue-400'
    };

    return (
        <div className={`card p-4 ${colors[color]}`}>
            <div className="flex items-center gap-2 mb-1">
                <Icon size={18} className="opacity-60" />
                <span className="text-xs text-gray-400">{label}</span>
            </div>
            <p className="text-2xl font-bold">{value}</p>
            {subtext && <p className="text-xs opacity-60 mt-0.5">{subtext}</p>}
        </div>
    );
}

function AttendeeEmptyPanel({ hasActiveFilters, onClearFilters, context = 'attendees' }) {
    const Icon = hasActiveFilters ? Search : Users;
    const title = hasActiveFilters ? 'No matching attendees' : 'No attendees yet';
    const message = hasActiveFilters
        ? 'The current search or status filter did not match any attendee records.'
        : context === 'checkin'
            ? 'Tickets will appear here as soon as attendees register for this event.'
            : 'Attendee records will appear here after registrations are booked.';

    return (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-10 text-center">
            <Icon size={42} className="mx-auto mb-3 text-gray-500 opacity-70" />
            <h3 className="text-base font-semibold text-white">{title}</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-gray-400">{message}</p>
            {hasActiveFilters && (
                <button type="button" onClick={onClearFilters} className="btn btn-secondary mx-auto mt-4">
                    <RotateCcw size={16} />
                    Clear filters
                </button>
            )}
        </div>
    );
}

// Check-in Tab Component
function CheckinTab({
    attendees,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    onCheckIn,
    onCheckOut,
    onReset,
    stats,
    statsError,
    attendeesError,
    onRetryStats,
    onRetryAttendees
}) {
    const hasActiveFilters = searchTerm.trim() !== '' || statusFilter !== 'all';
    const clearFilters = () => {
        setSearchTerm('');
        setStatusFilter('all');
    };

    return (
        <div className="space-y-3">
            {/* Quick Stats + Search in one row */}
            <div className="flex items-center gap-3 flex-wrap">
                {stats && (
                    <>
                        <div className="bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-lg text-sm">
                            <span className="font-bold">{stats.checkedIn}</span> checked in
                        </div>
                        <div className="bg-orange-500/10 text-orange-400 px-3 py-1.5 rounded-lg text-sm">
                            <span className="font-bold">{stats.notCheckedIn}</span> pending
                        </div>
                        <div className="bg-blue-500/10 text-blue-400 px-3 py-1.5 rounded-lg text-sm">
                            <span className="font-bold">{stats.currentlyInside}</span> inside
                        </div>
                    </>
                )}
                {statsError && (
                    <button type="button" onClick={onRetryStats} className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-sm font-bold text-red-300">
                        Retry stats
                    </button>
                )}
                <div className="flex-1 min-w-[200px] relative ml-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                    <input
                        type="text"
                        aria-label="Search attendees"
                        placeholder="Search by name or email..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="input pl-9 py-1.5 text-sm"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="input w-auto py-1.5 text-sm"
                    aria-label="Filter check-in status"
                >
                    <option value="all">All</option>
                    <option value="not-checked-in">Not Checked In</option>
                    <option value="checked-in">Checked In</option>
                    <option value="checked-out">Checked Out</option>
                </select>
            </div>

            {/* Attendee List */}
            <div className="space-y-1.5">
                {attendeesError ? (
                    <ErrorState
                        title="Could not load attendees"
                        message={attendeesError}
                        action={(
                            <button type="button" onClick={onRetryAttendees} className="btn btn-primary">
                                <RefreshCw size={16} />
                                Retry attendees
                            </button>
                        )}
                        className="min-h-[320px]"
                    />
                ) : attendees.length === 0 ? (
                    <AttendeeEmptyPanel
                        hasActiveFilters={hasActiveFilters}
                        onClearFilters={clearFilters}
                        context="checkin"
                    />
                ) : (
                    attendees.map(attendee => (
                        <div key={attendee.id} className="card flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="min-w-0 break-words font-medium text-white text-sm">{attendee.name}</p>
                                    <span className="text-[10px] font-mono bg-white/10 text-gray-400 px-1.5 py-0.5 rounded">
                                        {attendee.ticketShortId || attendee.ticketId?.substring(0, 8).toUpperCase()}
                                    </span>
                                    {attendee.bookedAt && (
                                        <span className="text-[11px] text-gray-500 ml-1">
                                            <Clock size={10} className="inline mr-0.5" />
                                            {format(new Date(attendee.bookedAt), 'MMM d, h:mm a')}
                                        </span>
                                    )}
                                    {attendee.checkedInAt && (
                                        <span className="text-[11px] text-emerald-400 ml-1">
                                            <Check size={10} className="inline mr-0.5" />
                                            {format(new Date(attendee.checkedInAt), 'MMM d, h:mm a')}
                                        </span>
                                    )}
                                </div>
                                <p className="break-all text-xs text-gray-400">{attendee.email}</p>
                            </div>
                            <div className="flex w-full items-center justify-end gap-1.5 sm:w-auto">
                                {!attendee.checkedInAt ? (
                                    <button
                                        onClick={() => onCheckIn(attendee.ticketId)}
                                        className="btn btn-primary px-3 py-1.5 text-sm"
                                    >
                                        <LogIn size={14} />
                                        Check In
                                    </button>
                                ) : !attendee.checkedOutAt ? (
                                    <button
                                        onClick={() => onCheckOut(attendee.ticketId)}
                                        className="btn btn-secondary px-3 py-1.5 text-sm"
                                    >
                                        <LogOut size={14} />
                                        Check Out
                                    </button>
                                ) : (
                                    <span className="badge badge-neutral text-xs">Done</span>
                                )}
                                {attendee.checkedInAt && (
                                    <button
                                        onClick={() => onReset(attendee.ticketId)}
                                        className="btn btn-ghost px-1.5"
                                        title="Reset"
                                        aria-label={`Reset check-in for ${attendee.name}`}
                                    >
                                        <RotateCcw size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// Attendees Tab Component
function AttendeesTab({ attendees, searchTerm, setSearchTerm, statusFilter, setStatusFilter, attendeesError, onRetryAttendees }) {
    const hasActiveFilters = searchTerm.trim() !== '' || statusFilter !== 'all';
    const clearFilters = () => {
        setSearchTerm('');
        setStatusFilter('all');
    };

    return (
        <div className="space-y-3">
            {/* Search & Filter */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                <FormField label="Search attendees">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                        <input
                            type="text"
                            placeholder="Name or email"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="input pl-10"
                        />
                    </div>
                </FormField>
                <FormField label="Status">
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="input"
                    >
                        <option value="all">All Attendees</option>
                        <option value="not-checked-in">Not Checked In</option>
                        <option value="checked-in">Checked In</option>
                    </select>
                </FormField>
            </div>

            {/* Table */}
            {attendeesError ? (
                <ErrorState
                    title="Could not load attendees"
                    message={attendeesError}
                    action={(
                        <button type="button" onClick={onRetryAttendees} className="btn btn-primary">
                            <RefreshCw size={16} />
                            Retry attendees
                        </button>
                    )}
                    className="min-h-[320px]"
                />
            ) : attendees.length === 0 ? (
                <AttendeeEmptyPanel hasActiveFilters={hasActiveFilters} onClearFilters={clearFilters} />
            ) : (
                <div className="card overflow-hidden p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[680px]">
                            <thead>
                                <tr className="border-b border-white/10 text-left">
                                    <th className="px-4 py-3 text-xs font-medium text-gray-400">Name</th>
                                    <th className="px-4 py-3 text-xs font-medium text-gray-400">Email</th>
                                    <th className="px-4 py-3 text-xs font-medium text-gray-400">Status</th>
                                    <th className="px-4 py-3 text-xs font-medium text-gray-400">Check-in Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {attendees.map(a => (
                                    <tr key={a.id} className="border-b border-white/5 hover:bg-white/5">
                                        <td className="px-4 py-3 text-white text-sm">{a.name}</td>
                                        <td className="px-4 py-3 text-gray-400 text-sm">{a.email}</td>
                                        <td className="px-4 py-3">
                                            {a.checkedInAt ? (
                                                a.checkedOutAt ? (
                                                    <span className="badge badge-neutral">Left</span>
                                                ) : (
                                                    <span className="badge badge-success">Inside</span>
                                                )
                                            ) : (
                                                <span className="badge badge-warning">Pending</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-400 text-sm">
                                            {a.checkedInAt ? format(new Date(a.checkedInAt), 'MMM d, h:mm a') : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

// Ticket Style Tab Component - Enhanced Wix-like Builder
function TicketStyleTab({ eventId, event, currentStyle }) {
    const [style, setStyle] = useState(currentStyle || {
        template: 'modern',
        primaryColor: '#E23744',
        accentColor: '#ffffff',
        backgroundColor: '#18181b',
        headerImage: '',
        fontFamily: 'Helvetica',
        borderRadius: '16',
        showQR: true,
        showLogo: true,
        showBorder: true
    });
    const [saving, setSaving] = useState(false);

    // PDF-compatible fonts only
    const FONTS = [
        { id: 'Helvetica', label: 'Helvetica (Sans)' },
        { id: 'Times-Roman', label: 'Times (Serif)' },
        { id: 'Courier', label: 'Courier (Mono)' }
    ];
    const TEMPLATES = [
        { id: 'modern', label: 'Modern', desc: 'Clean gradient design' },
        { id: 'minimal', label: 'Minimal', desc: 'Simple & elegant' },
        { id: 'classic', label: 'Classic', desc: 'Traditional look' },
        { id: 'bold', label: 'Bold', desc: 'Eye-catching colors' }
    ];

    const previewTheme = {
        modern: {
            cardBg: 'rgb(25, 25, 35)',
            wrapperBg: style.backgroundColor,
            headerBg: `linear-gradient(135deg, ${style.primaryColor} 0%, rgba(0,0,0,0.55) 100%)`,
            accentGlow: `0 0 0 1px ${style.primaryColor}33, 0 20px 45px rgba(0,0,0,0.35)`
        },
        minimal: {
            cardBg: 'rgb(17, 24, 39)',
            wrapperBg: '#0f172a',
            headerBg: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0))',
            accentGlow: '0 0 0 1px rgba(255,255,255,0.08), 0 10px 30px rgba(0,0,0,0.25)'
        },
        classic: {
            cardBg: 'rgb(38, 30, 22)',
            wrapperBg: 'rgb(28, 23, 18)',
            headerBg: `linear-gradient(135deg, ${style.primaryColor} 0%, rgba(20,10,0,0.65) 100%)`,
            accentGlow: `0 0 0 1px ${style.primaryColor}55, inset 0 0 0 1px rgba(245,222,179,0.12)`
        },
        bold: {
            cardBg: 'rgb(30, 16, 28)',
            wrapperBg: style.backgroundColor,
            headerBg: `linear-gradient(135deg, ${style.primaryColor} 0%, #111827 100%)`,
            accentGlow: `0 0 0 1px ${style.primaryColor}66, 0 24px 50px rgba(0,0,0,0.45)`
        }
    };

    const selectedPreview = previewTheme[style.template] || previewTheme.modern;
    const previewStart = event?.startTime ? new Date(event.startTime) : null;
    const hasPreviewStart = previewStart && !Number.isNaN(previewStart.getTime());
    const previewTitle = event?.title || 'Event name';
    const previewDate = hasPreviewStart ? format(previewStart, 'MMM d, yyyy') : 'Date to be announced';
    const previewTime = hasPreviewStart ? format(previewStart, 'h:mm a') : 'Time to be announced';
    const previewVenue = event?.location || 'Venue to be announced';

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put(`/admin/events/${eventId}/ticket-style`, { ticketStyle: style });
            toast.success('Ticket style saved');
        } catch (error) {
            toast.error('Failed to save');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-24">
            {/* Settings Panel */}
            <div className="space-y-6">
                <div className="card p-6 space-y-6">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Palette size={20} className="text-[#E23744]" />
                        Customize Ticket Design
                    </h3>

                    {/* Template Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-3">Template Style</label>
                        <div className="grid grid-cols-2 gap-3">
                            {TEMPLATES.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setStyle({ ...style, template: t.id })}
                                    className={`p-4 rounded-xl border-2 text-left transition-all ${style.template === t.id
                                        ? 'border-[#E23744] bg-[#E23744]/10'
                                        : 'border-white/10 hover:border-white/20'
                                        }`}
                                >
                                    <p className="font-medium text-white">{t.label}</p>
                                    <p className="text-xs text-gray-500">{t.desc}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Colors */}
                    <div className="space-y-4">
                        <label className="block text-sm font-medium text-gray-400">Colors</label>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Primary</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        aria-label="Primary color picker"
                                        value={style.primaryColor}
                                        onChange={e => setStyle({ ...style, primaryColor: e.target.value })}
                                        className="w-10 h-10 rounded-lg cursor-pointer border-0"
                                    />
                                    <input
                                        type="text"
                                        aria-label="Primary color hex value"
                                        value={style.primaryColor}
                                        onChange={e => setStyle({ ...style, primaryColor: e.target.value })}
                                        className="input text-xs flex-1"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Accent</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        aria-label="Accent color picker"
                                        value={style.accentColor}
                                        onChange={e => setStyle({ ...style, accentColor: e.target.value })}
                                        className="w-10 h-10 rounded-lg cursor-pointer border-0"
                                    />
                                    <input
                                        type="text"
                                        aria-label="Accent color hex value"
                                        value={style.accentColor}
                                        onChange={e => setStyle({ ...style, accentColor: e.target.value })}
                                        className="input text-xs flex-1"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Background</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        aria-label="Background color picker"
                                        value={style.backgroundColor}
                                        onChange={e => setStyle({ ...style, backgroundColor: e.target.value })}
                                        className="w-10 h-10 rounded-lg cursor-pointer border-0"
                                    />
                                    <input
                                        type="text"
                                        aria-label="Background color hex value"
                                        value={style.backgroundColor}
                                        onChange={e => setStyle({ ...style, backgroundColor: e.target.value })}
                                        className="input text-xs flex-1"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Font & Border Radius */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Font</label>
                            <select
                                aria-label="Ticket font"
                                value={style.fontFamily}
                                onChange={e => setStyle({ ...style, fontFamily: e.target.value })}
                                className="input w-full"
                            >
                                {FONTS.map(f => (
                                    <option key={f.id} value={f.id}>{f.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Corners</label>
                            <input
                                type="range"
                                aria-label="Ticket corner radius"
                                min="0"
                                max="32"
                                value={style.borderRadius}
                                onChange={e => setStyle({ ...style, borderRadius: e.target.value })}
                                className="w-full accent-[#E23744]"
                            />
                            <p className="text-xs text-gray-500 mt-1">{style.borderRadius}px</p>
                        </div>
                    </div>

                    {/* Header Image */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Header Background Image (URL)</label>
                        <input
                            type="url"
                            aria-label="Header background image URL"
                            value={style.headerImage || ''}
                            onChange={e => setStyle({ ...style, headerImage: e.target.value })}
                            placeholder="https://example.com/image.jpg"
                            className="input w-full"
                        />
                        <p className="text-xs text-gray-500 mt-1">Optional: Use an image instead of solid color for header</p>
                    </div>

                    {/* Toggles */}
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-400 mb-2">Elements</label>
                        {[
                            { key: 'showQR', label: 'Show QR Code' },
                            { key: 'showLogo', label: 'Show Event Logo' },
                            { key: 'showBorder', label: 'Show Border' }
                        ].map(toggle => (
                            <label key={toggle.key} className="flex cursor-pointer items-center gap-3 rounded-xl px-1 py-1 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#E23744] group">
                                <input
                                    type="checkbox"
                                    checked={Boolean(style[toggle.key])}
                                    onChange={(event) => setStyle({ ...style, [toggle.key]: event.target.checked })}
                                    className="sr-only"
                                />
                                <span
                                    aria-hidden="true"
                                    className={`w-11 h-6 rounded-full transition-colors relative ${style[toggle.key] ? 'bg-[#E23744]' : 'bg-white/20'
                                        }`}
                                >
                                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${style[toggle.key] ? 'left-6' : 'left-1'
                                        }`} />
                                </span>
                                <span className="text-sm text-gray-300 group-hover:text-white">{toggle.label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn btn-primary w-full"
                >
                    {saving ? 'Saving...' : 'Save Ticket Design'}
                </button>
            </div>

            {/* Live Preview - Matches PDF design */}
            <div className="lg:sticky lg:top-6">
                <label className="block text-sm font-medium text-gray-400 mb-3">Live Preview</label>
                <div
                    className="overflow-hidden transition-all p-2"
                    style={{
                        backgroundColor: selectedPreview.wrapperBg,
                        borderRadius: `${style.borderRadius}px`,
                        boxShadow: selectedPreview.accentGlow,
                        fontFamily: style.fontFamily === 'Times-Roman' ? 'Times New Roman, serif' :
                            style.fontFamily === 'Courier' ? 'Courier New, monospace' : 'Helvetica, Arial, sans-serif'
                    }}
                >
                    {/* Inner card with optional border */}
                    <div
                        className="m-3 rounded-lg overflow-hidden"
                        style={{
                            backgroundColor: selectedPreview.cardBg,
                            border: style.showBorder ? `2px solid ${style.primaryColor}` : 'none',
                            borderRadius: `${Math.max(0, parseInt(style.borderRadius) - 4)}px`
                        }}
                    >
                        {/* Header Section */}
                        <div
                            className="h-24 flex items-end p-4"
                            style={{
                                background: style.headerImage
                                    ? `linear-gradient(to top, rgba(0,0,0,0.7), transparent), url(${style.headerImage}) center/cover`
                                    : selectedPreview.headerBg
                            }}
                        >
                            <div>
                                {style.showLogo && (
                                    <p className="text-xs font-bold mb-1" style={{ color: style.primaryColor }}>
                                        ✦ EVENT TICKET
                                    </p>
                                )}
                                <h4 className="break-words text-lg font-bold" style={{ color: style.accentColor }}>
                                    {previewTitle}
                                </h4>
                                {style.template === 'bold' && (
                                    <p className="text-[10px] mt-1 font-semibold tracking-wide" style={{ color: style.primaryColor }}>
                                        VIP ACCESS
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Content Section */}
                        <div className="p-4">
                            <div className={`flex gap-4 ${style.showQR ? '' : 'flex-col'}`}>
                                {/* QR Code */}
                                {style.showQR && (
                                    <div className="flex flex-col items-center">
                                        <div
                                            className="w-16 h-16 rounded-lg flex items-center justify-center"
                                            style={{
                                                backgroundColor: 'rgb(30, 30, 40)',
                                                border: `1.5px solid ${style.primaryColor}`
                                            }}
                                        >
                                            <QrCode size={40} className="text-white" />
                                        </div>
                                        <p className="text-[8px] text-gray-500 mt-1">SCAN TO ENTER</p>
                                    </div>
                                )}

                                {/* Event Details */}
                                <div className="flex-1 space-y-2 text-xs">
                                    <div>
                                        <p className="text-gray-500 text-[10px]">DATE & TIME</p>
                                        <p className="font-bold" style={{ color: style.accentColor }}>{previewDate}</p>
                                        <p className="text-gray-400">{previewTime}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-500 text-[10px]">VENUE</p>
                                        <p className="break-words font-bold" style={{ color: style.accentColor }}>{previewVenue}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-500 text-[10px]">TICKET #</p>
                                        <p className="font-mono font-bold" style={{ color: style.primaryColor }}>A1B2C3D4</p>
                                    </div>
                                </div>
                            </div>

                            {/* Perforated Line */}
                            <div className="my-4 border-t border-dashed border-gray-600 relative">
                                <div className="absolute -left-7 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full" style={{ backgroundColor: style.backgroundColor }}></div>
                                <div className="absolute -right-7 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full" style={{ backgroundColor: style.backgroundColor }}></div>
                            </div>

                            {/* Attendee Section */}
                            <div>
                                <p className="text-[10px] font-bold mb-2" style={{ color: style.primaryColor }}>ATTENDEE INFORMATION</p>
                                <div className="flex justify-between text-xs">
                                    <div>
                                        <p className="text-gray-500 text-[10px]">NAME</p>
                                        <p className="font-bold" style={{ color: style.accentColor }}>Attendee name</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-500 text-[10px]">EMAIL</p>
                                        <p className="break-all text-gray-400">attendee@example.com</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="border-t border-gray-700 p-3 text-center">
                            <p className="text-[8px] text-gray-500">Non-transferable • Valid for single entry</p>
                            {style.showLogo && (
                                <p className="font-bold mt-2" style={{ color: style.primaryColor }}>occasio</p>
                            )}
                        </div>
                    </div>
                    <p className="text-[11px] text-gray-500 px-4 pb-3">
                        Template: <span className="text-gray-300 font-medium capitalize">{style.template}</span> • Preview updates exactly as you edit colors, corners, font, and elements.
                    </p>
                </div>
            </div>
        </div>
    );
}
