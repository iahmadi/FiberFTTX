// Offline-first IndexedDB persistence & auto-sync outbox using `idb`
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type OutboxItemKind = 'ticket_start' | 'ticket_comment' | 'service_record';

export interface OutboxStoredImage {
  imageType: string;
  filename: string;
  blob: Blob;
  originalSize: number;
  compressedSize: number;
}

export interface OfflineOutboxItem {
  id?: number;
  kind: OutboxItemKind;
  ticketId: number;
  payload: Record<string, unknown>;
  images?: OutboxStoredImage[];
  createdAt: string;
  status: 'pending' | 'syncing' | 'error';
  lastError?: string;
}

interface AvaNetworkOfflineDb extends DBSchema {
  outbox: {
    key: number;
    value: OfflineOutboxItem;
    indexes: { 'by-status': string; 'by-ticket': number };
  };
  snapshots: {
    key: string;
    value: {
      key: string;
      data: unknown;
      updatedAt: string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<AvaNetworkOfflineDb>> | null = null;

function getOfflineDb(): Promise<IDBPDatabase<AvaNetworkOfflineDb>> {
  if (!dbPromise) {
    dbPromise = openDB<AvaNetworkOfflineDb>('avanetwork_erp_offline', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('outbox')) {
          const outbox = db.createObjectStore('outbox', {
            keyPath: 'id',
            autoIncrement: true,
          });
          outbox.createIndex('by-status', 'status');
          outbox.createIndex('by-ticket', 'ticketId');
        }
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveOfflineSnapshot<T>(key: string, data: T): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await getOfflineDb();
  await db.put('snapshots', {
    key,
    data,
    updatedAt: new Date().toISOString(),
  });
}

export async function loadOfflineSnapshot<T>(key: string): Promise<T | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await getOfflineDb();
  const row = await db.get('snapshots', key);
  return row ? (row.data as T) : null;
}

export async function queueOfflineMutation(
  item: Omit<OfflineOutboxItem, 'id' | 'createdAt' | 'status'>,
): Promise<number> {
  const db = await getOfflineDb();
  const id = await db.add('outbox', {
    ...item,
    createdAt: new Date().toISOString(),
    status: 'pending',
  });
  return id;
}

export async function listOutboxItems(): Promise<OfflineOutboxItem[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await getOfflineDb();
  const all = await db.getAll('outbox');
  return all.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
}

export async function removeOutboxItem(id: number): Promise<void> {
  const db = await getOfflineDb();
  await db.delete('outbox', id);
}

export async function updateOutboxStatus(
  id: number,
  status: OfflineOutboxItem['status'],
  lastError?: string,
): Promise<void> {
  const db = await getOfflineDb();
  const existing = await db.get('outbox', id);
  if (!existing) return;
  await db.put('outbox', {
    ...existing,
    status,
    lastError,
  });
}

export interface SyncTransport {
  uploadBlob: (
    ticketId: number,
    imageType: string,
    blob: Blob,
    filename: string,
  ) => Promise<{ file_path: string }>;
  apiPost: (url: string, body: unknown) => Promise<unknown>;
}

export async function syncOutboxQueue(transport: SyncTransport): Promise<{
  syncedCount: number;
  failedCount: number;
}> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { syncedCount: 0, failedCount: 0 };
  }

  const items = await listOutboxItems();
  let syncedCount = 0;
  let failedCount = 0;

  for (const item of items) {
    if (!item.id) continue;
    await updateOutboxStatus(item.id, 'syncing');

    try {
      if (item.kind === 'ticket_start') {
        await transport.apiPost(`/api/tickets/${item.ticketId}/start`, item.payload || {});
      } else if (item.kind === 'ticket_comment') {
        await transport.apiPost(`/api/tickets/${item.ticketId}/comments`, item.payload);
      } else if (item.kind === 'service_record') {
        const uploadedImages: Array<{ image_type: string; file_path: string }> = [];
        for (const img of item.images || []) {
          const res = await transport.uploadBlob(
            item.ticketId,
            img.imageType,
            img.blob,
            img.filename,
          );
          uploadedImages.push({ image_type: img.imageType, file_path: res.file_path });
        }
        const existingImages = Array.isArray(item.payload.images)
          ? (item.payload.images as Array<{ image_type: string; file_path: string }>)
          : [];
        await transport.apiPost('/api/service-records', {
          ...item.payload,
          images: [...existingImages, ...uploadedImages],
        });
      }

      await removeOutboxItem(item.id);
      syncedCount += 1;
    } catch (err) {
      failedCount += 1;
      await updateOutboxStatus(
        item.id,
        'error',
        err instanceof Error ? err.message : 'خطا در همگام‌سازی آفلاین',
      );
    }
  }

  return { syncedCount, failedCount };
}
