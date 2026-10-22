// Local filesystem storage adapter — mock for the production adapter.
//
// SECURITY_DESIGN.md (File and document security):
//   - Store files in private external storage; retain controlled metadata/
//     reference, not public paths, in the database.
//   - Authorize every download server-side.
//
// Per AGENTS.md, file storage integrations must be adapter-based and start
// with mock implementations. This adapter writes files to a private
// directory under STORAGE_ROOT (default: /home/z/my-project/storage/dlpms-docs).
// Production swaps this for S3/NAS-backed adapter without changing the
// DocumentMetadata schema (storage_adapter + storage_key remain stable).
//
// The adapter never returns a public URL — downloads go through
// /api/v1/documents/{id}/content, which the route authorizes server-side.

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createReadStream } from 'node:fs';

const STORAGE_ROOT = process.env.STORAGE_ROOT ?? '/home/z/my-project/storage/dlpms-docs';
const ADAPTER_NAME = 'local-fs';

export function getAdapterName() {
  return ADAPTER_NAME;
}

export function getStorageRoot() {
  return STORAGE_ROOT;
}

async function ensureRoot() {
  await mkdir(STORAGE_ROOT, { recursive: true, mode: 0o700 });
}

// Generate a storage key. We use a two-level prefix (first 2 chars of UUID)
// to avoid a single flat directory at scale.
function generateStorageKey(originalFilename) {
  const id = randomUUID();
  const prefix = id.slice(0, 2);
  const ext = (originalFilename?.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase();
  return `${prefix}/${id}${ext}`;
}

export async function persistFile({ buffer, originalFilename }) {
  await ensureRoot();
  const storageKey = generateStorageKey(originalFilename);
  const fullPath = join(STORAGE_ROOT, storageKey);
  // Ensure the prefix directory exists.
  const prefixDir = join(STORAGE_ROOT, storageKey.split('/')[0]);
  await mkdir(prefixDir, { recursive: true, mode: 0o700 });
  await writeFile(fullPath, buffer, { mode: 0o600 });
  const checksum = createHash('sha256').update(buffer).digest('hex');
  return {
    storageAdapter: ADAPTER_NAME,
    storageKey,
    byteSize: buffer.length,
    checksum
  };
}

export async function streamFile(storageKey) {
  // Verify the storage key is well-formed (prefix/id format) to prevent
  // path traversal — never concatenate user-supplied strings into a path.
  if (!/^[a-f0-9]{2}\/[a-f0-9-]+(\.[a-z0-9]+)?$/i.test(storageKey)) {
    throw new Error('Invalid storage key format');
  }
  const fullPath = join(STORAGE_ROOT, storageKey);
  const stats = await stat(fullPath);
  return { stream: createReadStream(fullPath), size: stats.size };
}

export async function readBuffer(storageKey) {
  if (!/^[a-f0-9]{2}\/[a-f0-9-]+(\.[a-z0-9]+)?$/i.test(storageKey)) {
    throw new Error('Invalid storage key format');
  }
  const fullPath = join(STORAGE_ROOT, storageKey);
  return await readFile(fullPath);
}
