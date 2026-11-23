import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  Cable,
  MinusCircle,
  PackagePlus,
  Plus,
  RotateCcw,
  Search,
  Truck,
  X,
} from 'lucide-react';
import type {
  AuthUser,
  InventoryItemRecord,
  ModemBrandItem,
  SpoolItem,
  VanStockItem,
} from '../types/erp';
import { apiFetch } from '../utils/api';
import { toPersianDigits } from '../lib/jalali';
import {
  LOW_SPOOL_THRESHOLD_PCT,
  detectSpoolDrops,
  getLowSpoolWarnings,
  getSpoolPercentRemaining,
  isSpoolLowStock,
} from '../lib/fiberLogic';
import { matchesHardwareQuery } from '../lib/searchFilter';
import { Modal } from '../components/Modal';
import { SearchableSelect } from '../components/SearchableSelect';
import { ToastContainer, type ToastNotice } from '../components/Toast';

interface InstallerOption {
  id: number;
  first_name: string;
  last_name: string;
  role_name: string;
}

export function InventoryPage({ user }: { user: AuthUser }) {
  const [activeTab, setActiveTab] = useState<'spools' | 'items' | 'van'>('spools');
  const [spools, setSpools] = useState<SpoolItem[]>([]);
  const [items, setItems] = useState<InventoryItemRecord[]>([]);
  const [vanStock, setVanStock] = useState<VanStockItem[]>([]);
  const [modemBrands, setModemBrands] = useState<ModemBrandItem[]>([]);
  const [installers, setInstallers] = useState<InstallerOption[]>([]);

  const [filterType, setFilterType] = useState<'all' | 'outdoor' | 'indoor'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add Spool Modal
  const [addSpoolOpen, setAddSpoolOpen] = useState(false);
  const [spoolCode, setSpoolCode] = useState('');
  const [cableType, setCableType] = useState<'outdoor' | 'indoor'>('outdoor');
  const [initialLength, setInitialLength] = useState('1000');
  const [assignOnCreate, setAssignOnCreate] = useState('');

  // Transfer Spool Modal
  const [transferSpool, setTransferSpool] = useState<SpoolItem | null>(null);
  const [transferTarget, setTransferTarget] = useState('');

  // Add Warehouse Item Modal
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemType, setItemType] = useState<'modem' | 'unit' | 'spool'>('modem');
  const [itemBrandId, setItemBrandId] = useState('');
  const [itemInitialQty, setItemInitialQty] = useState('10');

  // Transfer Item / Modem to Van Stock Modal
  const [transferItem, setTransferItem] = useState<InventoryItemRecord | null>(null);
  const [vanInstallerId, setVanInstallerId] = useState('');
  const [vanSerialMode, setVanSerialMode] = useState<'bulk' | 'serial'>('bulk');
  const [vanQuantity, setVanQuantity] = useState('1');
  const [vanSerial, setVanSerial] = useState('');

  // Consume / Deduct Spool Modal
  const [consumeSpool, setConsumeSpool] = useState<SpoolItem | null>(null);
  const [consumeMeters, setConsumeMeters] = useState('50');

  // Red Warning Toasts & Configurable Spool Low-Stock Threshold (default 10%)
  const [thresholdPct, setThresholdPct] = useState<number>(LOW_SPOOL_THRESHOLD_PCT);
  const thresholdPctRef = useRef<number>(LOW_SPOOL_THRESHOLD_PCT);
  thresholdPctRef.current = thresholdPct;
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const prevSpoolsRef = useRef<SpoolItem[] | null>(null);
  const initialLowWarnedRef = useRef(false);

  const canManage = user.isSuperAdmin || user.permissions.includes('can_manage_inventory');

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushRedToast = useCallback(
    (title: string, message: string) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, message, variant: 'danger' }]);
      window.setTimeout(() => {
        dismissToast(id);
      }, 9000);
    },
    [dismissToast],
  );

  const notifyLowSpools = useCallback(
    (list: SpoolItem[], pctLimit: number) => {
      const lowWarnings = getLowSpoolWarnings(list, pctLimit);
      if (lowWarnings.length === 0) return;
      const summary = lowWarnings
        .slice(0, 3)
        .map(
          (w) =>
            `${w.spool_code} (${toPersianDigits(w.current_length)} متر / ${toPersianDigits(w.percentRemaining)}٪)`,
        )
        .join('، ');
      pushRedToast(
        `هشدار کمبود موجودی قرقره کابل (زیر ${toPersianDigits(pctLimit)}٪)`,
        `موجودی ${toPersianDigits(lowWarnings.length)} قرقره به زیر حد آستانه رسیده است: ${summary}`,
      );
    },
    [pushRedToast],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, invRes] = await Promise.all([
        apiFetch<{ spools: SpoolItem[] }>('/api/spools'),
        apiFetch<{
          items: InventoryItemRecord[];
          vanStock: VanStockItem[];
          modemBrands: ModemBrandItem[];
        }>('/api/inventory'),
      ]);

      const activeThreshold = thresholdPctRef.current;

      // Detect drops falling below threshold (default < 10%)
      if (prevSpoolsRef.current !== null) {
        const drops = detectSpoolDrops(prevSpoolsRef.current, sRes.spools, activeThreshold);
        for (const drop of drops) {
          if (drop.isLow) {
            pushRedToast(
              `هشدار کاهش بحرانی موجودی قرقره (زیر ${toPersianDigits(activeThreshold)}٪)`,
              `موجودی قرقره ${drop.spool.spool_code} پس از کسر ${toPersianDigits(drop.deductedMeters)} متر به ${toPersianDigits(drop.spool.current_length)} متر (${toPersianDigits(drop.percentRemaining)}٪) رسید.`,
            );
          }
        }
      } else if (!initialLowWarnedRef.current) {
        initialLowWarnedRef.current = true;
        notifyLowSpools(sRes.spools, activeThreshold);
      }

      prevSpoolsRef.current = sRes.spools;
      setSpools(sRes.spools);
      setItems(invRes.items);
      setVanStock(invRes.vanStock);
      setModemBrands(invRes.modemBrands);

      if (canManage) {
        const uRes = await apiFetch<{ users: InstallerOption[] }>('/api/users/installers');
        setInstallers(uRes.users);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت موجودی انبار');
    } finally {
      setLoading(false);
    }
  }, [canManage, notifyLowSpools, pushRedToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredSpools = useMemo(
    () =>
      spools.filter(
        (s) =>
          (filterType === 'all' || s.cable_type === filterType) &&
          matchesHardwareQuery([s.spool_code, s.installer_name, s.cable_type], searchQuery),
      ),
    [spools, filterType, searchQuery],
  );

  const filteredItems = useMemo(
    () =>
      items.filter((i) =>
        matchesHardwareQuery([i.name, i.brand_name, i.type], searchQuery),
      ),
    [items, searchQuery],
  );

  const filteredVanStock = useMemo(
    () =>
      vanStock.filter((v) =>
        matchesHardwareQuery(
          [v.item_name, v.brand_name, v.installer_name, v.serial_number, v.item_type],
          searchQuery,
        ),
      ),
    [vanStock, searchQuery],
  );

  const installerOptions = useMemo(
    () => [
      { value: '', label: 'انبار مرکزی (تحویل به انبار)' },
      ...installers.map((u) => ({
        value: u.id,
        label: `${u.first_name} ${u.last_name}`,
        sublabel: u.role_name,
      })),
    ],
    [installers],
  );

  const vanTargetOptions = useMemo(
    () =>
      installers.map((u) => ({
        value: u.id,
        label: `${u.first_name} ${u.last_name}`,
        sublabel: u.role_name,
      })),
    [installers],
  );

  const handleCreateSpool = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/spools', {
        method: 'POST',
        body: JSON.stringify({
          spool_code: spoolCode,
          cable_type: cableType,
          initial_length: Number(initialLength),
          assigned_installer_id: assignOnCreate ? Number(assignOnCreate) : null,
        }),
      });
      setSpoolCode('');
      setAddSpoolOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت قرقره جدید');
    }
  };

  const handleTransferSpool = async (e: FormEvent) => {
    e.preventDefault();
    if (!transferSpool) return;
    setError(null);
    try {
      await apiFetch(`/api/spools/${transferSpool.id}/transfer`, {
        method: 'PATCH',
        body: JSON.stringify({
          assigned_installer_id: transferTarget ? Number(transferTarget) : null,
        }),
      });
      setTransferSpool(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در انتقال قرقره');
    }
  };

  const handleConsumeSpool = async (e: FormEvent) => {
    e.preventDefault();
    if (!consumeSpool) return;
    setError(null);
    try {
      await apiFetch(`/api/spools/${consumeSpool.id}/consume`, {
        method: 'PATCH',
        body: JSON.stringify({ meters: Number(consumeMeters) || 0 }),
      });
      setConsumeSpool(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت کسر متراژ قرقره');
    }
  };

  const handleCreateItem = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/inventory/items', {
        method: 'POST',
        body: JSON.stringify({
          name: itemName,
          type: itemType,
          modem_brand_id: itemType === 'modem' && itemBrandId ? Number(itemBrandId) : null,
          total_quantity: Number(itemInitialQty) || 0,
        }),
      });
      setItemName('');
      setItemBrandId('');
      setItemInitialQty('10');
      setAddItemOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت کالای انبار');
    }
  };

  const handleAdjustItem = async (itemId: number, delta: number) => {
    setError(null);
    try {
      await apiFetch(`/api/inventory/items/${itemId}/adjust`, {
        method: 'PATCH',
        body: JSON.stringify({ delta }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در اصلاح موجودی');
    }
  };

  const handleTransferToVan = async (e: FormEvent) => {
    e.preventDefault();
    if (!transferItem || !vanInstallerId) return;
    setError(null);
    try {
      await apiFetch('/api/inventory/van-stock/transfer', {
        method: 'POST',
        body: JSON.stringify({
          user_id: Number(vanInstallerId),
          item_id: transferItem.id,
          serial_number: vanSerialMode === 'serial' ? vanSerial.trim() : null,
          quantity: vanSerialMode === 'serial' ? 1 : Number(vanQuantity) || 1,
        }),
      });
      setTransferItem(null);
      setVanSerial('');
      setVanQuantity('1');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در تحویل کالا به خودروی نصاب');
    }
  };

  const handleReturnFromVan = async (vanId: number) => {
    setError(null);
    try {
      await apiFetch(`/api/inventory/van-stock/${vanId}/return`, { method: 'POST' });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در عودت کالا به انبار مرکزی');
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('spools')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'spools' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              <Cable className="h-3.5 w-3.5" />
              <span>قرقره‌های کابل ({toPersianDigits(spools.length)})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('items')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'items' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              <Boxes className="h-3.5 w-3.5" />
              <span>کالاها و مودم‌ها ({toPersianDigits(items.length)})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('van')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'van' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              <Truck className="h-3.5 w-3.5" />
              <span>موجودی خودرو (Van Stock) ({toPersianDigits(vanStock.length)})</span>
            </button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 right-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              aria-label="جستجوی لحظه‌ای انبار و تجهیزات"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجوی کد قرقره، نام کالا، سریال یا نصاب..."
              className="h-9 w-72 max-w-full rounded-lg border border-slate-300 pr-9 pl-8 text-xs focus:border-teal-600 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="پاک کردن جستجو"
                onClick={() => setSearchQuery('')}
                className="absolute top-2 left-2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'spools' && (
            <>
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1">
                <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                <label htmlFor="spool-threshold" className="text-[11px] font-medium text-slate-600">
                  آستانه هشدار:
                </label>
                <select
                  id="spool-threshold"
                  aria-label="حد آستانه هشدار قرقره"
                  value={thresholdPct}
                  onChange={(e) => {
                    const nextPct = Number(e.target.value);
                    setThresholdPct(nextPct);
                    notifyLowSpools(spools, nextPct);
                  }}
                  className="h-7 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800 focus:border-teal-600 focus:outline-none"
                >
                  <option value={5}>زیر ۵٪</option>
                  <option value={10}>زیر ۱۰٪</option>
                  <option value={15}>زیر ۱۵٪</option>
                  <option value={20}>زیر ۲۰٪</option>
                </select>
              </div>

              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                {(
                  [
                    ['all', 'همه'],
                    ['outdoor', 'بیرونی'],
                    ['indoor', 'داخلی'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilterType(key)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      filterType === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {canManage && activeTab === 'spools' && (
            <button
              type="button"
              onClick={() => setAddSpoolOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700 whitespace-nowrap"
            >
              <PackagePlus className="h-4 w-4" />
              <span>ثبت قرقره جدید</span>
            </button>
          )}

          {canManage && activeTab !== 'spools' && (
            <button
              type="button"
              onClick={() => setAddItemOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>افزودن کالا / مودم به انبار</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Tab 1: Cable Spools */}
      {activeTab === 'spools' && (
        <div className="rounded-xl border border-slate-200 bg-white">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">در حال بارگذاری قرقره‌ها...</div>
          ) : filteredSpools.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">قرقره‌ای با این مشخصات یافت نشد.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-4 py-3">کد قرقره</th>
                    <th className="px-4 py-3">نوع کابل</th>
                    <th className="px-4 py-3">متراژ اولیه</th>
                    <th className="px-4 py-3">مانده فعلی</th>
                    <th className="px-4 py-3">تحویل‌گیرنده (Van Stock)</th>
                    {canManage && <th className="px-4 py-3">عملیات</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSpools.map((s) => {
                    const pct = getSpoolPercentRemaining(s);
                    const lowStock = isSpoolLowStock(s, thresholdPct);
                    return (
                      <tr key={s.id} className="hover:bg-slate-50/70">
                        <td dir="ltr" className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                          {s.spool_code}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700">
                          {s.cable_type === 'outdoor' ? 'فضای باز (Outdoor)' : 'داخلی (Indoor)'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 tabular-nums">
                          {toPersianDigits(s.initial_length)} متر
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span
                              className={`w-24 text-xs tabular-nums ${
                                lowStock ? 'font-bold text-red-700' : 'font-semibold text-slate-900'
                              }`}
                            >
                              {toPersianDigits(s.current_length)} متر ({toPersianDigits(pct)}٪)
                            </span>
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                              <div
                                style={{ width: `${pct}%` }}
                                className={`h-full ${lowStock ? 'bg-red-600' : 'bg-teal-600'}`}
                              />
                            </div>
                            {lowStock && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                <span>زیر آستانه</span>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-700">
                          {s.installer_name ? `خودرو: ${s.installer_name}` : 'انبار مرکزی'}
                        </td>
                        {canManage && (
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setTransferSpool(s);
                                  setTransferTarget(
                                    s.assigned_installer_id ? String(s.assigned_installer_id) : '',
                                  );
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                              >
                                <ArrowLeftRight className="h-3.5 w-3.5" />
                                <span>انتقال / تحویل</span>
                              </button>
                              <button
                                type="button"
                                disabled={s.current_length <= 0}
                                onClick={() => {
                                  setConsumeSpool(s);
                                  setConsumeMeters(String(Math.min(50, Math.max(1, s.current_length))));
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                              >
                                <MinusCircle className="h-3.5 w-3.5" />
                                <span>کسر متراژ</span>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Warehouse General Items & Modems */}
      {activeTab === 'items' && (
        <div className="rounded-xl border border-slate-200 bg-white">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">در حال بارگذاری اقلام انبار...</div>
          ) : filteredItems.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">کالایی یافت نشد.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-4 py-3">نام کالا / تجهیز</th>
                    <th className="px-4 py-3">دسته‌بندی</th>
                    <th className="px-4 py-3">برند مرتبط</th>
                    <th className="px-4 py-3">موجودی انبار مرکزی</th>
                    <th className="px-4 py-3">مجموع در خودروی نصابان</th>
                    {canManage && <th className="px-4 py-3">عملیات انبار</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {item.type === 'modem'
                          ? 'مودم / ONT'
                          : item.type === 'spool'
                            ? 'قرقره کابل'
                            : 'تجهیزات مصرفی (عددی)'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{item.brand_name || '—'}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-900 tabular-nums">
                        {toPersianDigits(item.total_quantity)} عدد
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 tabular-nums">
                        {toPersianDigits(item.van_allocated_quantity || 0)} عدد
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleAdjustItem(item.id, 1)}
                              className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                              title="افزایش ۱ عدد به انبار مرکزی"
                            >
                              +۱
                            </button>
                            <button
                              type="button"
                              disabled={item.total_quantity <= 0}
                              onClick={() => {
                                setTransferItem(item);
                                setVanInstallerId(installers[0] ? String(installers[0].id) : '');
                                setVanSerialMode(item.type === 'modem' ? 'serial' : 'bulk');
                                setVanQuantity('1');
                                setVanSerial('');
                              }}
                              className="inline-flex items-center gap-1 rounded-md bg-teal-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                            >
                              <Truck className="h-3.5 w-3.5" />
                              <span>تحویل به خودرو نصاب</span>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Installer Van Stock (Modems & General Items) */}
      {activeTab === 'van' && (
        <div className="rounded-xl border border-slate-200 bg-white">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">در حال بارگذاری موجودی خودروها...</div>
          ) : filteredVanStock.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              موردی در موجودی خودروی نصابان ثبت نشده است.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-4 py-3">نصاب (صاحب خودرو)</th>
                    <th className="px-4 py-3">نام کالا / مودم</th>
                    <th className="px-4 py-3">نوع</th>
                    <th className="px-4 py-3">شماره سریال (در صورت ثبت قبلی)</th>
                    <th className="px-4 py-3">تعداد</th>
                    {canManage && <th className="px-4 py-3">عودت</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVanStock.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-slate-900">{v.installer_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-800">
                        <div>{v.item_name}</div>
                        {v.brand_name && (
                          <div className="text-[11px] text-slate-400">{v.brand_name}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {v.item_type === 'modem' ? 'مودم شرکت' : 'کالای مصرفی'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {v.serial_number ? (
                          <span dir="ltr" className="font-mono font-semibold text-teal-800">
                            {v.serial_number}
                          </span>
                        ) : (
                          <span className="text-slate-400">تعدادی (ثبت سریال هنگام نصب)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-900 tabular-nums">
                        {toPersianDigits(v.quantity)} عدد
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleReturnFromVan(v.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>عودت به انبار</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Spool Modal */}
      <Modal open={addSpoolOpen} onClose={() => setAddSpoolOpen(false)} title="ثبت قرقره کابل جدید">
        <form onSubmit={handleCreateSpool} className="space-y-4">
          <div>
            <label htmlFor="sp-code" className="mb-1 block text-xs font-medium text-slate-700">
              کد یکتای قرقره
            </label>
            <input
              id="sp-code"
              type="text"
              required
              value={spoolCode}
              onChange={(e) => setSpoolCode(e.target.value.toUpperCase())}
              placeholder="مثال: OUT-1405-08"
              className="h-10 w-full rounded-lg border border-slate-300 px-3 font-mono text-xs dir-ltr text-left focus:border-teal-600 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sp-type" className="mb-1 block text-xs font-medium text-slate-700">
                نوع کابل
              </label>
              <select
                id="sp-type"
                value={cableType}
                onChange={(e) => setCableType(e.target.value as 'outdoor' | 'indoor')}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs focus:border-teal-600 focus:outline-none"
              >
                <option value="outdoor">فضای باز (Outdoor)</option>
                <option value="indoor">داخلی (Indoor)</option>
              </select>
            </div>
            <div>
              <label htmlFor="sp-len" className="mb-1 block text-xs font-medium text-slate-700">
                متراژ اولیه (متر)
              </label>
              <input
                id="sp-len"
                type="number"
                min={1}
                required
                value={initialLength}
                onChange={(e) => setInitialLength(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm tabular-nums focus:border-teal-600 focus:outline-none"
              />
            </div>
          </div>
          <SearchableSelect
            label="تحویل اولیه به نصاب"
            options={installerOptions}
            value={assignOnCreate}
            onChange={setAssignOnCreate}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAddSpoolOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs text-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700"
            >
              ذخیره قرقره
            </button>
          </div>
        </form>
      </Modal>

      {/* Transfer Spool Modal */}
      <Modal
        open={Boolean(transferSpool)}
        onClose={() => setTransferSpool(null)}
        title={transferSpool ? `انتقال قرقره ${transferSpool.spool_code}` : 'انتقال قرقره'}
      >
        <form onSubmit={handleTransferSpool} className="space-y-4">
          <SearchableSelect
            label="مقصد جدید (خودروی نصاب یا انبار مرکزی)"
            options={installerOptions}
            value={transferTarget}
            onChange={setTransferTarget}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setTransferSpool(null)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs text-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700"
            >
              تایید انتقال
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Warehouse Item / Modem Modal */}
      <Modal
        open={addItemOpen}
        onClose={() => setAddItemOpen(false)}
        title="افزودن کالا یا مودم جدید به انبار مرکزی"
      >
        <form onSubmit={handleCreateItem} className="space-y-4">
          <div>
            <label htmlFor="inv-name" className="mb-1 block text-xs font-medium text-slate-700">
              نام کالا / مدل مودم <span className="text-red-600">*</span>
            </label>
            <input
              id="inv-name"
              type="text"
              required
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="مثال: مودم TP-Link XZ000-G3"
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-teal-600 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="inv-type" className="mb-1 block text-xs font-medium text-slate-700">
                نوع کالا
              </label>
              <select
                id="inv-type"
                value={itemType}
                onChange={(e) => setItemType(e.target.value as 'modem' | 'unit' | 'spool')}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs focus:border-teal-600 focus:outline-none"
              >
                <option value="modem">مودم / ONT</option>
                <option value="unit">اقلام مصرفی عددی</option>
                <option value="spool">کابل قرقره‌ای</option>
              </select>
            </div>
            <div>
              <label htmlFor="inv-qty" className="mb-1 block text-xs font-medium text-slate-700">
                موجودی اولیه (عدد)
              </label>
              <input
                id="inv-qty"
                type="number"
                min={0}
                required
                value={itemInitialQty}
                onChange={(e) => setItemInitialQty(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm tabular-nums focus:border-teal-600 focus:outline-none"
              />
            </div>
          </div>

          {itemType === 'modem' && (
            <SearchableSelect
              label="اتصال به الگوی برند مودم (اختیاری)"
              options={modemBrands.map((b) => ({
                value: b.id,
                label: b.name,
                sublabel: `پیشوند: ${b.serial_prefix}`,
              }))}
              value={itemBrandId}
              onChange={setItemBrandId}
              placeholder="انتخاب برند جهت اعتبارسنجی سریال..."
            />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAddItemOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs text-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700"
            >
              ثبت در انبار مرکزی
            </button>
          </div>
        </form>
      </Modal>

      {/* Transfer Item / Modem to Installer Van Stock Modal */}
      <Modal
        open={Boolean(transferItem)}
        onClose={() => setTransferItem(null)}
        title={transferItem ? `تحویل «${transferItem.name}» به خودروی نصاب` : 'تحویل به انبار خودرو'}
      >
        {transferItem && (
          <form onSubmit={handleTransferToVan} className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 tabular-nums">
              موجودی فعلی در انبار مرکزی: <span className="font-semibold text-slate-900">{toPersianDigits(transferItem.total_quantity)} عدد</span>
            </div>

            <SearchableSelect
              label="انتخاب نصاب مقصد"
              required
              options={vanTargetOptions}
              value={vanInstallerId}
              onChange={setVanInstallerId}
              placeholder="انتخاب نصاب..."
            />

            {transferItem.type === 'modem' && (
              <div className="flex items-center gap-2 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setVanSerialMode('serial')}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                    vanSerialMode === 'serial' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  ثبت با سریال مشخص
                </button>
                <button
                  type="button"
                  onClick={() => setVanSerialMode('bulk')}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                    vanSerialMode === 'bulk' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  تحویل تعدادی (ورود سریال هنگام نصب)
                </button>
              </div>
            )}

            {transferItem.type === 'modem' && vanSerialMode === 'serial' ? (
              <div>
                <label htmlFor="van-serial" className="mb-1 block text-xs font-medium text-slate-700">
                  شماره سریال مودم <span className="text-red-600">*</span>
                </label>
                <input
                  id="van-serial"
                  type="text"
                  dir="ltr"
                  required
                  value={vanSerial}
                  onChange={(e) => setVanSerial(e.target.value.toUpperCase())}
                  placeholder="48575443..."
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 text-left font-mono text-sm focus:border-teal-600 focus:outline-none"
                />
              </div>
            ) : (
              <div>
                <label htmlFor="van-qty" className="mb-1 block text-xs font-medium text-slate-700">
                  تعداد تحویلی
                </label>
                <input
                  id="van-qty"
                  type="number"
                  min={1}
                  max={transferItem.total_quantity}
                  required
                  value={vanQuantity}
                  onChange={(e) => setVanQuantity(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm tabular-nums focus:border-teal-600 focus:outline-none"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTransferItem(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs text-slate-700"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={!vanInstallerId}
                className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                تایید تحویل به خودرو
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Consume Spool Meters Modal */}
      <Modal
        open={Boolean(consumeSpool)}
        onClose={() => setConsumeSpool(null)}
        title={consumeSpool ? `ثبت مصرف / کسر متراژ قرقره ${consumeSpool.spool_code}` : 'کسر متراژ قرقره'}
      >
        {consumeSpool && (
          <form onSubmit={handleConsumeSpool} className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 tabular-nums">
              مانده فعلی قرقره:{' '}
              <span className="font-semibold text-slate-900">
                {toPersianDigits(consumeSpool.current_length)} متر
              </span>{' '}
              از {toPersianDigits(consumeSpool.initial_length)} متر
            </div>
            <div>
              <label htmlFor="consume-meters" className="mb-1 block text-xs font-medium text-slate-700">
                متراژ مصرفی / کسری (متر)
              </label>
              <input
                id="consume-meters"
                type="number"
                min={1}
                max={consumeSpool.current_length}
                required
                value={consumeMeters}
                onChange={(e) => setConsumeMeters(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm tabular-nums focus:border-teal-600 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConsumeSpool(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs text-slate-700"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700"
              >
                تایید کسر متراژ
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

