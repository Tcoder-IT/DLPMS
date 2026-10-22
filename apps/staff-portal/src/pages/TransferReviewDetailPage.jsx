// Transfer review detail — show documents + officer action buttons
// (request documents, approve, reject).

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/apiClient.js';
import { Card, Spinner, Badge, Button, Input, ErrorBanner, EmptyState } from '../components/ui.jsx';
import { fmtMoney, fmtDate, transferStatus } from '../lib/format.js';
import { useAuth } from '../contexts/AuthContext.jsx';

const STATUS_TONES = {
  Draft: 'slate', Submitted: 'blue', TaxVerified: 'blue', TaxHold: 'red',
  UnderReview: 'amber', DocumentsRequested: 'amber',
  Approved: 'green', Rejected: 'red', Cancelled: 'slate'
};

export default function TransferReviewDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [transfer, setTransfer] = useState(null);
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState('');

  async function load() {
    try {
      const [t, d] = await Promise.all([
        api.get(`/transfers/${id}`),
        api.get(`/transfers/${id}/documents`).catch(() => null)
      ]);
      setTransfer(t);
      setDocs(d);
      setError(null);
    } catch (e) { setError(e); }
  }
  useEffect(() => { load(); }, [id]);

  async function run(path) {
    if (!reason.trim()) {
      setActionError(new Error('A reason is required.'));
      return;
    }
    setActionError(null);
    setSubmitting(true);
    try {
      await api.post(path, { reason, expectedVersion: transfer.version });
      setReason('');
      await load();
    } catch (err) {
      setActionError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!user || !['LandOfficer', 'SystemAdmin'].includes(user.role)) {
    return <Card><p className="text-sm text-red-700">You do not have access to this page.</p></Card>;
  }
  if (error) return <Card><p className="text-sm text-red-700">{error.message}</p></Card>;
  if (!transfer) return <div className="flex justify-center py-16"><Spinner size={32} /></div>;

  const canAct = ['Submitted', 'TaxVerified', 'TaxHold', 'UnderReview', 'DocumentsRequested'].includes(transfer.status);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg text-slate-900">{transfer.trackingId}</h1>
          <p className="text-xs text-slate-500">Created {fmtDate(transfer.createdAt)}</p>
        </div>
        <Badge tone={STATUS_TONES[transfer.status] ?? 'slate'}>
          {transferStatus(transfer.status)}
        </Badge>
      </div>

      <Card>
        <h2 className="font-semibold text-slate-900">Summary</h2>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Field label="Parcel" value={transfer.parcel?.parcelNumber ?? transfer.parcelId} />
          <Field label="Sale price" value={fmtMoney(transfer.salePrice)} />
          <Field label="Seller" value={transfer.seller?.fullName ?? '—'} />
          <Field label="Buyer" value={transfer.buyer?.fullName ?? '—'} />
          {transfer.decisionReason && <Field label="Decision reason" value={transfer.decisionReason} />}
        </dl>
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">Attached documents</h2>
        {!docs || docs.items.length === 0 ? (
          <EmptyState title="No documents attached" description="The citizen must upload and attach documents before approval." />
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
                  }>{d.verificationStatus}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canAct && (
        <Card>
          <h2 className="font-semibold text-slate-900">Officer actions</h2>
          {actionError && <div className="mt-2"><ErrorBanner error={actionError} onDismiss={() => setActionError(null)} /></div>}
          <div className="mt-3">
            <Input
              label="Reason (required)"
              placeholder="Document the reason for the decision"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" disabled={submitting} onClick={() => run(`/transfers/${id}/request-documents`)}>
              Request documents
            </Button>
            <Button variant="success" disabled={submitting} onClick={() => run(`/transfers/${id}/approve`)}>
              Approve
            </Button>
            <Button variant="danger" disabled={submitting} onClick={() => run(`/transfers/${id}/reject`)}>
              Reject
            </Button>
          </div>
        </Card>
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
