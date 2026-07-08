import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Edit, Trash2, FileText, Users, Eye, EyeOff, BarChart3, MoreVertical, MapPin, CalendarDays, Tag, Copy, Settings, Star } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { ErrorState } from '../../components/StateBlock';
import { SkeletonCardList } from '../../components/Skeleton';
import useConfirmDialog from '../../hooks/useConfirmDialog';

const openPublicEvent = (eventId) => {
  const preview = window.open(`/events/${eventId}`, '_blank', 'noopener,noreferrer');
  if (preview) preview.opener = null;
};

// Full action list for the overflow (⋯) menu.
const EVENT_ACTIONS = [
  { id: 'view', label: 'View public page', icon: Eye },
  { id: 'edit', label: 'Edit event', icon: Edit },
  { id: 'duplicate', label: 'Duplicate event', icon: Copy },
  { id: 'registrations', label: 'Registrations', icon: Users, dividerBefore: true },
  { id: 'control', label: 'Control center', icon: Settings, highlight: true },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'discounts', label: 'Discounts', icon: Tag },
  { id: 'form', label: 'Form builder', icon: FileText },
  {
    id: 'feature',
    label: (event) => (event.featured ? 'Unfeature from homepage' : 'Feature on homepage'),
    icon: Star,
    highlight: true,
    dividerBefore: true,
  },
  {
    id: 'toggle',
    label: (event) => (event.published ? 'Unpublish' : 'Publish'),
    icon: (event) => (event.published ? EyeOff : Eye),
  },
  { id: 'delete', label: 'Delete event', icon: Trash2, destructive: true },
];

const resolveText = (action, event) => (typeof action.label === 'function' ? action.label(event) : action.label);
const resolveIcon = (action, event) => (typeof action.icon === 'function' ? action.icon(event) : action.icon);

export default function EventListPage() {
  const [openMenuId, setOpenMenuId] = useState(null);
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
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenuId(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAction = (action, eventId) => {
    setOpenMenuId(null);
    switch (action) {
      case 'edit': navigate(`/admin/events/${eventId}/edit`); break;
      case 'form': navigate(`/admin/events/${eventId}/form`); break;
      case 'registrations': navigate(`/admin/events/${eventId}/registrations`); break;
      case 'analytics': navigate(`/admin/events/${eventId}/analytics`); break;
      case 'control': navigate(`/admin/events/${eventId}/control`); break;
      case 'discounts': navigate(`/admin/events/${eventId}/discounts`); break;
      case 'delete': handleDelete(eventId); break;
      case 'toggle': {
        const event = events.find(e => e.id === eventId);
        if (event) togglePublish(eventId, event.published);
        break;
      }
      case 'feature': {
        const event = events.find(e => e.id === eventId);
        if (event) toggleFeatured(eventId, event.featured);
        break;
      }
      case 'duplicate': handleDuplicate(eventId); break;
      case 'view': openPublicEvent(eventId); break;
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
      await api.put(`/admin/events/${id}`, { published: !currentStatus });
      toast.success(`Event ${!currentStatus ? 'published' : 'unpublished'} successfully`);
      refetch();
    } catch (error) {
      toast.error('Failed to update event');
    }
  };

  const toggleFeatured = async (id, current) => {
    try {
      await api.put(`/admin/events/${id}`, { featured: !current });
      toast.success(current ? 'Removed from homepage headliner' : 'Featured on homepage');
      refetch();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update event');
    }
  };

  const handleDuplicate = async (id) => {
    try {
      const event = events.find(e => e.id === id);
      if (!event) return;
      await api.post('/admin/events', {
        title: `${event.title} (Copy)`,
        description: event.description,
        location: event.location,
        startTime: event.startTime,
        endTime: event.endTime,
        capacity: event.capacity,
        priceCents: event.priceCents
      });
      toast.success('Event duplicated successfully');
      refetch();
    } catch (error) {
      toast.error('Failed to duplicate event');
    }
  };

  if (isLoading) {
    return <div className="animate-fade-in"><SkeletonCardList count={6} /></div>;
  }

  if (isError) {
    return (
      <ErrorState
        title="Could not load events"
        message={error?.response?.data?.error || 'Failed to fetch events'}
        action={<button type="button" onClick={() => refetch()} className="btn-accent">Retry</button>}
      />
    );
  }

  const PRIMARY = [
    { id: 'edit', label: 'Edit', icon: Edit },
    { id: 'registrations', label: 'Registrations', icon: Users },
    { id: 'control', label: 'Control', icon: Settings },
  ];

  return (
    <div className="animate-fade-in space-y-5">
      {dialog}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mono-accent">★ Event ledger</p>
          <h1 className="mt-2 font-display text-5xl uppercase leading-none sm:text-[56px]">My Events</h1>
          <p className="mt-2 text-sm text-ink-55">Manage, edit, and track your events.</p>
        </div>
        <Link to="/admin/events/create" className="btn-accent inline-flex items-center gap-2 self-start">
          <Plus size={18} /> New Event
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-20 text-center" style={{ borderColor: 'var(--dash)' }}>
          <CalendarDays className="mx-auto mb-4 text-ink-45" size={44} />
          <h3 className="font-display text-2xl uppercase">No events found</h3>
          <p className="mt-2 text-ink-55">Get started by creating your first event.</p>
          <Link to="/admin/events/create" className="btn-accent mt-6 inline-block">Create event</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <div key={event.id} className={`ticket-card-sm relative flex flex-col gap-4 p-5 md:flex-row md:items-center ${openMenuId === event.id ? 'z-[100]' : ''}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Link to={`/admin/events/${event.id}/edit`} className="font-display text-xl uppercase leading-none hover:text-accent">{event.title}</Link>
                  <span className={`tchip ${event.published ? 'tchip-ok text-accent' : 'tchip-warn'}`}>{event.published ? 'PUBLISHED' : 'DRAFT'}</span>
                  {event.featured && <span className="tchip tchip-warn inline-flex items-center gap-1"><Star size={9} /> FEATURED</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-4 font-mono text-[11px] text-ink-55">
                  <span className="flex items-center gap-1.5"><MapPin size={13} /> {event.location}</span>
                  <span className="flex items-center gap-1.5"><CalendarDays size={13} /> {format(new Date(event.startTime), 'MMM d, yyyy • h:mm a')}</span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="font-display text-2xl leading-none">{event._count?.registrations || 0}</div>
                  <div className="mono-label">Registrations</div>
                </div>
                <div className="text-right">
                  <div className="font-display text-2xl leading-none">{event.priceCents === 0 ? 'FREE' : `₹${(event.priceCents / 100).toLocaleString('en-IN')}`}</div>
                  <div className="mono-label">Price</div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 border-l pl-3" style={{ borderColor: 'var(--line20)' }}>
                  {PRIMARY.map(({ id, label, icon: Icon }) => (
                    <button key={id} type="button" onClick={() => handleAction(id, event.id)} title={label} aria-label={`${label} — ${event.title}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:border-accent hover:text-accent" style={{ borderColor: 'var(--line60)' }}>
                      <Icon size={16} />
                    </button>
                  ))}
                  <div className="relative" ref={openMenuId === event.id ? menuRef : null}>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === event.id ? null : event.id); }}
                      title="More" aria-label={`More actions — ${event.title}`} aria-haspopup="menu" aria-expanded={openMenuId === event.id}
                      className="flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:border-accent hover:text-accent" style={{ borderColor: 'var(--line60)' }}>
                      <MoreVertical size={16} />
                    </button>
                    {openMenuId === event.id && (
                      <div role="menu" className="ticket-card-sm absolute right-0 top-full z-[110] mt-2 w-52 overflow-hidden py-1.5 text-sm" onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => { if (e.key === 'Escape') setOpenMenuId(null); }}>
                        {EVENT_ACTIONS.map((action) => {
                          const Icon = resolveIcon(action, event);
                          return (
                            <div key={action.id} role="none">
                              {action.dividerBefore && <div className="my-1 border-t" style={{ borderColor: 'var(--line20)' }} />}
                              <button role="menuitem" onClick={() => handleAction(action.id, event.id)}
                                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--card2)] ${action.destructive ? 'text-red-400' : action.highlight ? 'text-accent' : ''}`}>
                                <Icon size={14} /> {resolveText(action, event)}
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
          ))}
        </div>
      )}
    </div>
  );
}
