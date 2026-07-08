import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calendar, Download, ArrowRight } from 'lucide-react';
import QRCode from 'qrcode';
import ShareButtons from '../../components/ShareButtons';
import Barcode from '../../components/Barcode';
import { buildApiUrl } from '../../utils/api';

export default function SuccessPage() {
  const { state } = useLocation();
  const [qrDataUrl, setQrDataUrl] = useState('');
  const eventId = state?.eventId ? encodeURIComponent(state.eventId) : null;
  const orderId = state?.orderId ? encodeURIComponent(state.orderId) : null;
  const hasSuccessContext = Boolean(state?.eventId || state?.orderId || state?.downloadToken);
  const ticketDownloadUrl = state?.orderId && state?.downloadToken
    ? `${buildApiUrl(`/tickets/order/${orderId}/download`)}?token=${encodeURIComponent(state.downloadToken)}`
    : null;

  // Real, scannable QR encoding the ticket download link (falls back to the event page).
  useEffect(() => {
    const target = ticketDownloadUrl
      || (state?.eventId ? `${window.location.origin}/events/${state.eventId}` : window.location.origin);
    QRCode.toDataURL(target, { margin: 0, width: 240, errorCorrectionLevel: 'M', color: { dark: '#151016', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [ticketDownloadUrl, state]);

  if (!hasSuccessContext) {
    return (
      <div className="flex min-h-[62vh] items-center justify-center py-8">
        <div className="ticket-card w-full max-w-xl p-8 text-center">
          <p className="mono-accent">No ticket session</p>
          <h1 className="mt-3 font-display text-3xl uppercase">This link has no ticket details.</h1>
          <p className="mt-3 text-sm text-ink-55">Open this page from a completed registration so ticket actions can be shown.</p>
          <Link to="/" className="btn-accent mt-7 inline-flex items-center justify-center gap-2">Explore events <ArrowRight size={18} /></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[62vh] flex-col items-center py-10">
      <div
        className="inline-block rounded-lg border-4 px-5 py-0.5 font-display text-5xl uppercase text-accent"
        style={{ borderColor: 'var(--accent)', transform: 'rotate(-3deg)' }}
      >You&apos;re in.</div>

      {/* Ticket */}
      <div className="ticket-card relative mt-8 w-full max-w-lg text-left">
        <div className="p-7 pb-5">
          <div className="mono-accent">Registration complete</div>
          <div className="mt-2 font-display text-3xl uppercase">Your ticket is ready</div>
          <p className="mt-2 text-sm text-ink-55">We sent the QR ticket to your email. Keep it handy for check-in.</p>
        </div>

        <div className="relative flex items-center gap-5 border-t-2 border-dashed p-6" style={{ borderColor: 'var(--dash)' }}>
          <span className="ticket-notch -left-[10px] -top-[10px]" aria-hidden="true" />
          <span className="ticket-notch -top-[10px] right-[-10px]" style={{ left: 'auto' }} aria-hidden="true" />
          <div className="flex h-[110px] w-[110px] shrink-0 items-center justify-center rounded-md bg-white p-1.5" style={{ border: '2px solid var(--ink)' }}>
            {qrDataUrl && <img src={qrDataUrl} alt="Ticket QR code" className="h-full w-full" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="mono-label">Scan at gate</div>
            {orderId && <div className="mt-1.5 font-mono text-[13px] font-semibold tracking-wide">№ {String(state.orderId).slice(0, 12).toUpperCase()}</div>}
            <Barcode seed={orderId || 'occasio'} height={24} className="mt-3" />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 grid w-full max-w-lg grid-cols-1 gap-2.5 sm:grid-cols-2">
        {eventId && (
          <a href={buildApiUrl(`/events/${eventId}/calendar`)} className="btn-outline inline-flex items-center justify-center gap-2">
            <Calendar size={18} /> Add to calendar
          </a>
        )}
        {ticketDownloadUrl && (
          <a href={ticketDownloadUrl} target="_blank" rel="noopener noreferrer" className="btn-ink inline-flex items-center justify-center gap-2">
            <Download size={18} /> Download ticket
          </a>
        )}
      </div>

      <Link to="/" className="mt-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-55 hover:text-accent">
        Browse more events →
      </Link>

      {state?.eventId && (
        <div className="mt-8 w-full max-w-lg border-t border-dashed pt-6 text-center" style={{ borderColor: 'var(--dash)' }}>
          <p className="mono-label mb-4">Share this event</p>
          <ShareButtons title="Just booked my ticket. Check out this event" url={`${window.location.origin}/events/${state.eventId}`} />
        </div>
      )}
    </div>
  );
}
