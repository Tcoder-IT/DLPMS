// Create a transfer draft. Pre-fills parcelId from query string when the
// citizen navigates from a parcel detail page.

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/apiClient.js';
import { Button, Input, Card, ErrorBanner } from '../components/ui.jsx';
import { fmtMoney } from '../lib/format.js';

export default function TransferCreatePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const parcelIdFromQuery = params.get('parcelId');

  const [parcels, setParcels] = useState(null);
  const [form, setForm] = useState({
    parcelId: parcelIdFromQuery ?? '',
    buyerOwnerId: '',
    salePrice: '',
    buyerSnapshot: {}
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/parcels').then(setParcels).catch(setError);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        parcelId: form.parcelId,
        buyerOwnerId: form.buyerOwnerId,
        salePrice: Number(form.salePrice),
        buyerSnapshot: form.buyerSnapshot || {}
      };
      const created = await api.post('/transfers', payload);
      navigate(`/transfers/${created.id}`, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  const selectedParcel = parcels?.items?.find((p) => p.id === form.parcelId);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Start a transfer</h1>
      <p className="text-sm text-slate-600">
        Select a parcel you own, enter the buyer's owner profile ID, and set a
        sale price. The transfer is created in <code>Draft</code> status — submit
        it from the transfer detail page when you are ready.
      </p>
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Parcel</label>
            {!parcels ? (
              <p className="text-sm text-slate-500">Loading parcels…</p>
            ) : parcels.items.length === 0 ? (
              <p className="text-sm text-red-700">You do not own any parcels.</p>
            ) : (
              <select
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={form.parcelId}
                onChange={(e) => setForm({ ...form, parcelId: e.target.value })}
                required
              >
                <option value="">Select a parcel…</option>
                {parcels.items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.parcelNumber} — {p.subCity}/{p.kebele} ({fmtMoney(p.declaredSize)} {p.sizeUnit})
                  </option>
                ))}
              </select>
            )}
            {selectedParcel && (
              <p className="mt-1 text-xs text-slate-500">
                Current owner: {selectedParcel.currentOwner?.fullName ?? '—'}
              </p>
            )}
          </div>
          <Input
            label="Buyer owner profile ID"
            required
            placeholder="00000000-0000-0000-0000-000000000000"
            value={form.buyerOwnerId}
            onChange={(e) => setForm({ ...form, buyerOwnerId: e.target.value })}
            hint="The buyer must already have a registered citizen account with an owner profile."
          />
          <Input
            label="Sale price (ETB)"
            type="number"
            min="1"
            step="0.01"
            required
            value={form.salePrice}
            onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
          />
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Creating…' : 'Create draft transfer'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
