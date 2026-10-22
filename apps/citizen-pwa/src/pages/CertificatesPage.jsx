// Certificates list. The certificate list endpoint is not yet implemented
// (M5 only added GET /certificates/{id} and POST /certificates/{id}/download),
// so this page shows a free-form "enter certificate ID" box that lets the
// citizen fetch and download any of their certificates.

import { useEffect, useState } from 'react';
import { api } from '../lib/apiClient.js';
import { Card, Input, Button, ErrorBanner, Badge, Spinner, EmptyState } from '../components/ui.jsx';
import { fmtDate } from '../lib/format.js';
import { Download, FileText } from 'lucide-react';

export default function CertificatesPage() {
  const [certId, setCertId] = useState('');
  const [cert, setCert] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [downloadError, setDownloadError] = useState(null);

  // Auto-load if URL hash has an id (e.g. ?id=…).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
      setCertId(id);
      load(id);
    }
  }, []);

  async function load(id) {
    setLoading(true);
    setError(null);
    setCert(null);
    try {
      const data = await api.get(`/certificates/${id}`);
      setCert(data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    if (!cert) return;
    setDownloadError(null);
    try {
      const res = await api.raw(`/certificates/${cert.id}/download`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? 'Download failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `certificate-${cert.certificateNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Certificates</h1>
      <Card>
        <p className="text-sm text-slate-600">
          Enter a certificate ID to view its details and download the PDF.
          You receive a certificate ID when a land officer registers a parcel
          in your name or when a transfer is approved.
        </p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (certId) load(certId); }}
        >
          <Input
            placeholder="00000000-0000-0000-0000-000000000000"
            value={certId}
            onChange={(e) => setCertId(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={!certId || loading}>
            {loading ? 'Loading…' : 'Look up'}
          </Button>
        </form>
      </Card>

      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}
      {downloadError && <ErrorBanner error={downloadError} onDismiss={() => setDownloadError(null)} />}

      {loading && <div className="flex justify-center py-8"><Spinner size={28} /></div>}

      {cert && !loading && (
        <Card>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <FileText size={20} className="text-blue-700" />
              <div>
                <p className="font-mono text-sm text-slate-900">{cert.certificateNumber}</p>
                <p className="text-xs text-slate-500">Issued {fmtDate(cert.issuedAt)}</p>
              </div>
            </div>
            <Badge tone={cert.status === 'Active' ? 'green' : 'red'}>{cert.status}</Badge>
          </div>
          <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <Field label="Parcel" value={cert.parcel?.parcelNumber ?? cert.parcelId} />
            <Field label="Owner" value={cert.owner?.fullName ?? '—'} />
            {cert.transfer && <Field label="Transfer" value={cert.transfer.trackingId ?? cert.transferId} />}
          </dl>
          <div className="mt-4">
            <Button onClick={handleDownload} disabled={cert.status !== 'Active'}>
              <Download size={14} /> Download PDF
            </Button>
          </div>
        </Card>
      )}

      {!cert && !loading && !error && (
        <EmptyState title="No certificate loaded"
          description="Enter a certificate ID above to view and download." />
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{value ?? '—'}</dd>
    </div>
  );
}
