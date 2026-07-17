// Per-document Drive files (docs/sheets/PLAN.md §13): one visible folder,
// one file per document, each stamped with appProperties {stbApp, stbId,
// stbType, stbHash}. THE FILES ARE THE TRUTH — there is no manifest to
// race on; a device reconciles by listing the folder and comparing hashes.
// Dedupe is by stbId property, never by name (drive.ts's findFile lesson).

import { authFetch } from './drive.ts';

const FOLDER_NAME = 'Storyteller Toolbox';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export interface DriveDocFile {
  fileId: string;
  stbId: string;
  stbType: string;
  stbHash: string;
  modifiedTime: string;
}

let folderId: string | null = null;

async function ensureFolder(): Promise<string> {
  if (folderId) return folderId;
  const q = encodeURIComponent(
    `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
  const res = await authFetch(`${API}/files?q=${q}&fields=files(id)&pageSize=5`);
  const found = ((await res.json()).files ?? [])[0];
  if (found) {
    folderId = found.id as string;
    return folderId;
  }
  const create = await authFetch(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  folderId = ((await create.json()) as { id: string }).id;
  return folderId;
}

/** Every app-stamped file in the folder (docs AND assets), one page of up
 *  to 1000 — far beyond a personal library today; paging can come with it. */
export async function listDocFiles(): Promise<DriveDocFile[]> {
  const parent = await ensureFolder();
  const q = encodeURIComponent(
    `'${parent}' in parents and appProperties has { key='stbApp' and value='1' } and trashed = false`,
  );
  const res = await authFetch(
    `${API}/files?q=${q}&fields=files(id,modifiedTime,appProperties)&pageSize=1000`,
  );
  const files: { id: string; modifiedTime: string; appProperties?: Record<string, string> }[] =
    ((await res.json()).files ?? []);
  return files
    .filter((f) => f.appProperties?.stbId && f.appProperties.stbType)
    .map((f) => ({
      fileId: f.id,
      stbId: f.appProperties!.stbId!,
      stbType: f.appProperties!.stbType!,
      stbHash: f.appProperties!.stbHash ?? '',
      modifiedTime: f.modifiedTime,
    }));
}

function multipartBody(metadata: object, payload: Blob | string, payloadType: string): { body: Blob; boundary: string } {
  const boundary = 'stb-doc-sync';
  const parts: (string | Blob)[] = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${payloadType}\r\n\r\n`,
    payload,
    `\r\n--${boundary}--\r\n`,
  ];
  return { body: new Blob(parts), boundary };
}

/** Create or overwrite one document file. Returns the fileId. */
export async function uploadDocFile(
  existingFileId: string | null,
  name: string,
  props: { stbId: string; stbType: string; stbHash: string },
  payload: Blob | string,
  payloadType = 'application/json',
): Promise<string> {
  const parent = await ensureFolder();
  const metadata: Record<string, unknown> = {
    name,
    appProperties: { stbApp: '1', ...props },
  };
  if (!existingFileId) metadata.parents = [parent];
  const { body, boundary } = multipartBody(metadata, payload, payloadType);
  const url = existingFileId
    ? `${UPLOAD}/files/${existingFileId}?uploadType=multipart&fields=id`
    : `${UPLOAD}/files?uploadType=multipart&fields=id`;
  const res = await authFetch(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return ((await res.json()) as { id: string }).id;
}

export async function downloadDocText(fileId: string): Promise<string> {
  const res = await authFetch(`${API}/files/${fileId}?alt=media`);
  return await res.text();
}

export async function downloadDocBlob(fileId: string): Promise<Blob> {
  const res = await authFetch(`${API}/files/${fileId}?alt=media`);
  return await res.blob();
}

export async function deleteDocFile(fileId: string): Promise<void> {
  await authFetch(`${API}/files/${fileId}`, { method: 'DELETE' });
}
