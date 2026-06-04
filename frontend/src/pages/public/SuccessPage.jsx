import { Link, useLocation } from 'react-router-dom';
import { CheckCircle, Mail, Calendar, Download, ArrowRight } from 'lucide-react';
import ShareButtons from '../../components/ShareButtons';
import { buildApiUrl } from '../../utils/api';

export default function SuccessPage() {
  const { state } = useLocation();
  const eventId = state?.eventId ? encodeURIComponent(state.eventId) : null;
  const orderId = state?.orderId ? encodeURIComponent(state.orderId) : null;
  const hasSuccessContext = Boolean(state?.eventId || state?.orderId || state?.downloadToken);
  const ticketDownloadUrl = state?.orderId && state?.downloadToken
    ? `${buildApiUrl(`/tickets/order/${orderId}/download`)}?token=${encodeURIComponent(state.downloadToken)}`
    : null;

  if (!hasSuccessContext) {
    return (
      <div className="relative z-10 flex min-h-[62vh] items-center justify-center py-8 text-[#f7efe3]">
        <section className="w-full max-w-xl rounded-[1.25rem] border border-white/10 bg-[#12100e] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.28)] sm:p-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#E23744]/20 bg-[#E23744]/10 text-[#ff9aa2]">
            <CheckCircle size={32} />
          </div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-[#716960]">No ticket session</p>
          <h1 className="mt-2 text-3xl font-black leading-tight tracking-normal text-[#f7efe3]">
            This confirmation link has no ticket details.
          </h1>
          <p className="mt-3 text-sm leading-7 text-[#a99f95]">
            Open this page from a completed registration so ticket actions can be shown.
          </p>
          <Link
            to="/"
            className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-[#E23744] px-5 py-3 text-sm font-black text-white transition-colors hover:bg-[#d12c39] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744]"
          >
            Explore Events
            <ArrowRight size={18} />
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="relative z-10 flex min-h-[62vh] items-center justify-center py-8 text-[#f7efe3]">
      <section className="w-full max-w-2xl rounded-[1.25rem] border border-white/10 bg-[#12100e] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)] sm:p-7 lg:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
            <CheckCircle size={34} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#716960]">Registration complete</p>
            <h1 className="mt-2 break-words text-3xl font-black leading-tight tracking-normal text-[#f7efe3] sm:text-4xl">
              Your ticket is ready.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-[#a99f95] sm:text-base">
              We sent the ticket details to your email. Keep the QR ticket handy for check-in.
            </p>
          </div>
        </div>

        <div className="mt-7 border-t border-white/10 pt-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#E23744]/15 bg-[#E23744]/10 text-[#ff9aa2]">
              <Mail size={22} />
            </div>
            <div className="min-w-0">
              <h2 className="font-black text-[#f7efe3]">Check your email</h2>
              <p className="mt-1 text-sm leading-6 text-[#a99f95]">
                Look for the ticket email with the QR code. If it is not in your inbox, check spam or promotions.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-7 space-y-3 border-t border-white/10 pt-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {eventId && (
              <a
                href={buildApiUrl(`/events/${eventId}/calendar`)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3.5 text-sm font-bold text-[#f7efe3] transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744]"
              >
                <Calendar size={18} />
                <span>Add to Calendar</span>
              </a>
            )}

            {ticketDownloadUrl && (
              <a
                href={ticketDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3.5 text-sm font-bold text-[#f7efe3] transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744]"
              >
                <Download size={18} />
                <span>Download Ticket</span>
              </a>
            )}
          </div>

          <Link
            to="/"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#E23744] px-5 py-4 text-base font-black text-white transition-colors hover:bg-[#d12c39] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12100e]"
          >
            Browse More Events
            <ArrowRight size={20} />
          </Link>
        </div>

        {state?.eventId && (
          <div className="mt-7 border-t border-white/10 pt-6">
            <p className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-[#716960]">
              Share this event
            </p>
            <ShareButtons
              title="Just booked my ticket. Check out this event"
              url={`${window.location.origin}/events/${state.eventId}`}
            />
          </div>
        )}

        <p className="mt-7 border-t border-white/10 pt-5 text-sm text-[#8f867d]">
          Need help? Contact{' '}
          <a
            href="mailto:support@occasio.com"
            className="font-bold text-[#d9d0c6] underline decoration-white/20 underline-offset-4 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744]"
          >
            support@occasio.com
          </a>
        </p>
      </section>
    </div>
  );
}
