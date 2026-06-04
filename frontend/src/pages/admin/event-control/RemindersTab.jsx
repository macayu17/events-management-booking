import { useEffect, useState } from 'react';
import { Bell, PlusCircle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../utils/api';
import useConfirmDialog from '../../../hooks/useConfirmDialog';
import FormField from './FormField';

const emptyReminderForm = { hoursBeforeEvent: 24, subject: '', message: '' };

export default function RemindersTab({ eventId }) {
    const [reminders, setReminders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(emptyReminderForm);
    const { confirm, dialog } = useConfirmDialog();

    useEffect(() => {
        fetchReminders();
    }, [eventId]);

    const fetchReminders = async () => {
        try {
            const res = await api.get(`/admin/events/${eventId}/reminders`);
            setReminders(res.data);
        } catch (error) {
            console.error('Error fetching reminders:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.post(`/admin/events/${eventId}/reminders`, form);
            toast.success('Reminder created');
            setShowForm(false);
            setForm(emptyReminderForm);
            fetchReminders();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to create reminder');
        }
    };

    const handleDelete = async (reminderId) => {
        const confirmed = await confirm({
            title: 'Delete reminder?',
            message: 'This removes the scheduled reminder from this event.',
            confirmLabel: 'Delete reminder',
        });
        if (!confirmed) return;

        try {
            await api.delete(`/admin/reminders/${reminderId}`);
            toast.success('Reminder deleted');
            fetchReminders();
        } catch (error) {
            toast.error('Failed to delete');
        }
    };

    const toggleActive = async (reminder) => {
        try {
            await api.put(`/admin/reminders/${reminder.id}`, { isActive: !reminder.isActive });
            fetchReminders();
        } catch (error) {
            toast.error('Failed to update');
        }
    };

    return (
        <div className="admin-card min-w-0 p-5 sm:p-6">
            {dialog}
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <h2 className="text-xl font-bold text-[#f7efe3]">Event Reminders</h2>
                    <p className="break-words text-sm admin-muted">Automated emails sent to attendees before the event</p>
                </div>
                <button type="button" onClick={() => setShowForm(true)} className="admin-primary-action inline-flex items-center justify-center gap-2">
                    <PlusCircle size={18} /> Add Reminder
                </button>
            </div>

            <div className="mb-4 rounded-[1.25rem] border border-[#E23744]/20 bg-[#E23744]/10 p-4 text-sm text-[#f7efe3]">
                <strong>Tip:</strong> Use placeholders: {'{name}'}, {'{event}'}, {'{date}'}, {'{time}'}, {'{location}'}
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} className="mb-6 space-y-4 rounded-[1.25rem] border border-white/10 bg-[#12100e]/70 p-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                        <FormField label="Send time">
                            <select value={form.hoursBeforeEvent} onChange={(e) => setForm({ ...form, hoursBeforeEvent: parseInt(e.target.value) })} className="input w-full">
                                <option value={168}>1 week before</option>
                                <option value={72}>3 days before</option>
                                <option value={24}>1 day before</option>
                                <option value={12}>12 hours before</option>
                                <option value={2}>2 hours before</option>
                                <option value={1}>1 hour before</option>
                            </select>
                        </FormField>
                        <FormField label="Email subject">
                            <input type="text" placeholder="Don't forget: {event} is tomorrow!" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="input w-full" required />
                        </FormField>
                    </div>
                    <FormField label="Email message" helpText="Available placeholders: {name}, {event}, {date}, {time}, {location}.">
                        <textarea placeholder="Write the reminder message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="input w-full h-32" required />
                    </FormField>
                    <div className="flex flex-wrap gap-2">
                        <button type="submit" className="admin-primary-action">Create Reminder</button>
                        <button type="button" onClick={() => setShowForm(false)} className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-[#aaa096] transition-all hover:border-[#f2e7d8]/25 hover:text-[#f7efe3]">Cancel</button>
                    </div>
                </form>
            )}

            {loading ? (
                <div className="admin-muted">Loading...</div>
            ) : reminders.length === 0 ? (
                <div className="py-12 text-center admin-muted">
                    <Bell className="mx-auto mb-4 text-[#aaa096]" size={48} />
                    <p>No reminders configured</p>
                    <p className="text-sm">Set up automatic reminder emails for attendees</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {reminders.map(reminder => (
                        <div key={reminder.id} className={`flex flex-col gap-3 rounded-[1.25rem] border border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between ${reminder.isActive ? 'bg-white/[0.035]' : 'bg-[#12100e]/55 opacity-60'}`}>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="font-semibold text-[#f7efe3]">{reminder.hoursBeforeEvent}h before</h3>
                                    {reminder.sentAt && <span className="admin-chip border-emerald-500/20 bg-emerald-500/10 text-emerald-300">Sent</span>}
                                </div>
                                <p className="break-words text-sm admin-muted">{reminder.subject}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <button type="button" onClick={() => toggleActive(reminder)} className={`admin-chip ${reminder.isActive ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/[0.04] text-[#aaa096]'}`}>
                                    {reminder.isActive ? 'Active' : 'Paused'}
                                </button>
                                <button type="button" onClick={() => handleDelete(reminder.id)} className="admin-icon-button hover:border-[#E23744]/40 hover:bg-[#E23744] hover:text-white" aria-label={`Delete reminder ${reminder.subject}`}>
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
