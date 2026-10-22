// Documents module — implements FR-05 (upload supporting documents) and
// SECURITY_DESIGN.md (File and document security):
//   - Upload through authenticated, authorized endpoints only
//   - Validate file type by content inspection (magic bytes), extension,
//     MIME type, size limit, and checksum
//   - Reject executable/unsupported content
//   - Store files in private external storage; retain controlled metadata
//     in the database, never public paths
//   - Authorize every download server-side
//
// Allowed types per FR-05 and WORKFLOWS.md §7: PDF, JPEG, PNG.
//
// The DocumentMetadata row's `uploadedById` field links the document to the
// uploader; ownership is server-side checked on every read/download.
// `classification = 'restricted'` by default per the existing schema.

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db } from '../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import { writeAudit } from '../../middleware/auditMiddleware.js';
import { AuditAction, DocumentVerificationStatus, RoleCode } from '@prisma/client';
import { persistFile, streamFile } from '../../lib/storageAdapter.js';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file (deployment policy)

// Magic-byte signatures for allowed file types. Adding new types requires
// adding both the signature check AND the MIME/extension allowlist below.
const MAGIC_BYTES = [
  { name: 'pdf', offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2D], mediaType: 'application/pdf', extensions: ['pdf'] },
  { name: 'png', offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], mediaType: 'image/png', extensions: ['png'] },
  { name: 'jpeg', offset: 0, bytes: [0xFF, 0xD8, 0xFF], mediaType: 'image/jpeg', extensions: ['jpg', 'jpeg'] }
];

const EXTENSION_ALLOWLIST = new Set(['pdf', 'png', 'jpg', 'jpeg']);
const MIME_ALLOWLIST = new Set(['application/pdf', 'image/png', 'image/jpeg']);

// Forbidden extensions — reject even if magic bytes happen to match.
// Per SECURITY_DESIGN.md "reject executable/unsupported content".
const EXTENSION_BLOCKLIST = new Set([
  'exe', 'dll', 'so', 'bin', 'sh', 'bash', 'js', 'mjs', 'cjs', 'py', 'rb',
  'pl', 'php', 'jar', 'class', 'bat', 'cmd', 'ps1', 'vbs', 'scr',
  'zip', 'tar', 'gz', 'bz2', '7z', 'rar', 'iso', 'dmg'
]);

function detectType(buffer) {
  for (const sig of MAGIC_BYTES) {
    if (buffer.length < sig.bytes.length + sig.offset) continue;
    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buffer[sig.offset + i] !== sig.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) return sig;
  }
  return null;
}

function getExtension(filename) {
  const m = /\.([a-z0-9]+)$/i.exec(filename ?? '');
  return m ? m[1].toLowerCase() : '';
}

export function validateUpload({ file }) {
  if (!file) {
    throw new AppError(400, 'NO_FILE', 'No file was uploaded.');
  }
  if (!file.buffer || !file.buffer.length) {
    throw new AppError(400, 'EMPTY_FILE', 'Uploaded file is empty.');
  }
  if (file.buffer.length > MAX_BYTES) {
    throw new AppError(413, 'FILE_TOO_LARGE', `File exceeds the ${MAX_BYTES} byte limit.`);
  }
  const ext = getExtension(file.originalname);
  if (EXTENSION_BLOCKLIST.has(ext)) {
    throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', `Extension '.${ext}' is blocked.`);
  }
  if (!EXTENSION_ALLOWLIST.has(ext)) {
    throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', `Extension '.${ext}' is not allowed. Use pdf, png, jpg, jpeg.`);
  }
  if (file.mimetype && !MIME_ALLOWLIST.has(file.mimetype)) {
    throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', `MIME type '${file.mimetype}' is not allowed.`);
  }
  const sig = detectType(file.buffer);
  if (!sig) {
    throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'File content does not match any allowed type (PDF, PNG, JPEG).');
  }
  // Defense in depth: if MIME header says one type but magic bytes say another, reject.
  if (file.mimetype && sig.mediaType !== file.mimetype) {
    throw new AppError(415, 'MIME_MISMATCH', `MIME type '${file.mimetype}' does not match the file content ('${sig.mediaType}').`);
  }
  // If extension claims a type that doesn't match magic-byte detection, reject.
  if (ext && !sig.extensions.includes(ext)) {
    throw new AppError(415, 'EXTENSION_MISMATCH', `Extension '.${ext}' does not match the file content ('${sig.name}').`);
  }
  return { sig, ext };
}

export async function uploadDocument({ file, request, classification = 'restricted' }) {
  const { sig, ext } = validateUpload({ file });
  // Mock malware scan status. Per SECURITY_DESIGN.md "Malware scanning/
  // quarantine and final file limits are implementation/deployment decisions
  // pending policy" — we record 'pending' and leave actual scanning to a
  // deployment integration. The schema already reserves the field.
  const safeFilename = `${randomUUID().slice(0, 8)}.${ext}`;
  const stored = await persistFile({
    buffer: file.buffer,
    originalFilename: file.originalname,
    mediaType: sig.mediaType
  });

  const doc = await db.documentMetadata.create({
    data: {
      uploadedById: request.user.id,
      storageAdapter: stored.storageAdapter,
      storageKey: stored.storageKey,
      originalFilename: file.originalname,
      safeFilename,
      mediaType: sig.mediaType,
      byteSize: BigInt(stored.byteSize),
      checksum: stored.checksum,
      classification,
      scanStatus: 'pending'
    }
  });

  await writeAudit(request, AuditAction.DocumentUpload, {
    entityType: 'DocumentMetadata',
    entityId: doc.id,
    newSnapshot: { originalFilename: doc.originalFilename, mediaType: doc.mediaType, byteSize: stored.byteSize, checksum: doc.checksum, classification }
  });

  return documentDto(doc, { withStorage: false });
}

export async function getDocument({ id, request }) {
  const doc = await db.documentMetadata.findUnique({ where: { id } });
  if (!doc) {
    throw new AppError(404, 'NOT_FOUND', 'Document not found.');
  }
  // Server-side ownership: uploader, OR an officer/admin (review path), OR
  // the document is attached to a transfer where the user is a party.
  const roleCode = request.role?.code;
  if (roleCode === RoleCode.Citizen && doc.uploadedById !== request.user.id) {
    // Check if the document is attached to a transfer where this citizen is a party.
    const attached = await db.transferDocument.findFirst({
      where: { documentMetaId: id },
      include: { transfer: { include: { seller: true, buyer: true } } }
    });
    const ownerId = request.user.ownerProfile?.id;
    const isParty = attached && (attached.transfer.sellerOwnerId === ownerId || attached.transfer.buyerOwnerId === ownerId);
    if (!isParty) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this document.');
    }
  }
  return documentDto(doc, { withStorage: false });
}

export async function streamDocumentContent({ id, request, response }) {
  const doc = await getDocument({ id, request });
  // Audit the download BEFORE streaming so a stream failure does not skip
  // the audit row.
  await writeAudit(request, AuditAction.DocumentDownload, {
    entityType: 'DocumentMetadata',
    entityId: id,
    newSnapshot: { originalFilename: doc.originalFilename, downloadedAt: new Date().toISOString() }
  });

  let stream, size;
  try {
    const result = await streamFile(doc.storageKey);
    stream = result.stream;
    size = result.size;
  } catch {
    throw new AppError(500, 'STORAGE_ERROR', 'Could not retrieve the file from storage.');
  }

  response.setHeader('Content-Type', doc.mediaType);
  response.setHeader('Content-Length', String(size));
  response.setHeader('Content-Disposition', `attachment; filename="${doc.safeFilename}"`);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'private, no-store');
  // Pipe the file stream directly to the response — never buffer the whole
  // file in memory; large PDFs and images stream cleanly.
  stream.on('error', () => {
    if (!response.headersSent) {
      response.status(500).json({ error: { code: 'STORAGE_ERROR', message: 'Failed to stream the file.' } });
    } else {
      response.end();
    }
  });
  stream.pipe(response);
}

// ---------------------------------------------------------------------------
// Transfer-document wiring — used by transfersService
// ---------------------------------------------------------------------------

const reviewSchema = z.object({
  verificationStatus: z.nativeEnum(DocumentVerificationStatus),
  reason: z.string().min(1).max(2000),
  expectedVersion: z.number().int().positive()
});

const attachSchema = z.object({
  documentId: z.string().uuid(),
  documentType: z.string().min(1).max(100)
});

export async function attachToTransfer({ transferId, input, request }) {
  const parsed = attachSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request body failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const transfer = await db.transferRequest.findUnique({ where: { id: transferId } });
  if (!transfer) {
    throw new AppError(404, 'NOT_FOUND', 'Transfer not found.');
  }
  // Ownership: seller or buyer for citizens; officers may attach on their behalf.
  const roleCode = request.role?.code;
  const ownerId = request.user.ownerProfile?.id;
  if (roleCode === RoleCode.Citizen && transfer.sellerOwnerId !== ownerId && transfer.buyerOwnerId !== ownerId) {
    throw new AppError(403, 'FORBIDDEN', 'You are not a party to this transfer.');
  }
  const doc = await db.documentMetadata.findUnique({ where: { id: parsed.data.documentId } });
  if (!doc) {
    throw new AppError(404, 'NOT_FOUND', 'Document not found.');
  }
  // The uploader must be the citizen attaching the document, OR an officer.
  if (roleCode === RoleCode.Citizen && doc.uploadedById !== request.user.id) {
    throw new AppError(403, 'FORBIDDEN', 'You can only attach documents you uploaded.');
  }

  // Idempotency: if the (transferId, documentMetaId) pair already exists, return it.
  const existing = await db.transferDocument.findFirst({
    where: { transferId, documentMetaId: parsed.data.documentId }
  });
  if (existing) {
    return transferDocumentDto(existing);
  }

  const td = await db.transferDocument.create({
    data: {
      transferId,
      documentMetaId: parsed.data.documentId,
      documentType: parsed.data.documentType,
      verificationStatus: DocumentVerificationStatus.Pending
    },
    include: { documentMeta: true, transfer: true }
  });
  await writeAudit(request, AuditAction.Create, {
    entityType: 'TransferDocument',
    entityId: td.id,
    newSnapshot: { transferId, documentId: parsed.data.documentId, documentType: parsed.data.documentType }
  });
  return transferDocumentDto(td);
}

export async function listTransferDocuments({ transferId, request }) {
  const transfer = await db.transferRequest.findUnique({ where: { id: transferId } });
  if (!transfer) {
    throw new AppError(404, 'NOT_FOUND', 'Transfer not found.');
  }
  const roleCode = request.role?.code;
  const ownerId = request.user.ownerProfile?.id;
  if (roleCode === RoleCode.Citizen && transfer.sellerOwnerId !== ownerId && transfer.buyerOwnerId !== ownerId) {
    throw new AppError(403, 'FORBIDDEN', 'You are not a party to this transfer.');
  }
  const docs = await db.transferDocument.findMany({
    where: { transferId },
    include: { documentMeta: true },
    orderBy: { createdAt: 'asc' }
  });
  return { items: docs.map(transferDocumentDto), total: docs.length };
}

export async function reviewTransferDocument({ id, input, request }) {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request body failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const td = await db.transferDocument.findUnique({
    where: { id },
    include: { transfer: true, documentMeta: true }
  });
  if (!td) {
    throw new AppError(404, 'NOT_FOUND', 'Transfer document not found.');
  }
  if (td.version !== parsed.data.expectedVersion) {
    throw new AppError(409, 'CONFLICT', 'Stale version.', {
      currentVersion: td.version,
      expectedVersion: parsed.data.expectedVersion
    });
  }
  const updated = await db.transferDocument.update({
    where: { id },
    data: {
      verificationStatus: parsed.data.verificationStatus,
      verificationReason: parsed.data.reason,
      verifiedById: request.user.id,
      verifiedAt: new Date(),
      version: { increment: 1 }
    },
    include: { documentMeta: true, transfer: true }
  });
  await writeAudit(request, AuditAction.DocumentReview, {
    entityType: 'TransferDocument',
    entityId: id,
    oldSnapshot: { verificationStatus: td.verificationStatus },
    newSnapshot: { verificationStatus: parsed.data.verificationStatus, reason: parsed.data.reason }
  });
  return transferDocumentDto(updated);
}

// ---------------------------------------------------------------------------
// DTOs — never expose storageKey or storageAdapter to citizens; only metadata
// that the citizen needs to identify the document. Staff with admin/officer
// roles can see the storage info too, but the file itself is always gated
// behind the /content endpoint.
// ---------------------------------------------------------------------------

function documentDto(doc, { withStorage = false } = {}) {
  return {
    id: doc.id,
    uploadedById: doc.uploadedById,
    originalFilename: doc.originalFilename,
    safeFilename: doc.safeFilename,
    mediaType: doc.mediaType,
    byteSize: doc.byteSize?.toString?.() ?? String(doc.byteSize),
    checksum: doc.checksum,
    classification: doc.classification,
    scanStatus: doc.scanStatus,
    uploadedAt: doc.uploadedAt,
    version: doc.version,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...(withStorage ? { storageAdapter: doc.storageAdapter, storageKey: doc.storageKey } : {})
  };
}

function transferDocumentDto(td) {
  return {
    id: td.id,
    transferId: td.transferId,
    documentMetaId: td.documentMetaId,
    documentType: td.documentType,
    verificationStatus: td.verificationStatus,
    verificationReason: td.verificationReason,
    verifiedById: td.verifiedById ?? null,
    verifiedAt: td.verifiedAt,
    version: td.version,
    createdAt: td.createdAt,
    updatedAt: td.updatedAt,
    ...(td.documentMeta
      ? { document: { id: td.documentMeta.id, originalFilename: td.documentMeta.originalFilename, mediaType: td.documentMeta.mediaType, byteSize: td.documentMeta.byteSize?.toString?.() ?? String(td.documentMeta.byteSize) } }
      : {})
  };
}
