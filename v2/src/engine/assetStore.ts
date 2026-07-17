// Uploaded images (docs/sheets/PLAN.md §14): content-hashed blobs in
// IndexedDB. Uploads are downscaled client-side (≤1600 px long edge,
// JPEG re-encode) BEFORE hashing/storing, so IndexedDB, the Drive backup,
// and print all stay sane. Content-hash ids make every store idempotent:
// the same picture uploaded twice is one record.

export interface AssetMeta {
  id: string;
  mime: string;
  w: number;
  h: number;
  createdAt: number;
}

interface AssetRecord extends AssetMeta {
  blob: Blob;
}

const DB_NAME = 'stb:assets';
const DB_VERSION = 1;
const STORE = 'assets';
const MAX_EDGE = 1600;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('could not open the asset database'));
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('asset database request failed'));
      }),
  );
}

async function hashOf(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

/** Decode + downscale to ≤maxEdge (default MAX_EDGE). Returns the original
 *  file untouched when it is already small enough (no needless recompression). */
async function normalizeImage(file: Blob, maxEdge = MAX_EDGE): Promise<{ blob: Blob; w: number; h: number; mime: string }> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = bitmap;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    if (scale === 1) return { blob: file, w: width, h: height, mime: file.type || 'image/png' };
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('image re-encode failed'))), 'image/jpeg', 0.85),
    );
    return { blob, w, h, mime: 'image/jpeg' };
  } finally {
    bitmap.close();
  }
}

/** Store an uploaded image (downscaled, content-hashed). Idempotent.
 *  maxEdge trims tighter than the default where small is the point
 *  (dice textures, §17). */
export async function putAssetFromFile(file: Blob, maxEdge?: number): Promise<AssetMeta> {
  const { blob, w, h, mime } = await normalizeImage(file, maxEdge);
  const id = await hashOf(blob);
  const existing = await tx('readonly', (s) => s.get(id) as IDBRequest<AssetRecord | undefined>);
  const meta: AssetMeta = existing
    ? { id: existing.id, mime: existing.mime, w: existing.w, h: existing.h, createdAt: existing.createdAt }
    : { id, mime, w, h, createdAt: Date.now() };
  if (!existing) await tx('readwrite', (s) => s.put({ ...meta, blob }));
  return meta;
}

/** Raw write for the backup-restore path (bytes already normalized). */
export async function putAssetRaw(meta: AssetMeta, blob: Blob): Promise<void> {
  const existing = await tx('readonly', (s) => s.getKey(meta.id));
  if (existing === undefined) await tx('readwrite', (s) => s.put({ ...meta, blob }));
}

export async function getAsset(id: string): Promise<AssetRecord | undefined> {
  return await tx('readonly', (s) => s.get(id) as IDBRequest<AssetRecord | undefined>);
}

const urlCache = new Map<string, string>();

/** Object URL for an asset, cached for the session. Null when missing
 *  (e.g. a sheet restored on a device the image never reached). */
export async function getAssetUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const record = await getAsset(id);
  if (!record) return null;
  const url = URL.createObjectURL(record.blob);
  urlCache.set(id, url);
  return url;
}
