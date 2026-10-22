// Documents page — list the citizen's own uploads + multipart upload form.
// After upload, the page shows the new document ID so the citizen can copy it
// and attach it to a transfer from the transfer detail page.

import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Upload, FileText, Paperclip, AlertCircle } from 'lucide-react';
import { api } from '../lib/apiClient.js';
import { Card, Spinner, EmptyState, Badge, Button, ErrorBanner } from '../components/ui.jsx';
import { fmtDate, fmtMoney } from '../lib/format.js';

const ACCEPT = '.pdf,.png,.jpg,.jpeg';
const MAX_BYTES = 10 * 1024 * 1024;

export default function DocumentsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [lastUploaded, setLastUploaded] = useState(null);
  const fileRef = useRef(null);

  async function load() {
    try { setData(await api.get('/documents?pageSize=50')); setError(null); }
    catch (e) { setError(e); }
  }
  useEffect(() => { load(); }, []);

  async function handleUpload(e) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setUploadError(new Error(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB; max is 10 MB.`));
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const doc = await api.post('/documents', fd);
      setLastUploaded(doc);
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (err) {
      setUploadError(err);
    } finally {
      setUploading(false);
    }
  }

  if (error) return <Card><p className="text-sm text-red-700">{error.message}</p></Card>;
  if (!data) return <div className="flex justify-center py-16"><Spinner size={32} /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Documents</h1>
      <p className="text-sm text-slate-600">
        Upload supporting documents (ID copies, sale agreements, tax clearance
        certificates, photos/forms). PDF, PNG, or JPEG up to 10 MB. Files are
        validated by content inspection, stored privately, and audit-logged.
      </p>

      <Card>
        <form onSubmit={handleUpload} className="space-y-3">
          {uploadError && <ErrorBanner error={uploadError} onDismiss={() => setUploadError(null)} />}
          {lastUploaded && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <p className="font-medium">Uploaded: {lastUploaded.originalFilename}</p>
              <p className="mt-1 text-xs">
                Document ID: <code className="font-mono">{lastUploaded.id}</code>
              </p>
              <p className="mt-1 text-xs">
                Attach this to a transfer from the
                <Link to="/transfers" className="ml-1 text-emerald-800 underline">transfer detail page</Link>.
              </p>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Choose a file</label>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              required
              className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-700 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-800"
            />
            <p className="mt-1 text-xs text-slate-500">PDF, PNG, or JPEG up to 10 MB.</p>
          </div>
          <Button type="submit" disabled={uploading}>
            {uploading ? <><Spinner size={14} /> Uploading…</> : <><Upload size={14} /> Upload</>}
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">Your uploads</h2>
        {data.items.length === 0 ? (
          <EmptyState title="No documents uploaded yet"
            description="Upload an ID copy, sale agreement, or supporting form to get started." />
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {data.items.map((d) => (
              <li key={d.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <FileText size={16} className="mt-0.5 text-blue-700" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{d.originalFilename}</p>
                      <p className="text-xs text-slate-500">
                        {d.mediaType} · {fmtMoney(d.byteSize)} bytes · uploaded {fmtDate(d.uploadedAt)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        ID: <code className="font-mono">{d.id}</code>
                      </p>
                      {d.attachedTo && d.attachedTo.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {d.attachedTo.map((a) => (
                            <div key={a.id} className="flex items-center gap-1 text-xs">
                              <Paperclip size={12} className="text-slate-500" />
                              <Link to={`/transfers/${a.transferId}`} className="text-blue-700 hover:underline">
                                {a.trackingId}
                              </Link>
                              <span className="text-slate-500">· {a.documentType}</span>
                              <Badge tone={
                                a.verificationStatus === 'Verified' ? 'green' :
                                a.verificationStatus === 'Rejected' ? 'red' : 'amber'
                              }>{a.verificationStatus}</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <Badge tone="slate">{d.classification}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="bg-amber-50 border-amber-200">
        <div className="flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 text-amber-700" />
          <p className="text-xs text-amber-800">
            Executable and script content (.exe, .sh, .js, .zip, etc.) is
            blocked at upload time by extension and content inspection.
            Magic bytes are checked against the declared MIME type — a PDF
            header with a .png extension is rejected.
          </p>
        </div>
      </Card>
    </div>
  );
}
