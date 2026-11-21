import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { errorMessage } from '../data/errors.ts';

export function Loading({ label = 'Loading' }: { label?: string }) {
  return <div className="state"><div className="spinner" role="status" aria-label={label} /></div>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="banner banner-error" role="alert">
      <span style={{ flex: 1 }}>{errorMessage(error)}</span>
      {onRetry && <button type="button" className="btn btn-sm btn-ghost" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="state">
      <span className="state-icon"><Icon size={24} aria-hidden="true" /></span>
      <p className="state-title">{title}</p>
      {children}
    </div>
  );
}
