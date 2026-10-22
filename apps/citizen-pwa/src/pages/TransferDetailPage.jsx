// Transfer detail — shows the state machine + action buttons the citizen
// can take (submit, cancel). Officer-only actions (approve/reject/request-
// documents) are shown read-only with a note that they require a land officer.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/apiClient.js';
import { Card, Spinner, Badge, Button, ErrorBanner, EmptyState } from '../components/ui.jsx';
import { fmtMoney, fmtDate, transferStatus } from '../lib/format.js';

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

// Linear walk of the documented state machine for the visual stepper.
const STATES = ['Draft', 'Submitted', 'TaxVerified', 'UnderReview', 'Approved'];

export default function TransferDetailPage() {
  const { id } = useParams();
  const [transfer, setTransfer] = useState(null);
  const [docs, setDocs] = useState(null);
  const [myDocuments, setMyDocuments] = useState([]);
  const [attachForm, setAttachForm] = useState({ documentId: '', documentType: 'sale_agreement' });
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState(null);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const [t, d, my] = await Promise.all([
      api.get(`/transfers/${id}`).catch((e) => { setError(e); return null; }),
      api.get(`/transfers/${id}/documents`).catch(() => null),
      api.get('/documents?pageSize=100').catch(() => null)
    ]);
    setTransfer(t);
    setDocs(d);
    if (my) setMyDocuments(my.items);
  }
  useEffect(() => { load(); }, [id]);

  async function handleAttach(e) {
    e.preventDefault();
    setAttachError(null);
    setAttaching(true);
    try {
      await api.post(`/transfers/${id}/documents`, attachForm);
      setAttachForm({ documentId: '', documentType: 'sale_agreement' });
      await load();
    } catch (err) {
      setAttachError(err);
    } finally {
      setAttaching(false);
    }
  }

  async function handleSubmit() {
    setActionError(null);
    setSubmitting(true);
    try {
      await api.post(`/transfers/${id}/submit`, { expectedVersion: transfer.version });
      await load();
    } catch (err) {
      setActionError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    const reason = window.prompt('Reason for cancelling this transfer?');
    if (!reason) return;
    setActionError(null);
    setSubmitting(true);
    try {
      await api.post(`/transfers/${id}/cancel`, { reason, expectedVersion: transfer.version });
      await load();
    } catch (err) {
      setActionError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return <Card><p className="text-sm text-red-700">{error.message}</p></Card>;
  if (!transfer) return <div className="flex justify-center py-16"><Spinner size={32} /></div>;

  const stateIndex = STATES.indexOf(transfer.status);
  const showSubmit = transfer.status === 'Draft';
  const showCancel = !['Approved', 'Rejected', 'Cancelled'].includes(transfer.status);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg text-slate-900">{transfer.trackingId}</h1>
          <p className="text-xs text-slate-500">Transfer · created {fmtDate(transfer.createdAt)}</p>
        </div>
        <Badge tone={STATUS_TONES[transfer.status] ?? 'slate'}>
          {transferStatus(transfer.status)}
        </Badge>
      </div>

      {/* State stepper — only when the transfer is in the linear path */}
      {stateIndex >= 0 && (
        <Card>
          <ol className="flex items-center">
            {STATES.map((s, i) => (
              <li key={s} className="flex flex-1 items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`h-3 w-3 rounded-full ${i <= stateIndex ? 'bg-blue-700' : 'bg-slate-300'}`}
                  />
                  <p className="mt-1 text-xs text-slate-600">{s}</p>
                </div>
                {i < STATES.length - 1 && (
                  <div className={`h-0.5 flex-1 ${i < stateIndex ? 'bg-blue-700' : 'bg-slate-200'}`} />
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold text-slate-900">Summary</h2>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Field label="Parcel" value={transfer.parcel?.parcelNumber ?? transfer.parcelId} />
          <Field label="Sale price" value={fmtMoney(transfer.salePrice)} />
          <Field label="Seller" value={transfer.seller?.fullName ?? '—'} />
          <Field label="Buyer" value={transfer.buyer?.fullName ?? '—'} />
          {transfer.decisionReason && (
            <Field label="Decision reason" value={transfer.decisionReason} />
          )}
          {transfer.reviewedAt && (
            <Field label="Reviewed at" value={fmtDate(transfer.reviewedAt)} />
          )}
        </dl>
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">Documents</h2>
        {!docs || docs.items.length === 0 ? (
          <EmptyState title="No documents attached yet"
            description="Upload documents via the Documents page, then attach them here." />
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {docs.items.map((d) => (
              <li key={d.id} className="py-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{d.documentType}</p>
                    <p className="text-xs text-slate-500">{d.document?.originalFilename}</p>
                  </div>
                  <Badge tone={
                    d.verificationStatus === 'Verified' ? 'green' :
                    d.verificationStatus === 'Rejected' ? 'red' : 'amber'
                  }>
                    {d.verificationStatus}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Attach document form — shown when the transfer is in any pre-approval state */}
        {transfer.status !== 'Approved' && transfer.status !== 'Rejected' && transfer.status !== 'Cancelled' && (
          <form onSubmit={handleAttach} className="mt-4 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <h3 className="text-sm font-medium text-slate-700">Attach a document</h3>
            {attachError && <ErrorBanner error={attachError} onDismiss={() => setAttachError(null)} />}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Document</label>
                <select
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={attachForm.documentId}
                  onChange={(e) => setAttachForm({ ...attachForm, documentId: e.target.value })}
                  required
                >
                  <option value="">Select an uploaded document…</option>
                  {myDocuments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.originalFilename} ({d.mediaType})
                    </option>
                  ))}
                </select>
                {myDocuments.length === 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    Upload documents on the <Link to="/documents" className="text-blue-700 underline">Documents page</Link> first.
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Document type</label>
                <select
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={attachForm.documentType}
                  onChange={(e) => setAttachForm({ ...attachForm, documentType: e.target.value })}
                >
                  <option value="sale_agreement">Sale agreement</option>
                  <option value="seller_id">Seller ID copy</option>
                  <option value="buyer_id">Buyer ID copy</option>
                  <option value="tax_clearance">Tax clearance certificate</option>
                  <option value="deed">Title deed</option>
                  <option value="photo">Photo / form</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <Button type="submit" size="sm" disabled={attaching || !attachForm.documentId}>
              {attaching ? 'Attaching…' : 'Attach'}
            </Button>
          </form>
        )}
      </Card>

      {actionError && <ErrorBanner error={actionError} onDismiss={() => setActionError(null)} />}

      <Card>
        <h2 className="font-semibold text-slate-900">Actions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {showSubmit && (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit for processing'}
            </Button>
          )}
          {showCancel && (
            <Button variant="danger" onClick={handleCancel} disabled={submitting}>
              {submitting ? 'Cancelling…' : 'Cancel transfer'}
            </Button>
          )}
          {transfer.status === 'Approved' && (
            <p className="text-sm text-emerald-700">This transfer was approved. A new certificate was issued.</p>
          )}
          {transfer.status === 'Rejected' && (
            <p className="text-sm text-red-700">This transfer was rejected. Reason: {transfer.decisionReason}</p>
          )}
          {transfer.status === 'TaxHold' && (
            <p className="text-sm text-amber-700">
              This transfer is on hold because of outstanding tax. Pay the due from your parcels and re-submit.
            </p>
          )}
          {transfer.status === 'DocumentsRequested' && (
            <p className="text-sm text-amber-700">
              A land officer has requested additional documents. Upload them and the review will continue.
            </p>
          )}
        </div>
      </Card>
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
