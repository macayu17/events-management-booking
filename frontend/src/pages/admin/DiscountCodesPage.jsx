import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { Plus, Tag, X, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import Modal from '../../components/Modal';
import { ErrorState } from '../../components/StateBlock';

export default function DiscountCodesPage() {
    const { id } = useParams();
    const [codes, setCodes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const closeButtonRef = useRef(null);
    const { register, handleSubmit, reset, formState: { errors } } = useForm();

    useEffect(() => {
        fetchCodes({ showSpinner: true });
    }, [id]);

    const fetchCodes = async ({ showSpinner = false } = {}) => {
        if (showSpinner) setLoading(true);
        setLoadError('');

        try {
            const response = await api.get(`/discounts/events/${id}`);
            setCodes(response.data);
        } catch (error) {
            setLoadError(error.response?.data?.error || 'Failed to fetch discount codes');
            toast.error('Failed to fetch discount codes');
        } finally {
            setLoading(false);
        }
    };

    const onSubmit = async (data) => {
        try {
            await api.post(`/discounts/events/${id}`, data);
            toast.success('Discount code created successfully');
            setIsModalOpen(false);
            reset();
            fetchCodes();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to create code');
        }
    };

    const toggleStatus = async (codeId) => {
        try {
            await api.patch(`/discounts/${codeId}/toggle`);
            setCodes(codes.map(c => c.id === codeId ? { ...c, isActive: !c.isActive } : c));
            toast.success('Status updated');
        } catch (error) {
            toast.error('Failed to update status');
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-[#E23744] border-r-2 border-[#E23744]/30"></div>
            </div>
        );
    }

    if (loadError) {
        return (
            <ErrorState
                title="Could not load discount codes"
                message={loadError}
                action={(
                    <button type="button" onClick={() => fetchCodes({ showSpinner: true })} className="admin-primary-action">
                        Retry
                    </button>
                )}
            />
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                    <Link to="/admin/events" className="admin-icon-button shrink-0" aria-label="Back to admin events">
                        <ArrowLeft size={22} />
                    </Link>
                    <div className="min-w-0">
                        <h1 className="mb-2 truncate text-3xl font-bold text-[#f7efe3]">Discount Codes</h1>
                        <p className="admin-muted">Manage promo codes and discounts for this event.</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="admin-primary-action flex items-center gap-2 self-start sm:self-auto"
                >
                    <Plus size={20} />
                    New Code
                </button>
            </div>

            {codes.length === 0 ? (
                <div className="admin-card border-dashed px-6 py-20 text-center">
                    <Tag className="mx-auto mb-4 text-[#7f766d]" size={48} />
                    <h3 className="mb-2 text-xl font-bold text-[#f7efe3]">No discount codes</h3>
                    <p className="admin-muted mb-6">Create codes to boost your ticket sales.</p>
                    <button type="button" onClick={() => setIsModalOpen(true)} className="admin-primary-action inline-flex">
                        Create Code
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {codes.map((code) => (
                        <div key={code.id} className={`admin-card admin-card-hover min-w-0 p-5 sm:p-6 ${code.isActive ? '' : 'border-red-500/20 bg-red-500/5'}`}>
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className="bg-[#E23744]/10 p-2.5 rounded-lg text-[#E23744]">
                                        <Tag size={20} />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="truncate text-lg font-bold tracking-wide text-[#f7efe3]" title={code.code || ''}>{code.code || 'Untitled code'}</h3>
                                        <p className="admin-muted text-sm">
                                            {code.type === 'PERCENTAGE' ? `${code.amount}% OFF` : `₹${(code.amount / 100).toFixed(0)} OFF`}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => toggleStatus(code.id)}
                                    className={`admin-chip shrink-0 transition-colors ${code.isActive
                                            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                                            : 'border-white/10 bg-white/[0.04] text-[#aaa096] hover:bg-white/[0.08]'
                                        }`}
                                >
                                    {code.isActive ? 'Active' : 'Inactive'}
                                </button>
                            </div>

                            <div className="admin-muted mb-6 space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span>Used</span>
                                    <span className="font-medium text-[#f7efe3]">
                                        {code.usedCount} {code.maxUses ? `/ ${code.maxUses}` : ''}
                                    </span>
                                </div>
                                {code.validUntil && (
                                    <div className="flex justify-between">
                                        <span>Expires</span>
                                        <span className="text-[#f7efe3]">{format(new Date(code.validUntil), 'MMM d, yyyy')}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {isModalOpen && (
                <Modal
                    ariaLabelledby="discount-modal-title"
                    ariaDescribedby="discount-modal-description"
                    initialFocusRef={closeButtonRef}
                    onClose={() => setIsModalOpen(false)}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-[#070604]/85 p-4"
                    panelClassName="admin-card w-full max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto overscroll-contain p-6 animate-scale-up"
                >
                        <div className="flex justify-between items-center mb-6">
                            <h2 id="discount-modal-title" className="text-xl font-bold text-[#f7efe3]">New Discount Code</h2>
                            <p id="discount-modal-description" className="sr-only">
                                Create a promo code with type, value, usage limit, and validity dates.
                            </p>
                            <button
                                type="button"
                                ref={closeButtonRef}
                                aria-label="Close discount modal"
                                onClick={() => setIsModalOpen(false)}
                                className="admin-icon-button"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                            <div>
                                <label htmlFor="discount-code-name" className="admin-muted mb-1 block text-sm font-medium">Code</label>
                                <input
                                    id="discount-code-name"
                                    type="text"
                                    {...register('code', { required: true, pattern: /^[A-Za-z0-9_-]+$/ })}
                                    className="input uppercase"
                                    placeholder="SUMMER2024"
                                />
                                {errors.code && <p className="mt-1 text-xs text-red-400">Valid code required</p>}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="discount-code-type" className="admin-muted mb-1 block text-sm font-medium">Type</label>
                                    <select id="discount-code-type" {...register('type')} className="input">
                                        <option value="PERCENTAGE">Percentage (%)</option>
                                        <option value="FIXED_AMOUNT">Fixed Amount (₹)</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="discount-code-amount" className="admin-muted mb-1 block text-sm font-medium">Value</label>
                                    <input
                                        id="discount-code-amount"
                                        type="number"
                                        {...register('amount', { required: true, min: 1 })}
                                        className="input"
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="discount-code-max-uses" className="admin-muted mb-1 block text-sm font-medium">Max Uses (Optional)</label>
                                <input id="discount-code-max-uses" type="number" {...register('maxUses')} className="input" placeholder="Unlimited" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="discount-code-valid-from" className="admin-muted mb-1 block text-sm font-medium">Valid From</label>
                                    <input id="discount-code-valid-from" type="date" {...register('validFrom')} className="input" />
                                </div>
                                <div>
                                    <label htmlFor="discount-code-valid-until" className="admin-muted mb-1 block text-sm font-medium">Valid Until</label>
                                    <input id="discount-code-valid-until" type="date" {...register('validUntil')} className="input" />
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button type="submit" className="admin-primary-action flex-1">Create Code</button>
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-[#f7efe3] transition-all hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0a09]"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                </Modal>
            )}
        </div>
    );
}
