import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Calendar, MapPin, Users, ArrowLeft, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api, { getImageUrl } from '../../utils/api';
import ShareButton from '../../components/ShareButton';
import ShareButtons from '../../components/ShareButtons';
import CountdownTimer from '../../components/CountdownTimer';
import PollsSection from '../../components/PollsSection';
import ReviewsSection from '../../components/ReviewsSection';

export default function EventDetailsPage() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [waitlistJoined, setWaitlistJoined] = useState(false);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();

  useEffect(() => {
    fetchEvent();
  }, [id]);

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
      const msg = error.response?.data?.error || 'Failed to join waitlist';
      toast.error(msg);
    }
  };

  if (loading) {
    return (
      <div className="relative z-10 flex min-h-[52vh] items-center justify-center">
        <div className="rounded-[1.25rem] border border-white/10 bg-[#12100e] px-6 py-5 text-center shadow-[0_18px_70px_rgba(0,0,0,0.24)]">
          <Loader2 className="mx-auto animate-spin text-[#E23744]" size={32} />
          <p className="mt-3 text-sm font-semibold text-[#a99f95]">Loading event details</p>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="relative z-10 flex min-h-[52vh] items-center justify-center">
        <div className="w-full max-w-md rounded-[1.25rem] border border-white/10 bg-[#12100e] p-8 text-center shadow-[0_18px_70px_rgba(0,0,0,0.24)]">
          <h2 className="text-2xl font-black text-[#f7efe3]">Event not found</h2>
          <p className="mt-2 text-sm leading-6 text-[#a99f95]">This event may have been removed or the link may be incorrect.</p>
          <Link to="/" className="mt-6 inline-flex rounded-full bg-[#E23744] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#d12c39] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]">
            Back to Events
          </Link>
        </div>
      </div>
    );
  }

  const availableSlots = event.capacity - (event._count?.registrations || 0);
  const displaySlots = Math.max(availableSlots, 0);
  const isFull = availableSlots <= 0;
  const registrationClosed = event.startTime ? new Date(event.startTime) <= new Date() : false;
  const organizerName = event.organizer?.name || 'Organizer';
  const posterUrl = getImageUrl(event.posterUrl) || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1600&q=80';

  return (
    <div className="relative z-10 pb-12 text-[#f7efe3]">
      <div className="mb-7">
        <Link
          to="/"
          className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-sm font-bold text-[#a99f95] transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744]"
        >
          <ArrowLeft size={16} />
          Back to Events
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <article className="min-w-0 space-y-6">
          <div className="flex min-w-0 items-start justify-between gap-4 lg:hidden">
            <h1 className="min-w-0 flex-1 break-words text-balance text-3xl font-black leading-tight tracking-normal text-[#f7efe3] sm:text-4xl">
              {event.title}
            </h1>
            <div className="shrink-0">
              <ShareButton event={event} />
            </div>
          </div>

          <div className="group relative aspect-[4/3] w-full overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#12100e] shadow-[0_24px_90px_rgba(0,0,0,0.28)] sm:aspect-video">
            <img
              src={posterUrl}
              alt={event.title}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.025] motion-reduce:transform-none motion-reduce:transition-none"
              sizes="(min-width: 1024px) 760px, calc(100vw - 2rem)"
              fetchPriority="high"
              decoding="async"
            />
          </div>

          <div className="hidden min-w-0 items-start justify-between gap-5 lg:flex">
            <h1 className="min-w-0 flex-1 break-words text-balance text-5xl font-black leading-tight tracking-normal text-[#f7efe3]">
              {event.title}
            </h1>
            <div className="shrink-0">
              <ShareButtons event={event} />
            </div>
          </div>

          <section className="flex min-w-0 items-center gap-4 rounded-[1.25rem] border border-white/10 bg-[#12100e] p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#f2e7d8]/20 bg-[#f2e7d8] text-lg font-black text-[#17110d]">
              {organizerName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#716960]">Organized by</p>
              <p className="break-words text-base font-bold text-[#f7efe3]">{organizerName}</p>
            </div>
          </section>

          <section className="rounded-[1.25rem] border border-white/10 bg-[#12100e] p-5 sm:p-6">
            <h2 className="text-xl font-black text-[#f7efe3]">About this event</h2>
            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-[#c9c0b7] sm:text-base">
              {event.description || 'No description has been added yet.'}
            </p>
          </section>
        </article>

        <aside className="space-y-4 lg:sticky lg:top-28">
          <section className="rounded-[1.25rem] border border-white/10 bg-[#12100e] p-4">
            <CountdownTimer targetDate={event.startTime} label="Event starts in" />
          </section>

          <section className="rounded-[1.25rem] border border-white/10 bg-[#12100e] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)] sm:p-6">
            <div className="border-b border-white/10 pb-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#716960]">Price per ticket</p>
              <div className="mt-2 flex items-baseline gap-1">
                {event.priceCents === 0 ? (
                  <span className="text-4xl font-black text-[#f7efe3]">Free</span>
                ) : (
                  <>
                    <span className="text-2xl font-black text-[#E23744]">₹</span>
                    <span className="text-5xl font-black tracking-normal text-[#f7efe3]">{(event.priceCents / 100).toFixed(2)}</span>
                  </>
                )}
              </div>
            </div>

            <div className="mt-6 space-y-5">
              <div className="flex min-w-0 items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#E23744]/15 bg-[#E23744]/10 text-[#ff9aa2]">
                  <Calendar size={20} />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-[#f7efe3]">Date and Time</p>
                  <p className="mt-1 text-sm leading-6 text-[#a99f95]">{format(new Date(event.startTime), 'EEEE, MMMM d, yyyy')}</p>
                  <p className="text-sm leading-6 text-[#a99f95]">{format(new Date(event.startTime), 'h:mm a')} - {format(new Date(event.endTime), 'h:mm a')}</p>
                </div>
              </div>

              <div className="flex min-w-0 items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#E23744]/15 bg-[#E23744]/10 text-[#ff9aa2]">
                  <MapPin size={20} />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-[#f7efe3]">Location</p>
                  <p className="mt-1 break-words text-sm leading-6 text-[#a99f95]">{event.location}</p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex text-sm font-bold text-[#ff9aa2] underline-offset-4 transition-colors hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744]"
                  >
                    View on map
                  </a>
                </div>
              </div>

              <div className="flex min-w-0 items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#E23744]/15 bg-[#E23744]/10 text-[#ff9aa2]">
                  <Users size={20} />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-[#f7efe3]">Availability</p>
                  <p className={`mt-1 text-sm font-bold ${isFull ? 'text-[#ff9aa2]' : 'text-emerald-300'}`}>
                    {isFull ? 'Sold Out' : `${displaySlots} spots left`}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-7 border-t border-white/10 pt-6">
              {registrationClosed ? (
                <div className="rounded-2xl border border-[#E23744]/20 bg-[#E23744]/10 p-5 text-center">
                  <p className="font-black text-[#f7efe3]">Registration closed</p>
                  <p className="mt-1 text-sm leading-6 text-[#a99f95]">This event has already started.</p>
                </div>
              ) : isFull ? (
                !waitlistJoined ? (
                  <form onSubmit={handleSubmit(onJoinWaitlist)} className="space-y-3">
                    <div>
                      <label htmlFor="waitlist-name" className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-[#8f867d]">
                        Name
                      </label>
                      <input
                        id="waitlist-name"
                        type="text"
                        className="input"
                        placeholder="Your full name"
                        aria-invalid={errors.name ? 'true' : 'false'}
                        {...register('name', { required: true })}
                      />
                    </div>
                    <div>
                      <label htmlFor="waitlist-email" className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-[#8f867d]">
                        Email
                      </label>
                      <input
                        id="waitlist-email"
                        type="email"
                        className="input"
                        placeholder="you@example.com"
                        aria-invalid={errors.email ? 'true' : 'false'}
                        {...register('email', { required: true })}
                      />
                    </div>
                    <div>
                      <label htmlFor="waitlist-phone" className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-[#8f867d]">
                        Phone
                      </label>
                      <input
                        id="waitlist-phone"
                        type="tel"
                        className="input"
                        placeholder="Optional"
                        {...register('phone')}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-[#f2e7d8] px-5 py-4 text-base font-black text-[#17110d] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12100e]"
                    >
                      {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : 'Join Waitlist'}
                    </button>
                  </form>
                ) : (
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-5 py-4 text-center font-black text-emerald-300">
                    Added to Waitlist
                  </div>
                )
              ) : (
                <Link
                  to={`/events/${id}/register`}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-[#E23744] px-5 py-4 text-base font-black text-white transition-colors hover:bg-[#d12c39] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12100e]"
                >
                  Book Tickets
                </Link>
              )}
            </div>
          </section>
        </aside>
      </div>

      <div className="mt-8 max-w-4xl space-y-6">
        {new Date(event.endTime) > new Date() && (
          <PollsSection eventId={id} />
        )}
        <ReviewsSection eventId={id} eventEndTime={event.endTime} />
      </div>
    </div>
  );
}
