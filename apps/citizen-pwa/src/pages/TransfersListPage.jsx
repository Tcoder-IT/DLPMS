// Transfers list — shows the citizen's transfers with status badges.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../lib/apiClient.js';
import { Card, Spinner, EmptyState, Badge, Button } from '../components/ui.jsx';
import { fmtMoney, fmtDateOnly, transferStatus } from '../lib/format.js';

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

export default function TransfersListPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { api.get('/transfers').then(setData).catch(setError); }, []);

  if (error) return <Card><p className="text-sm text-red-700">{error.message}</p></Card>;
  if (!data) return <div className="flex justify-center py-16"><Spinner size={32} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Transfers</h1>
        <Link to="/transfers/new">
          <Button size="sm"><Plus size={14} /> New transfer</Button>
        </Link>
      </div>
      {data.items.length === 0 ? (
        <EmptyState title="No transfers yet"
          description="Start a transfer from any parcel you own." />
      ) : (
        <ul className="space-y-3">
          {data.items.map((t) => (
            <li key={t.id}>
              <Link to={`/transfers/${t.id}`}>
                <Card className="transition-colors hover:border-blue-500 hover:bg-blue-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-sm text-slate-900">{t.trackingId}</p>
                      <p className="text-xs text-slate-500">
                        {fmtMoney(t.salePrice)} · {fmtDateOnly(t.createdAt)}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONES[t.status] ?? 'slate'}>
                      {transferStatus(t.status)}
                    </Badge>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
