import { useCallback, useRef, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';

const DEFAULT_OPTIONS = {
  title: 'Confirm action',
  message: 'Are you sure you want to continue?',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  tone: 'danger',
};

export default function useConfirmDialog() {
  const [dialogOptions, setDialogOptions] = useState(null);
  const resolveRef = useRef(null);

  const closeDialog = useCallback((confirmed) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setDialogOptions(null);
    resolve?.(confirmed);
  }, []);

  const confirm = useCallback((options = {}) => {
    if (resolveRef.current) {
      resolveRef.current(false);
    }

    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialogOptions({ ...DEFAULT_OPTIONS, ...options });
    });
  }, []);

  const dialog = dialogOptions ? (
    <ConfirmDialog
      {...dialogOptions}
      onCancel={() => closeDialog(false)}
      onConfirm={() => closeDialog(true)}
    />
  ) : null;

  return { confirm, dialog };
}
