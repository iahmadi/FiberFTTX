// Centralized AJAX client holding session Bearer & CSRF tokens strictly in JS memory

interface SessionAuthState {
  token: string;
  csrfToken: string;
}

let sessionAuth: SessionAuthState | null = null;
let onUnauthorizedCallback: (() => void) | null = null;

export function setMemorySession(token: string, csrfToken: string): void {
  sessionAuth = { token, csrfToken };
}

export function clearMemorySession(): void {
  sessionAuth = null;
}

export function getMemorySession(): SessionAuthState | null {
  return sessionAuth;
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

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('X-Requested-With', 'XMLHttpRequest');

  if (sessionAuth) {
    headers.set('Authorization', `Bearer ${sessionAuth.token}`);
    headers.set('X-CSRF-Token', sessionAuth.csrfToken);
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && sessionAuth && !url.includes('/api/auth/login')) {
    clearMemorySession();
    if (onUnauthorizedCallback) onUnauthorizedCallback();
  }

  if (!res.ok) {
    const msg = typeof data?.error === 'string' ? data.error : 'خطا در ارتباط با سرور محلی';
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
