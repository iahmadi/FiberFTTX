import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Cable, Package, Plus, Truck } from 'lucide-react';
import { getLowSpoolWarnings, getSpoolPercentRemaining, isSpoolLowStock } from '../lib/fiberLogic';
import { toPersianDigits } from '../lib/jalali';
import { userHasPermission } from '../lib/permissions';
import type { AuthUser, InventoryItemRecord, SpoolItem, VanStockItem } from '../types/erp';
import { apiFetch } from '../utils/api';

interface InventoryPageProps {
  user: AuthUser;
  spools: SpoolItem[];
  items: InventoryItemRecord[];
  vanStock: VanStockItem[];
  installers: Array<{ id: number; full_name: string }>;
  onRefresh: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, desc?: string) => void;
}

export function InventoryPage({
  user,
  spools,
  items,
  vanStock,
  installers,
  onRefresh,
  onNotify,
}: InventoryPageProps) {
  const canManage = userHasPermission(user, 'can_manage_inventory');
  const alertedSpoolsRef = useRef<Set<string>>(new Set());

  const [newSpoolCode, setNewSpoolCode] = useState('');
  const [newSpoolType, setNewSpoolType] = useState<'outdoor' | 'indoor'>('outdoor');
  const [newSpoolLength, setNewSpoolLength] = useState('1000');
  const [newSpoolInstaller, setNewSpoolInstaller] = useState('');

  const [consumeSpoolId, setConsumeSpoolId] = useState('');
  const [consumeMeters, setConsumeMeters] = useState('');

  const [transferUserId, setTransferUserId] = useState('');
  const [transferItemId, setTransferItemId] = useState('');
  const [transferSerial, setTransferSerial] = useState('');
  const [transferQty, setTransferQty] = useState('1');

  const lowSpools = useMemo(
    () =>
      getLowSpoolWarnings(
        spools.map((s) => ({
          id: s.id,
          spool_code: s.spool_code,
          cable_type: s.cable_type,
          initial_length: s.initial_length,
          current_length: s.current_length,
          assigned_installer_id: s.assigned_installer_id,
        })),
      ),
    [spools],
  );

  // Trigger prominent red Toast warning automatically when any spool falls below 10%
  useEffect(() => {
    for (const s of lowSpools) {
      const signature = `${s.id}:${s.current_length}`;
      if (!alertedSpoolsRef.current.has(signature)) {
        alertedSpoolsRef.current.add(signature);
        onNotify(
          'error',
          `هشدار کاهش بحرانی قرقره ${s.spool_code}`,
          `تنها ${toPersianDigits(s.current_length)} متر (${toPersianDigits(
            s.percentRemaining,
          )}٪) از قرقره باقی مانده است.`,
        );
      }
    }
  }, [lowSpools, onNotify]);

  const handleCreateSpool = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/spools', {
        method: 'POST',
        body: JSON.stringify({
          spool_code: newSpoolCode,
          cable_type: newSpoolType,
          initial_length: Number(newSpoolLength),
          assigned_installer_id: newSpoolInstaller ? Number(newSpoolInstaller) : null,
        }),
      });
      onNotify('success', `قرقره ${newSpoolCode.toUpperCase()} ثبت شد`);
      setNewSpoolCode('');
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در ثبت قرقره', err instanceof Error ? err.message : undefined);
    }
  };

  const handleConsumeSpool = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/spools/consume', {
        method: 'POST',
        body: JSON.stringify({
          spool_id: Number(consumeSpoolId),
          meters: Number(consumeMeters),
        }),
      });
      setConsumeMeters('');
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در کسر متراژ قرقره', err instanceof Error ? err.message : undefined);
    }
  };

  const handleTransferToVan = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/inventory/transfer-to-van', {
        method: 'POST',
        body: JSON.stringify({
          user_id: Number(transferUserId),
          item_id: Number(transferItemId),
          serial_number: transferSerial || null,
          quantity: Number(transferQty) || 1,
        }),
      });
      onNotify('success', 'کالا به انبار خودروی نصاب منتقل شد');
      setTransferSerial('');
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در انتقال کالا به خودرو', err instanceof Error ? err.message : undefined);
    }
  };

  const selectedTransferItem = items.find((it) => String(it.id) === transferItemId);

  return (
    <div className="space-y-6">
      {lowSpools.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-xs text-red-900"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <div className="font-bold">هشدار اتمام قرقره‌های کابل (کمتر از ۱۰٪)</div>
            <div className="mt-1">
              {lowSpools
                .map(
                  (ls) =>
                    `${ls.spool_code}: ${toPersianDigits(ls.current_length)} متر (${toPersianDigits(
                      ls.percentRemaining,
                    )}٪)`,
                )
                .join(' | ')}
            </div>
          </div>
        </div>
      )}

      {/* Spools Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Cable className="h-5 w-5 text-teal-700" />
            <span>وضعیت قرقره‌های کابل فیبر نوری (برحسب کد و متراژ دقیق)</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2.5 font-bold">کد قرقره</th>
                <th className="px-3 py-2.5 font-bold">نوع کابل</th>
                <th className="px-3 py-2.5 font-bold">نصاب / انبار</th>
                <th className="px-3 py-2.5 font-bold">متراژ اولیه</th>
                <th className="px-3 py-2.5 font-bold">متراژ باقیمانده</th>
                <th className="px-3 py-2.5 font-bold">درصد باقیمانده</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {spools.map((sp) => {
                const pct = getSpoolPercentRemaining(sp);
                const low = isSpoolLowStock(sp);
                return (
                  <tr key={sp.id} className={low ? 'bg-red-50/70' : ''}>
                    <td dir="ltr" className="px-3 py-2.5 text-right font-bold text-slate-900">
                      {sp.spool_code}
                    </td>
                    <td className="px-3 py-2.5">
                      {sp.cable_type === 'outdoor' ? 'فضای باز (Outdoor)' : 'داخلی (Indoor)'}
                    </td>
                    <td className="px-3 py-2.5">{sp.installer_name || 'انبار مرکزی'}</td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {toPersianDigits(sp.initial_length)} متر
                    </td>
                    <td
                      className={`px-3 py-2.5 font-bold tabular-nums ${
                        low ? 'text-red-700' : 'text-teal-800'
                      }`}
                    >
                      {toPersianDigits(sp.current_length)} متر
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className={`h-full ${low ? 'bg-red-600' : 'bg-teal-600'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="tabular-nums font-semibold">{toPersianDigits(pct)}٪</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {canManage && (
          <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 lg:grid-cols-2">
            <form onSubmit={handleCreateSpool} className="space-y-2.5 rounded-xl bg-slate-50 p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Plus className="h-4 w-4 text-teal-700" />
                <span>ثبت قرقره جدید</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={newSpoolCode}
                  onChange={(e) => setNewSpoolCode(e.target.value)}
                  placeholder="OUT-205"
                  className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-2.5 text-left text-xs"
                />
                <select
                  value={newSpoolType}
                  onChange={(e) => setNewSpoolType(e.target.value as 'outdoor' | 'indoor')}
                  className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-2 text-xs"
                >
                  <option value="outdoor">فضای باز (Outdoor)</option>
                  <option value="indoor">داخلی (Indoor)</option>
                </select>
                <input
                  type="number"
                  min={1}
                  required
                  value={newSpoolLength}
                  onChange={(e) => setNewSpoolLength(e.target.value)}
                  placeholder="متراژ (متر)"
                  className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs tabular-nums"
                />
                <select
                  value={newSpoolInstaller}
                  onChange={(e) => setNewSpoolInstaller(e.target.value)}
                  className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-2 text-xs"
                >
                  <option value="">انبار مرکزی</option>
                  {installers.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="min-h-[38px] rounded-lg bg-teal-700 px-4 text-xs font-bold text-white"
              >
                ایجاد قرقره
              </button>
            </form>

            <form onSubmit={handleConsumeSpool} className="space-y-2.5 rounded-xl bg-slate-50 p-3.5">
              <div className="text-xs font-bold text-slate-800">
                ثبت کسر / تعدیل متراژ قرقره (انبارداری)
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  required
                  value={consumeSpoolId}
                  onChange={(e) => setConsumeSpoolId(e.target.value)}
                  className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-2 text-xs"
                >
                  <option value="">انتخاب قرقره...</option>
                  {spools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.spool_code} ({toPersianDigits(s.current_length)} متر)
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  required
                  value={consumeMeters}
                  onChange={(e) => setConsumeMeters(e.target.value)}
                  placeholder="متر کسرشده"
                  className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs tabular-nums"
                />
              </div>
              <button
                type="submit"
                className="min-h-[38px] rounded-lg bg-slate-800 px-4 text-xs font-bold text-white"
              >
                ثبت کسر متراژ
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Central Inventory + Van Stock */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
            <Package className="h-5 w-5 text-teal-700" />
            <span>موجودی انبار مرکزی و تخصیص به خودروها</span>
          </div>
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-bold">نام کالا</th>
                <th className="px-3 py-2 font-bold">در انبار مرکزی</th>
                <th className="px-3 py-2 font-bold">تحویل‌شده به خودروها</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2 font-medium text-slate-900">{it.name}</td>
                  <td className="px-3 py-2 tabular-nums font-bold">
                    {toPersianDigits(it.total_quantity)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-teal-800">
                    {toPersianDigits(it.van_allocated_quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {canManage && (
            <form
              onSubmit={handleTransferToVan}
              className="mt-4 space-y-2.5 border-t border-slate-100 pt-4"
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Truck className="h-4 w-4 text-teal-700" />
                <span>تحویل کالا / مودم به انبار خودروی نصاب (Van Stock)</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  required
                  value={transferUserId}
                  onChange={(e) => setTransferUserId(e.target.value)}
                  className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-2 text-xs"
                >
                  <option value="">انتخاب نصاب...</option>
                  {installers.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.full_name}
                    </option>
                  ))}
                </select>
                <select
                  required
                  value={transferItemId}
                  onChange={(e) => setTransferItemId(e.target.value)}
                  className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-2 text-xs"
                >
                  <option value="">انتخاب کالا...</option>
                  {items
                    .filter((it) => it.type !== 'spool')
                    .map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name} (موجودی: {toPersianDigits(it.total_quantity)})
                      </option>
                    ))}
                </select>
                {selectedTransferItem?.type === 'modem' ? (
                  <input
                    type="text"
                    required
                    dir="ltr"
                    value={transferSerial}
                    onChange={(e) => setTransferSerial(e.target.value)}
                    placeholder="شماره سریال مودم (S/N)"
                    className="min-h-[40px] rounded-lg border border-slate-300 px-2.5 text-left text-xs sm:col-span-2"
                  />
                ) : (
                  <input
                    type="number"
                    min={1}
                    value={transferQty}
                    onChange={(e) => setTransferQty(e.target.value)}
                    placeholder="تعداد"
                    className="min-h-[40px] rounded-lg border border-slate-300 px-2.5 text-xs tabular-nums"
                  />
                )}
              </div>
              <button
                type="submit"
                className="min-h-[38px] rounded-lg bg-teal-700 px-4 text-xs font-bold text-white"
              >
                انتقال به انبار خودرو
              </button>
            </form>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
            <Truck className="h-5 w-5 text-sky-700" />
            <span>موجودی فعلی انبار خودروی نصابان (Van Stock)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-bold">نصاب</th>
                  <th className="px-3 py-2 font-bold">کالا</th>
                  <th className="px-3 py-2 font-bold">شماره سریال</th>
                  <th className="px-3 py-2 font-bold">تعداد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vanStock.map((v) => (
                  <tr key={v.id}>
                    <td className="px-3 py-2 font-medium text-slate-900">{v.installer_name}</td>
                    <td className="px-3 py-2">{v.item_name}</td>
                    <td dir="ltr" className="px-3 py-2 text-right font-mono text-slate-700">
                      {v.serial_number || '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums font-bold">
                      {toPersianDigits(v.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
