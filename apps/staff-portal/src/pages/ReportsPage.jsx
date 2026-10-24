// Staff portal Reports page — admin can view registration/transfer/tax/
// operations reports with date + subCity filters, and export CSV.
// Per FR-15, FR-21, and PDF §4.3 sub-system 6.

import { useEffect, useState } from 'react';
import { api, storage } from '../lib/apiClient.js';
import { Card, Spinner, EmptyState, Badge, Button, Input, ErrorBanner } from '../components/ui.jsx';
import { fmtMoney } from '../lib/format.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { Download, FileText, ArrowRightLeft, Receipt, BarChart3 } from 'lucide-react';

const REPORTS = [
  { key: 'registrations', label: 'Registrations', icon: FileText, roles: ['LandOfficer', 'SystemAdmin'] },
  { key: 'transfers', label: 'Transfers', icon: ArrowRightLeft, roles: ['LandOfficer', 'SystemAdmin'] },
  { key: 'tax-compliance', label: 'Tax compliance', icon: Receipt, roles: ['TaxOfficial', 'SystemAdmin'] },
  { key: 'operations', label: 'Operations', icon: BarChart3, roles: ['SystemAdmin'] }
];

export default function ReportsPage() {
  const { user } = useAuth();
  const [activeReport, setActiveReport] = useState('registrations');
  const [filters, setFilters] = useState({ from: '', to: '', subCity: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadReport() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.from) params.set('from', new Date(filters.from).toISOString());
      if (filters.to) params.set('to', new Date(filters.to + 'T23:59:59.999Z'));
      if (filters.subCity) params.set('subCity', filters.subCity);
      const result = await api.get(`/reports/${activeReport}?${params.toString()}`);
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadReport(); }, [activeReport]);

  async function handleExportCsv() {
    try {
      const params = new URLSearchParams({ format: 'csv' });
      if (filters.from) params.set('from', new Date(filters.from).toISOString());
      if (filters.to) params.set('to', new Date(filters.to + 'T23:59:59.999Z'));
      if (filters.subCity) params.set('subCity', filters.subCity);
      const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';
      const res = await fetch(`${baseUrl}/reports/${activeReport}?${params.toString()}`, {
        headers: { authorization: `Bearer ${storage.getAccess()}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeReport}-report-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err);
    }
  }

  const visibleReports = REPORTS.filter((r) => user && r.roles.includes(user.role));

  if (!user) return <Card><p className="text-sm text-red-700">Loading…</p></Card>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
      <p className="text-sm text-slate-600">
        Filter by date range and sub-city. CSV export is supported.
      </p>

      <Card>
        <div className="flex flex-wrap gap-2">
          {visibleReports.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => { setActiveReport(r.key); setData(null); }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeReport === r.key ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <r.icon size={14} /> {r.label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">Filters</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Input type="date" label="From" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          <Input type="date" label="To" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          <Input label="Sub-city" placeholder="e.g. 01 Kebele" value={filters.subCity} onChange={(e) => setFilters({ ...filters, subCity: e.target.value })} />
          <div className="flex items-end gap-2">
            <Button size="sm" onClick={loadReport} disabled={loading}>Apply</Button>
            <Button size="sm" variant="secondary" onClick={handleExportCsv} disabled={loading}>
              <Download size={14} /> CSV
            </Button>
          </div>
        </div>
      </Card>

      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : data ? (
        <ReportView report={activeReport} data={data} />
      ) : (
        <EmptyState title="No report loaded" description="Click Apply to load a report." />
      )}
    </div>
  );
}

function ReportView({ report, data }) {
  if (report === 'operations') {
    const s = data.summary;
    return (
      <Card>
        <h2 className="font-semibold text-slate-900">Operations summary</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Parcels" value={s.totalParcels} />
          <Metric label="Transfers" value={s.totalTransfers} />
          <Metric label="Payments" value={s.totalPayments} />
          <Metric label="Completed payments" value={s.totalPaymentsCompleted} />
          <Metric label="Tax collected" value={fmtMoney(s.totalTaxCollected)} />
          <Metric label="Appointments" value={s.totalAppointments} />
          <Metric label="Audit log entries" value={s.totalAuditLogs} />
        </div>
        {Object.keys(s.transfersByStatus).length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-slate-700">Transfers by status</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(s.transfersByStatus).map(([status, count]) => (
                <Badge key={status} tone="slate">{status}: {count}</Badge>
              ))}
            </div>
          </div>
        )}
      </Card>
    );
  }
  if (report === 'tax-compliance') {
    const s = data.summary;
    return (
      <>
        <Card>
          <h2 className="font-semibold text-slate-900">Tax compliance summary</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Records" value={s.total} />
            <Metric label="Calculated" value={fmtMoney(s.totalCalculated)} />
            <Metric label="Paid" value={fmtMoney(s.totalPaid)} />
            <Metric label="Outstanding" value={fmtMoney(s.totalOutstanding)} tone="amber" />
            <Metric label="Active holds" value={s.totalHolds} tone="red" />
          </div>
          {Object.keys(s.byStatus).length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-slate-700">By status</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(s.byStatus).map(([status, count]) => (
                  <Badge key={status} tone="slate">{status}: {count}</Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
        <ReportTable items={data.items} />
      </>
    );
  }
  // registrations + transfers
  return <ReportTable items={data.items} />;
}

function Metric({ label, value, tone }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${tone === 'amber' ? 'text-amber-700' : tone === 'red' ? 'text-red-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function ReportTable({ items }) {
  if (!items || items.length === 0) {
    return <EmptyState title="No records match the filters" />;
  }
  const headers = Object.keys(items[0]);
  return (
    <Card>
      <h2 className="font-semibold text-slate-900">Records ({items.length})</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left uppercase tracking-wide text-slate-500">
            <tr>
              {headers.map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.slice(0, 100).map((row, i) => (
              <tr key={i}>
                {headers.map((h) => <td key={h} className="py-2 pr-3">{String(row[h] ?? '').slice(0, 50)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {items.length > 100 && <p className="mt-2 text-xs text-slate-500">Showing first 100 of {items.length} records. Export CSV for full data.</p>}
      </div>
    </Card>
  );
}
