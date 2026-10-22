// Parcels list — fetches /parcels (the API auto-filters to the citizen's own).

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/apiClient.js';
import { Card, Spinner, EmptyState, Badge } from '../components/ui.jsx';
import { fmtMoney, boundaryStatus } from '../lib/format.js';

export default function ParcelsListPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/parcels').then(setData).catch(setError);
  }, []);

  if (error) {
    return <Card><p className="text-sm text-red-700">{error.message}</p></Card>;
  }
  if (!data) {
    return <div className="flex justify-center py-16"><Spinner size={32} /></div>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">My parcels</h1>
      {data.items.length === 0 ? (
        <EmptyState title="No parcels registered to your account"
          description="A land officer must register a parcel listing you as the current owner before it appears here." />
      ) : (
        <ul className="space-y-3">
          {data.items.map((p) => (
            <li key={p.id}>
              <Link to={`/parcels/${p.id}`}>
                <Card className="transition-colors hover:border-blue-500 hover:bg-blue-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{p.parcelNumber}</p>
                      <p className="text-sm text-slate-600">
                        {p.subCity}, {p.kebele} · {p.location}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {fmtMoney(p.declaredSize)} {p.sizeUnit} · {p.landUseType}
                      </p>
                    </div>
                    <Badge tone={p.boundaryStatus === 'Verified' ? 'green' : 'amber'}>
                      {boundaryStatus(p.boundaryStatus)}
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
