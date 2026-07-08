import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api, { getImageUrl } from '../../utils/api';
import ShareButtons from '../../components/ShareButtons';
import Barcode from '../../components/Barcode';
import CountdownTimer from '../../components/CountdownTimer';
import PollsSection from '../../components/PollsSection';
import ReviewsSection from '../../components/ReviewsSection';

const when = (v) => (v && !Number.isNaN(new Date(v).getTime())) ? format(new Date(v), 'EEE MMM d · h:mm a').toUpperCase() : 'DATE TBA';

export default function EventDetailsPage() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [waitlistJoined, setWaitlistJoined] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();

  useEffect(() => { fetchEvent(); }, [id]);

  const fetchEvent = async () => {
    try {
      const response = await api.get(`/events/${id}`);
      setEvent(response.data);
    } catch (error) {
      toast.error('Failed to fetch event details');
    } finally {
      setLoading(false);
    }
  };

  const onJoinWaitlist = async (data) => {
    try {
      await api.post(`/events/${event.id}/waitlist`, data);
      setWaitlistJoined(true);
      reset();
      toast.success('Successfully joined the waitlist!');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to join waitlist');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[52vh] items-center justify-center">
        <Loader2 className="animate-spin text-accent" size={32} />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex min-h-[52vh] items-center justify-center">
        <div className="ticket-card max-w-md p-8 text-center">
          <h2 className="font-display text-3xl uppercase">Event not found</h2>
          <p className="mt-2 text-sm text-ink-55">This event may have been removed or the link is incorrect.</p>
          <Link to="/" className="btn-accent mt-6 inline-block">Back to events</Link>
        </div>
      </div>
    );
  }

  const availableSlots = event.capacity - (event._count?.registrations || 0);
  const displaySlots = Math.max(availableSlots, 0);
  const isFull = availableSlots <= 0;
  const registrationClosed = event.startTime ? new Date(event.startTime) <= new Date() : false;
  const organizerName = event.organizer?.name || 'Organizer';
  const poster = getImageUrl(event.posterUrl);
  const isFree = event.priceCents === 0;

  return (
    <div className="pb-14">
      <Link to="/" className="mono-label hover:text-accent">← All events</Link>

      {/* Hero ticket */}
      <div className="ticket-card mt-5 grid grid-cols-1 md:grid-cols-[340px_1fr_220px]">
        <div
          className="flex min-h-[240px] items-center justify-center rounded-t-[10px] border-b md:min-h-[300px] md:rounded-l-[10px] md:rounded-tr-none md:border-b-0 md:border-r font-mono text-[11px]"
          style={{ borderColor: 'var(--line20)', color: 'var(--ink45)', background: poster ? undefined : 'repeating-linear-gradient(45deg,var(--stripe) 0 10px,transparent 10px 20px),var(--ph)' }}
        >
          {poster ? <img src={poster} alt={event.title} className="h-full w-full rounded-t-[10px] object-cover md:rounded-l-[9px] md:rounded-tr-none" fetchPriority="high" /> : 'event photo'}
        </div>

        <div className="flex flex-col justify-center gap-1.5 px-8 py-7">
          <div className="flex flex-wrap items-center gap-3">
            <span className="mono-accent">{when(event.startTime)}</span>
            <span className={`tchip ${isFull ? 'tchip-warn' : 'tchip-ok'}`}>{isFull ? 'Sold out' : `${displaySlots} left`}</span>
          </div>
          <h1 className="mt-1.5 font-display text-4xl uppercase leading-none tracking-wide sm:text-[54px]">{event.title}</h1>
          <div className="font-mono text-[12.5px] tracking-wide text-ink-55">{event.location?.toUpperCase()}</div>
          <p className="mt-3 max-w-[480px] whitespace-pre-wrap text-[15px] leading-relaxed text-ink-70">{event.description || 'No description has been added yet.'}</p>
          <div className="mt-4"><ShareButtons event={event} /></div>
        </div>

        <div className="ticket-stub relative flex flex-col justify-between p-6">
          <span className="ticket-notch -left-[10px] -top-[10px]" aria-hidden="true" />
          <span className="ticket-notch -bottom-[10px] -left-[10px]" aria-hidden="true" />
          <div>
            <div className="mono-label">From</div>
            <div className="font-display text-[38px]">{isFree ? 'FREE' : `₹${(event.priceCents / 100).toLocaleString('en-IN')}`}</div>
          </div>
          <Barcode seed={event.id} height={34} />
          {registrationClosed
            ? <div className="rounded-md border-2 border-dashed py-3 text-center font-mono text-[11px] uppercase tracking-wide text-ink-55" style={{ borderColor: 'var(--dash)' }}>Registration closed</div>
            : isFull
              ? <div className="rounded-md border-2 border-dashed py-3 text-center font-mono text-[11px] uppercase tracking-wide text-ink-55" style={{ borderColor: 'var(--dash)' }}>Join waitlist below</div>
              : <Link to={`/events/${id}/register`} className="btn-accent">{isFree ? 'RSVP' : 'Get tickets'}</Link>}
        </div>
      </div>

      {/* Info row */}
      <div className="mt-5 grid grid-cols-1 gap-3.5 md:grid-cols-3">
        <div className="ticket-card-sm p-5">
          <CountdownTimer targetDate={event.startTime} label="Event starts in" />
        </div>
        <div className="ticket-card-sm p-5">
          <div className="mono-label">Good to know</div>
          <div className="mt-3 flex flex-col gap-2 font-mono text-[12px] text-ink-70">
            <span>— E-TICKET QR AT GATE</span>
            <span>— {format(new Date(event.startTime), 'EEE, MMM d')} · {format(new Date(event.startTime), 'h:mm a')}–{format(new Date(event.endTime), 'h:mm a')}</span>
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`} target="_blank" rel="noopener noreferrer" className="text-accent">— VIEW ON MAP →</a>
          </div>
        </div>
        <div className="ticket-card-sm flex flex-col justify-between p-5">
          <div>
            <div className="mono-label">Hosted by</div>
            <div className="mt-2.5 font-display text-[22px] uppercase">{organizerName}</div>
          </div>
        </div>
      </div>

      {/* Waitlist (when full) */}
      {isFull && !registrationClosed && (
        <div className="ticket-card-sm mt-3.5 p-5 sm:p-6">
          <div className="mono-label">Sold out — join the waitlist</div>
          {!waitlistJoined ? (
            <form onSubmit={handleSubmit(onJoinWaitlist)} className="mt-4 grid gap-3 sm:grid-cols-3">
              <input className="field" placeholder="Full name" aria-invalid={errors.name ? 'true' : 'false'} {...register('name', { required: true })} />
              <input className="field" type="email" placeholder="you@example.com" aria-invalid={errors.email ? 'true' : 'false'} {...register('email', { required: true })} />
              <input className="field" type="tel" placeholder="Phone (optional)" {...register('phone')} />
              <button type="submit" disabled={isSubmitting} className="btn-ink sm:col-span-3 disabled:opacity-60">
                {isSubmitting ? 'Joining…' : 'Join waitlist'}
              </button>
            </form>
          ) : (
            <div className="mt-4 rounded-md border-2 border-dashed py-4 text-center font-mono text-[12px] uppercase tracking-wide text-accent" style={{ borderColor: 'var(--dash)' }}>
              Added to waitlist
            </div>
          )}
        </div>
      )}

      <div className="mt-8 max-w-4xl space-y-6">
        {new Date(event.endTime) > new Date() && <PollsSection eventId={id} />}
        <ReviewsSection eventId={id} eventEndTime={event.endTime} />
      </div>
    </div>
  );
}
