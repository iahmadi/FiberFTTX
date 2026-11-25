// Centralized API fetch helper holding active auth token strictly in JS memory
// Supports both live Firebase ID token retrieval and intranet HMAC session tokens.

import { auth } from '../lib/firebase';

let memoryToken: string | null = null;
let onUnauthorizedCallback: (() => void) | null = null;

export function setMemoryAuthToken(token: string | null): void {
  memoryToken = token;
}

export function getMemoryAuthToken(): string | null {
  return memoryToken;
}

export function setUnauthorizedHandler(cb: () => void): void {
  onUnauthorizedCallback = cb;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function resolveActiveToken(): Promise<string | null> {
  if (memoryToken) {
    if (!memoryToken.startsWith('local.') && auth.currentUser) {
      try {
        const fresh = await auth.currentUser.getIdToken();
        memoryToken = fresh;
      } catch {
        // Offline or token refresh unavailable: keep cached memory token
      }
    }
    return memoryToken;
  }
  if (auth.currentUser) {
    try {
      const tok = await auth.currentUser.getIdToken();
      memoryToken = tok;
      return tok;
    } catch {
      return null;
    }
  }
  return null;
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('X-Requested-With', 'XMLHttpRequest');

  const token = await resolveActiveToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && token && !url.includes('/api/auth/')) {
    setMemoryAuthToken(null);
    if (onUnauthorizedCallback) onUnauthorizedCallback();
  }

  if (!res.ok) {
    const msg = typeof data?.error === 'string' ? data.error : 'خطا در ارتباط با سرور';
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export async function uploadCompressedImage(
  ticketId: number,
  imageType: string,
  blob: Blob,
  filename: string,
): Promise<{ file_path: string; image_type: string; size_bytes: number }> {
  const fd = new FormData();
  fd.append('ticket_id', String(ticketId));
  fd.append('image_type', imageType);
  fd.append('image', blob, filename);

  return apiFetch<{ file_path: string; image_type: string; size_bytes: number }>('/api/upload', {
    method: 'POST',
    body: fd,
  });
}

export async function uploadReceiptImage(
  blob: Blob,
  filename: string,
): Promise<{ file_path: string; size_bytes: number }> {
  const fd = new FormData();
  fd.append('image', blob, filename);

  return apiFetch<{ file_path: string; size_bytes: number }>('/api/uploads/receipt', {
    method: 'POST',
    body: fd,
  });
}

export async function uploadPublicIdentityImage(
  imageType: string,
  blob: Blob,
  filename: string,
): Promise<{ file_path: string; image_type: string; size_bytes: number }> {
  const fd = new FormData();
  fd.append('image_type', imageType);
  fd.append('image', blob, filename);

  const res = await fetch('/api/public/upload-identity', {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.error === 'string' ? data.error : 'خطا در آپلود مدرک هویتی';
    throw new ApiError(msg, res.status);
  }
  return data as { file_path: string; image_type: string; size_bytes: number };
}


