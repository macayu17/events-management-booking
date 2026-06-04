import { useId, useRef } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import Modal from './Modal';

const TONE_STYLES = {
  danger: {
    icon: 'border-red-500/25 bg-red-500/10 text-red-300',
    button: 'bg-red-500 text-white hover:bg-red-400 focus-visible:ring-red-400',
  },
  warning: {
    icon: 'border-amber-500/25 bg-amber-500/10 text-amber-200',
    button: 'bg-amber-400 text-[#17110d] hover:bg-amber-300 focus-visible:ring-amber-300',
  },
  info: {
    icon: 'border-blue-500/25 bg-blue-500/10 text-blue-200',
    button: 'bg-[#f2e7d8] text-[#17110d] hover:bg-white focus-visible:ring-[#f2e7d8]',
  },
};

export default function ConfirmDialog({
  title = 'Confirm action',
  message = 'Are you sure you want to continue?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onCancel,
}) {
  const titleId = useId();
  const messageId = useId();
  const cancelButtonRef = useRef(null);
  const styles = TONE_STYLES[tone] || TONE_STYLES.danger;
  const Icon = tone === 'info' ? Info : AlertTriangle;

  return (
    <Modal
      ariaLabelledby={titleId}
      ariaDescribedby={messageId}
      initialFocusRef={cancelButtonRef}
      closeOnBackdrop
      onClose={onCancel}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      panelClassName="w-full max-w-md rounded-[1.5rem] border border-[#f2e7d8]/14 bg-[#14110f] shadow-[0_30px_100px_rgba(0,0,0,0.55)]"
    >
      <div className="flex items-start gap-4 border-b border-white/10 p-5">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${styles.icon}`}>
          <Icon size={22} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-lg font-black leading-tight text-[#f7efe3]">
            {title}
          </h2>
          <p id={messageId} className="mt-2 text-sm leading-6 text-[#b9afa4]">
            {message}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full p-2 text-[#8f867d] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744]"
          aria-label="Close confirmation dialog"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex flex-col-reverse gap-3 p-5 sm:flex-row sm:justify-end">
        <button
          type="button"
          ref={cancelButtonRef}
          onClick={onCancel}
          className="btn btn-ghost w-full sm:w-auto"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`inline-flex w-full items-center justify-center rounded-full px-5 py-2.5 text-sm font-bold transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#14110f] sm:w-auto ${styles.button}`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
