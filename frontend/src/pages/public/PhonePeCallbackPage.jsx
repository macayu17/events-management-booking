import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

const getCheckoutStorageKey = (orderId) => `checkout-access:${orderId}`;

export default function PhonePeCallbackPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState('verifying'); // verifying, success, failed, pending
    const [retryCount, setRetryCount] = useState(0);

    const orderId = searchParams.get('orderId');
    const nonce = searchParams.get('nonce');

    useEffect(() => {
        if (orderId && nonce) {
            verifyPayment();
        } else {
            setStatus('failed');
            toast.error('Invalid payment callback');
        }
    }, [orderId, nonce]);

    const verifyPayment = async () => {
        try {
            setStatus('verifying');
            const checkoutAccessToken = sessionStorage.getItem(getCheckoutStorageKey(orderId));

            if (!checkoutAccessToken) {
                setStatus('failed');
                toast.error('Payment session expired. Please try again.');
                return;
            }

            const response = await api.post(`/orders/${orderId}/verify-phonepe`, { checkoutAccessToken, nonce });

            if (response.data.success) {
                setStatus('success');
                toast.success('Payment successful! Check your email for the ticket.');
                setTimeout(() => {
                    sessionStorage.removeItem(getCheckoutStorageKey(orderId));
                    navigate('/success', {
                        state: {
                            orderId,
                            eventId: response.data.eventId,
                            downloadToken: response.data.downloadToken
                        }
                    });
                }, 2000);
            } else if (response.data.state === 'PENDING') {
                setStatus('pending');
            } else {
                sessionStorage.removeItem(getCheckoutStorageKey(orderId));
                setStatus('failed');
            }
        } catch (error) {
            console.error('PhonePe verification error:', error);
            if (error.response?.status === 202) {
                setStatus('pending');
            } else {
                if (orderId) sessionStorage.removeItem(getCheckoutStorageKey(orderId));
                setStatus('failed');
                toast.error('Payment verification failed');
            }
        }
    };

    const handleRetry = () => {
        setRetryCount(prev => prev + 1);
        verifyPayment();
    };

    return (
        <section className="flex min-h-[62vh] items-center justify-center py-8">
            <div className="relative w-full max-w-md overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#12100e] p-8 text-center shadow-[0_24px_90px_rgba(0,0,0,0.34)] sm:p-10">
                {status === 'verifying' && (
                    <div role="status" aria-live="polite">
                        <div className="relative mb-8">
                            <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#E23744]/25 bg-[#E23744]/10">
                                <div className="absolute inset-0 rounded-full border-t-2 border-[#E23744] motion-safe:animate-spin" />
                                <Loader2 className="h-10 w-10 text-[#ff6c76] motion-safe:animate-spin" />
                            </div>
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Verifying Payment</h2>
                        <p className="text-gray-400 mb-4">
                            Please wait while we confirm your PhonePe payment.
                        </p>
                        <p className="text-xs text-gray-500 animate-pulse">
                            Do not close this page
                        </p>
                    </div>
                )}

                {status === 'success' && (
                    <div role="status" aria-live="polite">
                        <div className="relative mb-8">
                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10">
                                <CheckCircle className="h-12 w-12 text-emerald-300" />
                            </div>
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Payment successful</h2>
                        <p className="text-gray-400 mb-4">
                            Redirecting you to download your ticket.
                        </p>
                    </div>
                )}

                {status === 'pending' && (
                    <div role="status" aria-live="polite">
                        <div className="relative mb-8">
                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-amber-400/20 bg-amber-400/10">
                                <RefreshCw className="h-12 w-12 text-amber-300" />
                            </div>
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Payment Pending</h2>
                        <p className="text-gray-400 mb-6">
                            Your payment is still being processed. This may take a few moments.
                        </p>
                        <button
                            type="button"
                            onClick={handleRetry}
                            disabled={retryCount >= 5}
                            className="rounded-full bg-[#E23744] px-6 py-3 font-bold text-white transition-all hover:bg-[#c92f3b] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {retryCount >= 5 ? 'Please contact support' : 'Check Again'}
                        </button>
                    </div>
                )}

                {status === 'failed' && (
                    <div role="alert">
                        <div className="relative mb-8">
                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-red-400/20 bg-red-400/10">
                                <XCircle className="h-12 w-12 text-red-300" />
                            </div>
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Payment Failed</h2>
                        <p className="text-gray-400 mb-6">
                            Unfortunately, your payment could not be verified. Please try again or contact support.
                        </p>
                        <div className="flex gap-3 justify-center">
                            <button
                                type="button"
                                onClick={() => navigate('/')}
                                className="rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 font-bold text-white transition-colors hover:bg-white/[0.08] active:translate-y-px"
                            >
                                Explore Events
                            </button>
                            <button
                                type="button"
                                onClick={handleRetry}
                                className="rounded-full bg-[#E23744] px-6 py-3 font-bold text-white transition-colors hover:bg-[#c92f3b] active:translate-y-px"
                            >
                                Retry
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
