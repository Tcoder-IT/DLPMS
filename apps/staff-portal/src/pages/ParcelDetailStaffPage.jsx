// Staff portal parcel detail page — LandOfficer/SystemAdmin view of a parcel
// with boundary status, ownership history, tax records, and certificate.
// Lets the officer verify the boundary, see who owns the parcel, and
// navigate to related transfers.

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Globe } from 'lucide-react';
import { api } from '../lib/apiClient.js';
import { Card, Spinner, Badge, EmptyState, Button } from '../components/ui.jsx';
import { fmtMoney, fmtDateOnly, boundaryStatus } from '../lib/format.js';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function ParcelDetailStaffPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [parcel, setParcel] = useState(null);
  const [history, setHistory] = useState(null);
  const [taxRecords, setTaxRecords] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    try {
      const [p, h, t] = await Promise.all([
        api.get(`/parcels/${id}`),
        api.get(`/parcels/${id}/ownership-history`).catch(() => null),
        api.get(`/parcels/${id}/tax-records`).catch(() => null)
      ]);
      setParcel(p);
      setHistory(h);
      setTaxRecords(t);
      setError(null);
    } catch (e) { setError(e); }
  }
  useEffect(() => { load(); }, [id]);

  if (!user || !['LandOfficer', 'SystemAdmin'].includes(user.role)) {
    return <Card><p className="text-sm text-red-700">You do not have access to this page.</p></Card>;
  }
  if (error) return <Card><p className="text-sm text-red-700">{error.message}</p></Card>;
  if (!parcel) return <div className="flex justify-center py-16"><Spinner size={32} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg text-slate-900">{parcel.parcelNumber}</h1>
          <p className="text-xs text-slate-500">v{parcel.version} · {parcel.subCity}/{parcel.kebele}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={
            parcel.boundaryStatus === 'Verified' ? 'green' :
            parcel.boundaryStatus === 'OverlapConflict' ? 'red' : 'amber'
          }>
            {boundaryStatus(parcel.boundaryStatus)}
          </Badge>
          <Link to="/gis">
            <Button size="sm" variant="secondary"><Globe size={14} /> Open in GIS</Button>
          </Link>
        </div>
      </div>

      <Card>
        <h2 className="font-semibold text-slate-900">Parcel details</h2>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Field label="Sub-city" value={parcel.subCity} />
          <Field label="Kebele" value={parcel.kebele} />
          <Field label="Location" value={parcel.location} />
          <Field label="Declared size" value={`${fmtMoney(parcel.declaredSize)} ${parcel.sizeUnit}`} />
          <Field label="Land use" value={parcel.landUseType} />
          <Field label="Created" value={fmtDateOnly(parcel.createdAt)} />
        </dl>
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">Current owner</h2>
        {parcel.currentOwner ? (
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <Field label="Name" value={parcel.currentOwner.fullName} />
            <Field label="National ID" value={parcel.currentOwner.nationalId} />
          </dl>
        ) : <p className="mt-2 text-sm text-slate-500">No current owner linked.</p>}
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">Ownership history</h2>
        {!history || history.history.length === 0 ? (
          <EmptyState title="No history" />
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {history.history.map((h) => (
              <li key={h.id} className="py-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{h.owner.fullName}</p>
                    <p className="text-xs text-slate-500">{h.acquisitionMethod} · acquired {fmtDateOnly(h.acquiredAt)}</p>
                  </div>
                  <Badge tone={h.endedAt ? 'slate' : 'green'}>
                    {h.endedAt ? 'Past' : 'Current'}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">Tax records</h2>
        {!taxRecords || taxRecords.items.length === 0 ? (
          <EmptyState title="No tax records"
            description="A Tax Official can calculate tax for this parcel from the Tax dashboard." />
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {taxRecords.items.map((r) => (
              <li key={r.id} className="py-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">Tax year {r.taxYear}</p>
                    <p className="text-xs text-slate-500">
                      Due {fmtMoney(r.calculatedAmount)} · paid {fmtMoney(r.paidAmount)} · credit {fmtMoney(r.creditBalance)}
                    </p>
                  </div>
                  <Badge tone={r.holdActive ? 'red' : r.status === 'Paid' ? 'green' : 'amber'}>{r.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{value ?? '—'}</dd>
    </div>
  );
}
