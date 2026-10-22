// Users management (SystemAdmin only).

import { useEffect, useState } from 'react';
import { api } from '../lib/apiClient.js';
import { Card, Spinner, Badge, Button, EmptyState } from '../components/ui.jsx';
import { fmtDate } from '../lib/format.js';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function UsersPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState(null);

  async function load() {
    try {
      const [u, r] = await Promise.all([
        api.get('/admin/users?pageSize=100'),
        api.get('/admin/roles')
      ]);
      setData(u);
      setRoles(r);
      setError(null);
    } catch (e) { setError(e); }
  }
  useEffect(() => { load(); }, []);

  async function handleRoleChange(userId, currentRole) {
    const choices = roles.map((r) => r.code).filter((c) => c !== currentRole);
    const next = window.prompt(`Change role from ${currentRole} to:`, choices[0] ?? '');
    if (!next || !choices.includes(next)) return;
    try {
      await api.patch(`/admin/users/${userId}/role`, { roleCode: next });
      await load();
    } catch (err) {
      setError(err);
    }
  }

  async function handleDeactivate(userId) {
    const reason = window.prompt('Reason for deactivation:');
    if (!reason) return;
    try {
      await api.post(`/admin/users/${userId}/deactivate`, { reason });
      await load();
    } catch (err) {
      setError(err);
    }
  }

  if (!user || user.role !== 'SystemAdmin') {
    return <Card><p className="text-sm text-red-700">Only System Administrators can manage users.</p></Card>;
  }
  if (error) return <Card><p className="text-sm text-red-700">{error.message}</p></Card>;
  if (!data) return <div className="flex justify-center py-16"><Spinner size={32} /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Users</h1>
      {data.items.length === 0 ? (
        <EmptyState title="No users" />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">Phone</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Last login</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td className="py-2 pr-3">{u.phoneNumber}</td>
                  <td className="py-2 pr-3 text-slate-600">{u.email ?? '—'}</td>
                  <td className="py-2 pr-3"><Badge tone="purple">{u.role}</Badge></td>
                  <td className="py-2 pr-3">
                    <Badge tone={u.active ? 'green' : 'red'}>{u.active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-500">{u.lastLoginAt ? fmtDate(u.lastLoginAt) : 'never'}</td>
                  <td className="py-2 pr-3">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handleRoleChange(u.id, u.role)}>Role</Button>
                      {u.active && u.id !== user.id && (
                        <Button size="sm" variant="ghost" onClick={() => handleDeactivate(u.id)}>Deactivate</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
