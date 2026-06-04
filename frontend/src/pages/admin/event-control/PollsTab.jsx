import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { MessageSquare, PlusCircle, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../utils/api';
import useConfirmDialog from '../../../hooks/useConfirmDialog';
import FormField from './FormField';

export default function PollsTab({ eventId }) {
    const [polls, setPolls] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const { confirm, dialog } = useConfirmDialog();

    const [newPoll, setNewPoll] = useState({
        question: '',
        description: '',
        allowMultiple: false,
        notifyUsers: true,
        options: [{ text: '' }, { text: '' }]
    });

    useEffect(() => {
        fetchPolls();
    }, [eventId]);

    const fetchPolls = async () => {
        try {
            const res = await api.get(`/admin/events/${eventId}/polls`);
            setPolls(res.data);
        } catch (error) {
            console.error('Failed to fetch polls');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateOption = () => {
        setNewPoll({
            ...newPoll,
            options: [...newPoll.options, { text: '' }]
        });
    };

    const handleRemoveOption = (idx) => {
        const updated = newPoll.options.filter((_, i) => i !== idx);
        setNewPoll({ ...newPoll, options: updated });
    };

    const handleOptionChange = (idx, val) => {
        const updated = [...newPoll.options];
        updated[idx].text = val;
        setNewPoll({ ...newPoll, options: updated });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!newPoll.question.trim()) return toast.error('Question is required');
        const validOptions = newPoll.options.filter(o => o.text.trim());
        if (validOptions.length < 2) return toast.error('At least 2 options required');

        try {
            await api.post(`/admin/events/${eventId}/polls`, {
                ...newPoll,
                options: validOptions
            });
            toast.success('Poll created successfully');
            setShowCreate(false);
            setNewPoll({
                question: '',
                description: '',
                allowMultiple: false,
                notifyUsers: true,
                options: [{ text: '' }, { text: '' }]
            });
            fetchPolls();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to create poll');
        }
    };

    const handleDelete = async (pollId) => {
        const confirmed = await confirm({
            title: 'Delete poll?',
            message: 'This removes the poll and its collected responses from the event control center.',
            confirmLabel: 'Delete poll',
        });
        if (!confirmed) return;

        try {
            await api.delete(`/admin/polls/${pollId}`);
            toast.success('Poll deleted');
            fetchPolls();
        } catch (error) {
            toast.error('Failed to delete poll');
        }
    };

    const toggleActive = async (poll, currentStatus) => {
        try {
            await api.put(`/admin/polls/${poll.id}`, { isActive: !currentStatus });
            toast.success('Poll updated');
            fetchPolls();
        } catch (error) {
            toast.error('Failed to update poll');
        }
    };

    if (loading) {
        return <div className="text-gray-400">Loading polls...</div>;
    }

    return (
        <div className="space-y-6">
            {dialog}
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-white">Event Polls</h3>
                <button
                    type="button"
                    onClick={() => setShowCreate(!showCreate)}
                    className="btn btn-primary"
                >
                    {showCreate ? 'Cancel' : 'Create Poll'}
                </button>
            </div>

            {showCreate && (
                <div className="card p-6 animate-fade-in border-l-4 border-l-[#E23744]">
                    <h4 className="text-lg font-bold mb-4">Create New Poll</h4>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <FormField label="Question" className="lg:col-span-2">
                                <input
                                    type="text"
                                    value={newPoll.question}
                                    onChange={e => setNewPoll({ ...newPoll, question: e.target.value })}
                                    placeholder="What would you like to ask?"
                                    className="input"
                                />
                            </FormField>

                            <FormField label="Description" className="lg:col-span-2" helpText="Optional context shown with the poll.">
                                <textarea
                                    value={newPoll.description}
                                    onChange={e => setNewPoll({ ...newPoll, description: e.target.value })}
                                    placeholder="Add some context..."
                                    className="input min-h-[80px]"
                                />
                            </FormField>
                        </div>

                        <div>
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Options</span>
                                <span className="text-xs text-gray-500">At least 2 required</span>
                            </div>
                            <div className="space-y-2">
                                {newPoll.options.map((opt, idx) => (
                                    <div key={idx} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                                        <FormField label={`Option ${idx + 1}`}>
                                            <input
                                                type="text"
                                                value={opt.text}
                                                onChange={e => handleOptionChange(idx, e.target.value)}
                                                placeholder="Enter option text"
                                                className="input"
                                            />
                                        </FormField>
                                        {newPoll.options.length > 2 && (
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveOption(idx)}
                                                className="btn btn-secondary px-3"
                                                aria-label={`Remove option ${idx + 1}`}
                                            >
                                                <X size={16} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={handleCreateOption}
                                    className="text-sm text-[#E23744] hover:text-white flex items-center gap-1 mt-2"
                                >
                                    <PlusCircle size={14} /> Add Option
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 pt-2 md:grid-cols-2">
                            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                                <input
                                    type="checkbox"
                                    checked={newPoll.allowMultiple}
                                    onChange={e => setNewPoll({ ...newPoll, allowMultiple: e.target.checked })}
                                    className="w-4 h-4 rounded border-gray-600 text-[#E23744] focus:ring-[#E23744]"
                                />
                                <span className="text-sm text-gray-300">Allow multiple answers</span>
                            </label>

                            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                                <input
                                    type="checkbox"
                                    checked={newPoll.notifyUsers}
                                    onChange={e => setNewPoll({ ...newPoll, notifyUsers: e.target.checked })}
                                    className="w-4 h-4 rounded border-gray-600 text-[#E23744] focus:ring-[#E23744]"
                                />
                                <span className="text-sm text-gray-300">Notify attendees via email</span>
                            </label>
                        </div>

                        <div className="pt-2">
                            <button type="submit" className="btn btn-primary w-full">Launch Poll</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="grid gap-4">
                {polls.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">
                        <MessageSquare size={40} className="mx-auto mb-2 opacity-20" />
                        <p>No polls yet</p>
                    </div>
                ) : (
                    polls.map(poll => (
                        <div key={poll.id} className="card group p-5">
                            <div className="mb-3 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 flex-1">
                                    <h5 className="break-words text-lg font-bold text-white">{poll.question}</h5>
                                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
                                        <span>{format(new Date(poll.createdAt), 'MMM d, yyyy')}</span>
                                        <span className="h-1 w-1 rounded-full bg-gray-600" aria-hidden="true" />
                                        <span className={poll.isActive ? 'text-green-500' : 'text-orange-500'}>
                                            {poll.isActive ? 'Active' : 'Ended'}
                                        </span>
                                        <span className="h-1 w-1 rounded-full bg-gray-600" aria-hidden="true" />
                                        <span>{poll.options.reduce((acc, o) => acc + (o._count?.votes || 0), 0)} votes</span>
                                    </div>
                                </div>
                                <div className="flex shrink-0 gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                                    <button
                                        type="button"
                                        onClick={() => toggleActive(poll, poll.isActive)}
                                        className="btn btn-secondary px-3 py-1 text-xs"
                                    >
                                        {poll.isActive ? 'Close' : 'Reopen'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(poll.id)}
                                        className="btn btn-ghost px-3 py-1 text-xs hover:bg-red-500/10 hover:text-red-500"
                                        aria-label={`Delete poll ${poll.question}`}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2 mt-4">
                                {poll.options.map(opt => {
                                    const totalVotes = poll.options.reduce((acc, o) => acc + (o._count?.votes || 0), 0);
                                    const percentage = totalVotes > 0 ? ((opt._count?.votes || 0) / totalVotes * 100).toFixed(1) : 0;

                                    return (
                                        <div key={opt.id} className="relative min-h-8 overflow-hidden rounded-md bg-white/5">
                                            <div
                                                className="absolute top-0 left-0 h-full bg-white/10"
                                                style={{ width: `${percentage}%` }}
                                            />
                                            <div className="relative flex min-w-0 items-center justify-between gap-3 px-3 py-2 text-xs">
                                                <span className="min-w-0 break-words">{opt.text}</span>
                                                <span className="shrink-0 text-gray-300">{opt._count?.votes || 0} ({percentage}%)</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
