import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle,
  Clock,
  Keyboard,
  Loader,
  Mail,
  MapPin,
  QrCode,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Ticket,
  User,
  XCircle,
  Zap
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api';

const QR_READER_ID = 'qr-reader';
const SCAN_DEDUPE_MS = 1800;
let scannerModulePromise;

const normalizeQrPayload = (qrData) => String(qrData || '').trim().replace(/^\uFEFF/, '');

const loadScannerModule = () => {
  if (!scannerModulePromise) {
    scannerModulePromise = import('html5-qrcode');
  }
  return scannerModulePromise;
};

const scheduleIdleTask = (callback) => {
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(callback, { timeout: 2500 });
    return () => window.cancelIdleCallback?.(id);
  }

  const id = window.setTimeout(callback, 900);
  return () => window.clearTimeout(id);
};

const getQrbox = (viewfinderWidth, viewfinderHeight) => {
  const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
  const size = Math.max(180, Math.min(Math.floor(minEdge * 0.72), 340));
  return { width: size, height: size };
};

const fastScanConfig = {
  fps: 18,
  qrbox: getQrbox,
  aspectRatio: 16 / 9,
  disableFlip: true
};

const rearCameraConstraints = {
  facingMode: { ideal: 'environment' },
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 }
};

const frontCameraConstraints = {
  facingMode: 'user',
  width: { ideal: 960 },
  height: { ideal: 540 },
  frameRate: { ideal: 24, max: 30 }
};

export default function ScannerPage() {
  const [verificationResult, setVerificationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [cameraError, setCameraError] = useState('');

  const html5QrCodeRef = useRef(null);
  const verificationInFlightRef = useRef(false);
  const lastPayloadRef = useRef('');
  const lastScanAtRef = useRef(0);
  const isMountedRef = useRef(true);

  const stopScanner = useCallback(async () => {
    const scanner = html5QrCodeRef.current;

    if (scanner) {
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
      } catch {
        // The scanner can already be stopped when camera permissions fail.
      }

      try {
        scanner.clear();
      } catch {
        // Clear is best-effort only.
      }

      html5QrCodeRef.current = null;
    }

    if (isMountedRef.current) {
      setScannerActive(false);
      setStarting(false);
    }
  }, []);

  const verifyTicket = useCallback(async (qrData, { bypassDedupe = false } = {}) => {
    const normalizedQrData = normalizeQrPayload(qrData);
    const now = Date.now();

    if (!normalizedQrData) {
      toast.error('Paste valid QR data first.');
      return;
    }

    if (verificationInFlightRef.current) return;

    if (!bypassDedupe && lastPayloadRef.current === normalizedQrData && now - lastScanAtRef.current < SCAN_DEDUPE_MS) {
      return;
    }

    verificationInFlightRef.current = true;
    setLoading(true);
    setCameraError('');
    setVerificationResult(null);

    try {
      const response = await api.post('/tickets/verify', {
        qrPayload: normalizedQrData
      });

      lastPayloadRef.current = normalizedQrData;
      lastScanAtRef.current = Date.now();

      setVerificationResult({
        valid: true,
        alreadyScanned: false,
        ...response.data
      });

      toast.success('Valid ticket. Attendee checked in.');
    } catch (error) {
      const errorData = error.response?.data;

      if (error.response) {
        lastPayloadRef.current = normalizedQrData;
        lastScanAtRef.current = Date.now();
      } else {
        lastPayloadRef.current = '';
        lastScanAtRef.current = 0;
      }

      setVerificationResult({
        valid: false,
        alreadyScanned: errorData?.alreadyScanned || false,
        error: errorData?.error || 'Invalid ticket or server error',
        scannedAt: errorData?.scannedAt,
        attendee: errorData?.attendee
      });

      if (errorData?.alreadyScanned) {
        toast.error('This ticket was already scanned.');
      } else {
        toast.error(errorData?.error || 'Invalid ticket.');
      }
    } finally {
      verificationInFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  const handleDetectedPayload = useCallback((decodedText) => {
    const normalizedQrData = normalizeQrPayload(decodedText);
    if (!normalizedQrData || verificationInFlightRef.current) return;

    try {
      html5QrCodeRef.current?.pause(true);
    } catch {
      // Pause is an optimization; stopScanner below still shuts the stream down.
    }

    void stopScanner();
    void verifyTicket(normalizedQrData);
  }, [stopScanner, verifyTicket]);

  const startScanner = useCallback(async () => {
    await stopScanner();

    setVerificationResult(null);
    setCameraError('');
    setManualOpen(false);
    setScannerActive(true);
    setStarting(true);

    await new Promise((resolve) => requestAnimationFrame(resolve));

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await loadScannerModule();
      const scanner = new Html5Qrcode(QR_READER_ID, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        verbose: false
      });

      html5QrCodeRef.current = scanner;

      try {
        await scanner.start(rearCameraConstraints, fastScanConfig, handleDetectedPayload, undefined);
      } catch {
        await scanner.start(frontCameraConstraints, fastScanConfig, handleDetectedPayload, undefined);
      }

      if (isMountedRef.current) {
        setScannerActive(true);
        setStarting(false);
      }
    } catch (error) {
      console.error('Error starting scanner:', error);
      await stopScanner();
      setCameraError('Camera access failed. Use manual entry or allow camera permission.');
      toast.error('Could not access camera. Use manual entry.');
    }
  }, [handleDetectedPayload, stopScanner]);

  useEffect(() => {
    return scheduleIdleTask(() => {
      void loadScannerModule();
    });
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      void stopScanner();
    };
  }, [stopScanner]);

  const submitManualEntry = async (event) => {
    event.preventDefault();
    await stopScanner();
    await verifyTicket(manualValue, { bypassDedupe: true });
    setManualValue('');
    setManualOpen(false);
  };

  const scanNextTicket = () => {
    setVerificationResult(null);
    setCameraError('');
    void startScanner();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-[#f7efe3]">
      <header className="admin-card overflow-hidden p-0">
        <div className="relative isolate flex flex-col gap-5 px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(226,55,68,0.22),transparent_26rem)]" />
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#E23744]/35 bg-[#E23744]/15 text-[#ff6b75] shadow-lg shadow-[#E23744]/10">
              <QrCode size={24} />
            </div>
            <div>
              <p className="admin-eyebrow">Live gate control</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Ticket Scanner</h1>
              <p className="mt-2 max-w-2xl text-sm text-[#b7aca2] sm:text-base">
                Fast QR check-in with duplicate protection, instant attendee status, and manual fallback.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-[1.5rem] border border-white/10 bg-black/20 p-2 text-center sm:min-w-[360px]">
            <ScannerStat label="Mode" value={scannerActive ? 'Live' : 'Ready'} tone={scannerActive ? 'text-emerald-300' : 'text-[#f2e7d8]'} />
            <ScannerStat label="Decoder" value="QR only" tone="text-[#ff7a84]" />
            <ScannerStat label="FPS" value="18" tone="text-[#f2e7d8]" />
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="admin-card overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
            <div>
              <p className="admin-eyebrow">Camera window</p>
              <h2 className="mt-1 text-xl font-black">Scan ticket QR</h2>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-[#bdb4aa]">
              <Zap size={14} className="text-[#E23744]" />
              Fast mode
            </div>
          </div>

          <div className="p-4 sm:p-6">
            <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#070707] shadow-inner shadow-black/60">
              <div className="aspect-video min-h-[260px] max-h-[560px]">
                {scannerActive ? (
                  <div id={QR_READER_ID} className="scanner-reader h-full w-full" />
                ) : (
                  <div className="flex h-full min-h-[260px] items-center justify-center bg-[radial-gradient(circle_at_center,rgba(226,55,68,0.13),transparent_18rem)]">
                    <div className="text-center">
                      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-white/10 bg-white/[0.04] text-[#b7aca2]">
                        <Camera size={38} />
                      </div>
                      <p className="mt-4 text-sm font-bold text-[#f2e7d8]">Camera is off</p>
                      <p className="mt-1 text-xs text-[#8f867d]">Start scanner when the attendee is ready.</p>
                    </div>
                  </div>
                )}
              </div>

              {scannerActive && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-[54%] w-[32%] min-w-[210px] rounded-[1.5rem] border-2 border-[#E23744] shadow-[0_0_0_999px_rgba(0,0,0,0.18),0_0_36px_rgba(226,55,68,0.25)]" />
                </div>
              )}

              {(loading || starting) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
                  <div className="rounded-2xl border border-white/10 bg-[#111]/90 px-5 py-4 text-center shadow-2xl">
                    <Loader className="mx-auto animate-spin text-[#E23744]" size={34} />
                    <p className="mt-3 text-sm font-bold">{starting ? 'Starting camera...' : 'Verifying ticket...'}</p>
                  </div>
                </div>
              )}
            </div>

            {cameraError && (
              <div role="alert" className="mt-4 flex gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-300" />
                <span>{cameraError}</span>
              </div>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {!scannerActive ? (
                <button
                  type="button"
                  onClick={startScanner}
                  disabled={starting || loading}
                  className="admin-primary-action justify-center disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Camera size={18} />
                  Start Camera Scanner
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopScanner}
                  className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-bold text-[#f7efe3] transition-all hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744] focus-visible:ring-offset-2 focus-visible:ring-offset-[#17110d]"
                >
                  Stop Scanning
                </button>
              )}

              <button
                type="button"
                onClick={() => setManualOpen((open) => !open)}
                aria-expanded={manualOpen}
                className="rounded-full border border-white/10 bg-[#f2e7d8] px-5 py-3 text-sm font-black text-[#17110d] transition-all hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744] focus-visible:ring-offset-2 focus-visible:ring-offset-[#17110d]"
              >
                <span className="inline-flex items-center justify-center gap-2">
                  <Keyboard size={18} />
                  Manual Entry
                </span>
              </button>
            </div>

            {manualOpen && (
              <form onSubmit={submitManualEntry} className="mt-4 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                <label htmlFor="manual-qr" className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f867d]">
                  Paste QR payload or ticket ID
                </label>
                <textarea
                  id="manual-qr"
                  value={manualValue}
                  onChange={(event) => setManualValue(event.target.value)}
                  rows={4}
                  className="mt-3 w-full resize-none rounded-2xl border border-white/10 bg-[#080808] px-4 py-3 text-sm text-white outline-none transition focus:border-[#E23744]/70 focus:ring-2 focus:ring-[#E23744]/20"
                  placeholder='{"ticketId":"...","orderId":"..."}'
                />
                <button
                  type="submit"
                  disabled={loading || !manualValue.trim()}
                  className="mt-3 w-full rounded-full bg-[#E23744] px-5 py-3 text-sm font-black text-white transition hover:bg-[#f04552] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744] focus-visible:ring-offset-2 focus-visible:ring-offset-[#17110d] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Verify Manual Entry
                </button>
              </form>
            )}
          </div>
        </section>

        <aside className="space-y-6 lg:sticky lg:top-8 lg:self-start">
          <ResultPanel result={verificationResult} loading={loading} onScanNext={scanNextTicket} />

          <section className="admin-card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.05] text-[#E23744]">
                <ShieldCheck size={20} />
              </div>
              <div>
                <p className="admin-eyebrow">Gate rules</p>
                <h3 className="text-lg font-black">What to do</h3>
              </div>
            </div>
            <div className="mt-5 space-y-3 text-sm text-[#b7aca2]">
              <Instruction tone="bg-emerald-400" title="Green" text="Allow entry. The attendee has been checked in." />
              <Instruction tone="bg-amber-400" title="Yellow" text="Already scanned. Verify identity before allowing entry." />
              <Instruction tone="bg-red-400" title="Red" text="Invalid, revoked, expired, or unauthorized ticket." />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ScannerStat({ label, value, tone }) {
  return (
    <div className="rounded-[1rem] bg-white/[0.04] px-3 py-2">
      <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[#756d66]">{label}</p>
      <p className={`mt-1 text-sm font-black ${tone}`}>{value}</p>
    </div>
  );
}

function ResultPanel({ result, loading, onScanNext }) {
  if (!result) {
    return (
      <section className="admin-card p-5">
        <div className="flex h-40 flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-white/15 bg-white/[0.03] text-center">
          <ScanLine size={34} className="text-[#E23744]" />
          <h3 className="mt-4 text-lg font-black">Awaiting scan</h3>
          <p className="mt-1 max-w-[260px] text-sm text-[#8f867d]">Scan a ticket QR or paste the payload manually.</p>
        </div>
      </section>
    );
  }

  const attendee = result.ticket?.attendee || result.attendee || {};
  const event = result.ticket?.event;
  const isValid = result.valid;
  const isDuplicate = result.alreadyScanned;
  const tone = isValid
    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
    : isDuplicate
      ? 'border-amber-400/30 bg-amber-400/10 text-amber-100'
      : 'border-red-400/30 bg-red-400/10 text-red-100';
  const Icon = isValid ? CheckCircle : XCircle;

  return (
    <section className={`rounded-[1.65rem] border p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] ${tone}`} role="status" aria-live="polite">
      <div className="flex items-start gap-4">
        <Icon size={42} className="shrink-0" />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-75">Scan result</p>
          <h2 className="mt-1 text-2xl font-black">
            {isValid ? 'Valid ticket' : isDuplicate ? 'Already checked in' : 'Invalid ticket'}
          </h2>
          <p className="mt-2 text-sm opacity-80">
            {isValid ? 'Attendee checked in successfully.' : result.error || 'Ticket could not be verified.'}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3 rounded-[1.35rem] border border-white/10 bg-black/25 p-4 text-sm">
        <DetailRow icon={User} label="Name" value={attendee.name || 'Not provided'} />
        <DetailRow icon={Mail} label="Email" value={attendee.email || 'Not provided'} />
        {event?.title && <DetailRow icon={Ticket} label="Event" value={event.title} />}
        {event?.location && <DetailRow icon={MapPin} label="Venue" value={event.location} />}
        {result.ticket?.id && <DetailRow icon={QrCode} label="Ticket" value={result.ticket.id.substring(0, 8).toUpperCase()} />}
        {result.scannedAt && <DetailRow icon={Clock} label="Scanned" value={new Date(result.scannedAt).toLocaleString()} />}
      </div>

      <button
        type="button"
        onClick={onScanNext}
        disabled={loading}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#f2e7d8] px-5 py-3 text-sm font-black text-[#17110d] transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744] focus-visible:ring-offset-2 focus-visible:ring-offset-[#17110d] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RotateCcw size={17} />
        Scan Next Ticket
      </button>
    </section>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-2 last:border-b-0 last:pb-0">
      <span className="flex items-center gap-2 text-[#b7aca2]">
        <Icon size={15} />
        {label}
      </span>
      <span className="truncate text-right font-bold text-white">{value}</span>
    </div>
  );
}

function Instruction({ tone, title, text }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${tone}`} />
      <p>
        <span className="font-black text-[#f7efe3]">{title}:</span> {text}
      </p>
    </div>
  );
}
