import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let openModalCount = 0;
let previousBodyOverflow = '';
let previousRootAriaHidden = null;
let previousRootInert = false;

const getFocusableElements = (element) => {
  if (!element) return [];
  return Array.from(element.querySelectorAll(FOCUSABLE_SELECTOR)).filter((node) => {
    const style = window.getComputedStyle(node);
    return style.visibility !== 'hidden' && style.display !== 'none';
  });
};

export default function Modal({
  children,
  className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm',
  panelClassName = '',
  ariaLabelledby,
  ariaDescribedby,
  initialFocusRef,
  closeOnBackdrop = false,
  closeOnEscape = true,
  onClose,
}) {
  const panelRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    const appRoot = document.getElementById('root');

    previousFocusRef.current = document.activeElement;

    const panel = panelRef.current;
    const focusTarget = initialFocusRef?.current || getFocusableElements(panel)[0] || panel;
    focusTarget?.focus?.();

    if (openModalCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      previousRootAriaHidden = appRoot?.getAttribute('aria-hidden') ?? null;
      previousRootInert = Boolean(appRoot?.inert);
      document.body.style.overflow = 'hidden';
      appRoot?.setAttribute('aria-hidden', 'true');
      if (appRoot && 'inert' in appRoot) appRoot.inert = true;
    }

    openModalCount += 1;

    return () => {
      openModalCount = Math.max(0, openModalCount - 1);

      if (openModalCount === 0) {
        document.body.style.overflow = previousBodyOverflow;
        if (appRoot) {
          if (previousRootAriaHidden === null) {
            appRoot.removeAttribute('aria-hidden');
          } else {
            appRoot.setAttribute('aria-hidden', previousRootAriaHidden);
          }
          if ('inert' in appRoot) appRoot.inert = previousRootInert;
        }
      }

      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus?.();
      }
    };
  }, [initialFocusRef]);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape' && closeOnEscape) {
      event.preventDefault();
      onClose?.();
      return;
    }

    if (event.key !== 'Tab') return;

    const panel = panelRef.current;
    const focusableElements = getFocusableElements(panel);

    if (focusableElements.length === 0) {
      event.preventDefault();
      panel?.focus?.();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return createPortal(
    <div
      className={className}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={panelClassName}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
