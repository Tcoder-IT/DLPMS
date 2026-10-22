// Shared UI primitives for the citizen PWA. Tailwind provides the styling;
// these components wrap the common patterns (Button variants, Input, Card,
// Badge, Spinner, EmptyState, ErrorBanner) so the page components stay
// focused on layout and behavior.

import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

export function Button({ variant = 'primary', size = 'md', className, children, ...rest }) {
  const variants = {
    primary: 'bg-blue-700 text-white hover:bg-blue-800 disabled:bg-blue-300',
    secondary: 'bg-white text-blue-700 border border-blue-700 hover:bg-blue-50 disabled:opacity-50',
    danger: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-red-300',
    ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 disabled:opacity-50',
    success: 'bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-emerald-300'
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed',
        variants[variant], sizes[size], className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Input({ label, error, hint, className, id, ...rest }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>}
      <input
        id={id}
        className={clsx(
          'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
          error && 'border-red-500',
          className
        )}
        {...rest}
      />
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Card({ className, children }) {
  return (
    <div className={clsx('rounded-lg border border-slate-200 bg-white p-5 shadow-sm', className)}>
      {children}
    </div>
  );
}

export function Badge({ tone = 'slate', children }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    blue: 'bg-blue-100 text-blue-800',
    green: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-800',
    purple: 'bg-purple-100 text-purple-800'
  };
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone])}>
      {children}
    </span>
  );
}

export function Spinner({ size = 24, className }) {
  return <Loader2 size={size} className={clsx('animate-spin text-slate-400', className)} />;
}

export function EmptyState({ title, description, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <p className="text-base font-medium text-slate-700">{title}</p>
      {description && <p className="text-sm text-slate-500">{description}</p>}
      {children}
    </div>
  );
}

export function ErrorBanner({ error, onDismiss }) {
  if (!error) return null;
  const message = typeof error === 'string' ? error : (error.message ?? 'Something went wrong');
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <span>{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-red-500 hover:text-red-700">✕</button>
      )}
    </div>
  );
}

export function Field({ label, children, hint, error }) {
  return (
    <div>
      {label && <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
