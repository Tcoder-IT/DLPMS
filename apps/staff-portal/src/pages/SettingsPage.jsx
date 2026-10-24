// Staff portal Settings page — SystemAdmin can edit tax rate, surcharge,
// appointment cancellation window, and notification templates.
// Per FR-27: "Configure system parameters including tax rates, fees, and
// notification templates."

import { useEffect, useState } from 'react';
import { api } from '../lib/apiClient.js';
import { Card, Spinner, EmptyState, Badge, Button, Input, ErrorBanner } from '../components/ui.jsx';
import { fmtDate } from '../lib/format.js';
import { useAuth } from '../contexts/AuthContext.jsx';

const KNOWN_KEYS = [
  { key: 'tax.rate_per_sqm_etb', label: 'Tax rate per square meter per year (ETB)', field: 'rate', type: 'number', description: 'Base property tax per square meter per year.' },
  { key: 'tax.surcharge_factor', label: 'Tax surcharge factor', field: 'factor', type: 'number', description: 'Multiplier applied to the base tax (1.0 = no surcharge).' },
  { key: 'appointment.cancellation_window_hours', label: 'Appointment cancellation window (hours)', field: 'hours', type: 'number', description: 'Minimum hours before an appointment to allow cancellation.' }
];

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // key being edited
  const [form, setForm] = useState({ value: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);

  async function load() {
    try { setSettings(await api.get('/admin/settings')); setError(null); }
    catch (e) { setError(e); }
  }
  useEffect(() => { load(); }, []);

  function startEdit(s) {
    setEditing(s.key);
    setActionError(null);
    // For known keys, extract the relevant field from the value object
    const known = KNOWN_KEYS.find((k) => k.key === s.key);
    if (known) {
      setForm({ value: String(s.value?.[known.field] ?? ''), description: s.description ?? '' });
    } else {
      setForm({ value: JSON.stringify(s.value, null, 2), description: s.description ?? '' });
    }
  }

  async function handleSave(key) {
    setActionError(null);
    setSubmitting(true);
    try {
      const known = KNOWN_KEYS.find((k) => k.key === key);
      let valueObj;
      if (known) {
        const num = Number(form.value);
        if (!Number.isFinite(num)) {
          throw new Error('Value must be a number for this setting.');
        }
        valueObj = { [known.field]: num };
      } else {
        valueObj = JSON.parse(form.value);
      }
      await api.patch(`/admin/settings/${key}`, { value: valueObj, description: form.description || undefined });
      setEditing(null);
      await load();
    } catch (err) {
      setActionError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!user || user.role !== 'SystemAdmin') {
    return <Card><p className="text-sm text-red-700">Only System Administrators can edit settings.</p></Card>;
  }
  if (error) return <Card><p className="text-sm text-red-700">{error.message}</p></Card>;
  if (!settings) return <div className="flex justify-center py-16"><Spinner size={32} /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">System settings</h1>
      <p className="text-sm text-slate-600">
        Tax rates, fees, and appointment policies are configurable here. Changes
        are audited as <code>SettingsUpdate</code> entries.
      </p>

      {actionError && <ErrorBanner error={actionError} onDismiss={() => setActionError(null)} />}

      {settings.items.length === 0 ? (
        <EmptyState title="No settings configured"
          description="Save a setting below to create it. Default values will be lazy-initialized by the services on first use." />
      ) : (
        <ul className="space-y-3">
          {settings.items.map((s) => {
            const known = KNOWN_KEYS.find((k) => k.key === s.key);
            const isEditing = editing === s.key;
            const isTemplate = s.key.startsWith('notification.template.');
            return (
              <li key={s.key}>
                <Card>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-mono text-sm text-slate-900">{s.key}</p>
                      <p className="text-xs text-slate-500">{s.description ?? 'No description'}</p>
                      <p className="mt-1 text-xs text-slate-500">Updated {fmtDate(s.updatedAt)}</p>
                    </div>
                    {isTemplate && <Badge tone="purple">template</Badge>}
                    {known && <Badge tone="blue">known</Badge>}
                  </div>

                  {isEditing ? (
                    <div className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                      <Input
                        label={known ? known.label : 'Value (JSON)'}
                        type={known?.type ?? 'text'}
                        step={known?.type === 'number' ? '0.01' : undefined}
                        value={form.value}
                        onChange={(e) => setForm({ ...form, value: e.target.value })}
                      />
                      <Input
                        label="Description (optional)"
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleSave(s.key)} disabled={submitting}>
                          {submitting ? 'Saving…' : 'Save'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center justify-between">
                      <pre className="overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
                        {JSON.stringify(s.value, null, 2)}
                      </pre>
                      <Button size="sm" variant="secondary" onClick={() => startEdit(s)}>Edit</Button>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {/* Quick-edit known settings that don't exist yet */}
      <Card>
        <h2 className="font-semibold text-slate-900">Configure a known setting</h2>
        <p className="text-xs text-slate-500">These will be created on first save if they don't exist.</p>
        <div className="mt-3 space-y-3">
          {KNOWN_KEYS.map((k) => {
            const exists = settings.items.some((s) => s.key === k.key);
            return (
              <div key={k.key} className="flex items-center justify-between rounded-md border border-slate-200 p-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">{k.label}</p>
                  <p className="text-xs text-slate-500">{k.description}</p>
                </div>
                <Button
                  size="sm"
                  variant={exists ? 'secondary' : 'primary'}
                  onClick={() => startEdit({ key: k.key, value: { [k.field]: k.key.includes('hours') ? 2 : 0.5 }, description: k.description })}
                >
                  {exists ? 'Edit' : 'Create'}
                </Button>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
