import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Calendar, Users } from 'lucide-react';
import api, { getImageUrl } from '../../utils/api';
import { ErrorState, LoadingBlock } from '../../components/StateBlock';

export default function TeamEventsPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const inviteEventId = searchParams.get('event');
    const inviteToken = searchParams.get('invite');

    useEffect(() => {
        fetchTeamEvents();
    }, [inviteEventId, inviteToken]);

    const fetchTeamEvents = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await api.get('/team/events', {
                params: inviteEventId && inviteToken
                    ? { event: inviteEventId, invite: inviteToken }
                    : undefined
            });
            setEvents(response.data);
            setError(null);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load team events');
        } finally {
            setLoading(false);
        }
    };

    const acceptInvitation = async (eventId) => {
        try {
            setError(null);
            const payload = inviteEventId === eventId && inviteToken
                ? { inviteToken }
                : {};
            await api.post(`/team/events/${eventId}/accept`, payload);
            if (inviteEventId === eventId) {
                setSearchParams({});
            }
            fetchTeamEvents();
        } catch (err) {
            console.error('Failed to accept invitation:', err);
            setError(err.response?.data?.error || 'Failed to accept invitation');
        }
    };

    const getRoleBadge = (role) => {
        const colors = {
            SUPER_MANAGER: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
            MANAGER: 'border-[#E23744]/25 bg-[#E23744]/10 text-[#ffb3b8]',
            SCANNER: 'border-sky-400/25 bg-sky-400/10 text-sky-200',
            STAFF: 'border-white/10 bg-white/[0.05] text-[#d9d0c6]'
        };
        return colors[role] || colors.STAFF;
    };

    const getRoleDescription = (role) => {
        const descriptions = {
            SUPER_MANAGER: 'Full event access + forms + financials',
            MANAGER: 'Full event access + analytics',
            SCANNER: 'Check-in & attendee list access',
            STAFF: 'View-only access'
        };
        return descriptions[role] || '';
    };

    if (loading) {
        return <LoadingBlock title="Loading team events" message="Checking invitations and role access." />;
    }

    if (error) {
        return (
            <ErrorState
                title="Could not load team events"
                message={error}
                action={(
                    <button type="button" onClick={fetchTeamEvents} className="admin-primary-action inline-flex">
                        Retry
                    </button>
                )}
            />
        );
    }

    return (
        <div className="p-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">Team Events</h1>
                <p className="text-gray-400">
                    Events you've been invited to as a team member
                </p>
            </div>

            {events.length === 0 ? (
                <div className="admin-card p-12 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#E23744]/25 bg-[#E23744]/10 text-[#ff6c76]">
                        <Users size={28} />
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">No Team Events</h3>
                    <p className="text-gray-400">
                        You haven't been invited to any events as a team member yet.
                    </p>
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {events.map((event) => (
                        <div key={event.id} className="admin-card overflow-hidden p-0">
                            {/* Event Poster */}
                            {event.posterUrl && (
                                <div className="h-40 bg-gray-800">
                                    <img
                                        src={getImageUrl(event.posterUrl)}
                                        alt={event.title}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                            )}

                            <div className="p-5">
                                {/* Role Badge */}
                                <div className="flex items-center justify-between mb-3">
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getRoleBadge(event.teamRole)}`}>
                                        {event.teamRole}
                                    </span>
                                    {!event.acceptedAt && (
                                        <span className="text-xs text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded">
                                            Pending
                                        </span>
                                    )}
                                </div>

                                {/* Event Title */}
                                <h3 className="text-lg font-semibold text-white mb-2 line-clamp-2">
                                    {event.title}
                                </h3>

                                {/* Role Description */}
                                <p className="text-sm text-gray-400 mb-3">
                                    {getRoleDescription(event.teamRole)}
                                </p>

                                {/* Event Date */}
                                <div className="flex items-center text-sm text-gray-400 mb-4">
                                    <Calendar className="mr-2 h-4 w-4 shrink-0 text-[#716960]" />
                                    {new Date(event.startTime).toLocaleDateString('en-US', {
                                        weekday: 'short',
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric'
                                    })}
                                </div>

                                {/* Organizer */}
                                <p className="text-xs text-gray-500 mb-4">
                                    Organized by {event.organizer?.name || 'Unknown'}
                                </p>

                                {/* Actions */}
                                <div className="flex flex-wrap gap-2">
                                    {!event.acceptedAt ? (
                                        <button
                                            onClick={() => acceptInvitation(event.id)}
                                            className="btn btn-primary min-h-10 flex-1 px-3 py-2 text-sm"
                                        >
                                            Accept Invitation
                                        </button>
                                    ) : (
                                        <>
                                            {/* Check-In button for SCANNER, MANAGER, SUPER_MANAGER */}
                                            {['SUPER_MANAGER', 'MANAGER', 'SCANNER'].includes(event.teamRole) && (
                                                <Link
                                                    to={`/admin/team-event/${event.id}/checkin`}
                                                    className="btn btn-primary min-h-10 flex-1 px-3 py-2 text-sm"
                                                >
                                                    Check-In
                                                </Link>
                                            )}

                                            {/* Edit button for MANAGER and SUPER_MANAGER */}
                                            {['SUPER_MANAGER', 'MANAGER'].includes(event.teamRole) && (
                                                <Link
                                                    to={`/admin/events/${event.id}/edit`}
                                                    className="btn btn-secondary min-h-10 flex-1 px-3 py-2 text-sm"
                                                >
                                                    Edit
                                                </Link>
                                            )}

                                            {/* Form builder for SUPER_MANAGER only */}
                                            {event.teamRole === 'SUPER_MANAGER' && (
                                                <Link
                                                    to={`/admin/events/${event.id}/form`}
                                                    className="btn btn-secondary min-h-10 flex-1 px-3 py-2 text-sm"
                                                >
                                                    Form
                                                </Link>
                                            )}

                                            {/* View public page */}
                                            <a
                                                href={`/events/${event.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn btn-secondary min-h-10 flex-1 px-3 py-2 text-sm"
                                            >
                                                View
                                            </a>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
