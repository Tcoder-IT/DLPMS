// Notifications list — recipient-scoped (the API returns only the citizen's
// own notifications). Mark-as-read button on each row.

import { useEffect, useState } from 'react';
import { api } from '../lib/apiClient.js';
import { Card, Spinner, EmptyState, Badge, Button } from '../components/ui.jsx';
import { fmtDate } from '../lib/format.js';

export default function NotificationsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    try {
      const d = await api.get('/notifications?pageSize=50');
      setData(d);
      setError(null);
    } catch (e) { setError(e); }
  }
  useEffect(() => { load(); }, []);

  async function handleMarkRead(id) {
    try {
      await api.patch(`/notifications/${id}/read`);
      await load();
    } catch (e) {
      setError(e);
    }
  }

  if (error) return <Card><p className="text-sm text-red-700">{error.message}</p></Card>;
  if (!data) return <div className="flex justify-center py-16"><Spinner size={32} /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
      {data.items.length === 0 ? (
        <EmptyState title="No notifications" description="You will see appointment reminders, transfer updates, and payment confirmations here." />
      ) : (
        <ul className="space-y-3">
          {data.items.map((n) => (
            <li key={n.id}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{n.templateKey}</p>
                    <p className="text-xs text-slate-500">
                      {n.channel} · {fmtDate(n.scheduledAt ?? n.createdAt)}
                    </p>
                    {n.payload && Object.keys(n.payload).length > 0 && (
                      <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
                        {JSON.stringify(n.payload, null, 2)}
                      </pre>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge tone={n.status === 'Sent' ? 'green' : 'amber'}>{n.status}</Badge>
                    {n.status !== 'Sent' && (
                      <Button size="sm" variant="secondary" onClick={() => handleMarkRead(n.id)}>
                        Mark read
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
