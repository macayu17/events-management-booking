import { useState, useEffect, useRef } from 'react';
import { X, Send, Loader } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import Modal from './Modal';

export default function BroadcastModal({ isOpen, onClose }) {
    const [loading, setLoading] = useState(false);
    const [events, setEvents] = useState([]);
    const closeButtonRef = useRef(null);
    const [formData, setFormData] = useState({
        type: 'ALL', // ALL, EVENT
        eventId: '',
        subject: '',
        content: ''
    });

    useEffect(() => {
        if (isOpen) {
            fetchEvents();
        }
    }, [isOpen]);

    const fetchEvents = async () => {
        try {
            const response = await api.get('/admin/events'); // Reuse existing endpoint
            setEvents(response.data);
        } catch (error) {
            console.error('Failed to fetch events:', error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.type === 'EVENT' && !formData.eventId) {
            toast.error('Please select an event');
            return;
        }

        setLoading(true);
        try {
            const response = await api.post('/admin/broadcast', formData);
            toast.success(response.data.message);
            onClose();
            setFormData({ type: 'ALL', eventId: '', subject: '', content: '' });
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to send broadcast');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Modal
            ariaLabelledby="broadcast-title"
            ariaDescribedby="broadcast-description"
            initialFocusRef={closeButtonRef}
            onClose={onClose}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
            panelClassName="bg-[#18181b] border border-white/10 rounded-2xl w-full max-h-[calc(100dvh-2rem)] max-w-2xl shadow-2xl overflow-y-auto overscroll-contain"
        >
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-[#27272a]/50">
                    <h2 id="broadcast-title" className="text-xl font-bold text-white flex items-center gap-2">
                        <Send size={20} className="text-[#E23744]" />
                        Broadcast Email
                    </h2>
                    <p id="broadcast-description" className="sr-only">
                        Compose and send an email broadcast to all participants or to one event.
                    </p>
                    <button
                        type="button"
                        ref={closeButtonRef}
                        aria-label="Close broadcast modal"
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label htmlFor="broadcast-type" className="text-sm font-medium text-gray-300">Recipients</label>
                            <select
                                id="broadcast-type"
                                className="input"
                                value={formData.type}
                                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                            >
                                <option value="ALL">All Participants (Global)</option>
                                <option value="EVENT">Specific Event Participants</option>
                            </select>
                        </div>

                        {formData.type === 'EVENT' && (
                            <div className="space-y-2 animate-fade-in">
                                <label htmlFor="broadcast-event" className="text-sm font-medium text-gray-300">Select Event</label>
                                <select
                                    id="broadcast-event"
                                    className="input"
                                    value={formData.eventId}
                                    onChange={(e) => setFormData({ ...formData, eventId: e.target.value })}
                                    required
                                >
                                    <option value="">-- Choose Event --</option>
                                    {events.map(event => (
                                        <option key={event.id} value={event.id}>
                                            {event.title}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="broadcast-subject" className="text-sm font-medium text-gray-300">Subject</label>
                        <input
                            id="broadcast-subject"
                            type="text"
                            className="input"
                            placeholder="e.g., Important update regarding..."
                            value={formData.subject}
                            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="broadcast-content" className="text-sm font-medium text-gray-300">Message (basic HTML allowed)</label>
                        <textarea
                            id="broadcast-content"
                            className="input min-h-[200px] font-mono text-sm"
                            placeholder="<p>Hello everyone,</p><p>We have an announcement...</p>"
                            value={formData.content}
                            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                            required
                        />
                        <p className="text-xs text-gray-500">Allowed tags include paragraphs, headings, lists, bold text, and safe links.</p>
                    </div>

                    <div className="flex justify-end pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn btn-ghost mr-2"
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <Loader className="animate-spin" size={18} />
                                    Sending...
                                </>
                            ) : (
                                <>
                                    <Send size={18} />
                                    Send Broadcast
                                </>
                            )}
                        </button>
                    </div>
                </form>
        </Modal>
    );
}
