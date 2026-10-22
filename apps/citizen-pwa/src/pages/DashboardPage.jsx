// Citizen dashboard — quick actions + parcel overview.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, ArrowRightLeft, Calendar, FileText, Bell } from 'lucide-react';
import { api } from '../lib/apiClient.js';
import { Card, Spinner, EmptyState, Button } from '../components/ui.jsx';
import { fmtMoney, fmtDateOnly } from '../lib/format.js';

export default function DashboardPage() {
  const [parcels, setParcels] = useState(null);
  const [transfers, setTransfers] = useState(null);
  const [unread, setUnread] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/parcels?pageSize=5').catch(() => null),
      api.get('/transfers?pageSize=5').catch(() => null),
      api.get('/notifications/unread').catch(() => null)
    ]).then(([p, t, n]) => {
      if (p) setParcels(p); else setParcels({ items: [] });
      if (t) setTransfers(t); else setTransfers({ items: [] });
      if (n) setUnread(n); else setUnread({ unread: 0 });
      setError(null);
    }).catch((e) => setError(e));
  }, []);

  if (error) {
    return (
      <Card>
        <p className="text-sm text-red-700">Could not load dashboard: {error.message}</p>
        <p className="mt-2 text-xs text-slate-500">
          If the API is not running locally, start it with `npm run dev:api` from the project root.
        </p>
      </Card>
    );
  }

  if (!parcels || !transfers || !unread) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-600">Welcome to your DLPMS citizen portal.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Parcels" value={parcels.total} icon={MapPin} to="/parcels" />
        <StatCard label="Transfers" value={transfers.total} icon={ArrowRightLeft} to="/transfers" />
        <StatCard label="Unread" value={unread.unread} icon={Bell} to="/notifications" />
        <StatCard label="Certificates" value="—" icon={FileText} to="/certificates" />
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Your parcels</h2>
          <Link to="/parcels" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">
            View all <ArrowRight size={14} />
          </Link>
        </div>
        <div className="mt-3">
          {parcels.items.length === 0 ? (
            <EmptyState title="No parcels yet" description="A land officer will register your parcels; they will appear here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {parcels.items.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-medium text-slate-900">{p.parcelNumber}</p>
                    <p className="text-xs text-slate-500">
                      {p.subCity}, {p.kebele} · {fmtMoney(p.declaredSize)} {p.sizeUnit}
                    </p>
                  </div>
                  <Link to={`/parcels/${p.id}`} className="text-sm text-blue-700 hover:underline">Open</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Recent transfers</h2>
          <Link to="/transfers" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">
            View all <ArrowRight size={14} />
          </Link>
        </div>
        <div className="mt-3">
          {transfers.items.length === 0 ? (
            <EmptyState
              title="No transfers yet"
              description="Start a transfer from any parcel you own."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {transfers.items.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-medium text-slate-900">{t.trackingId}</p>
                    <p className="text-xs text-slate-500">
                      {fmtMoney(t.salePrice)} · {fmtDateOnly(t.createdAt)}
                    </p>
                  </div>
                  <Link to={`/transfers/${t.id}`} className="text-sm text-blue-700 hover:underline">Open</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="bg-blue-50">
        <div className="flex items-center gap-3">
          <Calendar size={20} className="text-blue-700" />
          <div className="flex-1">
            <p className="font-medium text-slate-900">Book an appointment</p>
            <p className="text-sm text-slate-600">Need in-person verification? Book a slot with a land officer.</p>
          </div>
          <Link to="/appointments"><Button variant="secondary" size="sm">Book</Button></Link>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, to }) {
  return (
    <Link to={to} className="block rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-blue-500 hover:bg-blue-50">
      <div className="flex items-center justify-between">
        <Icon size={18} className="text-slate-500" />
        <ArrowRight size={14} className="text-slate-400" />
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </Link>
  );
}
