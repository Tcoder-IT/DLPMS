// Citizen PWA Public Search page — FR-10: "Search public land records by
// parcel ID, owner name, or location." Per PROJECT_DECISIONS.md privacy
// deference: the response excludes owner name, national ID, contact info,
// tax records, ownership history, and boundary geometry.
//
// This page is reachable WITHOUT authentication — it's the public-facing
// land-records lookup. If the user is already logged in (e.g. a citizen
// browsing the public records), the page still works.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
// Public search uses raw fetch (not the authed apiClient) so unauthenticated
// visitors can call the public endpoint without triggering a 401.
import { Card, Spinner, EmptyState, Badge, Button, Input, ErrorBanner } from '../components/ui.jsx';
import { fmtDateOnly, fmtMoney, boundaryStatus } from '../lib/format.js';
import { ShieldCheck, LogIn } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export default function PublicSearchPage() {
  const [form, setForm] = useState({ q: '', subCity: '', kebele: '', location: '' });
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const params = new URLSearchParams();
      if (form.q) params.set('q', form.q);
      if (form.subCity) params.set('subCity', form.subCity);
      if (form.kebele) params.set('kebele', form.kebele);
      if (form.location) params.set('location', form.location);
      // Use raw fetch so this works for unauthenticated visitors too.
      const res = await fetch(`${API_BASE}/public/parcels/search?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? 'Search failed');
      }
      setResults(await res.json());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  // Auto-search on first mount with empty filters (returns most recent 20)
  useEffect(() => { handleSearch(); }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Minimal top bar — this page is reachable without auth */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold text-blue-800">
            <ShieldCheck size={20} /> <span>DLPMS — Public Records</span>
          </Link>
          <Link to="/login" className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
            <LogIn size={14} /> Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Public land records</h1>
        <p className="text-sm text-slate-600">
          Search public parcel metadata by parcel number, sub-city, kebele, or
          location. Owner name, national ID, contact information, tax records,
          ownership history, and boundary geometry are NOT exposed through this
          public search per privacy policy.
        </p>

        <Card>
          <form onSubmit={handleSearch} className="space-y-3">
            {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}
            <Input
              label="Free-text search"
              placeholder="e.g. DDW-00123 or 01 Kebele"
              value={form.q}
              onChange={(e) => setForm({ ...form, q: e.target.value })}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input label="Sub-city" value={form.subCity} onChange={(e) => setForm({ ...form, subCity: e.target.value })} />
              <Input label="Kebele" value={form.kebele} onChange={(e) => setForm({ ...form, kebele: e.target.value })} />
              <Input label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? <><Spinner size={14} /> Searching…</> : 'Search'}
            </Button>
          </form>
        </Card>

        {results && (
          <>
            <Card>
              <p className="text-sm text-slate-600">
                {results.total} result{results.total === 1 ? '' : 's'} · page {results.page} of {Math.max(1, Math.ceil(results.total / results.pageSize))} · {results.privacyNotice}
              </p>
            </Card>

            {results.items.length === 0 ? (
              <EmptyState title="No parcels match your search" />
            ) : (
              <ul className="space-y-3">
                {results.items.map((p) => (
                  <li key={p.id}>
                    <Card>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-mono text-sm text-slate-900">{p.parcelNumber}</p>
                          <p className="text-xs text-slate-500">{p.subCity}, {p.kebele} · {p.location}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {fmtMoney(p.declaredSize)} {p.sizeUnit} · {p.landUseType}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">Registered: {fmtDateOnly(p.registeredAt)}</p>
                        </div>
                        <Badge tone={p.boundaryStatus === 'Verified' ? 'green' : 'amber'}>
                          {boundaryStatus(p.boundaryStatus)}
                        </Badge>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
