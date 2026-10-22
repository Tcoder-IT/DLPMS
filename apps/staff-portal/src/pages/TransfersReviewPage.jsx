// Transfers review — list + decision modal (approve/reject/request-docs).
// LandOfficer/SystemAdmin only.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/apiClient.js';
import { Card, Spinner, EmptyState, Badge } from '../components/ui.jsx';
import { fmtMoney, fmtDate, transferStatus } from '../lib/format.js';
import { useAuth } from '../contexts/AuthContext.jsx';

const STATUS_TONES = {
  Draft: 'slate',
  Submitted: 'blue',
  TaxVerified: 'blue',
  TaxHold: 'red',
  UnderReview: 'amber',
  DocumentsRequested: 'amber',
  Approved: 'green',
  Rejected: 'red',
  Cancelled: 'slate'
};

export default function TransfersReviewPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    try { setData(await api.get('/transfers?pageSize=50')); setError(null); }
    catch (e) { setError(e); }
  }
  useEffect(() => { load(); }, []);

  if (!user || !['LandOfficer', 'SystemAdmin'].includes(user.role)) {
    return <Card><p className="text-sm text-red-700">You do not have access to this page.</p></Card>;
  }
  if (error) return <Card><p className="text-sm text-red-700">{error.message}</p></Card>;
  if (!data) return <div className="flex justify-center py-16"><Spinner size={32} /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Transfer requests</h1>
      <p className="text-sm text-slate-600">
        Open any transfer to review documents, request more, or approve/reject.
      </p>
      {data.items.length === 0 ? (
        <EmptyState title="No transfer requests yet" />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">Tracking ID</th>
                <th className="py-2 pr-3">Parcel</th>
                <th className="py-2 pr-3">Seller</th>
                <th className="py-2 pr-3">Buyer</th>
                <th className="py-2 pr-3">Price</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((t) => (
                <tr key={t.id}>
                  <td className="py-2 pr-3 font-mono">
                    <Link to={`/transfers/${t.id}`} className="text-blue-700 hover:underline">{t.trackingId}</Link>
                  </td>
                  <td className="py-2 pr-3">{t.parcel?.parcelNumber ?? t.parcelId.slice(0, 8)}</td>
                  <td className="py-2 pr-3">{t.seller?.fullName ?? '—'}</td>
                  <td className="py-2 pr-3">{t.buyer?.fullName ?? '—'}</td>
                  <td className="py-2 pr-3">{fmtMoney(t.salePrice)}</td>
                  <td className="py-2 pr-3">
                    <Badge tone={STATUS_TONES[t.status] ?? 'slate'}>{transferStatus(t.status)}</Badge>
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-500">{t.submittedAt ? fmtDate(t.submittedAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
