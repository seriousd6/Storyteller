// Google Drive backup for the Sheet Builder. Browser-only: Google Identity
// Services token flow + the Drive REST API with the `drive.file` scope, so
// the site can see ONLY the single backup file it creates — nothing else in
// the user's Drive. No backend and no API key; a web OAuth client id is
// public by design. Requires the site origin to be listed under "Authorized
// JavaScript origins" on this client id in Google Cloud Console.

const CLIENT_ID = '550823612459-t38c1k097cepbfhprb8ir9f6i7nsj5bo.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
// One backup file for EVERYTHING created on the site — sheets today; maps,
// stat blocks, initiative trackers as they arrive. Earlier builds named the
// file *-sheets.json; found legacy files are renamed on the next save.
const FILE_NAME = 'storyteller-toolbox-data.json';
const LEGACY_FILE_NAME = 'storyteller-toolbox-sheets.json';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface TokenClient {
  requestAccessToken(): void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { message?: string }) => void;
          }): TokenClient;
          revoke?(token: string, done?: () => void): void;
        };
      };
    };
  }
}

/** Fired on window whenever the connection state changes. */
export const DRIVE_EVENT = 'stb:drive-changed';
const LINKED_KEY = 'stb:drive:linked';

function emitChange(): void {
  window.dispatchEvent(new CustomEvent(DRIVE_EVENT));
}

/** True while this page session holds a live Drive token. */
export function isConnected(): boolean {
  return token !== null && Date.now() < token.expiresAt - 60_000;
}

/** True if this browser has linked Drive before (survives reloads; the next
 *  Save/Load usually reconnects without another consent popup). */
export function isLinked(): boolean {
  try {
    return localStorage.getItem(LINKED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Revoke the site's access token and forget the link on this device. */
export async function disconnect(): Promise<void> {
  if (token) {
    try {
      await loadGsi();
      window.google?.accounts.oauth2.revoke?.(token.value, () => {});
    } catch {
      /* revocation is best-effort — the token expires within the hour anyway */
    }
  }
  token = null;
  try {
    localStorage.removeItem(LINKED_KEY);
  } catch {
    /* ignore */
  }
  emitChange();
}

let gsiLoading: Promise<void> | null = null;

function loadGsi(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gsiLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google sign-in — check your connection.'));
    document.head.appendChild(script);
  });
  return gsiLoading;
}

let token: { value: string; expiresAt: number } | null = null;
let client: TokenClient | null = null;
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;

/** Get a Drive access token, prompting the Google consent popup only when
 *  needed. Must be reachable from a user gesture (popup blockers). */
async function getAccessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt - 60_000) return token.value;
  await loadGsi();
  client ??= window.google!.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (response) => {
      const waiter = pending;
      pending = null;
      if (!response.access_token || response.error) {
        waiter?.reject(new Error(response.error ?? 'Google authorization was cancelled.'));
        return;
      }
      token = { value: response.access_token, expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 };
      try {
        localStorage.setItem(LINKED_KEY, '1');
      } catch {
        /* ignore */
      }
      emitChange();
      waiter?.resolve(token.value);
    },
    error_callback: (error) => {
      const waiter = pending;
      pending = null;
      waiter?.reject(new Error(error.message ?? 'Google authorization failed.'));
    },
  });
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    client!.requestAccessToken();
  });
}

/** Authenticated Drive fetch with one re-auth on 401. Exported for the
 *  per-doc sync layer (driveFiles.ts); everything else should go through
 *  the higher-level helpers. */
export async function authFetch(url: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const t = await getAccessToken();
  // normalize via Headers: spreading a Headers INSTANCE as an object yields {}
  // and silently drops the caller's headers (e.g. the multipart Content-Type)
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${t}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401 && retry) {
    token = null; // expired or revoked — re-authorize once
    return authFetch(url, init, false);
  }
  if (!res.ok) throw new Error(`Google Drive request failed (${res.status}).`);
  return res;
}

async function findFile(): Promise<{ id: string; name: string; modifiedTime: string } | null> {
  const q = encodeURIComponent(
    `(name = '${FILE_NAME}' or name = '${LEGACY_FILE_NAME}') and trashed = false`,
  );
  const res = await authFetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&pageSize=10`,
  );
  const data = await res.json();
  const files: { id: string; name: string; modifiedTime: string }[] = data.files ?? [];
  // Duplicates happen (two devices racing their first save both POST a new
  // file). Always operate on the NEWEST candidate — Drive's list order is
  // arbitrary, so `files[0]` could point Save and Load at different files
  // that then never reconcile.
  files.sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1));
  return files.find((f) => f.name === FILE_NAME) ?? files[0] ?? null;
}

/** Connect from a USER GESTURE (a click) — may open the consent popup. */
export async function connectInteractive(): Promise<void> {
  await getAccessToken();
}

/** Best-effort connect with no gesture: succeeds when Google silently
 *  reissues a token (prior consent, active session), otherwise resolves
 *  false — the sync courier's cue to enter its paused state, never to
 *  surprise the user with a popup. */
export async function tryConnect(): Promise<boolean> {
  if (isConnected()) return true;
  if (!isLinked()) return false;
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}

export interface DriveSaveResult {
  modifiedTime: string;
}

/** Upload the backup JSON, creating or overwriting the single backup file
 *  (renaming a legacy-named file in the process). Drive keeps prior
 *  revisions of the file for ~30 days. */
export async function saveToDrive(json: string): Promise<DriveSaveResult> {
  const existing = await findFile();
  const boundary = 'stb-backup';
  const metadata = existing ? { name: FILE_NAME } : { name: FILE_NAME, mimeType: 'application/json' };
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    json,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart&fields=modifiedTime`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=modifiedTime';
  const res = await authFetch(url, {
    method: existing ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return await res.json();
}

/** Download the backup, or null if none has been saved yet. */
export async function loadFromDrive(): Promise<{ json: string; modifiedTime: string } | null> {
  const existing = await findFile();
  if (!existing) return null;
  const res = await authFetch(`https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`);
  return { json: await res.text(), modifiedTime: existing.modifiedTime };
}
