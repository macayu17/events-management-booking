import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { getImageUrl } from '../utils/api';
import Barcode from './Barcode';

const CATEGORY_LABEL = {
  ALL: 'All', MUSIC: 'Music', TECH: 'Tech', SPORTS: 'Sports', ARTS: 'Arts',
  BUSINESS: 'Business', EDUCATION: 'Education', FOOD: 'Food', HEALTH: 'Health', SOCIAL: 'Social'
};

const priceLabel = (priceCents) => {
  const n = Number(priceCents || 0);
  return n === 0 ? 'FREE' : `₹${(n / 100).toLocaleString('en-IN')}`;
};

const whenLabel = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'DATE TBA';
  return format(date, 'EEE MMM d · h:mm a').toUpperCase();
};

const metaLabel = (event) => {
  const cat = CATEGORY_LABEL[event.category] || event.category;
  return [event.location, cat].filter(Boolean).join(' · ').toUpperCase();
};

// Punched half-circle centered exactly on the perforation line at top/bottom.
function Notch({ pos, size = 18 }) {
  const off = -(size / 2); // pull half the circle off the card so it centers on the seam
  return (
    <span
      className="absolute rounded-full"
      style={{
        width: size,
        height: size,
        left: off + 1, // +1 to sit on the ~2px border line
        [pos]: off,
        background: 'var(--bg)',
        border: `${size >= 16 ? 2 : 1.5}px solid var(--line)`,
      }}
      aria-hidden="true"
    />
  );
}

// Full-width headliner ticket with cover photo.
export function HeadlinerTicket({ event }) {
  const poster = getImageUrl(event.posterUrl);
  return (
    <Link to={`/events/${event.id}`} className="group block" aria-label={`View ${event.title}`}>
      <div className="ticket-card grid grid-cols-1 md:grid-cols-[300px_1fr_210px] group-hover:-translate-x-0.5 group-hover:-translate-y-0.5">
        <div
          className="flex min-h-[214px] items-center justify-center rounded-t-[10px] border-b md:rounded-l-[10px] md:rounded-tr-none md:border-b-0 md:border-r font-mono text-[11px]"
          style={{ borderColor: 'var(--line20)', color: 'var(--ink45)', background: poster ? undefined : 'repeating-linear-gradient(45deg,var(--stripe) 0 10px,transparent 10px 20px),var(--ph)' }}
        >
          {poster
            ? <img src={poster} alt={event.title} className="h-full w-full rounded-t-[10px] object-cover md:rounded-l-[9px] md:rounded-tr-none" loading="eager" />
            : 'headliner photo'}
        </div>

        <div className="flex flex-col justify-center gap-1 px-7 py-6">
          <div className="flex items-center gap-3">
            <span className="mono-accent">{whenLabel(event.startTime)}</span>
            {event.category && <span className="tchip tchip-ok">{CATEGORY_LABEL[event.category] || event.category}</span>}
          </div>
          <div className="mt-1.5 font-display text-4xl uppercase leading-none tracking-wide sm:text-[46px]">{event.title}</div>
          <div className="font-mono text-[12.5px] tracking-wide text-ink-55">{metaLabel(event)}</div>
          {event.description && (
            <p className="mt-2.5 max-w-[430px] text-sm leading-relaxed text-ink-70 line-clamp-2">{event.description}</p>
          )}
        </div>

        <div className="ticket-stub relative flex flex-col justify-between p-5">
          <Notch pos="top" size={18} />
          <Notch pos="bottom" size={18} />
          <div>
            <div className="mono-label">From</div>
            <div className="font-display text-[34px]">{priceLabel(event.priceCents)}</div>
          </div>
          <Barcode seed={event.id} height={30} />
          <div className="btn-accent">{Number(event.priceCents) === 0 ? 'RSVP' : 'Get tickets'}</div>
        </div>
      </div>
    </Link>
  );
}

// Compact ticket-stub row (2-up grid on desktop).
export function EventTicket({ event }) {
  const isFree = Number(event.priceCents) === 0;
  return (
    <Link to={`/events/${event.id}`} className="group block" aria-label={`View ${event.title}`}>
      <div className="ticket-card-sm grid grid-cols-[1fr_124px]">
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="mono-accent text-[0.62rem]">{whenLabel(event.startTime)}</span>
            {event.category && <span className="tchip tchip-ok">{CATEGORY_LABEL[event.category] || event.category}</span>}
          </div>
          <div className="mt-1.5 font-display text-[23px] uppercase leading-tight">{event.title}</div>
          <div className="mt-1 truncate font-mono text-[11px] text-ink-55">{metaLabel(event)}</div>
        </div>
        <div className="ticket-stub relative flex flex-col justify-between gap-1.5 p-3.5">
          <Notch pos="top" size={14} />
          <Notch pos="bottom" size={14} />
          <span className="font-display text-[18px]">{priceLabel(event.priceCents)}</span>
          <Barcode seed={event.id} height={18} />
          <span className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.15em] text-accent">
            {isFree ? 'RSVP →' : 'Book →'}
          </span>
        </div>
      </div>
    </Link>
  );
}
