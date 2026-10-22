// Parcel detail — shows metadata + ownership history + tax records.

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRightLeft, FileText } from 'lucide-react';
import { api } from '../lib/apiClient.js';
import { Card, Spinner, Badge, Button, EmptyState } from '../components/ui.jsx';
import { fmtMoney, fmtDateOnly } from '../lib/format.js';

export default function ParcelDetailPage() {
  const { id } = useParams();
  const [parcel, setParcel] = useState(null);
  const [history, setHistory] = useState(null);
  const [taxRecords, setTaxRecords] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get(`/parcels/${id}`).catch((e) => { setError(e); return null; }),
      api.get(`/parcels/${id}/ownership-history`).catch(() => null),
      api.get(`/parcels/${id}/tax-records`).catch(() => null)
    ]).then(([p, h, t]) => {
      setParcel(p);
      setHistory(h);
      setTaxRecords(t);
    });
  }, [id]);

  if (error) return <Card><p className="text-sm text-red-700">{error.message}</p></Card>;
  if (!parcel) return <div className="flex justify-center py-16"><Spinner size={32} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{parcel.parcelNumber}</h1>
        <Link to={`/transfers/new?parcelId=${id}`}>
          <Button variant="secondary" size="sm">
            <ArrowRightLeft size={14} /> Start transfer
          </Button>
        </Link>
      </div>

      <Card>
        <h2 className="font-semibold text-slate-900">Parcel details</h2>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Field label="Sub-city" value={parcel.subCity} />
          <Field label="Kebele" value={parcel.kebele} />
          <Field label="Location" value={parcel.location} />
          <Field label="Declared size" value={`${fmtMoney(parcel.declaredSize)} ${parcel.sizeUnit}`} />
          <Field label="Land use" value={parcel.landUseType} />
          <Field label="Boundary status" value={
            <Badge tone={parcel.boundaryStatus === 'Verified' ? 'green' : 'amber'}>
              {parcel.boundaryStatus}
            </Badge>
          } />
        </dl>
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">Current owner</h2>
        {parcel.currentOwner ? (
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <Field label="Name" value={parcel.currentOwner.fullName} />
            <Field label="National ID" value={parcel.currentOwner.nationalId} />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No current owner linked.</p>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">Ownership history</h2>
        {!history || history.history.length === 0 ? (
          <EmptyState title="No history yet" />
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {history.history.map((h) => (
              <li key={h.id} className="py-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{h.owner.fullName}</p>
                    <p className="text-xs text-slate-500">
                      {h.acquisitionMethod} · acquired {fmtDateOnly(h.acquiredAt)}
                    </p>
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
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Tax records</h2>
          <Link to="/transfers"><Button variant="ghost" size="sm"><FileText size={14} /> Pay</Button></Link>
        </div>
        {!taxRecords || taxRecords.items.length === 0 ? (
          <EmptyState title="No tax records yet"
            description="A tax official will calculate your annual tax; it will appear here." />
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {taxRecords.items.map((r) => (
              <li key={r.id} className="py-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">Tax year {r.taxYear}</p>
                    <p className="text-xs text-slate-500">
                      Due {fmtMoney(r.calculatedAmount)} · paid {fmtMoney(r.paidAmount)}
                    </p>
                  </div>
                  <Badge tone={r.status === 'Paid' ? 'green' : r.holdActive ? 'red' : 'amber'}>
                    {r.status}
                  </Badge>
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
