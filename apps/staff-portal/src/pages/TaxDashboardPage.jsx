// Tax dashboard + arrears (TaxOfficial/SystemAdmin only).

import { useEffect, useState } from 'react';
import { api } from '../lib/apiClient.js';
import { Card, Spinner, Badge, EmptyState } from '../components/ui.jsx';
import { fmtMoney } from '../lib/format.js';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function TaxDashboardPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [arrears, setArrears] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/tax/dashboard').catch((e) => { setError(e); return null; }),
      api.get('/tax/arrears').catch(() => null)
    ]).then(([d, a]) => {
      setDashboard(d);
      setArrears(a);
    });
  }, []);

  if (!user || !['TaxOfficial', 'SystemAdmin'].includes(user.role)) {
    return <Card><p className="text-sm text-red-700">You do not have access to this page.</p></Card>;
  }
  if (error) return <Card><p className="text-sm text-red-700">{error.message}</p></Card>;
  if (!dashboard) return <div className="flex justify-center py-16"><Spinner size={32} /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Tax dashboard</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-500">Tax year</p>
          <p className="text-2xl font-bold text-slate-900">{dashboard.taxYear}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-500">Total records</p>
          <p className="text-2xl font-bold text-slate-900">{dashboard.summary.totalRecords}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-500">Collected</p>
          <p className="text-2xl font-bold text-emerald-700">{fmtMoney(dashboard.summary.collected)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-500">Outstanding</p>
          <p className="text-2xl font-bold text-amber-700">{fmtMoney(dashboard.summary.outstanding)}</p>
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold text-slate-900">Parcels with active tax holds</h2>
        {!arrears || arrears.items.length === 0 ? (
          <EmptyState title="No arrears" description="No parcels currently have a tax hold." />
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {arrears.items.map((r) => (
              <li key={r.id} className="py-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{r.parcel?.parcelNumber}</p>
                    <p className="text-xs text-slate-500">
                      {r.parcel?.subCity}, {r.parcel?.kebele} · owner {r.parcel?.owner?.fullName ?? '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-900">{fmtMoney(r.calculatedAmount - r.paidAmount)} owed</p>
                    <Badge tone="red">{r.status}</Badge>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
