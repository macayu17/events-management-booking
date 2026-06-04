import { AlertCircle, Loader2, Search } from 'lucide-react';

const icons = {
  loading: Loader2,
  empty: Search,
  error: AlertCircle
};

export function StateBlock({
  type = 'empty',
  title,
  message,
  action,
  fullPage = false,
  className = ''
}) {
  const Icon = icons[type] || Search;
  const liveMode = type === 'error' ? 'assertive' : 'polite';

  return (
    <div
      className={`${fullPage ? 'min-h-screen' : 'min-h-[52vh]'} flex items-center justify-center px-4 ${className}`}
      aria-live={liveMode}
      role={type === 'error' ? 'alert' : 'status'}
    >
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#12100e]/85 p-8 text-center shadow-[0_24px_90px_rgba(0,0,0,0.32)] backdrop-blur-2xl">
        <div className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border ${type === 'error' ? 'border-red-500/20 bg-red-500/10 text-red-300' : 'border-[#E23744]/25 bg-[#E23744]/10 text-[#ff6c76]'}`}>
          <Icon className={type === 'loading' ? 'animate-spin' : ''} size={24} />
        </div>
        <h2 className="text-xl font-black tracking-tight text-[#f7efe3]">{title}</h2>
        {message && <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-[#aaa096]">{message}</p>}
        {action && <div className="mt-6 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

export function LoadingBlock({ title = 'Loading', message = 'Preparing your workspace.', fullPage = false }) {
  return <StateBlock type="loading" title={title} message={message} fullPage={fullPage} />;
}

export function EmptyState({ title = 'Nothing here yet', message, action }) {
  return <StateBlock type="empty" title={title} message={message} action={action} />;
}

export function ErrorState({ title = 'Something went wrong', message, action }) {
  return <StateBlock type="error" title={title} message={message} action={action} />;
}
