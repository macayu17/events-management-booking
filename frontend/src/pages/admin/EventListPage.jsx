import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Edit, Trash2, FileText, Users, Eye, EyeOff, BarChart3, MoreVertical, MapPin, CalendarDays, Tag, Copy, Settings } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import Dock from '../../components/Dock';
import { ErrorState } from '../../components/StateBlock';
import { SkeletonCardList } from '../../components/Skeleton';
import useConfirmDialog from '../../hooks/useConfirmDialog';

const openPublicEvent = (eventId) => {
  const preview = window.open(`/events/${eventId}`, '_blank', 'noopener,noreferrer');
  if (preview) preview.opener = null;
};

const EVENT_ACTIONS = [
  { id: 'view', label: 'View Public Page', dockLabel: 'Public', icon: Eye },
  { id: 'edit', label: 'Edit Event', dockLabel: 'Edit', icon: Edit, quick: true },
  { id: 'duplicate', label: 'Duplicate Event', dockLabel: 'Duplicate', icon: Copy },
  { id: 'registrations', label: 'Registrations', dockLabel: 'Registrations', icon: Users, quick: true, dividerBefore: true },
  { id: 'control', label: 'Control Center', dockLabel: 'Control', icon: Settings, highlight: true },
  { id: 'analytics', label: 'Analytics', dockLabel: 'Analytics', icon: BarChart3 },
  { id: 'discounts', label: 'Discounts', dockLabel: 'Discounts', icon: Tag },
  { id: 'form', label: 'Form Builder', dockLabel: 'Form', icon: FileText },
  {
    id: 'toggle',
    label: (event) => (event.published ? 'Unpublish' : 'Publish'),
    dockLabel: (event) => (event.published ? 'Unpublish' : 'Publish'),
    icon: (event) => (event.published ? EyeOff : Eye),
    dividerBefore: true,
  },
  { id: 'delete', label: 'Delete Event', dockLabel: 'Delete', icon: Trash2, destructive: true },
];

const resolveActionText = (action, event, key = 'label') => {
  const value = action[key] ?? action.label;
  return typeof value === 'function' ? value(event) : value;
};

const resolveActionIcon = (action, event) => {
  const Icon = typeof action.icon === 'function' ? action.icon(event) : action.icon;
  return Icon;
};

export default function EventListPage() {
  const [openMenuId, setOpenMenuId] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirmDialog();

  const { data: events = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'events'],
    queryFn: async () => {
      const res = await api.get('/admin/events');
      return Array.isArray(res.data) ? res.data : [];
    }
  });

  useEffect(() => {
    if (events.length === 0) {
      setSelectedEventId(null);
      return;
    }

    if (!selectedEventId || !events.some(event => event.id === selectedEventId)) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleMenu = (e, eventId) => {
    e.stopPropagation();
    setOpenMenuId(openMenuId === eventId ? null : eventId);
  };

  const handleAction = (action, eventId) => {
    setOpenMenuId(null);

    switch (action) {
      case 'edit':
        navigate(`/admin/events/${eventId}/edit`);
        break;
      case 'form':
        navigate(`/admin/events/${eventId}/form`);
        break;
      case 'registrations':
        navigate(`/admin/events/${eventId}/registrations`);
        break;
      case 'analytics':
        navigate(`/admin/events/${eventId}/analytics`);
        break;
      case 'control':
        navigate(`/admin/events/${eventId}/control`);
        break;
      case 'discounts':
        navigate(`/admin/events/${eventId}/discounts`);
        break;
      case 'delete':
        handleDelete(eventId);
        break;
      case 'toggle': {
        const event = events.find(e => e.id === eventId);
        if (event) togglePublish(eventId, event.published);
        break;
      }
      case 'duplicate':
        handleDuplicate(eventId);
        break;
      case 'view':
        openPublicEvent(eventId);
        break;
    }
  };

  const handleDelete = async (id) => {
    const event = events.find(item => item.id === id);
    const confirmed = await confirm({
      title: 'Delete event?',
      message: `Delete "${event?.title || 'this event'}" and its editable setup data? Paid registrations and ticket history may block deletion.`,
      confirmLabel: 'Delete event',
    });
    if (!confirmed) return;
    try {
      await api.delete(`/admin/events/${id}`);
      toast.success('Event deleted successfully');
      refetch();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete event');
    }
  };

  const togglePublish = async (id, currentStatus) => {
    try {
      await api.put(`/admin/events/${id}`, {
        published: !currentStatus
      });
      toast.success(`Event ${!currentStatus ? 'published' : 'unpublished'} successfully`);
      refetch();
    } catch (error) {
      toast.error('Failed to update event');
    }
  };

  const handleDuplicate = async (id) => {
    try {
      const event = events.find(e => e.id === id);
      if (!event) return;

      const newEvent = {
        title: `${event.title} (Copy)`,
        description: event.description,
        location: event.location,
        startTime: event.startTime,
        endTime: event.endTime,
        capacity: event.capacity,
        priceCents: event.priceCents
      };

      await api.post('/admin/events', newEvent);
      toast.success('Event duplicated successfully');
      refetch();
    } catch (error) {
      toast.error('Failed to duplicate event');
    }
  };

  const selectedEvent = events.find(event => event.id === selectedEventId);
  const dockItems = selectedEvent
    ? EVENT_ACTIONS.map((action) => {
        const Icon = resolveActionIcon(action, selectedEvent);
        return {
          label: resolveActionText(action, selectedEvent, 'dockLabel'),
          icon: <Icon size={20} />,
          onClick: () => handleAction(action.id, selectedEvent.id),
        };
      })
    : [];

  if (isLoading) {
    return (
      <div className="animate-fade-in">
        <SkeletonCardList count={6} />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Could not load events"
        message={error?.response?.data?.error || 'Failed to fetch events'}
        action={(
          <button type="button" onClick={() => refetch()} className="admin-primary-action">
            Retry
          </button>
        )}
      />
    );
  }

  return (
    <div className="animate-fade-in relative min-h-screen pb-[calc(9rem+env(safe-area-inset-bottom))]">
      {dialog}
      <div className="mb-8 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="admin-eyebrow mb-3">Event ledger</p>
          <h1 className="mb-3 text-4xl font-black tracking-tight text-[#f7efe3] md:text-5xl">My Events</h1>
          <p className="admin-muted max-w-2xl">Manage, edit, and track your events. Select any row to use the quick action buttons below.</p>
        </div>
        <Link to="/admin/events/create" className="admin-primary-action flex items-center gap-2 self-start xl:self-auto">
          <Plus size={20} />
          <span>New Event</span>
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="admin-card border-dashed text-center py-20">
          <CalendarDays className="mx-auto text-gray-600 mb-4" size={48} />
          <h3 className="text-xl font-bold text-white mb-2">No events found</h3>
          <p className="text-gray-400 mb-6">Get started by creating your first event.</p>
          <Link to="/admin/events/create" className="admin-primary-action inline-flex">
            Create Event
          </Link>
        </div>
      ) : (
        <div className="space-y-4 overflow-visible">
          {events.map((event, index) => (
            <div
              key={event.id}
              className={`admin-card admin-card-hover group animate-slide-up relative p-5 ${openMenuId === event.id ? 'z-[100]' : ''} ${selectedEventId === event.id ? 'border-[#f2e7d8]/35 bg-[#191511] shadow-[#E23744]/10' : ''}`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <button
                  type="button"
                  onClick={() => setSelectedEventId(event.id)}
                  aria-label={`Select ${event.title} for quick actions`}
                  aria-pressed={selectedEventId === event.id}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all ${selectedEventId === event.id ? 'border-[#E23744] bg-[#E23744]/15' : 'border-white/10 bg-white/[0.04] hover:border-white/25'}`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${selectedEventId === event.id ? 'bg-[#E23744]' : 'bg-[#8f867d]'}`} />
                </button>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Link to={`/admin/events/${event.id}/edit`} className="text-xl font-black text-[#f7efe3] transition-colors group-hover:text-white hover:underline hover:underline-offset-4">
                      {event.title}
                    </Link>
                    <span className={`admin-chip ${event.published ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}`}>
                      {event.published ? 'PUBLISHED' : 'DRAFT'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-5 text-sm text-[#aaa096]">
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-[#8f867d]" />
                      {event.location}
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarDays size={14} className="text-[#8f867d]" />
                      {format(new Date(event.startTime), 'MMM d, yyyy • h:mm a')}
                    </div>
                  </div>
                </div>

                <div className="flex w-full flex-wrap items-center gap-3 md:w-auto md:flex-nowrap md:gap-4">
                  <div className="text-right px-3 border-r border-white/10 md:px-4">
                    <div className="text-2xl font-black text-[#f7efe3]">{event._count?.registrations || 0}</div>
                    <div className="text-[0.65rem] uppercase tracking-[0.16em] text-[#8f867d]">Registrations</div>
                  </div>

                  <div className="text-right px-3 border-r border-white/10 md:px-4">
                    <div className="text-2xl font-black text-[#f7efe3]">
                      {event.priceCents === 0 ? 'FREE' : `₹${event.priceCents / 100}`}
                    </div>
                    <div className="text-[0.65rem] uppercase tracking-[0.16em] text-[#8f867d]">Price</div>
                  </div>

                  {/* Action Buttons */}
                  <div className="ml-auto flex shrink-0 gap-2 pl-0 md:pl-2">
                    {EVENT_ACTIONS.filter(action => action.quick).map((action) => {
                      const Icon = resolveActionIcon(action, event);
                      const label = resolveActionText(action, event);

                      return (
                        <button
                          key={action.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAction(action.id, event.id);
                          }}
                          className="admin-icon-button"
                          title={label}
                          aria-label={`${label} for ${event.title}`}
                        >
                          <Icon size={18} />
                        </button>
                      );
                    })}

                    {/* Dropdown Menu */}
                    <div className="relative" ref={openMenuId === event.id ? menuRef : null}>
                      <button
                        onClick={(e) => toggleMenu(e, event.id)}
                        className="admin-icon-button"
                        title="More Options"
                        aria-label={`More actions for ${event.title}`}
                        aria-expanded={openMenuId === event.id}
                        aria-haspopup="menu"
                        aria-controls={`event-actions-${event.id}`}
                        data-event-menu-trigger={event.id}
                      >
                        <MoreVertical size={18} />
                      </button>

                      {openMenuId === event.id && (
                        <div
                          id={`event-actions-${event.id}`}
                          role="menu"
                          aria-label={`Actions for ${event.title}`}
                          className="absolute right-0 top-full mt-2 z-[60] bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl py-2 w-52 text-sm backdrop-blur-xl animate-fade-in"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setOpenMenuId(null);
                              document.querySelector(`[data-event-menu-trigger="${event.id}"]`)?.focus();
                            }
                          }}
                        >
                          {EVENT_ACTIONS.map((action) => {
                            const Icon = resolveActionIcon(action, event);
                            const label = resolveActionText(action, event);
                            const buttonClass = action.destructive
                              ? 'w-full text-left px-4 py-2.5 hover:bg-red-500/20 text-red-500 flex items-center gap-3'
                              : `w-full text-left px-4 py-2.5 hover:bg-white/10 flex items-center gap-3 ${action.highlight ? 'text-[#E23744] font-medium' : 'text-white'}`;

                            return (
                              <div key={action.id} role="none">
                                {action.dividerBefore && <div className="border-t border-white/10 my-1"></div>}
                                <button
                                  role="menuitem"
                                  onClick={() => handleAction(action.id, event.id)}
                                  className={buttonClass}
                                >
                                  <Icon size={14} /> {label}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedEvent && (
        <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-50 w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 lg:bottom-[calc(2rem+env(safe-area-inset-bottom))] lg:left-[calc(50%+9rem)]">
          <Dock
            items={dockItems}
            className="mx-auto"
            magnification={62}
            baseItemSize={46}
            distance={110}
            panelHeight={102}
            minimal
          />
        </div>
      )}
    </div>
  );
}
