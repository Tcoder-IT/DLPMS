// Audit logs viewer (SystemAdmin only).

import { useEffect, useState } from 'react';
import { api } from '../lib/apiClient.js';
import { Card, Spinner, Badge, Input, Button, EmptyState } from '../components/ui.jsx';
import { fmtDate } from '../lib/format.js';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function AuditLogsPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ action: '', actorUserId: '', entityType: '' });

  async function load() {
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '50' });
      if (filters.action) params.set('action', filters.action);
      if (filters.actorUserId) params.set('actorUserId', filters.actorUserId);
      if (filters.entityType) params.set('entityType', filters.entityType);
      const d = await api.get(`/admin/audit-logs?${params.toString()}`);
      setData(d);
      setError(null);
    } catch (e) { setError(e); }
  }
  useEffect(() => { load(); }, []);

  async function handleExport() {
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '500' });
      if (filters.action) params.set('action', filters.action);
      if (filters.actorUserId) params.set('actorUserId', filters.actorUserId);
      if (filters.entityType) params.set('entityType', filters.entityType);
      const res = await api.raw(`/admin/audit-logs/export?${params.toString()}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err);
    }
  }

  if (!user || user.role !== 'SystemAdmin') {
    return <Card><p className="text-sm text-red-700">Only System Administrators can view audit logs.</p></Card>;
  }
  if (error) return <Card><p className="text-sm text-red-700">{error.message}</p></Card>;
  if (!data) return <div className="flex justify-center py-16"><Spinner size={32} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Audit logs</h1>
        <Button variant="secondary" size="sm" onClick={handleExport}>Export CSV</Button>
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input label="Action" placeholder="e.g. Approve, DocumentUpload" value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} />
          <Input label="Actor user ID" placeholder="00000000-…" value={filters.actorUserId} onChange={(e) => setFilters({ ...filters, actorUserId: e.target.value })} />
          <Input label="Entity type" placeholder="e.g. TransferRequest" value={filters.entityType} onChange={(e) => setFilters({ ...filters, entityType: e.target.value })} />
        </div>
        <div className="mt-3"><Button size="sm" onClick={load}>Apply filters</Button></div>
      </Card>

      {data.items.length === 0 ? (
        <EmptyState title="No audit entries match your filters." />
      ) : (
        <Card>
          <table className="w-full text-xs">
            <thead className="text-left uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2 pr-3">Actor</th>
                <th className="py-2 pr-3">Action</th>
                <th className="py-2 pr-3">Entity</th>
                <th className="py-2 pr-3">Request ID</th>
                <th className="py-2 pr-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((row) => (
                <tr key={row.id}>
                  <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(row.createdAt)}</td>
                  <td className="py-2 pr-3 font-mono">{row.actorUserId ? row.actorUserId.slice(0, 8) : 'system'}</td>
                  <td className="py-2 pr-3"><Badge tone="slate">{row.action}</Badge></td>
                  <td className="py-2 pr-3">{row.entityType}{row.entityId ? `/${row.entityId.slice(0, 8)}` : ''}</td>
                  <td className="py-2 pr-3 font-mono text-slate-500">{row.requestId ? row.requestId.slice(0, 8) : '—'}</td>
                  <td className="py-2 pr-3 text-slate-500">{row.ipAddress ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
