import { useState, type FormEvent } from 'react';
import { HardDrive, Network, Plus, Router } from 'lucide-react';
import { toPersianDigits } from '../lib/jalali';
import { userHasPermission } from '../lib/permissions';
import type {
  AuthUser,
  FatItem,
  FFatItem,
  KafItem,
  ModemBrandItem,
  OltItem,
} from '../types/erp';
import { apiFetch } from '../utils/api';

interface HardwarePageProps {
  user: AuthUser;
  kafs: KafItem[];
  olts: OltItem[];
  fats: FatItem[];
  ffats: FFatItem[];
  modemBrands: ModemBrandItem[];
  onRefresh: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, desc?: string) => void;
}

export function HardwarePage({
  user,
  kafs,
  olts,
  fats,
  ffats,
  modemBrands,
  onRefresh,
  onNotify,
}: HardwarePageProps) {
  const canManage = userHasPermission(user, 'can_manage_hardware');
  const canAddFat = canManage || userHasPermission(user, 'can_add_fat');

  const [kafName, setKafName] = useState('');
  const [oltKafId, setOltKafId] = useState('');
  const [oltName, setOltName] = useState('');
  const [fatOltId, setFatOltId] = useState('');
  const [fatNumber, setFatNumber] = useState('');
  const [ffatFatId, setFfatFatId] = useState('');
  const [ffatSuffix, setFfatSuffix] = useState('');

  const [brandName, setBrandName] = useState('');
  const [serialPrefix, setSerialPrefix] = useState('');
  const [serialPattern, setSerialPattern] = useState('');

  const submitPost = async (url: string, body: unknown, successMsg: string, reset: () => void) => {
    try {
      await apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
      onNotify('success', successMsg);
      reset();
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در ثبت تجهیزات', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-6">
      {/* Topology Tree Summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
            <Network className="h-4 w-4 text-teal-700" />
            <span>کافوهای نوری (KAF)</span>
          </div>
          <ul className="space-y-1.5 text-xs text-slate-700">
            {kafs.map((k) => (
              <li key={k.id} className="rounded-lg bg-slate-50 px-3 py-2 font-medium">
                {k.name}
              </li>
            ))}
          </ul>
          {canManage && (
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void submitPost('/api/hardware/kafs', { name: kafName }, 'کافو ثبت شد', () =>
                  setKafName(''),
                );
              }}
              className="mt-3 flex gap-2"
            >
              <input
                type="text"
                required
                value={kafName}
                onChange={(e) => setKafName(e.target.value)}
                placeholder="نام کافو جدید..."
                className="min-h-[38px] flex-1 rounded-lg border border-slate-300 px-2.5 text-xs"
              />
              <button
                type="submit"
                className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-lg bg-teal-700 text-white"
              >
                <Plus className="h-4 w-4" />
              </button>
            </form>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
            <HardDrive className="h-4 w-4 text-sky-700" />
            <span>ترمینال‌های OLT</span>
          </div>
          <ul className="space-y-1.5 text-xs text-slate-700">
            {olts.map((o) => (
              <li key={o.id} className="rounded-lg bg-slate-50 px-3 py-2">
                <div dir="ltr" className="text-right font-semibold">
                  {o.name}
                </div>
                <div className="text-[11px] text-slate-500">{o.kaf_name}</div>
              </li>
            ))}
          </ul>
          {canManage && (
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void submitPost(
                  '/api/hardware/olts',
                  { kaf_id: Number(oltKafId), name: oltName },
                  'OLT ثبت شد',
                  () => setOltName(''),
                );
              }}
              className="mt-3 space-y-2"
            >
              <select
                value={oltKafId}
                onChange={(e) => setOltKafId(e.target.value)}
                required
                className="min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2 text-xs"
              >
                <option value="">انتخاب کافو...</option>
                {kafs.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={oltName}
                  onChange={(e) => setOltName(e.target.value)}
                  placeholder="OLT-NAME"
                  className="min-h-[38px] flex-1 rounded-lg border border-slate-300 px-2.5 text-left text-xs"
                />
                <button
                  type="submit"
                  className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-lg bg-teal-700 text-white"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="mb-3 text-sm font-bold text-slate-900">پورت‌های FAT</div>
          <ul className="max-h-60 space-y-1.5 overflow-y-auto text-xs text-slate-700">
            {fats.map((f) => (
              <li key={f.id} className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="font-bold tabular-nums">FAT {toPersianDigits(f.fat_number)}</div>
                <div className="text-[11px] text-slate-500">{f.olt_name}</div>
              </li>
            ))}
          </ul>
          {canAddFat && (
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void submitPost(
                  '/api/hardware/fats',
                  { olt_id: Number(fatOltId), fat_number: Number(fatNumber) },
                  'FAT جدید ثبت شد',
                  () => setFatNumber(''),
                );
              }}
              className="mt-3 space-y-2"
            >
              <select
                value={fatOltId}
                onChange={(e) => setFatOltId(e.target.value)}
                required
                className="min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2 text-xs"
              >
                <option value="">انتخاب OLT...</option>
                {olts.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  required
                  value={fatNumber}
                  onChange={(e) => setFatNumber(e.target.value)}
                  placeholder="شماره FAT (مثلاً 105)"
                  className="min-h-[38px] flex-1 rounded-lg border border-slate-300 px-2.5 text-xs tabular-nums"
                />
                <button
                  type="submit"
                  className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-lg bg-teal-700 text-white"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="mb-3 text-sm font-bold text-slate-900">توزیع F-FAT (تولید کد پویا)</div>
          <ul className="max-h-60 space-y-1.5 overflow-y-auto text-xs text-slate-700">
            {ffats.map((ff) => (
              <li key={ff.id} className="rounded-lg bg-slate-50 px-3 py-2">
                <div dir="ltr" className="text-right font-bold text-teal-800">
                  {ff.ffat_code}
                </div>
                <div className="text-[11px] text-slate-500">
                  FAT {toPersianDigits(ff.fat_number || '')}
                </div>
              </li>
            ))}
          </ul>
          {canAddFat && (
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void submitPost(
                  '/api/hardware/ffats',
                  { fat_id: Number(ffatFatId), suffix: ffatSuffix },
                  'کد F-FAT ایجاد شد',
                  () => setFfatSuffix(''),
                );
              }}
              className="mt-3 space-y-2"
            >
              <select
                value={ffatFatId}
                onChange={(e) => setFfatFatId(e.target.value)}
                required
                className="min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2 text-xs"
              >
                <option value="">انتخاب FAT والد...</option>
                {fats.map((f) => (
                  <option key={f.id} value={f.id}>
                    FAT {toPersianDigits(f.fat_number)}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={ffatSuffix}
                  onChange={(e) => setFfatSuffix(e.target.value)}
                  placeholder="پسوند (مثلاً A3)"
                  className="min-h-[38px] flex-1 rounded-lg border border-slate-300 px-2.5 text-left text-xs"
                />
                <button
                  type="submit"
                  className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-lg bg-teal-700 text-white"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Modem Brands & Regex Rules */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
          <Router className="h-5 w-5 text-teal-700" />
          <span>قوانین برندهای مودم و اعتبارسنجی Regex شماره سریال</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2.5 font-bold">نام برند / مدل</th>
                <th className="px-3 py-2.5 font-bold">پیشوند سریال (Prefix)</th>
                <th className="px-3 py-2.5 font-bold">الگوی Regex کارخانه</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {modemBrands.map((b) => (
                <tr key={b.id}>
                  <td className="px-3 py-2.5 font-semibold text-slate-900">{b.name}</td>
                  <td dir="ltr" className="px-3 py-2.5 text-right font-mono text-teal-800">
                    {b.serial_prefix}
                  </td>
                  <td dir="ltr" className="px-3 py-2.5 text-right font-mono text-slate-600">
                    {b.serial_pattern}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canManage && (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void submitPost(
                '/api/hardware/modem-brands',
                { name: brandName, serial_prefix: serialPrefix, serial_pattern: serialPattern },
                'قانون برند مودم اضافه شد',
                () => {
                  setBrandName('');
                  setSerialPrefix('');
                  setSerialPattern('');
                },
              );
            }}
            className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4"
          >
            <input
              type="text"
              required
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="نام مدل مودم"
              className="min-h-[42px] rounded-lg border border-slate-300 px-3 text-xs"
            />
            <input
              type="text"
              required
              dir="ltr"
              value={serialPrefix}
              onChange={(e) => setSerialPrefix(e.target.value)}
              placeholder="Prefix (e.g. ZTEG)"
              className="min-h-[42px] rounded-lg border border-slate-300 px-3 text-left text-xs"
            />
            <input
              type="text"
              required
              dir="ltr"
              value={serialPattern}
              onChange={(e) => setSerialPattern(e.target.value)}
              placeholder="^ZTEG[A-Z0-9]{8}$"
              className="min-h-[42px] rounded-lg border border-slate-300 px-3 text-left text-xs"
            />
            <button
              type="submit"
              className="min-h-[42px] rounded-lg bg-teal-700 px-4 text-xs font-bold text-white hover:bg-teal-800"
            >
              افزودن برند مودم
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
