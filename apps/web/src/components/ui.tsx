import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

const buttonVariants = {
  primary: 'border-sage bg-sage text-white hover:bg-forest-light',
  secondary: 'border-line bg-card text-ink hover:bg-paper',
  light: 'border-gold bg-gold text-forest hover:bg-amber-100',
  dark: 'border-sage/60 bg-forest-light text-paper hover:bg-sage/40',
  subtle: 'border-transparent bg-transparent text-sage hover:bg-sage/10',
};
export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof buttonVariants }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-xs font-medium transition-colors disabled:opacity-45 ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-line bg-card p-6 ${className}`}>
      {children}
    </section>
  );
}
export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <label className="grid content-start gap-2 text-xs text-ink">
      <span id={id + '-label'} className="font-medium">
        {label}
      </span>
      <input
        aria-labelledby={id + '-label'}
        aria-describedby={hint ? id + '-hint' : undefined}
        className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm disabled:bg-paper disabled:text-muted"
        {...props}
      />
      {hint && (
        <span id={id + '-hint'} className="text-[11px] leading-relaxed text-muted">
          {hint}
        </span>
      )}
    </label>
  );
}
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center text-muted">
      <h3 className="mb-3 font-display text-2xl text-ink">{title}</h3>
      <div className="text-xs leading-relaxed">{children}</div>
    </div>
  );
}
