import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, MapPin, Calendar, RefreshCw, WifiOff, X } from 'lucide-react';
import api, { getImageUrl } from '../../utils/api';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

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

const EVENT_FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop&q=80';
const EVENT_DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop&q=80';

const formatEventDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date to be announced';
  return format(date, 'EEE, MMM d • h:mm a');
};

export default function HomePage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [showPastEvents, setShowPastEvents] = useState(false);
  const [error, setError] = useState('');

  const activeCategory = CATEGORIES.find(cat => cat.value === categoryFilter);
  const hasFilters = Boolean(debouncedSearch) || categoryFilter !== 'ALL';
  const sectionTitle = debouncedSearch
    ? 'Search Results'
    : showPastEvents
      ? 'Past events'
      : `${activeCategory?.label || 'All Events'}`;

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
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

  return (
    <div className="relative z-10 min-h-screen pb-20">
      <section className="relative mb-4 overflow-hidden px-4 pb-10 pt-8 sm:px-6 sm:pt-12 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-end">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#E23744]/25 bg-[#E23744]/10 px-4 py-2 text-sm font-bold text-[#ffb3b8]">
              <span className="h-2 w-2 rounded-full bg-[#E23744]" />
              Curated event marketplace
            </div>

            <h1 className="max-w-4xl text-4xl font-black leading-[0.95] tracking-normal text-[#f7efe3] sm:text-5xl lg:text-6xl xl:text-7xl">
              Find the event worth showing up for.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-[#a99f95] sm:text-lg">
              Browse concerts, conferences, workshops, and community events with QR tickets, fast checkout, and clear event details.
            </p>

            <div className="mt-7 max-w-2xl">
              <div className="group flex min-w-0 items-center rounded-[1.25rem] border border-white/10 bg-[#12100e] p-2 shadow-[0_18px_70px_rgba(0,0,0,0.24)] transition-colors focus-within:border-[#E23744]/50">
                <Search className="ml-3 shrink-0 text-[#8f867d] transition-colors group-focus-within:text-[#E23744] sm:ml-4" size={21} />
                <input
                  type="text"
                  placeholder="Search events, artists, or venues"
                  aria-label="Search events"
                  className="min-w-0 flex-1 border-none bg-transparent px-3 py-3 text-base font-semibold text-[#f7efe3] placeholder-[#716960] focus:ring-0 sm:px-4"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    aria-label="Clear search"
                    className="mr-2 rounded-full p-2 text-[#716960] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744]"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#8f867d]">
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">QR tickets</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">Secure checkout</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">Live updates</span>
            </div>
          </div>

          <div className="hidden rounded-[1.25rem] border border-white/10 bg-[#12100e] p-5 lg:block">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#716960]">This week</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <p className="text-3xl font-black tabular-nums text-[#f7efe3]">{loading ? '--' : events.length}</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-[#8f867d]">Visible events</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <p className="text-3xl font-black tabular-nums text-[#f7efe3]">{CATEGORIES.length - 1}</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-[#8f867d]">Categories</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-[#a99f95]">
              Use filters to compare upcoming and past events without leaving the index.
            </p>
          </div>
        </div>
      </section>

      {/* Events Grid */}
      <section className="relative z-20 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-6 border-t border-white/10 pt-7 md:flex-row md:items-start">
          <div>
            <h2 className="flex items-center gap-2 text-3xl font-black text-[#f7efe3]">
              {sectionTitle}
              <span className="h-2 w-2 rounded-full bg-[#E23744]" />
            </h2>
            <p className="mt-2 text-sm font-medium text-[#8f867d]">
              {loading ? 'Finding the best matches...' : `${events.length} ${events.length === 1 ? 'event' : 'events'} available`}
              {debouncedSearch ? ` for "${debouncedSearch}"` : ''}
            </p>
          </div>

          <div className="flex flex-col gap-3 md:items-end">
            <div className="flex rounded-full border border-white/10 bg-[#12100e] p-1">
              <button
                type="button"
                onClick={() => setShowPastEvents(false)}
                aria-pressed={!showPastEvents}
                className={`rounded-full px-4 py-2 text-sm font-bold transition-all active:translate-y-px ${!showPastEvents ? 'bg-[#f2e7d8] text-[#17110d]' : 'text-[#8f867d] hover:text-white'}`}
              >
                Upcoming
              </button>
              <button
                type="button"
                onClick={() => setShowPastEvents(true)}
                aria-pressed={showPastEvents}
                className={`rounded-full px-4 py-2 text-sm font-bold transition-all active:translate-y-px ${showPastEvents ? 'bg-[#f2e7d8] text-[#17110d]' : 'text-[#8f867d] hover:text-white'}`}
              >
                Past
              </button>
            </div>

            <div className="relative max-w-full">
              <div className="pointer-events-none absolute bottom-2 left-0 top-0 z-10 w-8 bg-gradient-to-r from-[#09090b] to-transparent md:hidden" />
              <div className="pointer-events-none absolute bottom-2 right-0 top-0 z-10 w-8 bg-gradient-to-l from-[#09090b] to-transparent md:hidden" />
              <div className="flex max-w-[calc(100vw-2rem)] gap-2 overflow-x-auto pb-2 pl-2 pr-2 scrollbar-hide md:max-w-2xl md:flex-wrap md:justify-end md:overflow-visible md:pb-0" aria-label="Filter events by category">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.value}
                    onClick={() => setCategoryFilter(cat.value)}
                    aria-pressed={categoryFilter === cat.value}
                    className={`whitespace-nowrap rounded-full border px-5 py-2.5 text-sm font-bold transition-all active:translate-y-px ${categoryFilter === cat.value
                      ? 'border-[#E23744] bg-[#E23744] text-white'
                      : 'border-white/10 bg-white/[0.035] text-[#a99f95] hover:bg-white/[0.07] hover:text-white'
                      }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3" aria-label="Loading events">
            {Array.from({ length: 6 }).map((_, index) => (
              <EventCardSkeleton key={index} />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-[1.25rem] border border-red-400/15 bg-red-400/[0.04] px-6 py-20 text-center">
            <div className="mb-4 inline-flex rounded-full bg-red-400/10 p-4 text-red-300">
              <WifiOff size={32} />
            </div>
            <p className="text-white text-xl font-semibold">Could not load events</p>
            <p className="mx-auto mt-2 max-w-md text-[#a99f95]">{error}</p>
            <button onClick={() => fetchEvents()} className="btn btn-primary mx-auto mt-6">
              <RefreshCw size={16} />
              Retry
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-[1.25rem] border border-white/10 bg-[#12100e] px-6 py-24 text-center">
            <div className="mb-4 inline-flex rounded-full bg-white/[0.05] p-4">
              <Search size={32} className="text-[#716960]" />
            </div>
            <p className="text-xl font-bold text-[#d9d0c6]">
              {!showPastEvents && !hasFilters ? 'No upcoming events right now.' : 'No events found matching your search.'}
            </p>
            <p className="mt-2 text-[#8f867d]">
              {!showPastEvents && !hasFilters
                ? 'Past events are still available for review.'
                : 'Try checking your spelling, changing category, or clearing filters.'}
            </p>
            {hasFilters && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setCategoryFilter('ALL');
                }}
                className="btn btn-secondary mx-auto mt-6"
              >
                Clear filters
              </button>
            )}
            {!showPastEvents && !hasFilters && (
              <button
                onClick={() => setShowPastEvents(true)}
                className="btn btn-secondary mx-auto mt-6"
              >
                Show past events
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event, idx) => (
              <div key={event.id} className="animate-fade-in" style={{ animationDelay: `${idx * 60}ms` }}>
                <EventCard event={event} priority={idx < 3} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EventCardSkeleton() {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-[#12100e] p-3">
      <div className="aspect-[4/3] animate-pulse rounded-[1rem] bg-white/[0.06]" />
      <div className="px-1 pb-2 pt-4">
        <div className="h-5 w-3/4 animate-pulse rounded-full bg-white/[0.08]" />
        <div className="mt-5 space-y-3">
          <div className="h-4 w-1/2 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-white/[0.06]" />
        </div>
      </div>
    </div>
  );
}

function EventCard({ event, priority = false }) {
  const posterImage = getImageUrl(event.posterUrl) || EVENT_DEFAULT_IMAGE;
  const priceCents = Number(event.priceCents || 0);

  return (
    <Link to={`/events/${event.id}`} className="group block h-full" aria-label={`View details for ${event.title}`}>
      <div className="flex h-full flex-col overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#12100e] p-3 transition-all duration-300 hover:border-[#E23744]/35 hover:bg-[#16120f]">

        <div className="relative aspect-[4/3] overflow-hidden rounded-[1rem] bg-[#090807]">
          <img
            src={posterImage}
            alt={`${event.title} poster`}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
            onError={(e) => {
              if (e.currentTarget.src !== EVENT_FALLBACK_IMAGE) {
                e.currentTarget.src = EVENT_FALLBACK_IMAGE;
              }
            }}
          />

          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/75 to-transparent" />

          <div className="absolute top-3 right-3">
            <div className="rounded-full border border-white/15 bg-black/65 px-3 py-1.5 text-xs font-black text-white">
              {priceCents === 0 ? 'FREE' : `₹${(priceCents / 100).toFixed(0)}`}
            </div>
          </div>

          <div className="absolute bottom-3 left-3 right-3 translate-y-0 opacity-100 transition-all duration-300 sm:translate-y-2 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100 group-focus:translate-y-0 group-focus:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
            <div className="rounded-full bg-[#f2e7d8] py-2.5 text-center text-sm font-black text-[#17110d]">
              Book Ticket
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col px-1 pb-2 pt-4">
          <h3 className="mb-2 line-clamp-2 text-lg font-black leading-tight text-[#f7efe3] transition-colors group-hover:text-white">
            {event.title}
          </h3>

          <div className="mt-auto space-y-2.5">
            <div className="flex min-w-0 items-center text-sm font-medium text-[#a99f95]">
              <Calendar size={14} className="mr-2.5 shrink-0 text-[#716960]" />
              {formatEventDate(event.startTime)}
            </div>
            <div className="flex min-w-0 items-center text-sm font-medium text-[#a99f95]">
              <MapPin size={14} className="mr-2.5 shrink-0 text-[#716960]" />
              <span className="truncate">{event.location}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
