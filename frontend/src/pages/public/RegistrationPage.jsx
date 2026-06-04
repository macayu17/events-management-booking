import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  ArrowRight,
  CalendarDays,
  CreditCard,
  IndianRupee,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Tag,
  Ticket,
  User
} from 'lucide-react';
import api, { getImageUrl } from '../../utils/api';
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
  const posterImage = getImageUrl(event?.posterUrl);

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

  const iconForField = (field) => {
    const label = `${field.label} ${field.key}`.toLowerCase();
    if (label.includes('email')) return <Mail size={17} />;
    if (label.includes('phone') || label.includes('mobile')) return <Phone size={17} />;
    return <User size={17} />;
  };

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
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-white/10" />
          <div className="absolute left-0 top-0 h-16 w-16 animate-spin rounded-full border-t-4 border-[#E23744]" />
        </div>
      </div>
    );
  }

  if (processingPayment) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-4 backdrop-blur-xl">
        <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/10 bg-[#121010] p-10 text-center shadow-2xl">
          <div className="absolute left-1/2 top-0 h-32 w-32 -translate-x-1/2 rounded-full bg-[#E23744]/20 blur-[50px]" />
          <div className="relative mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-white/5">
            <div className="absolute inset-0 animate-spin rounded-full border-t-2 border-[#E23744]" />
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E23744] shadow-[0_0_24px_rgba(226,55,68,0.5)]">
              <IndianRupee className="text-white" size={20} />
            </div>
          </div>
          <h2 className="mb-2 text-2xl font-black text-white">Processing payment</h2>
          <p className="leading-relaxed text-[#aaa096]">Please wait while we securely process your transaction.</p>
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex min-h-[52vh] items-center justify-center px-4">
        <div className="text-center">
          <h2 className="mb-4 text-xl font-bold text-white">Registration form not available</h2>
          <button onClick={() => navigate('/')} className="rounded-full bg-white/10 px-6 py-2 text-white transition-all hover:bg-white/20">Go Home</button>
        </div>
      </div>
    );
  }

  if (registrationClosed) {
    return (
      <section className="relative flex min-h-[62vh] items-center justify-center overflow-hidden py-10 text-white">
        <section className="relative z-10 w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#12100e]/90 p-8 text-center shadow-[0_24px_90px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#E23744]/25 bg-[#E23744]/10 text-[#ff6c76]">
            <CalendarDays size={24} />
          </div>
          <p className="admin-eyebrow mb-3">Registration closed</p>
          <h1 className="text-3xl font-black tracking-tight text-white">{event.title}</h1>
          <p className="mt-3 text-sm leading-6 text-[#aaa096]">
            This event has already started, so new registrations are no longer accepted.
          </p>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f867d]">Event time</p>
            <p className="mt-1 font-bold text-[#f7efe3]">{formattedDate}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/events/${id}`)}
            className="mt-7 inline-flex items-center justify-center rounded-full bg-[#E23744] px-6 py-3 text-sm font-black text-white shadow-[0_16px_36px_rgba(226,55,68,0.24)] transition-all hover:bg-[#f04552]"
          >
            Back to event
          </button>
        </section>
      </section>
    );
  }

  return (
    <section className="relative min-h-[calc(100dvh-12rem)] overflow-hidden py-2 text-white sm:py-4">
      <div className="relative z-10 mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <aside className="lg:sticky lg:top-8">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#12100e]/85 shadow-[0_24px_90px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
            <div className="relative min-h-[260px] overflow-hidden bg-[#161111]">
              {posterImage && (
                <img
                  src={posterImage}
                  alt={`${event.title} poster`}
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="eager"
                  decoding="async"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#12100e] via-[#12100e]/45 to-black/20" />
              <div className="absolute bottom-0 left-0 right-0 min-w-0 p-6">
                <p className="admin-eyebrow mb-3">Event registration</p>
                <h1 className="break-words text-balance text-4xl font-black leading-tight tracking-tight text-white md:text-5xl">{event.title}</h1>
              </div>
            </div>

            <div className="space-y-4 p-6">
              <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <CalendarDays className="mt-0.5 shrink-0 text-[#E23744]" size={20} />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f867d]">Date and time</p>
                  <p className="mt-1 font-bold text-[#f7efe3]">{formattedDate}</p>
                </div>
              </div>

              <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <MapPin className="mt-0.5 shrink-0 text-[#E23744]" size={20} />
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f867d]">Venue</p>
                  <p className="mt-1 break-words font-bold text-[#f7efe3]">{event.location || 'Venue to be announced'}</p>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-[#E23744]/25 bg-[#E23744]/10 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff7b84]">Amount due</p>
                <p className="mt-2 text-4xl font-black text-white">{noTierAvailable ? 'Sold out' : total === 0 ? 'Free' : formatMoney(total, currency)}</p>
                {selectedTier && <p className="mt-2 text-sm text-[#aaa096]">Selected tier: {selectedTier.name}</p>}
              </div>

              <div className="flex items-center gap-3 text-sm text-[#aaa096]">
                <ShieldCheck size={18} className="text-emerald-400" />
                Secure registration and encrypted payment handoff.
              </div>
            </div>
          </div>
        </aside>

        <section className="rounded-[2rem] border border-white/10 bg-[#111]/88 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.34)] backdrop-blur-2xl sm:p-7 lg:p-8">
          <div className="mb-8 flex flex-col gap-3 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="admin-eyebrow mb-3">Checkout</p>
              <h2 className="text-3xl font-black tracking-tight text-white">Complete your registration</h2>
              <p className="mt-2 text-sm leading-6 text-[#aaa096]">Fill your attendee details and choose how you want to pay.</p>
            </div>
            <div className="rounded-full border border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#aaa096]">
              Step 1 of 1
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            <section>
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E23744]/15 text-[#ff5a66]">
                  <User size={18} />
                </span>
                <div>
                  <h3 className="font-black text-white">Attendee details</h3>
                  <p className="text-sm text-[#8f867d]">These details appear on your ticket.</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {fields.map((field) => {
                  const isLong = field.type === 'textarea' || field.type === 'select';
                  const fieldId = `registration-${field.key}`;
                  const errorId = `${fieldId}-error`;
                  const fieldMetadata = metadataForField(field);
                  return (
                    <div key={field.key} className={isLong ? 'md:col-span-2' : ''}>
                      <label htmlFor={fieldId} className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-[#aaa096]">
                        {field.label} {field.required && <span className="text-[#E23744]">*</span>}
                      </label>

                      {field.type === 'select' ? (
                        <select
                          id={fieldId}
                          {...register(field.key, registerOptions(field))}
                          {...fieldMetadata}
                          aria-invalid={errors[field.key] ? 'true' : 'false'}
                          aria-describedby={errors[field.key] ? errorId : undefined}
                          className="auth-input"
                        >
                          <option value="">Select an option</option>
                          {(field.options || []).map((option) => (
                            <option key={option} value={option} className="bg-[#18181b]">{option}</option>
                          ))}
                        </select>
                      ) : field.type === 'textarea' ? (
                        <textarea
                          id={fieldId}
                          {...register(field.key, registerOptions(field))}
                          {...fieldMetadata}
                          aria-invalid={errors[field.key] ? 'true' : 'false'}
                          aria-describedby={errors[field.key] ? errorId : undefined}
                          className="auth-input min-h-[110px] resize-none"
                          placeholder={`Enter ${field.label.toLowerCase()}`}
                        />
                      ) : (
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#756d66]">
                            {iconForField(field)}
                          </span>
                          <input
                            id={fieldId}
                            type={field.type}
                            {...register(field.key, registerOptions(field))}
                            {...fieldMetadata}
                            aria-invalid={errors[field.key] ? 'true' : 'false'}
                            aria-describedby={errors[field.key] ? errorId : undefined}
                            className="auth-input pl-12"
                            placeholder={`Enter ${field.label.toLowerCase()}`}
                          />
                        </div>
                      )}

                      {errors[field.key] && (
                        <p id={errorId} className="mt-2 text-xs font-semibold text-[#ff5a66]">This field is required.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {tiers.length > 0 && (
              <section className="border-t border-white/10 pt-7">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E23744]/15 text-[#ff5a66]">
                    <Ticket size={18} />
                  </span>
                  <div>
                    <h3 className="font-black text-white">Ticket type</h3>
                    <p className="text-sm text-[#8f867d]">Choose the pass that fits your access.</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {tiers.map((tier) => (
                    (() => {
                      const reservedCount = tier.reservedCount ?? tier.soldCount;
                      const remainingCount = tier.availableCount ?? (tier.capacity ? Math.max(0, tier.capacity - reservedCount) : null);
                      const soldOut = Boolean(tier.capacity && remainingCount <= 0);

                      return (
                        <label
                          key={tier.id}
                          className={`relative min-w-0 rounded-[1.35rem] border p-4 transition-all focus-within:ring-2 focus-within:ring-[#E23744]/45 ${soldOut
                            ? 'cursor-not-allowed border-white/5 bg-white/[0.02] opacity-55'
                            : selectedTier?.id === tier.id
                              ? 'cursor-pointer border-[#E23744] bg-[#E23744]/10 shadow-[0_18px_45px_rgba(226,55,68,0.12)]'
                              : 'cursor-pointer border-white/10 bg-white/[0.035] hover:border-white/25'
                            }`}
                        >
                          <input
                            type="radio"
                            name="ticketTier"
                            value={tier.id}
                            className="sr-only"
                            disabled={soldOut}
                            onChange={() => !soldOut && setSelectedTier(tier)}
                            checked={selectedTier?.id === tier.id}
                          />
                          <div className="flex min-w-0 items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="break-words font-black text-white">{tier.name}</p>
                              {tier.description && <p className="mt-1 break-words text-sm text-[#8f867d]">{tier.description}</p>}
                            </div>
                              <p className="shrink-0 text-lg font-black text-[#ff5a66]">{formatMoney(tier.priceCents / 100, currency, { maximumFractionDigits: 0 })}</p>
                          </div>
                          {tier.capacity && (
                            <p className={`mt-3 text-xs font-bold uppercase tracking-[0.16em] ${soldOut ? 'text-[#ff5a66]' : 'text-[#8f867d]'}`}>
                              {soldOut ? 'Sold out' : `${remainingCount} remaining`}
                            </p>
                          )}
                        </label>
                      );
                    })()
                  ))}
                </div>
              </section>
            )}

            {isPaidEvent && (
              <section className="border-t border-white/10 pt-7">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E23744]/15 text-[#ff5a66]">
                    <CreditCard size={18} />
                  </span>
                  <div>
                    <h3 className="font-black text-white">Payment</h3>
                    <p className="text-sm text-[#8f867d]">Apply a code and choose your gateway.</p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                  <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f867d]">Total amount</p>
                    <p className="mt-2 text-3xl font-black text-white">{total === 0 ? 'Free' : formatMoney(total, currency)}</p>
                  </div>

                  <div>
                    <label htmlFor="discount-code" className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#aaa096]">
                      <Tag size={13} /> Promo code
                    </label>
                    <div className="flex min-w-0 gap-2">
                      <input
                        id="discount-code"
                        type="text"
                        value={discountCode}
                        onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                        className="auth-input min-w-0 flex-1 font-mono uppercase tracking-[0.18em] sm:tracking-[0.22em]"
                        placeholder="ENTER CODE"
                        disabled={!!appliedDiscount}
                      />
                      {appliedDiscount ? (
                        <button type="button" onClick={() => { setAppliedDiscount(null); setDiscountCode(''); setDiscountMsg(''); }} className="shrink-0 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 text-sm font-bold text-red-300 transition-colors hover:bg-red-500/20 sm:px-5">
                          Remove
                        </button>
                      ) : (
                        <button type="button" onClick={handleApplyDiscount} className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.08] px-4 text-sm font-bold text-white transition-colors hover:bg-white/[0.14] sm:px-5">
                          Apply
                        </button>
                      )}
                    </div>
                    {discountMsg && (
                      <p className={`mt-2 text-xs font-semibold ${discountMsg.type === 'success' ? 'text-emerald-400' : 'text-[#ff5a66]'}`}>
                        {discountMsg.text}
                      </p>
                    )}
                  </div>
                </div>

                {total > 0 && (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <PaymentOption
                      active={paymentGateway === 'RAZORPAY'}
                      logo="/razorpay-logo.png"
                      title="Razorpay"
                      subtitle="Cards, UPI, Netbanking"
                      onChange={() => setPaymentGateway('RAZORPAY')}
                    />
                    <PaymentOption
                      active={paymentGateway === 'PHONEPE'}
                      logo="/phonepe-logo.png"
                      title="PhonePe"
                      subtitle="UPI, Wallet, Cards"
                      onChange={() => setPaymentGateway('PHONEPE')}
                    />
                  </div>
                )}
              </section>
            )}

            <button
              type="submit"
              disabled={submitting || checkoutOpen || noTierAvailable}
              className="flex w-full items-center justify-center gap-3 rounded-full bg-[#E23744] px-6 py-4 text-base font-black text-white shadow-[0_18px_45px_rgba(226,55,68,0.25)] transition-all hover:-translate-y-0.5 hover:bg-[#f04552] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Processing...
                </>
              ) : (
                <>
                  {noTierAvailable ? 'Sold out' : total === 0 ? 'Complete registration' : `Pay ${formatMoney(total, currency)}`}
                  <ArrowRight size={19} />
                </>
              )}
            </button>
          </form>
        </section>
      </div>
    </section>
  );
}

function PaymentOption({ active, logo, title, subtitle, onChange }) {
  return (
    <label className={`relative flex cursor-pointer items-center gap-4 rounded-[1.35rem] border p-4 transition-all focus-within:ring-2 focus-within:ring-[#E23744]/45 ${active
      ? 'border-[#E23744] bg-[#E23744]/10 shadow-[0_18px_45px_rgba(226,55,68,0.12)]'
      : 'border-white/10 bg-white/[0.035] hover:border-white/25'
      }`}>
      <input type="radio" name="paymentGateway" className="sr-only" onChange={onChange} checked={active} />
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white p-2">
        <img src={logo} alt="" aria-hidden="true" className="h-full w-full object-contain" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-black text-white">{title}</span>
        <span className="block text-sm text-[#8f867d]">{subtitle}</span>
      </span>
      <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${active ? 'border-[#E23744]' : 'border-[#5d5650]'}`}>
        {active && <span className="h-2.5 w-2.5 rounded-full bg-[#E23744]" />}
      </span>
    </label>
  );
}
