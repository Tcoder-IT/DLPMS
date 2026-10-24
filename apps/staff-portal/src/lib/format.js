// Shared formatters for the citizen PWA.

import { useTranslation } from 'react-i18next';

export function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function fmtDateOnly(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtMoney(value, currency = 'ETB') {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

// Hook for translating status enum values. Returns a function that takes a
// status string and returns the translated label. Falls back to the raw
// status if no translation exists.
export function useStatusTranslator() {
  const { t } = useTranslation();
  return (status) => {
    if (!status) return '—';
    // Boundary uses the same 'Rejected' label but in a boundary context.
    // We use the same key; if a future milestone needs a distinct label
    // we can add a key prefix.
    const key = `status.${status}`;
    const translated = t(key);
    return translated === key ? status : translated;
  };
}

// Convert the transfer status enum (CamelCase from the API) to a human label.
// Deprecated — prefer useStatusTranslator() in component bodies. Kept for
// cases where the page renders a static list before the i18n context is
// available.
const TRANSFER_LABELS = {
  Draft: 'Draft',
  Submitted: 'Submitted',
  TaxVerified: 'Tax verified',
  TaxHold: 'Tax hold',
  UnderReview: 'Under review',
  DocumentsRequested: 'Documents requested',
  Approved: 'Approved',
  Rejected: 'Rejected',
  Cancelled: 'Cancelled'
};

export function transferStatus(label) {
  return TRANSFER_LABELS[label] ?? label;
}

const BOUNDARY_LABELS = {
  Pending: 'Pending',
  Verified: 'Verified',
  OverlapConflict: 'Overlap conflict',
  Rejected: 'Rejected'
};

export function boundaryStatus(label) {
  return BOUNDARY_LABELS[label] ?? label;
}
