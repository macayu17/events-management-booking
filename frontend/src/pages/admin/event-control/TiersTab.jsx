import { useEffect, useState } from 'react';
import { PlusCircle, Ticket, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../utils/api';
import useConfirmDialog from '../../../hooks/useConfirmDialog';
import FormField from './FormField';

const emptyTierForm = { name: '', description: '', priceCents: '', capacity: '' };

const parseNonNegativeInteger = (value, label, allowEmpty = false) => {
    const raw = String(value ?? '').trim();
    if (allowEmpty && raw === '') return '';

    if (!/^\d+$/.test(raw)) {
        throw new Error(`${label} must be a whole number`);
    }

    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed)) {
        throw new Error(`${label} is too large`);
    }

    return parsed;
};

const buildTierPayload = (form) => ({
    ...form,
    name: String(form.name || '').trim(),
    description: String(form.description || '').trim(),
    priceCents: parseNonNegativeInteger(form.priceCents, 'Price'),
    capacity: parseNonNegativeInteger(form.capacity, 'Capacity', true)
});

export default function TiersTab({ eventId }) {
    const [tiers, setTiers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingTier, setEditingTier] = useState(null);
    const [form, setForm] = useState(emptyTierForm);
    const [fetchError, setFetchError] = useState('');
    const { confirm, dialog } = useConfirmDialog();

    useEffect(() => {
        fetchTiers();
    }, [eventId]);

    const fetchTiers = async () => {
        setLoading(true);
        setFetchError('');
        try {
            const res = await api.get(`/admin/events/${eventId}/tiers`);
            setTiers(res.data);
        } catch (error) {
            console.error('Error fetching tiers:', error);
            setFetchError(error.response?.data?.error || 'Failed to load ticket tiers');
        } finally {
            setLoading(false);
        }
    };

    const openCreateForm = () => {
        setShowForm(true);
        setEditingTier(null);
        setForm(emptyTierForm);
    };

    const closeForm = () => {
        setShowForm(false);
        setEditingTier(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = buildTierPayload(form);
            if (editingTier) {
                await api.put(`/admin/tiers/${editingTier.id}`, payload);
                toast.success('Tier updated');
            } else {
                await api.post(`/admin/events/${eventId}/tiers`, payload);
                toast.success('Tier created');
            }
            closeForm();
            setForm(emptyTierForm);
            fetchTiers();
        } catch (error) {
            toast.error(error.response?.data?.error || error.message || 'Failed to save tier');
        }
    };

    const handleDelete = async (tierId) => {
        const confirmed = await confirm({
            title: 'Delete ticket tier?',
            message: 'Sold or snapshotted tiers may be preserved by the server for order history.',
            confirmLabel: 'Delete tier',
        });
        if (!confirmed) return;

        try {
            await api.delete(`/admin/tiers/${tierId}`);
            toast.success('Tier deleted');
            fetchTiers();
        } catch (error) {
            toast.error('Failed to delete');
        }
    };

    const handleEdit = (tier) => {
        setEditingTier(tier);
        setForm({
            name: tier.name,
            description: tier.description || '',
            priceCents: tier.priceCents,
            capacity: tier.capacity || ''
        });
        setShowForm(true);
    };

    return (
        <div className="admin-card min-w-0 p-5 sm:p-6">
            {dialog}
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl font-bold text-[#f7efe3]">Ticket Tiers</h2>
                <button type="button" onClick={openCreateForm} className="admin-primary-action inline-flex items-center justify-center gap-2">
                    <PlusCircle size={18} /> Add Tier
                </button>
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} className="mb-6 space-y-4 rounded-[1.25rem] border border-white/10 bg-[#12100e]/70 p-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FormField label="Tier name">
                            <input type="text" placeholder="VIP, Standard, Early Bird" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input w-full" required />
                        </FormField>
                        <FormField label="Price (paise)" helpText="Use 0 for a free tier.">
                            <input type="number" min="0" step="1" inputMode="numeric" placeholder="50000" value={form.priceCents} onChange={(e) => setForm({ ...form, priceCents: e.target.value })} className="input" required />
                        </FormField>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                        <FormField label="Description" helpText="Optional buyer-facing summary.">
                            <input type="text" placeholder="What this tier includes" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input w-full" />
                        </FormField>
                        <FormField label="Capacity" helpText="Leave blank for unlimited.">
                            <input type="number" min="0" step="1" inputMode="numeric" placeholder="Unlimited" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="input" />
                        </FormField>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="submit" className="admin-primary-action">{editingTier ? 'Update' : 'Create'}</button>
                        <button type="button" onClick={closeForm} className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-[#aaa096] transition-all hover:border-[#f2e7d8]/25 hover:text-[#f7efe3]">Cancel</button>
                    </div>
                </form>
            )}

            {fetchError ? (
                <div className="rounded-[1.25rem] border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                    <p className="font-bold">Could not load ticket tiers</p>
                    <p className="mt-1 text-red-100/80">{fetchError}</p>
                    <button type="button" onClick={fetchTiers} className="mt-3 rounded-full border border-red-200/20 px-4 py-2 text-xs font-bold text-red-100 transition-colors hover:bg-red-200/10">
                        Retry
                    </button>
                </div>
            ) : loading ? (
                <div className="admin-muted">Loading...</div>
            ) : tiers.length === 0 ? (
                <div className="py-12 text-center admin-muted">
                    <Ticket className="mx-auto mb-4 text-[#aaa096]" size={48} />
                    <p>No tiers created yet</p>
                    <p className="text-sm">Add different ticket types like VIP, Standard, Early Bird</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {tiers.map(tier => (
                        <div key={tier.id} className="flex flex-col gap-3 rounded-[1.25rem] border border-white/10 bg-white/[0.035] p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <h3 className="truncate font-semibold text-[#f7efe3]">{tier.name}</h3>
                                <p className="break-words text-sm admin-muted">{tier.description || 'No description'}</p>
                                <p className="text-sm text-emerald-300">&#8377;{(tier.priceCents / 100).toFixed(2)} &bull; {tier.capacity ? `${tier.soldCount}/${tier.capacity} sold` : 'Unlimited'}</p>
                            </div>
                            <div className="flex shrink-0 gap-2">
                                <button type="button" onClick={() => handleEdit(tier)} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-[#aaa096] transition-all hover:border-[#f2e7d8]/25 hover:text-[#f7efe3]">Edit</button>
                                <button type="button" onClick={() => handleDelete(tier.id)} className="admin-icon-button hover:border-[#E23744]/40 hover:bg-[#E23744] hover:text-white" aria-label={`Delete tier ${tier.name}`}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
