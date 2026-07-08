import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowRight, IndianRupee, Loader2, Tag } from 'lucide-react';
import api from '../../utils/api';
import Barcode from '../../components/Barcode';
import toast from 'react-hot-toast';

const RAZORPAY_CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let razorpayScriptPromise;

const loadRazorpayScript = () => {
  if (window.Razorpay) return Promise.resolve();
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve, reject) => {
    let existingScript = document.querySelector(`script[src="${RAZORPAY_CHECKOUT_SRC}"]`);

    const handleLoad = (script) => {
      script.dataset.loadStatus = 'loaded';
      resolve();
    };

    const handleError = (script, error) => {
      script.dataset.loadStatus = 'error';
      script.remove();
      razorpayScriptPromise = null;
      reject(error instanceof Error ? error : new Error('Failed to load Razorpay checkout'));
    };

    if (existingScript) {
      if (existingScript.dataset.loadStatus === 'loaded' && !window.Razorpay) {
        existingScript.remove();
        existingScript = null;
      } else if (existingScript.dataset.loadStatus === 'error') {
        existingScript.remove();
        existingScript = null;
      } else {
        existingScript.addEventListener('load', () => handleLoad(existingScript), { once: true });
        existingScript.addEventListener('error', (error) => handleError(existingScript, error), { once: true });
        return;
      }
    }

    const script = document.createElement('script');
    script.src = RAZORPAY_CHECKOUT_SRC;
    script.async = true;
    script.onload = () => handleLoad(script);
    script.onerror = (error) => handleError(script, error);
    document.body.appendChild(script);
  });

  return razorpayScriptPromise.catch((error) => {
    razorpayScriptPromise = null;
    throw error;
  });
};

const scheduleIdleTask = (callback) => {
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(callback, { timeout: 3000 });
    return () => window.cancelIdleCallback?.(id);
  }

  const id = window.setTimeout(callback, 1200);
  return () => window.clearTimeout(id);
};

const getSafePhonePeRedirectUrl = (value) => {
  try {
    const url = new URL(value);
    const isPhonePeHost = url.hostname === 'phonepe.com' || url.hostname.endsWith('.phonepe.com');
    return url.protocol === 'https:' && isPhonePeHost ? url.toString() : null;
  } catch {
    return null;
  }
};

const getCheckoutStorageKey = (orderId) => `checkout-access:${orderId}`;

const formatMoney = (amount, currency = 'INR', options = {}) => {
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;
  const minimumFractionDigits = options.minimumFractionDigits ?? maximumFractionDigits;

  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits,
      maximumFractionDigits
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(maximumFractionDigits)}`;
  }
};

export default function RegistrationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tiers, setTiers] = useState([]);
  const [selectedTier, setSelectedTier] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [discountMsg, setDiscountMsg] = useState('');
  const [paymentGateway, setPaymentGateway] = useState('RAZORPAY');
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm();

  useEffect(() => {
    fetchEventAndForm();
  }, [id]);

  const fetchEventAndForm = async () => {
    try {
      const [eventRes, formRes, tiersRes] = await Promise.all([
        api.get(`/events/${id}`),
        api.get(`/events/${id}/form`),
        api.get(`/events/${id}/tiers`).catch(() => ({ data: [] }))
      ]);

      setEvent(eventRes.data);
      setForm(formRes.data);
      setTiers(tiersRes.data || []);
      if (tiersRes.data && tiersRes.data.length > 0) {
        const firstAvailableTier = tiersRes.data.find((tier) => {
          const reservedCount = tier.reservedCount ?? tier.soldCount;
          return !tier.capacity || reservedCount < tier.capacity;
        });
        setSelectedTier(firstAvailableTier || null);
      }
    } catch (error) {
      console.error('Error fetching event/form:', error);
      const errorMessage = error.response?.data?.error || 'Failed to load registration form';
      toast.error(errorMessage);
      setTimeout(() => navigate(`/events/${id}`), 2000);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) return;
    try {
      const res = await api.post('/discounts/validate', {
        eventId: id,
        code: discountCode.trim()
      });
      setAppliedDiscount(res.data);
      setDiscountMsg({ type: 'success', text: `Applied: ${res.data.code}` });
    } catch (error) {
      setAppliedDiscount(null);
      setDiscountMsg({ type: 'error', text: error.response?.data?.error || 'Invalid code' });
    }
  };

  const hasTicketTiers = tiers.length > 0;
  const noTierAvailable = hasTicketTiers && !selectedTier;
  const basePriceCents = selectedTier ? selectedTier.priceCents : hasTicketTiers ? 0 : event?.priceCents || 0;
  const basePrice = basePriceCents / 100;
  const isRsvpEvent = event?.type === 'RSVP';

  const calculateTotal = () => {
    if (!event) return 0;
    if (!appliedDiscount) return basePrice;

    if (appliedDiscount.type === 'PERCENTAGE') {
      return Math.max(0, basePrice * (1 - appliedDiscount.amount / 100));
    }
    return Math.max(0, basePrice - appliedDiscount.amount / 100);
  };

  const total = isRsvpEvent ? 0 : calculateTotal();
  const currency = event?.currency || 'INR';
  const fields = form?.schemaJson?.fields || [];
  const isPaidEvent = !isRsvpEvent && basePriceCents > 0;
  const registrationClosed = event?.startTime ? new Date(event.startTime) <= new Date() : false;
  const formattedDate = event?.startTime
    ? new Intl.DateTimeFormat('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(event.startTime))
    : 'Date to be announced';

  useEffect(() => {
    if (!isPaidEvent || paymentGateway !== 'RAZORPAY' || total <= 0) return undefined;

    return scheduleIdleTask(() => {
      void loadRazorpayScript().catch(() => {});
    });
  }, [isPaidEvent, paymentGateway, total]);

  const registerOptions = (field) => ({
    required: field.required,
    ...(field.type === 'number' ? { valueAsNumber: true } : {})
  });

  const metadataForField = (field) => {
    const label = `${field.label} ${field.key}`.toLowerCase();

    if (field.type === 'email' || label.includes('email')) {
      return { autoComplete: 'email', inputMode: 'email', spellCheck: false };
    }
    if (field.type === 'tel' || label.includes('phone') || label.includes('mobile') || label.includes('whatsapp')) {
      return { autoComplete: 'tel', inputMode: 'tel', spellCheck: false };
    }
    if (label.includes('name')) {
      return { autoComplete: 'name' };
    }
    if (field.type === 'number') {
      return { inputMode: 'numeric' };
    }

    return {};
  };

  const getResponseValueByLabel = (data, labels) => {
    for (const field of fields) {
      const signature = `${field.label} ${field.key}`.toLowerCase();
      if (labels.some((label) => signature.includes(label)) && data[field.key]) {
        return String(data[field.key]);
      }
    }
    return '';
  };

  const onSubmit = async (data) => {
    if (registrationClosed) {
      toast.error('Registration is closed for this event.');
      return;
    }

    if (noTierAvailable) {
      toast.error('No ticket tier is available for this event.');
      return;
    }

    setSubmitting(true);
    let paymentHandoffStarted = false;

    try {
      const regResponse = await api.post(`/events/${id}/register`, {
        formResponse: data,
        discountCode: appliedDiscount ? appliedDiscount.code : undefined,
        paymentGateway,
        tierId: selectedTier?.id
      });

      const { order, requiresPayment, checkoutAccessToken } = regResponse.data;

      if (!requiresPayment) {
        toast.success('Registration successful!');
        navigate('/success', {
          state: {
            eventId: event.id,
            orderId: order.id,
            downloadToken: regResponse.data.downloadToken
          }
        });
        return;
      }

      if (!checkoutAccessToken) {
        toast.error('Checkout session could not be started. Please try again.');
        return;
      }

      const checkoutResponse = await api.post(`/orders/${order.id}/create-checkout-session`, {
        checkoutAccessToken
      });
      const checkoutData = checkoutResponse.data;
      const activeCheckoutToken = checkoutData.checkoutAccessToken || checkoutAccessToken;

      if (checkoutData.provider === 'PHONEPE') {
        const paymentUrl = getSafePhonePeRedirectUrl(checkoutData.paymentUrl);
        if (!paymentUrl) {
          toast.error('Payment gateway returned an invalid redirect. Please try again.');
          return;
        }
        sessionStorage.setItem(getCheckoutStorageKey(order.id), activeCheckoutToken);
        paymentHandoffStarted = true;
        window.location.href = paymentUrl;
        return;
      }

      const { orderId, amount, currency: checkoutCurrency, keyId } = checkoutData;

      try {
        await loadRazorpayScript();
      } catch {
        toast.error('Payment gateway could not load. Please check your connection and try again.');
        return;
      }

      if (typeof window.Razorpay === 'undefined') {
        toast.error('Payment gateway not loaded. Please refresh the page.');
        return;
      }

      const options = {
        key: keyId,
        amount,
        currency: checkoutCurrency,
        name: event.title,
        description: 'Event Registration',
        order_id: orderId,
        handler: async function (response) {
          setCheckoutOpen(false);
          setProcessingPayment(true);
          try {
            const verifyResponse = await api.post(`/orders/${order.id}/verify-payment`, {
              checkoutAccessToken: activeCheckoutToken,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature
            });

            toast.success('Payment successful! Check your email for the ticket.');
            navigate('/success', {
              state: {
                eventId: event.id,
                orderId: order.id,
                downloadToken: verifyResponse.data.downloadToken
              }
            });
          } catch (error) {
            console.error('Payment verification error:', error);
            toast.error('Payment completed but verification failed. Please contact support.');
            setProcessingPayment(false);
            setSubmitting(false);
          }
        },
        prefill: {
          name: getResponseValueByLabel(data, ['name']) || data.name || '',
          email: getResponseValueByLabel(data, ['email']) || data.email || '',
          contact: getResponseValueByLabel(data, ['phone', 'mobile', 'whatsapp']) || data.phone || ''
        },
        theme: {
          color: '#E23744'
        },
        modal: {
          ondismiss: function () {
            setCheckoutOpen(false);
            setProcessingPayment(false);
            setSubmitting(false);
          }
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.on('payment.failed', function () {
        toast.error('Payment failed. Please try again.');
        setCheckoutOpen(false);
        setProcessingPayment(false);
        setSubmitting(false);
      });
      paymentHandoffStarted = true;
      setCheckoutOpen(true);
      razorpay.open();
    } catch (error) {
      console.error('Registration error:', error);
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Registration failed';
      toast.error(errorMessage);
    } finally {
      if (!paymentHandoffStarted) {
        setSubmitting(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[52vh] items-center justify-center">
        <Loader2 className="animate-spin text-accent" size={32} />
      </div>
    );
  }

  if (processingPayment) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
        <div className="ticket-card max-w-md p-10 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
            <IndianRupee size={22} className="animate-pulse" />
          </div>
          <h2 className="font-display text-2xl uppercase">Processing payment</h2>
          <p className="mt-2 text-ink-55">Please wait while we securely process your transaction.</p>
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex min-h-[52vh] items-center justify-center px-4 text-center">
        <div>
          <h2 className="mb-4 font-display text-2xl uppercase">Registration form not available</h2>
          <button onClick={() => navigate('/')} className="btn-outline">Go home</button>
        </div>
      </div>
    );
  }

  if (registrationClosed) {
    return (
      <div className="flex min-h-[62vh] items-center justify-center py-10">
        <div className="ticket-card w-full max-w-lg p-8 text-center">
          <p className="mono-accent">Registration closed</p>
          <h1 className="mt-3 font-display text-4xl uppercase">{event.title}</h1>
          <p className="mt-3 text-sm text-ink-55">This event has already started, so new registrations are no longer accepted.</p>
          <div className="mt-6 rounded-md border-2 border-dashed p-4 text-left" style={{ borderColor: 'var(--dash)' }}>
            <p className="mono-label">Event time</p>
            <p className="mt-1 font-bold">{formattedDate}</p>
          </div>
          <button type="button" onClick={() => navigate(`/events/${id}`)} className="btn-accent mt-7 inline-block">Back to event</button>
        </div>
      </div>
    );
  }

  const stepCard = (n, title, sub) => (
    <div className="mb-3 flex items-center gap-3">
      <span className="mono-label">{n} —</span>
      <div>
        <h3 className="font-display text-lg uppercase leading-none">{title}</h3>
        <p className="text-sm text-ink-55">{sub}</p>
      </div>
    </div>
  );

  return (
    <div className="py-2 sm:py-4">
      <button type="button" onClick={() => navigate(`/events/${id}`)} className="mono-label hover:text-accent">← Back to event</button>
      <div className="mt-4 flex flex-wrap items-baseline gap-4">
        <h1 className="font-display text-4xl uppercase sm:text-[46px]">Checkout.</h1>
        <span className="mono-label normal-case tracking-wide">{event.title} · {formattedDate}</span>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px] lg:items-start">
        {/* Left: numbered steps */}
        <div className="space-y-4">
          <section className="ticket-card-sm p-5 sm:p-6">
            {stepCard('01', "Who's coming", 'These details appear on your ticket.')}
            <div className="grid gap-3 md:grid-cols-2">
              {fields.map((field) => {
                const isLong = field.type === 'textarea' || field.type === 'select';
                const fieldId = `registration-${field.key}`;
                const errorId = `${fieldId}-error`;
                const fieldMetadata = metadataForField(field);
                return (
                  <div key={field.key} className={isLong ? 'md:col-span-2' : ''}>
                    <label htmlFor={fieldId} className="mono-label mb-1.5 block">
                      {field.label} {field.required && <span className="text-accent">*</span>}
                    </label>
                    {field.type === 'select' ? (
                      <select
                        id={fieldId}
                        {...register(field.key, registerOptions(field))}
                        {...fieldMetadata}
                        aria-invalid={errors[field.key] ? 'true' : 'false'}
                        aria-describedby={errors[field.key] ? errorId : undefined}
                        className="field"
                      >
                        <option value="">Select an option</option>
                        {(field.options || []).map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : field.type === 'textarea' ? (
                      <textarea
                        id={fieldId}
                        {...register(field.key, registerOptions(field))}
                        {...fieldMetadata}
                        aria-invalid={errors[field.key] ? 'true' : 'false'}
                        aria-describedby={errors[field.key] ? errorId : undefined}
                        className="field min-h-[110px] resize-none"
                        placeholder={`Enter ${field.label.toLowerCase()}`}
                      />
                    ) : (
                      <input
                        id={fieldId}
                        type={field.type}
                        {...register(field.key, registerOptions(field))}
                        {...fieldMetadata}
                        aria-invalid={errors[field.key] ? 'true' : 'false'}
                        aria-describedby={errors[field.key] ? errorId : undefined}
                        className="field"
                        placeholder={`Enter ${field.label.toLowerCase()}`}
                      />
                    )}
                    {errors[field.key] && (
                      <p id={errorId} className="mt-1.5 text-xs font-semibold text-accent">This field is required.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {tiers.length > 0 && (
            <section className="ticket-card-sm p-5 sm:p-6">
              {stepCard('02', 'Pick your ticket', 'Choose the pass that fits your access.')}
              <div className="grid gap-2.5">
                {tiers.map((tier) => {
                  const reservedCount = tier.reservedCount ?? tier.soldCount;
                  const remainingCount = tier.availableCount ?? (tier.capacity ? Math.max(0, tier.capacity - reservedCount) : null);
                  const soldOut = Boolean(tier.capacity && remainingCount <= 0);
                  const active = selectedTier?.id === tier.id;
                  return (
                    <label
                      key={tier.id}
                      className="flex min-w-0 items-center gap-3.5 rounded-lg p-3.5 transition-colors"
                      style={{
                        border: `1.5px ${soldOut ? 'dashed' : 'solid'} ${active ? 'var(--accent)' : 'var(--line60)'}`,
                        cursor: soldOut ? 'not-allowed' : 'pointer',
                        opacity: soldOut ? 0.55 : 1
                      }}
                    >
                      <input type="radio" name="ticketTier" value={tier.id} className="sr-only" disabled={soldOut} onChange={() => !soldOut && setSelectedTier(tier)} checked={active} />
                      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full" style={{ border: '2px solid var(--line60)' }}>
                        {active && <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--accent)' }} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{tier.name}</span>
                        {tier.description && <span className="block text-sm text-ink-55">{tier.description}</span>}
                        {tier.capacity && <span className="mono-label mt-0.5 block">{soldOut ? 'Sold out' : `${remainingCount} remaining`}</span>}
                      </span>
                      <span className="font-display text-xl">{formatMoney(tier.priceCents / 100, currency, { maximumFractionDigits: 0 })}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          {isPaidEvent && (
            <section className="ticket-card-sm p-5 sm:p-6">
              {stepCard('03', 'Payment', 'Apply a code and choose your gateway.')}
              <div>
                <label htmlFor="discount-code" className="mono-label mb-1.5 flex items-center gap-2"><Tag size={13} /> Promo code</label>
                <div className="flex min-w-0 gap-2">
                  <input
                    id="discount-code"
                    type="text"
                    value={discountCode}
                    onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                    className="field min-w-0 flex-1 font-mono uppercase tracking-[0.18em]"
                    placeholder="ENTER CODE"
                    disabled={!!appliedDiscount}
                  />
                  {appliedDiscount ? (
                    <button type="button" onClick={() => { setAppliedDiscount(null); setDiscountCode(''); setDiscountMsg(''); }} className="btn-outline shrink-0">Remove</button>
                  ) : (
                    <button type="button" onClick={handleApplyDiscount} className="btn-ink shrink-0">Apply</button>
                  )}
                </div>
                {discountMsg && (
                  <p className={`mt-2 text-xs font-semibold ${discountMsg.type === 'success' ? 'text-accent' : 'text-accent'}`}>{discountMsg.text}</p>
                )}
              </div>

              {total > 0 && (
                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  <PaymentOption active={paymentGateway === 'RAZORPAY'} logo="/razorpay-logo.png" title="Razorpay" subtitle="Cards, UPI, Netbanking" onChange={() => setPaymentGateway('RAZORPAY')} />
                  <PaymentOption active={paymentGateway === 'PHONEPE'} logo="/phonepe-logo.png" title="PhonePe" subtitle="UPI, Wallet, Cards" onChange={() => setPaymentGateway('PHONEPE')} />
                </div>
              )}
            </section>
          )}
        </div>

        {/* Right: order summary ticket */}
        <aside className="ticket-card relative p-6 lg:sticky lg:top-8">
          <span className="ticket-notch left-[-10px] top-1/2 -translate-y-1/2" aria-hidden="true" />
          <span className="ticket-notch right-[-10px] top-1/2 -translate-y-1/2" style={{ left: 'auto' }} aria-hidden="true" />
          <div className="mono-label">Order summary</div>
          <div className="mt-3.5 font-display text-2xl uppercase leading-tight">{event.title}</div>
          <div className="mt-1 font-mono text-[11px] tracking-wide text-ink-55">{formattedDate} · {event.location}</div>
          {selectedTier && (
            <div className="mt-4 border-t-2 border-dashed pt-3.5 font-mono text-[12px] text-ink-70" style={{ borderColor: 'var(--dash)' }}>
              <div className="flex justify-between"><span>{selectedTier.name}</span><span>{formatMoney(selectedTier.priceCents / 100, currency, { maximumFractionDigits: 0 })}</span></div>
            </div>
          )}
          <Barcode seed={event?.id || 'occasio'} height={26} className="my-4" />
          <div className="flex items-baseline justify-between">
            <span className="mono-label">Total</span>
            <span className="font-display text-3xl">{noTierAvailable ? 'Sold out' : total === 0 ? 'FREE' : formatMoney(total, currency)}</span>
          </div>
          <button type="submit" disabled={submitting || checkoutOpen || noTierAvailable} className="btn-accent mt-4 flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? <><Loader2 className="animate-spin" size={18} /> Processing…</> : <>{noTierAvailable ? 'Sold out' : total === 0 ? 'RSVP — Free' : `Pay ${formatMoney(total, currency)}`}<ArrowRight size={18} /></>}
          </button>
          <div className="mt-2.5 text-center font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-45">Secure checkout · UPI / Cards / Netbanking</div>
        </aside>
      </form>
    </div>
  );
}

function PaymentOption({ active, logo, title, subtitle, onChange }) {
  return (
    <label
      className="flex cursor-pointer items-center gap-3 rounded-lg p-3.5 transition-colors"
      style={{ border: `1.5px solid ${active ? 'var(--accent)' : 'var(--line60)'}` }}
    >
      <input type="radio" name="paymentGateway" className="sr-only" onChange={onChange} checked={active} />
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white p-1.5">
        <img src={logo} alt="" aria-hidden="true" className="h-full w-full object-contain" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{title}</span>
        <span className="block text-sm text-ink-55">{subtitle}</span>
      </span>
      <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ border: `2px solid ${active ? 'var(--accent)' : 'var(--line60)'}` }}>
        {active && <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--accent)' }} />}
      </span>
    </label>
  );
}
