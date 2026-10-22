// Parcels admin — list + create form (LandOfficer/SystemAdmin only).

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../lib/apiClient.js';
import { Card, Spinner, EmptyState, Badge, Button, Input, ErrorBanner } from '../components/ui.jsx';
import { fmtMoney, boundaryStatus } from '../lib/format.js';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function ParcelsAdminPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    parcelNumber: '',
    currentOwnerNationalId: '',
    subCity: '',
    kebele: '',
    location: '',
    declaredSize: '',
    landUseType: 'residential'
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  async function load() {
    try { setData(await api.get('/parcels?pageSize=50')); setError(null); }
    catch (e) { setError(e); }
  }
  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await api.post('/parcels', {
        ...form,
        declaredSize: Number(form.declaredSize)
      });
      setForm({
        parcelNumber: '', currentOwnerNationalId: '', subCity: '', kebele: '',
        location: '', declaredSize: '', landUseType: 'residential'
      });
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!user || !['LandOfficer', 'SystemAdmin'].includes(user.role)) {
    return <Card><p className="text-sm text-red-700">You do not have access to this page.</p></Card>;
  }
  if (error) return <Card><p className="text-sm text-red-700">{error.message}</p></Card>;
  if (!data) return <div className="flex justify-center py-16"><Spinner size={32} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Parcels</h1>
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : <><Plus size={14} /> New parcel</>}
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleCreate} className="space-y-4">
            {formError && <ErrorBanner error={formError} onDismiss={() => setFormError(null)} />}
            <Input label="Parcel number" required value={form.parcelNumber} onChange={(e) => setForm({ ...form, parcelNumber: e.target.value })} placeholder="DDW-00123" />
            <Input label="Owner national ID" required value={form.currentOwnerNationalId} onChange={(e) => setForm({ ...form, currentOwnerNationalId: e.target.value })} hint="The owner must already have a registered owner profile." />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Sub-city" required value={form.subCity} onChange={(e) => setForm({ ...form, subCity: e.target.value })} />
              <Input label="Kebele" required value={form.kebele} onChange={(e) => setForm({ ...form, kebele: e.target.value })} />
            </div>
            <Input label="Location" required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Declared size (sqm)" type="number" min="0" step="0.01" required value={form.declaredSize} onChange={(e) => setForm({ ...form, declaredSize: e.target.value })} />
              <Input label="Land use" required value={form.landUseType} onChange={(e) => setForm({ ...form, landUseType: e.target.value })} />
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Creating…' : 'Register parcel'}
            </Button>
          </form>
        </Card>
      )}

      {data.items.length === 0 ? (
        <EmptyState title="No parcels yet" description="Register the first parcel using the button above." />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">Parcel</th>
                <th className="py-2 pr-3">Location</th>
                <th className="py-2 pr-3">Owner</th>
                <th className="py-2 pr-3">Size</th>
                <th className="py-2 pr-3">Boundary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 pr-3 font-mono"><Link to={`/parcels/${p.id}`} className="text-blue-700 hover:underline">{p.parcelNumber}</Link></td>
                  <td className="py-2 pr-3">{p.subCity}/{p.kebele}</td>
                  <td className="py-2 pr-3">{p.currentOwner?.fullName ?? '—'}</td>
                  <td className="py-2 pr-3">{fmtMoney(p.declaredSize)} {p.sizeUnit}</td>
                  <td className="py-2 pr-3">
                    <Badge tone={p.boundaryStatus === 'Verified' ? 'green' : 'amber'}>
                      {boundaryStatus(p.boundaryStatus)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
