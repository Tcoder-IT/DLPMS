// Appointments list + book flow. The booking form requires an officer ID
// (the citizen enters it as text — a future milestone would replace this
// with a searchable officer picker).

import { useEffect, useState } from 'react';
import { api } from '../lib/apiClient.js';
import { Card, Spinner, EmptyState, Badge, Button, Input, ErrorBanner } from '../components/ui.jsx';
import { fmtDate } from '../lib/format.js';

const STATUS_TONES = {
  Scheduled: 'blue',
  Completed: 'green',
  Cancelled: 'slate',
  NoShow: 'red'
};

export default function AppointmentsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    officerId: '',
    serviceType: 'transfer_consultation',
    scheduledAt: '',
    purpose: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);

  async function load() {
    try {
      const d = await api.get('/appointments');
      setData(d);
      setError(null);
    } catch (e) { setError(e); }
  }
  useEffect(() => { load(); }, []);

  async function handleBook(e) {
    e.preventDefault();
    setActionError(null);
    setSubmitting(true);
    try {
      await api.post('/appointments', {
        ...form,
        scheduledAt: new Date(form.scheduledAt).toISOString()
      });
      setShowForm(false);
      setForm({ officerId: '', serviceType: 'transfer_consultation', scheduledAt: '', purpose: '' });
      await load();
    } catch (err) {
      setActionError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return <Card><p className="text-sm text-red-700">{error.message}</p></Card>;
  if (!data) return <div className="flex justify-center py-16"><Spinner size={32} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : 'Book appointment'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleBook} className="space-y-4">
            {actionError && <ErrorBanner error={actionError} onDismiss={() => setActionError(null)} />}
            <Input
              label="Land officer user ID"
              required
              placeholder="00000000-0000-0000-0000-000000000000"
              value={form.officerId}
              onChange={(e) => setForm({ ...form, officerId: e.target.value })}
              hint="The officer's user ID. Ask your land officer for this UUID."
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Service type</label>
              <select
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={form.serviceType}
                onChange={(e) => setForm({ ...form, serviceType: e.target.value })}
              >
                <option value="transfer_consultation">Transfer consultation</option>
                <option value="document_verification">Document verification</option>
                <option value="property_assessment">Property assessment review</option>
              </select>
            </div>
            <Input
              label="Scheduled at"
              type="datetime-local"
              required
              value={form.scheduledAt}
              onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
            />
            <Input
              label="Purpose (optional)"
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            />
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Booking…' : 'Confirm booking'}
            </Button>
          </form>
        </Card>
      )}

      {data.items.length === 0 ? (
        <EmptyState title="No appointments yet"
          description="Book an in-person appointment with a land officer for verification or consultation." />
      ) : (
        <ul className="space-y-3">
          {data.items.map((a) => (
            <li key={a.id}>
              <Card>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{a.serviceType}</p>
                    <p className="text-sm text-slate-600">{fmtDate(a.scheduledAt)}</p>
                    {a.purpose && <p className="mt-1 text-xs text-slate-500">{a.purpose}</p>}
                    {a.cancellationReason && (
                      <p className="mt-1 text-xs text-red-700">Cancelled: {a.cancellationReason}</p>
                    )}
                  </div>
                  <Badge tone={STATUS_TONES[a.status] ?? 'slate'}>{a.status}</Badge>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
