import { useEffect, useState } from 'react';
import { Mic, PlusCircle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../utils/api';
import useConfirmDialog from '../../../hooks/useConfirmDialog';
import FormField from './FormField';

const emptySpeakerForm = { name: '', title: '', bio: '', photoUrl: '', linkedIn: '', twitter: '' };

const formFromSpeaker = (speaker) => ({
    name: speaker.name,
    title: speaker.title || '',
    bio: speaker.bio || '',
    photoUrl: speaker.photoUrl || '',
    linkedIn: speaker.linkedIn || '',
    twitter: speaker.twitter || ''
});

export default function SpeakersTab({ eventId }) {
    const [speakers, setSpeakers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingSpeaker, setEditingSpeaker] = useState(null);
    const [form, setForm] = useState(emptySpeakerForm);
    const [fetchError, setFetchError] = useState('');
    const { confirm, dialog } = useConfirmDialog();

    useEffect(() => {
        fetchSpeakers();
    }, [eventId]);

    const fetchSpeakers = async () => {
        setLoading(true);
        setFetchError('');
        try {
            const res = await api.get(`/admin/events/${eventId}/speakers`);
            setSpeakers(res.data);
        } catch (error) {
            console.error('Error fetching speakers:', error);
            setFetchError(error.response?.data?.error || 'Failed to load speakers');
        } finally {
            setLoading(false);
        }
    };

    const openCreateForm = () => {
        setShowForm(true);
        setEditingSpeaker(null);
        setForm(emptySpeakerForm);
    };

    const closeForm = () => {
        setShowForm(false);
        setEditingSpeaker(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingSpeaker) {
                await api.put(`/admin/speakers/${editingSpeaker.id}`, form);
                toast.success('Speaker updated');
            } else {
                await api.post(`/admin/events/${eventId}/speakers`, form);
                toast.success('Speaker added');
            }
            closeForm();
            setForm(emptySpeakerForm);
            fetchSpeakers();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to save speaker');
        }
    };

    const handleDelete = async (speakerId) => {
        const confirmed = await confirm({
            title: 'Remove speaker?',
            message: 'This speaker will no longer appear on the public event page.',
            confirmLabel: 'Remove speaker',
        });
        if (!confirmed) return;

        try {
            await api.delete(`/admin/speakers/${speakerId}`);
            toast.success('Speaker removed');
            fetchSpeakers();
        } catch (error) {
            toast.error('Failed to remove');
        }
    };

    const handleEdit = (speaker) => {
        setEditingSpeaker(speaker);
        setForm(formFromSpeaker(speaker));
        setShowForm(true);
    };

    return (
        <div className="admin-card min-w-0 p-5 sm:p-6">
            {dialog}
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl font-bold text-[#f7efe3]">Speakers</h2>
                <button type="button" onClick={openCreateForm} className="admin-primary-action inline-flex items-center justify-center gap-2">
                    <PlusCircle size={18} /> Add Speaker
                </button>
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} className="mb-6 space-y-4 rounded-[1.25rem] border border-white/10 bg-[#12100e]/70 p-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FormField label="Speaker name">
                            <input type="text" placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" required />
                        </FormField>
                        <FormField label="Title">
                            <input type="text" placeholder="CEO at Company" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" />
                        </FormField>
                    </div>
                    <FormField label="Bio" helpText="Short speaker profile shown on the event page.">
                        <textarea placeholder="Speaker background and session focus" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="input w-full h-24" />
                    </FormField>
                    <FormField label="Photo URL">
                        <input type="url" placeholder="https://example.com/photo.jpg" value={form.photoUrl} onChange={(e) => setForm({ ...form, photoUrl: e.target.value })} className="input w-full" />
                    </FormField>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FormField label="LinkedIn URL">
                            <input type="url" placeholder="https://linkedin.com/in/username" value={form.linkedIn} onChange={(e) => setForm({ ...form, linkedIn: e.target.value })} className="input" />
                        </FormField>
                        <FormField label="Twitter handle">
                            <input type="text" placeholder="@username" value={form.twitter} onChange={(e) => setForm({ ...form, twitter: e.target.value })} className="input" />
                        </FormField>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="submit" className="admin-primary-action">{editingSpeaker ? 'Update' : 'Add'}</button>
                        <button type="button" onClick={closeForm} className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-[#aaa096] transition-all hover:border-[#f2e7d8]/25 hover:text-[#f7efe3]">Cancel</button>
                    </div>
                </form>
            )}

            {fetchError ? (
                <div className="rounded-[1.25rem] border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                    <p className="font-bold">Could not load speakers</p>
                    <p className="mt-1 text-red-100/80">{fetchError}</p>
                    <button type="button" onClick={fetchSpeakers} className="mt-3 rounded-full border border-red-200/20 px-4 py-2 text-xs font-bold text-red-100 transition-colors hover:bg-red-200/10">
                        Retry
                    </button>
                </div>
            ) : loading ? (
                <div className="admin-muted">Loading...</div>
            ) : speakers.length === 0 ? (
                <div className="py-12 text-center admin-muted">
                    <Mic className="mx-auto mb-4 text-[#aaa096]" size={48} />
                    <p>No speakers added yet</p>
                    <p className="text-sm">Add speakers to showcase on the event page</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {speakers.map(speaker => (
                        <div key={speaker.id} className="flex min-w-0 items-start gap-4 rounded-[1.25rem] border border-white/10 bg-white/[0.035] p-4">
                            {speaker.photoUrl ? (
                                <img src={speaker.photoUrl} alt={speaker.name} className="h-16 w-16 shrink-0 rounded-full object-cover" />
                            ) : (
                                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#12100e] text-xl font-bold text-[#f7efe3]">{speaker.name.charAt(0)}</div>
                            )}
                            <div className="min-w-0 flex-1">
                                <h3 className="truncate font-semibold text-[#f7efe3]">{speaker.name}</h3>
                                {speaker.title && <p className="truncate text-sm admin-muted">{speaker.title}</p>}
                                {speaker.bio && <p className="mt-1 line-clamp-2 break-words text-sm text-[#8f857c]">{speaker.bio}</p>}
                            </div>
                            <div className="flex shrink-0 gap-2">
                                <button type="button" onClick={() => handleEdit(speaker)} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-[#aaa096] transition-all hover:border-[#f2e7d8]/25 hover:text-[#f7efe3]">Edit</button>
                                <button type="button" onClick={() => handleDelete(speaker.id)} className="admin-icon-button hover:border-[#E23744]/40 hover:bg-[#E23744] hover:text-white" aria-label={`Delete speaker ${speaker.name}`}>
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
