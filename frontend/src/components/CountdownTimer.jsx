import { useState, useEffect } from 'react';

function getTimeLeft(targetDate) {
    const targetTime = new Date(targetDate).getTime();

    if (!targetDate || Number.isNaN(targetTime)) {
        return null;
    }

    const difference = targetTime - Date.now();

    if (difference <= 0) {
        return null;
    }

    return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60)
    };
}

export default function CountdownTimer({ targetDate, label = 'Registration closes in' }) {
    const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(targetDate));

    useEffect(() => {
        setTimeLeft(getTimeLeft(targetDate));

        const timer = setInterval(() => {
            setTimeLeft(getTimeLeft(targetDate));
        }, 1000);

        return () => clearInterval(timer);
    }, [targetDate]);

    if (!timeLeft) {
        return (
            <div className="rounded-2xl border border-[#E23744]/20 bg-[#E23744]/10 p-4 text-center">
                <span className="text-sm font-black text-[#ffb3b8]">Registration closed</span>
            </div>
        );
    }

    const isUrgent = timeLeft.days === 0 && timeLeft.hours < 24;
    const units = [
        ...(timeLeft.days > 0 ? [{ label: 'days', value: timeLeft.days }] : []),
        { label: 'hours', value: String(timeLeft.hours).padStart(2, '0') },
        { label: 'min', value: String(timeLeft.minutes).padStart(2, '0') },
        { label: 'sec', value: String(timeLeft.seconds).padStart(2, '0') }
    ];

    return (
        <div className={`rounded-2xl border p-4 ${isUrgent ? 'border-[#E23744]/25 bg-[#E23744]/10' : 'border-white/10 bg-white/[0.035]'}`}>
            <p className={`mb-3 text-center text-xs font-black uppercase tracking-[0.18em] ${isUrgent ? 'text-[#ffb3b8]' : 'text-[#8f867d]'}`}>
                {label}
            </p>
            <div className={`grid gap-2 ${units.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                {units.map((unit) => (
                    <div key={unit.label} className="min-w-0 rounded-xl border border-white/10 bg-[#09090b]/45 px-2 py-3 text-center">
                        <div className={`font-mono text-2xl font-black leading-none tabular-nums tracking-normal ${isUrgent ? 'text-[#ffb3b8]' : 'text-[#f7efe3]'}`}>
                            {unit.value}
                        </div>
                        <div className="mt-1 truncate text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#716960]">
                            {unit.label}
                        </div>
                    </div>
                ))}
            </div>
            {isUrgent && (
                <p className="mt-3 text-center text-xs font-bold text-[#ffb3b8]">
                    Limited time remaining
                </p>
            )}
        </div>
    );
}
