// Staff portal appointments management page — LandOfficer view of their
// schedule for today/this week. Officers can mark No-Show or Completed.

import { useEffect, useState } from 'react';
import { api } from '../lib/apiClient.js';
import { Card, Spinner, EmptyState, Badge, Button, ErrorBanner } from '../components/ui.jsx';
import { fmtDate } from '../lib/format.js';
import { useAuth } from '../contexts/AuthContext.jsx';

const STATUS_TONES = {
  Scheduled: 'blue',
  Completed: 'green',
  Cancelled: 'slate',
  NoShow: 'red'
};

export default function AppointmentsStaffPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [filter, setFilter] = useState('today');

  async function load() {
    try {
      const now = new Date();
      const from = new Date(now);
      from.setHours(0, 0, 0, 0);
      const to = new Date(now);
      to.setHours(23, 59, 59, 999);
      if (filter === 'week') {
        to.setDate(to.getDate() + 7);
      } else if (filter === 'all') {
        // No date filter
        from.setFullYear(2000);
        to.setFullYear(2100);
      }
      const d = await api.get(`/appointments?from=${from.toISOString()}&to=${to.toISOString()}&pageSize=200`);
      setData(d);
      setError(null);
    } catch (e) { setError(e); }
  }
  useEffect(() => { load(); }, [filter]);

  if (!user || !['LandOfficer', 'SystemAdmin'].includes(user.role)) {
    return <Card><p className="text-sm text-red-700">You do not have access to this page.</p></Card>;
  }
  if (error) return <Card><p className="text-sm text-red-700">{error.message}</p></Card>;
  if (!data) return <div className="flex justify-center py-16"><Spinner size={32} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
        <div className="flex gap-1">
          {['today', 'week', 'all'].map((f) => (
            <Button key={f} size="sm" variant={filter === f ? 'primary' : 'secondary'} onClick={() => setFilter(f)}>
              {f === 'today' ? 'Today' : f === 'week' ? 'This week' : 'All'}
            </Button>
          ))}
        </div>
      </div>

      {actionError && <ErrorBanner error={actionError} onDismiss={() => setActionError(null)} />}

      {data.items.length === 0 ? (
        <EmptyState title="No appointments" description="Citizens can book appointments from the citizen PWA." />
      ) : (
        <ul className="space-y-3">
          {data.items.map((a) => (
            <li key={a.id}>
              <Card>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{a.serviceType}</p>
                    <p className="text-sm text-slate-600">{fmtDate(a.scheduledAt)}</p>
                    {a.purpose && <p className="mt-1 text-xs text-slate-500">{a.purpose}</p>}
                    {a.citizen && (
                      <p className="mt-1 text-xs text-slate-500">
                        Citizen: {a.citizen.fullName} ({a.citizen.nationalId})
                      </p>
                    )}
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
