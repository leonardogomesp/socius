import { useEffect, useRef } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { ActionRequest } from '@valheim/contracts';
import { Button } from './ui';

export interface Confirmation {
  title: string;
  description: string;
  label: string;
  request?: ActionRequest;
}
interface Props {
  confirmation: Confirmation;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}
export function ConfirmDialog({ confirmation, busy, onCancel, onConfirm }: Props) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelButton.current?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-forest/70 p-8 backdrop-blur-sm">
      <div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
        className="w-full max-w-lg rounded-xl border border-line bg-card p-8 shadow-2xl"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) onCancel();
          if (event.key !== 'Tab') return;
          const elements =
            panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
          if (!elements?.length) return;
          const first = elements[0];
          const last = elements[elements.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <ShieldCheck size={30} className="text-sage" />
        <h2 id="confirm-title" className="mt-5 font-display text-2xl">
          {confirmation.title}
        </h2>
        <p id="confirm-description" className="mt-4 text-sm leading-7 text-muted">
          {confirmation.description}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelButton}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-md border border-line px-4 py-2.5 text-xs disabled:opacity-45"
          >
            Cancelar
          </button>
          <Button variant="primary" disabled={busy} onClick={onConfirm}>
            {confirmation.label}
          </Button>
        </div>
      </div>
    </div>
  );
}
