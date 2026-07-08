import { useState, useEffect } from 'react';
import { Search, RefreshCw, WifiOff, X } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { HeadlinerTicket, EventTicket } from '../../components/EventTicketCard';

// Category definitions
const CATEGORIES = [
  { value: 'ALL', label: 'All Events' },
  { value: 'MUSIC', label: 'Music' },
  { value: 'TECH', label: 'Tech' },
  { value: 'SPORTS', label: 'Sports' },
  { value: 'ARTS', label: 'Arts' },
  { value: 'BUSINESS', label: 'Business' },
  { value: 'EDUCATION', label: 'Education' },
  { value: 'FOOD', label: 'Food' },
  { value: 'HEALTH', label: 'Health' },
  { value: 'SOCIAL', label: 'Social' }
];

export default function HomePage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [showPastEvents, setShowPastEvents] = useState(false);
  const [error, setError] = useState('');

  const hasFilters = Boolean(debouncedSearch) || categoryFilter !== 'ALL';
  const showFeatured = !hasFilters && !showPastEvents;

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch events when filters change
  useEffect(() => {
    const controller = new AbortController();
    fetchEvents(controller.signal);
    return () => controller.abort();
  }, [debouncedSearch, categoryFilter, showPastEvents]);

  const fetchEvents = async (signal) => {
    const requestSignal = signal && typeof signal === 'object' && 'aborted' in signal ? signal : undefined;
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (!showPastEvents) params.append('upcoming', 'true');
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (categoryFilter && categoryFilter !== 'ALL') params.append('category', categoryFilter);

      const response = await api.get(`/events?${params.toString()}`, requestSignal ? { signal: requestSignal } : undefined);
      const eventData = Array.isArray(response.data) ? response.data : [];
      const visibleEvents = showPastEvents
        ? eventData
          .filter((event) => new Date(event.startTime) < new Date())
          .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
        : eventData;

      setEvents(visibleEvents);
    } catch (error) {
      if (error.code === 'ERR_CANCELED' || error.name === 'CanceledError') return;
      setError('We could not load events right now. Check the backend connection and try again.');
      toast.error('Failed to fetch events');
    } finally {
      if (!requestSignal?.aborted) setLoading(false);
    }
  };

  // Headliner = the event the organizer flagged as featured, else the soonest.
  const headliner = events.find((e) => e.featured) || events[0];
  const rest = events.filter((e) => e.id !== headliner?.id);

  return (
    <div className="mx-auto max-w-[1200px] px-1 pb-16">
      {/* --- Hero --- */}
      <section className="flex flex-col items-start justify-between gap-7 pt-8 pb-9 sm:pb-10 lg:flex-row lg:items-end">
        <div>
          <div className="mono-accent flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: 'var(--accent)' }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
            </span>
            ★ ADMIT ONE · LIVE EVENT INDEX
          </div>
          <h1 className="mt-3.5 font-display text-[46px] uppercase leading-[0.96] tracking-wide sm:text-6xl lg:text-[80px]">
            Stop doomscrolling,<br />
            <span
              className="mt-2 inline-block rounded-md border-[3px] px-3.5 py-0 text-accent"
              style={{ borderColor: 'var(--accent)', transform: 'rotate(-2deg)' }}
            >go out.</span>
          </h1>
        </div>

        {/* Search */}
        <div
          className="flex w-full items-center gap-3 rounded-lg border-2 border-dashed p-1.5 pl-4 lg:w-[400px]"
          style={{ borderColor: 'var(--dash)', background: 'var(--card2)' }}
        >
          <Search className="shrink-0 text-ink-45" size={18} />
          <input
            type="text"
            aria-label="Search events"
            placeholder="SEARCH EVENTS / VENUES"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent font-mono text-[12px] uppercase tracking-wide text-ink placeholder:text-ink-45 focus:outline-none"
          />
          {searchTerm && (
            <button type="button" onClick={() => setSearchTerm('')} aria-label="Clear search" className="text-ink-45 hover:text-accent">
              <X size={16} />
            </button>
          )}
        </div>
      </section>

      {/* --- Section header + filters --- */}
      <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-3 border-t border-dashed pt-6" style={{ borderColor: 'var(--dash)' }}>
        <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.14em]">
          {debouncedSearch ? 'Search results' : showPastEvents ? 'Past events' : 'Headliner'}
          <span className="ml-3 normal-case text-ink-55">
            {loading ? 'loading…' : `${events.length} ${events.length === 1 ? 'event' : 'events'}`}
          </span>
        </span>
        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden rounded-full border" style={{ borderColor: 'var(--line60)' }}>
            <button
              type="button" onClick={() => setShowPastEvents(false)} aria-pressed={!showPastEvents}
              className={`px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide transition-colors ${!showPastEvents ? 'bg-ink text-paper' : 'text-ink-55 hover:text-ink'}`}
              style={!showPastEvents ? { background: 'var(--ink)', color: 'var(--bg)' } : undefined}
            >Upcoming</button>
            <button
              type="button" onClick={() => setShowPastEvents(true)} aria-pressed={showPastEvents}
              className={`px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide transition-colors ${showPastEvents ? 'text-paper' : 'text-ink-55 hover:text-ink'}`}
              style={showPastEvents ? { background: 'var(--ink)', color: 'var(--bg)' } : undefined}
            >Past</button>
          </div>
        </div>
      </div>

      {/* Category chips */}
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1 scrollbar-hide" aria-label="Filter by category">
        {CATEGORIES.map(cat => (
          <button
            key={cat.value}
            onClick={() => setCategoryFilter(cat.value)}
            aria-pressed={categoryFilter === cat.value}
            className="whitespace-nowrap rounded-full px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide transition-colors"
            style={categoryFilter === cat.value
              ? { background: 'var(--ink)', color: 'var(--bg)' }
              : { border: '1.5px solid var(--line60)', color: 'var(--ink70)' }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* --- Content --- */}
      {loading ? (
        <div className="space-y-5">
          <div className="h-[214px] w-full animate-pulse rounded-xl" style={{ background: 'var(--stripe)' }} />
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[120px] animate-pulse rounded-[10px]" style={{ background: 'var(--stripe)' }} />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="ticket-card px-6 py-20 text-center">
          <div className="mx-auto mb-4 inline-flex text-accent"><WifiOff size={32} /></div>
          <p className="font-display text-2xl uppercase">Could not load events</p>
          <p className="mx-auto mt-2 max-w-md text-ink-55">{error}</p>
          <button onClick={() => fetchEvents()} className="btn-accent mx-auto mt-6 inline-flex items-center gap-2">
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed px-6 py-24 text-center" style={{ borderColor: 'var(--dash)' }}>
          <div className="mx-auto mb-4 inline-flex text-ink-45"><Search size={32} /></div>
          <p className="font-display text-2xl uppercase">
            {!showPastEvents && !hasFilters ? 'No upcoming events' : 'No events found'}
          </p>
          <p className="mt-2 text-ink-55">
            {!showPastEvents && !hasFilters ? 'Past events are still available for review.' : 'Try a different search or clear your filters.'}
          </p>
          {hasFilters && (
            <button onClick={() => { setSearchTerm(''); setCategoryFilter('ALL'); }} className="btn-outline mx-auto mt-6">
              Clear filters
            </button>
          )}
          {!showPastEvents && !hasFilters && (
            <button onClick={() => setShowPastEvents(true)} className="btn-outline mx-auto mt-6">Show past events</button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {showFeatured && headliner && <HeadlinerTicket event={headliner} />}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {(showFeatured && headliner ? rest : events).map((event) => (
              <div key={event.id} className="animate-fade-in"><EventTicket event={event} /></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
