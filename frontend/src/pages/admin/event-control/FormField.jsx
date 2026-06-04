export default function FormField({ label, children, className = '', helpText }) {
    return (
        <label className={`block ${className}`}>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">{label}</span>
            {children}
            {helpText && <span className="mt-1 block text-xs leading-relaxed text-gray-500">{helpText}</span>}
        </label>
    );
}
