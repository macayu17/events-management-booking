import { useState } from 'react';
import { BarChart, Check, Clock, Users } from 'lucide-react';
import { format } from 'date-fns';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function PollCard({ poll, userEmail, onVoted }) {
    const [selectedOptions, setSelectedOptions] = useState([]);
    const [hasVoted, setHasVoted] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [results, setResults] = useState(null);
    const [voting, setVoting] = useState(false);
    const [email, setEmail] = useState(userEmail || '');

    const isExpired = poll.endsAt && new Date(poll.endsAt) < new Date();
    const totalVotes = poll.options?.reduce((sum, opt) => sum + (opt._count?.votes || 0), 0) || 0;
    const allowMultiple = Boolean(poll.allowMultiple);

    const toggleOption = (optionId) => {
        if (!allowMultiple) {
            setSelectedOptions([optionId]);
            return;
        }

        setSelectedOptions((current) => (
            current.includes(optionId)
                ? current.filter((id) => id !== optionId)
                : [...current, optionId]
        ));
    };

    const handleVote = async () => {
        if (selectedOptions.length === 0) {
            toast.error('Please select at least one option');
            return;
        }
        if (!email || !email.includes('@')) {
            toast.error('Please enter your email to vote');
            return;
        }

        setVoting(true);
        try {
            await api.post(`/polls/${poll.id}/vote`, {
                ...(allowMultiple ? { optionIds: selectedOptions } : { optionId: selectedOptions[0] }),
                voterEmail: email
            });
            toast.success('Vote recorded!');
            setHasVoted(true);
            fetchResults();
            onVoted?.();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to vote');
        } finally {
            setVoting(false);
        }
    };

    const fetchResults = async () => {
        try {
            const res = await api.get(`/polls/${poll.id}/results`);
            setResults(res.data);
            setShowResults(true);
        } catch (error) {
            console.error('Failed to fetch results');
        }
    };

    return (
        <div className="card bg-[#18181b]/80 border border-white/10 rounded-xl p-5 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white">{poll.question}</h3>
                    {poll.description && (
                        <p className="text-sm text-gray-400 mt-1">{poll.description}</p>
                    )}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Users size={14} />
                    <span>{totalVotes} votes</span>
                </div>
            </div>

            {/* Time remaining */}
            {poll.endsAt && !isExpired && (
                <div className="flex items-center gap-2 text-xs text-orange-400">
                    <Clock size={12} />
                    <span>Ends {format(new Date(poll.endsAt), 'MMM d, h:mm a')}</span>
                </div>
            )}
            {isExpired && (
                <div className="text-xs text-gray-500">Poll ended</div>
            )}

            {/* Options / Results */}
            {(hasVoted || showResults) && results ? (
                <div className="space-y-2">
                    {results.options.map(opt => (
                        <div key={opt.id} className="relative">
                            <div
                                className="absolute inset-0 bg-[#E23744]/20 rounded-lg transition-all"
                                style={{ width: `${opt.percentage}%` }}
                            />
                            <div className="relative flex items-center justify-between px-4 py-3 rounded-lg border border-white/10">
                                <span className="text-sm text-white">{opt.text}</span>
                                <span className="text-sm font-medium text-gray-400">
                                    {opt.percentage}% ({opt.votes})
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-2">
                    <fieldset className="space-y-2" disabled={isExpired}>
                        <legend className="sr-only">{poll.question}</legend>
                        {allowMultiple && (
                            <p className="text-xs font-medium text-gray-400">
                                Choose one or more options.
                            </p>
                        )}
                        {poll.options?.map(opt => {
                            const optionId = `poll-${poll.id}-option-${opt.id}`;
                            const checked = selectedOptions.includes(opt.id);

                            return (
                                <label
                                    key={opt.id}
                                    htmlFor={optionId}
                                    className={`block w-full cursor-pointer rounded-lg border px-4 py-3 text-left transition-all focus-within:ring-2 focus-within:ring-[#E23744] focus-within:ring-offset-2 focus-within:ring-offset-[#18181b] ${checked
                                            ? 'border-[#E23744] bg-[#E23744]/10 text-white'
                                            : 'border-white/10 text-gray-300 hover:border-white/20 hover:bg-white/5'
                                        } ${isExpired ? 'cursor-not-allowed opacity-50' : ''}`}
                                >
                                    <input
                                        id={optionId}
                                        type={allowMultiple ? 'checkbox' : 'radio'}
                                        name={`poll-${poll.id}`}
                                        value={opt.id}
                                        checked={checked}
                                        onChange={() => toggleOption(opt.id)}
                                        className="sr-only"
                                    />
                                    <span className="flex items-center gap-3">
                                        <span className={`flex h-4 w-4 items-center justify-center border-2 ${allowMultiple ? 'rounded' : 'rounded-full'} ${checked ? 'border-[#E23744] bg-[#E23744]' : 'border-gray-500'}`}>
                                            {checked && <Check size={10} className="text-white" aria-hidden="true" />}
                                        </span>
                                        <span className="text-sm">{opt.text}</span>
                                    </span>
                                </label>
                            );
                        })}
                    </fieldset>

                    {/* Email input if not provided */}
                    {!userEmail && !isExpired && (
                        <div className="mt-3">
                            <label htmlFor={`poll-${poll.id}-email`} className="sr-only">Email address for voting</label>
                            <input
                                id={`poll-${poll.id}-email`}
                                name={`poll-${poll.id}-email`}
                                type="email"
                                autoComplete="email"
                                placeholder="Your email to vote"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="input w-full"
                            />
                        </div>
                    )}

                    {/* Vote / View Results buttons */}
                    <div className="flex gap-2 mt-4">
                        {!isExpired && (
                            <button
                                type="button"
                                onClick={handleVote}
                                disabled={voting || selectedOptions.length === 0}
                                className="btn btn-primary flex-1"
                            >
                                {voting ? 'Voting...' : allowMultiple ? 'Submit votes' : 'Vote'}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={fetchResults}
                            className="btn btn-secondary flex-1"
                        >
                            <BarChart size={16} />
                            View Results
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
