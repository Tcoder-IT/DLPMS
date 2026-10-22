// Citizen PWA Payments page — Figure 30 wireframe ("Property Tax Payment - Mobile").
// Lets the citizen:
//   1. See their parcels with outstanding tax
//   2. Initiate a mock telebirr payment for a tax record
//   3. Replay the signed webhook callback (mock provider behavior)
//   4. View payment history + download the receipt PDF
//
// This closes the TaxHold → Submitted recovery loop: when a transfer is in
// TaxHold, the citizen pays here, the webhook fires applyCompletedPayment
// which auto-advances the transfer back to Submitted → TaxVerified → UnderReview.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, CreditCard, Receipt, AlertCircle } from 'lucide-react';
import { api, storage } from '../lib/apiClient.js';
import { Card, Spinner, EmptyState, Badge, Button, ErrorBanner, Input } from '../components/ui.jsx';
import { fmtMoney, fmtDate } from '../lib/format.js';

export default function PaymentsPage() {
  const [parcels, setParcels] = useState(null);
  const [error, setError] = useState(null);
  const [selectedParcelId, setSelectedParcelId] = useState('');
  const [taxRecords, setTaxRecords] = useState([]);
  const [selectedTaxRecordId, setSelectedTaxRecordId] = useState('');
  const [amount, setAmount] = useState('');
  const [initiating, setInitiating] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [lastInitiated, setLastInitiated] = useState(null);
  const [replaying, setReplaying] = useState(false);
  const [payments, setPayments] = useState(null);

  async function loadParcels() {
    try {
      const d = await api.get('/parcels?pageSize=100');
      setParcels(d);
      setError(null);
    } catch (e) { setError(e); }
  }
  async function loadPayments() {
    // The API doesn't expose a /payments list endpoint yet — for the citizen
    // PWA we walk through tax records' embedded payments instead. This is
    // the canonical way per the schema (PaymentTransaction.payerOwnerId).
    try {
      const parcels = await api.get('/parcels?pageSize=100');
      const allPayments = [];
      for (const p of parcels.items) {
        const tr = await api.get(`/parcels/${p.id}/tax-records`).catch(() => null);
        if (tr) {
          for (const r of tr.items) {
            for (const pay of (r.payments ?? [])) {
              allPayments.push({ ...pay, parcelNumber: p.parcelNumber, taxYear: r.taxYear });
            }
          }
        }
      }
      // Most recent first
      allPayments.sort((a, b) => new Date(b.initiatedAt).getTime() - new Date(a.initiatedAt).getTime());
      setPayments(allPayments);
    } catch { setPayments([]); }
  }
  useEffect(() => { loadParcels(); loadPayments(); }, []);

  // When a parcel is selected, fetch its tax records
  useEffect(() => {
    if (!selectedParcelId) { setTaxRecords([]); return; }
    api.get(`/parcels/${selectedParcelId}/tax-records`)
      .then((d) => setTaxRecords(d.items))
      .catch(() => setTaxRecords([]));
    setSelectedTaxRecordId('');
  }, [selectedParcelId]);

  const outstandingTaxRecords = taxRecords.filter((r) => Number(r.calculatedAmount) - Number(r.paidAmount) > 0.01);

  async function handleInitiate(e) {
    e.preventDefault();
    setActionError(null);
    setLastInitiated(null);
    if (!selectedTaxRecordId || !amount) return;
    setInitiating(true);
    try {
      const result = await api.post('/payments/initiate', {
        taxRecordId: selectedTaxRecordId,
        amount: Number(amount)
      });
      setLastInitiated(result);
      await loadPayments();
    } catch (err) {
      setActionError(err);
    } finally {
      setInitiating(false);
    }
  }

  async function handleReplayWebhook() {
    if (!lastInitiated) return;
    setReplaying(true);
    setActionError(null);
    try {
      // The initiate response includes the signed webhook payload + signature
      // for the mock provider. In production, telebirr calls our webhook
      // out-of-band. For the prototype, the citizen/client replays it.
      const { webhookPayload, webhookSignature } = lastInitiated.provider;
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1'}/webhooks/payments/telebirr`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-telebirr-signature': webhookSignature
          },
          body: JSON.stringify(webhookPayload)
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message ?? 'Webhook replay failed');
      }
      setLastInitiated(null);
      setAmount('');
      await loadPayments();
      // Also reload parcels (a tax hold may have just cleared, auto-advancing a transfer)
      await loadParcels();
    } catch (err) {
      setActionError(err);
    } finally {
      setReplaying(false);
    }
  }

  async function handleDownloadReceipt(paymentId) {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1'}/payments/${paymentId}/receipt.pdf`,
        { headers: { authorization: `Bearer ${storage.getAccess()}` } }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? 'Download failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${paymentId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(err);
    }
  }

  if (error) return <Card><p className="text-sm text-red-700">{error.message}</p></Card>;
  if (!parcels) return <div className="flex justify-center py-16"><Spinner size={32} /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
      <p className="text-sm text-slate-600">
        Pay outstanding property tax via telebirr (mock). Clearing a tax hold
        automatically re-advances any held transfers on the parcel.
      </p>

      <Card>
        <h2 className="font-semibold text-slate-900">Initiate a payment</h2>
        <form onSubmit={handleInitiate} className="mt-3 space-y-4">
          {actionError && <ErrorBanner error={actionError} onDismiss={() => setActionError(null)} />}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Parcel</label>
            {!parcels || parcels.items.length === 0 ? (
              <p className="text-sm text-red-700">You do not own any parcels.</p>
            ) : (
              <select
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={selectedParcelId}
                onChange={(e) => setSelectedParcelId(e.target.value)}
                required
              >
                <option value="">Select a parcel…</option>
                {parcels.items.map((p) => (
                  <option key={p.id} value={p.id}>{p.parcelNumber} — {p.subCity}/{p.kebele}</option>
                ))}
              </select>
            )}
          </div>

          {selectedParcelId && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Tax record</label>
              {outstandingTaxRecords.length === 0 ? (
                <p className="text-sm text-slate-500">No outstanding tax on this parcel.</p>
              ) : (
                <select
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={selectedTaxRecordId}
                  onChange={(e) => {
                    setSelectedTaxRecordId(e.target.value);
                    const r = taxRecords.find((t) => t.id === e.target.value);
                    if (r) setAmount(String(Number(r.calculatedAmount) - Number(r.paidAmount)));
                  }}
                  required
                >
                  <option value="">Select a tax record…</option>
                  {outstandingTaxRecords.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.taxYear} — due {fmtMoney(r.calculatedAmount)}, paid {fmtMoney(r.paidAmount)}, outstanding {fmtMoney(Number(r.calculatedAmount) - Number(r.paidAmount))}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <Input
            label="Amount (ETB)"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            hint="Defaults to the outstanding amount. Overpayments become a credit balance."
          />

          <Button type="submit" disabled={initiating || !selectedTaxRecordId || !amount}>
            {initiating ? <><Spinner size={14} /> Initiating…</> : <><CreditCard size={14} /> Initiate telebirr payment</>}
          </Button>
        </form>

        {lastInitiated && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 text-amber-700" />
              <div className="flex-1 text-sm text-amber-900">
                <p className="font-medium">Payment initiated</p>
                <p className="text-xs">
                  Transaction ref: <code className="font-mono">{lastInitiated.payment.transactionRef}</code>
                </p>
                <p className="mt-1 text-xs">
                  The mock telebirr provider returned a signed webhook payload.
                  Click below to replay the callback (simulates the citizen
                  completing the payment on their phone).
                </p>
                <Button size="sm" variant="secondary" className="mt-2" disabled={replaying} onClick={handleReplayWebhook}>
                  {replaying ? <><Spinner size={14} /> Replaying…</> : 'Replay webhook callback'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">Payment history</h2>
        {!payments || payments.length === 0 ? (
          <EmptyState title="No payments yet" description="Initiate your first payment above." />
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {payments.map((p) => (
              <li key={p.id} className="py-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {fmtMoney(p.amount)} · {p.parcelNumber} ({p.taxYear})
                    </p>
                    <p className="text-xs text-slate-500">
                      Initiated {fmtDate(p.initiatedAt)}
                      {p.completedAt && ` · completed ${fmtDate(p.completedAt)}`}
                    </p>
                    <p className="mt-1 font-mono text-xs text-slate-500">{p.transactionRef}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge tone={
                      p.status === 'Completed' ? 'green' :
                      p.status === 'Failed' || p.status === 'Refunded' ? 'red' : 'amber'
                    }>{p.status}</Badge>
                    {p.status === 'Completed' && (
                      <Button size="sm" variant="ghost" onClick={() => handleDownloadReceipt(p.id)}>
                        <Download size={14} /> Receipt
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="bg-blue-50 border-blue-200">
        <div className="flex items-start gap-2">
          <Receipt size={16} className="mt-0.5 text-blue-700" />
          <p className="text-xs text-blue-800">
            When a tax hold is cleared, any transfers on this parcel that were
            in <code>TaxHold</code> state automatically re-submit and re-run
            the tax check (PDF §4.5.1 Table 24). Check your{' '}
            <Link to="/transfers" className="underline">transfers</Link> after
            payment to see the status change.
          </p>
        </div>
      </Card>
    </div>
  );
}
