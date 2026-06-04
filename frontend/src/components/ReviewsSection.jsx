import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Star, StarHalf, MessageSquare, User } from 'lucide-react';
import { format } from 'date-fns';

export default function ReviewsSection({ eventId }) {
    const { user } = useAuth();
    const [reviews, setReviews] = useState([]);
    const [stats, setStats] = useState({ average: 0, count: 0 });
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [rating, setRating] = useState(5);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchReviews();
    }, [eventId]);

    const fetchReviews = async () => {
        try {
            const response = await api.get(`/events/${eventId}/reviews`);
            setReviews(response.data.reviews);
            setStats(response.data.stats);
        } catch (error) {
            console.error('Failed to fetch reviews');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await api.post(`/events/${eventId}/reviews`, { rating, comment });
            toast.success('Review submitted successfully!');
            setShowForm(false);
            setComment('');
            fetchReviews();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to submit review');
        } finally {
            setSubmitting(false);
        }
    };

    const renderStars = (score) => {
        const stars = [];
        for (let i = 1; i <= 5; i++) {
            if (score >= i) {
                stars.push(<Star key={i} size={16} className="text-yellow-400 fill-yellow-400" />);
            } else if (score >= i - 0.5) {
                stars.push(<StarHalf key={i} size={16} className="text-yellow-400 fill-yellow-400" />);
            } else {
                stars.push(<Star key={i} size={16} className="text-gray-600" />);
            }
        }
        return stars;
    };

    if (loading) return null;

    return (
        <div className="card space-y-8 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <MessageSquare className="text-[#E23744]" />
                        Reviews
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                        <div className="flex">{renderStars(stats.average)}</div>
                        <span className="text-gray-400 text-sm">
                            {stats.average.toFixed(1)} ({stats.count} reviews)
                        </span>
                    </div>
                </div>

                {user && !showForm && (
                    <button onClick={() => setShowForm(true)} className="btn btn-secondary">
                        Write a Review
                    </button>
                )}
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} className="bg-[#18181b] p-6 rounded-xl border border-white/10 space-y-4 animate-scale-up">
                    <fieldset>
                        <legend className="block text-sm font-medium text-gray-400 mb-2">Rating</legend>
                        <div className="flex gap-2" role="group" aria-label={`Selected rating: ${rating} out of 5`}>
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    type="button"
                                    onClick={() => setRating(star)}
                                    aria-label={`Rate ${star} out of 5`}
                                    aria-pressed={rating === star}
                                    className="rounded-lg p-1 transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E23744]"
                                >
                                    <Star
                                        size={24}
                                        className={star <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-600"}
                                    />
                                </button>
                            ))}
                        </div>
                    </fieldset>

                    <div>
                        <label htmlFor={`review-comment-${eventId}`} className="block text-sm font-medium text-gray-400 mb-2">Comment</label>
                        <textarea
                            id={`review-comment-${eventId}`}
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="input"
                            rows={4}
                            placeholder="Share your experience..."
                            required
                        />
                    </div>

                    <div className="flex gap-3 justify-end">
                        <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">Cancel</button>
                        <button type="submit" disabled={submitting} className="btn btn-primary">
                            {submitting ? 'Submitting...' : 'Post Review'}
                        </button>
                    </div>
                </form>
            )}

            {reviews.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                    <p>No reviews yet. Be the first to share your thoughts!</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {reviews.map((review) => (
                        <div key={review.id} className="border-b border-white/5 pb-6 last:border-0 last:pb-0">
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400">
                                        <User size={20} />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-white">{review.user.name}</p>
                                        <div className="flex text-xs">{renderStars(review.rating)}</div>
                                    </div>
                                </div>
                                <span className="text-xs text-gray-500">{format(new Date(review.createdAt), 'MMM d, yyyy')}</span>
                            </div>
                            <p className="text-gray-300 mt-2 pl-12.5">{review.comment}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
