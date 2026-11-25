import { useState, type FormEvent } from 'react';
import { Check, HardDrive, Network, Pencil, Plus, Router, Trash2, X } from 'lucide-react';
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

  // Inline Edit states
  const [editKafId, setEditKafId] = useState<number | null>(null);
  const [editKafName, setEditKafName] = useState('');

  const [editOltId, setEditOltId] = useState<number | null>(null);
  const [editOltKafId, setEditOltKafId] = useState('');
  const [editOltName, setEditOltName] = useState('');

  const [editFatId, setEditFatId] = useState<number | null>(null);
  const [editFatOltId, setEditFatOltId] = useState('');
  const [editFatNumber, setEditFatNumber] = useState('');

  const [editFfatId, setEditFfatId] = useState<number | null>(null);
  const [editFfatFatId, setEditFfatFatId] = useState('');
  const [editFfatSuffix, setEditFfatSuffix] = useState('');

  const [editBrandId, setEditBrandId] = useState<number | null>(null);
  const [editBrandName, setEditBrandName] = useState('');
  const [editBrandPrefix, setEditBrandPrefix] = useState('');
  const [editBrandPattern, setEditBrandPattern] = useState('');

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

  const submitPatch = async (url: string, body: unknown, successMsg: string, onDone: () => void) => {
    try {
      await apiFetch(url, { method: 'PATCH', body: JSON.stringify(body) });
      onNotify('success', successMsg);
      onDone();
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در ویرایش تجهیز', err instanceof Error ? err.message : undefined);
    }
  };

  const submitDelete = async (url: string, successMsg: string) => {
    try {
      await apiFetch(url, { method: 'DELETE' });
      onNotify('success', successMsg);
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در حذف تجهیز', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-6">
      {/* Topology Tree Summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* KAFs */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
            <Network className="h-4 w-4 text-teal-700" />
            <span>کافوهای نوری (KAF)</span>
          </div>
          <ul className="space-y-1.5 text-xs text-slate-700">
            {kafs.map((k) => (
              <li key={k.id} className="rounded-lg bg-slate-50 px-3 py-2 font-medium">
                {editKafId === k.id ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={editKafName}
                      onChange={(e) => setEditKafName(e.target.value)}
                      className="min-h-[32px] flex-1 rounded border border-teal-500 bg-white px-2 text-xs"
                    />
                    <button
                      type="button"
                      aria-label={`ذخیره ${k.name}`}
                      onClick={() =>
                        void submitPatch(
                          `/api/hardware/kafs/${k.id}`,
                          { name: editKafName },
                          'نام کافو ویرایش شد',
                          () => setEditKafId(null),
                        )
                      }
                      className="inline-flex h-7 w-7 items-center justify-center rounded bg-teal-700 text-white"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="انصراف"
                      onClick={() => setEditKafId(null)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span>{k.name}</span>
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`ویرایش کافو ${k.name}`}
                          onClick={() => {
                            setEditKafId(k.id);
                            setEditKafName(k.name);
                          }}
                          className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-800"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          aria-label={`حذف کافو ${k.name}`}
                          onClick={() =>
                            void submitDelete(`/api/hardware/kafs/${k.id}`, 'کافو حذف شد')
                          }
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
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

        {/* OLTs */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
            <HardDrive className="h-4 w-4 text-sky-700" />
            <span>ترمینال‌های OLT</span>
          </div>
          <ul className="space-y-1.5 text-xs text-slate-700">
            {olts.map((o) => (
              <li key={o.id} className="rounded-lg bg-slate-50 px-3 py-2">
                {editOltId === o.id ? (
                  <div className="space-y-1.5">
                    <select
                      value={editOltKafId}
                      onChange={(e) => setEditOltKafId(e.target.value)}
                      className="min-h-[32px] w-full rounded border border-teal-500 bg-white px-2 text-xs"
                    >
                      {kafs.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        dir="ltr"
                        value={editOltName}
                        onChange={(e) => setEditOltName(e.target.value)}
                        className="min-h-[32px] flex-1 rounded border border-teal-500 bg-white px-2 text-left text-xs"
                      />
                      <button
                        type="button"
                        aria-label={`ذخیره ${o.name}`}
                        onClick={() =>
                          void submitPatch(
                            `/api/hardware/olts/${o.id}`,
                            { kaf_id: Number(editOltKafId), name: editOltName },
                            'OLT ویرایش شد',
                            () => setEditOltId(null),
                          )
                        }
                        className="inline-flex h-7 w-7 items-center justify-center rounded bg-teal-700 text-white"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditOltId(null)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div dir="ltr" className="text-right font-semibold">
                        {o.name}
                      </div>
                      <div className="text-[11px] text-slate-500">{o.kaf_name}</div>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`ویرایش OLT ${o.name}`}
                          onClick={() => {
                            setEditOltId(o.id);
                            setEditOltKafId(String(o.kaf_id));
                            setEditOltName(o.name);
                          }}
                          className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-800"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          aria-label={`حذف OLT ${o.name}`}
                          onClick={() =>
                            void submitDelete(`/api/hardware/olts/${o.id}`, 'OLT حذف شد')
                          }
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
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

        {/* FATs */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="mb-3 text-sm font-bold text-slate-900">پورت‌های FAT</div>
          <ul className="max-h-60 space-y-1.5 overflow-y-auto text-xs text-slate-700">
            {fats.map((f) => (
              <li key={f.id} className="rounded-lg bg-slate-50 px-3 py-2">
                {editFatId === f.id ? (
                  <div className="space-y-1.5">
                    <select
                      value={editFatOltId}
                      onChange={(e) => setEditFatOltId(e.target.value)}
                      className="min-h-[32px] w-full rounded border border-teal-500 bg-white px-2 text-xs"
                    >
                      {olts.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        value={editFatNumber}
                        onChange={(e) => setEditFatNumber(e.target.value)}
                        className="min-h-[32px] flex-1 rounded border border-teal-500 bg-white px-2 text-xs tabular-nums"
                      />
                      <button
                        type="button"
                        aria-label={`ذخیره FAT ${f.fat_number}`}
                        onClick={() =>
                          void submitPatch(
                            `/api/hardware/fats/${f.id}`,
                            { olt_id: Number(editFatOltId), fat_number: Number(editFatNumber) },
                            'FAT ویرایش شد',
                            () => setEditFatId(null),
                          )
                        }
                        className="inline-flex h-7 w-7 items-center justify-center rounded bg-teal-700 text-white"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditFatId(null)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold tabular-nums">FAT {toPersianDigits(f.fat_number)}</div>
                      <div className="text-[11px] text-slate-500">{f.olt_name}</div>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`ویرایش FAT ${f.fat_number}`}
                          onClick={() => {
                            setEditFatId(f.id);
                            setEditFatOltId(String(f.olt_id));
                            setEditFatNumber(String(f.fat_number));
                          }}
                          className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-800"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          aria-label={`حذف FAT ${f.fat_number}`}
                          onClick={() =>
                            void submitDelete(`/api/hardware/fats/${f.id}`, 'FAT حذف شد')
                          }
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
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

        {/* F-FATs */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="mb-3 text-sm font-bold text-slate-900">توزیع F-FAT (تولید کد پویا)</div>
          <ul className="max-h-60 space-y-1.5 overflow-y-auto text-xs text-slate-700">
            {ffats.map((ff) => {
              const currentSuffix = ff.ffat_code.includes('-')
                ? ff.ffat_code.split('-').slice(1).join('-')
                : ff.ffat_code;
              return (
                <li key={ff.id} className="rounded-lg bg-slate-50 px-3 py-2">
                  {editFfatId === ff.id ? (
                    <div className="space-y-1.5">
                      <select
                        value={editFfatFatId}
                        onChange={(e) => setEditFfatFatId(e.target.value)}
                        className="min-h-[32px] w-full rounded border border-teal-500 bg-white px-2 text-xs"
                      >
                        {fats.map((f) => (
                          <option key={f.id} value={f.id}>
                            FAT {toPersianDigits(f.fat_number)}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          dir="ltr"
                          value={editFfatSuffix}
                          onChange={(e) => setEditFfatSuffix(e.target.value)}
                          placeholder="پسوند"
                          className="min-h-[32px] flex-1 rounded border border-teal-500 bg-white px-2 text-left text-xs"
                        />
                        <button
                          type="button"
                          aria-label={`ذخیره ${ff.ffat_code}`}
                          onClick={() =>
                            void submitPatch(
                              `/api/hardware/ffats/${ff.id}`,
                              { fat_id: Number(editFfatFatId), suffix: editFfatSuffix },
                              'F-FAT ویرایش شد',
                              () => setEditFfatId(null),
                            )
                          }
                          className="inline-flex h-7 w-7 items-center justify-center rounded bg-teal-700 text-white"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditFfatId(null)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white text-slate-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div dir="ltr" className="text-right font-bold text-teal-800">
                          {ff.ffat_code}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          FAT {toPersianDigits(ff.fat_number || '')}
                        </div>
                      </div>
                      {canManage && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={`ویرایش ${ff.ffat_code}`}
                            onClick={() => {
                              setEditFfatId(ff.id);
                              setEditFfatFatId(String(ff.fat_id));
                              setEditFfatSuffix(currentSuffix);
                            }}
                            className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-800"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            aria-label={`حذف ${ff.ffat_code}`}
                            onClick={() =>
                              void submitDelete(`/api/hardware/ffats/${ff.id}`, 'F-FAT حذف شد')
                            }
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
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
                {canManage && <th className="px-3 py-2.5 font-bold">عملیات</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {modemBrands.map((b) => (
                <tr key={b.id}>
                  {editBrandId === b.id ? (
                    <>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={editBrandName}
                          onChange={(e) => setEditBrandName(e.target.value)}
                          className="min-h-[34px] w-full rounded border border-teal-500 px-2 text-xs"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          dir="ltr"
                          value={editBrandPrefix}
                          onChange={(e) => setEditBrandPrefix(e.target.value)}
                          className="min-h-[34px] w-full rounded border border-teal-500 px-2 text-left font-mono text-xs"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          dir="ltr"
                          value={editBrandPattern}
                          onChange={(e) => setEditBrandPattern(e.target.value)}
                          className="min-h-[34px] w-full rounded border border-teal-500 px-2 text-left font-mono text-xs"
                        />
                      </td>
                      {canManage && (
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                void submitPatch(
                                  `/api/hardware/modem-brands/${b.id}`,
                                  {
                                    name: editBrandName,
                                    serial_prefix: editBrandPrefix,
                                    serial_pattern: editBrandPattern,
                                  },
                                  'قانون برند مودم ویرایش شد',
                                  () => setEditBrandId(null),
                                )
                              }
                              className="inline-flex h-7 items-center gap-1 rounded bg-teal-700 px-2 text-[11px] font-bold text-white"
                            >
                              <Check className="h-3 w-3" />
                              <span>ذخیره</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditBrandId(null)}
                              className="inline-flex h-7 items-center rounded border border-slate-300 px-2 text-[11px] text-slate-600"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      )}
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2.5 font-semibold text-slate-900">{b.name}</td>
                      <td dir="ltr" className="px-3 py-2.5 text-right font-mono text-teal-800">
                        {b.serial_prefix}
                      </td>
                      <td dir="ltr" className="px-3 py-2.5 text-right font-mono text-slate-600">
                        {b.serial_pattern}
                      </td>
                      {canManage && (
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              aria-label={`ویرایش برند ${b.name}`}
                              onClick={() => {
                                setEditBrandId(b.id);
                                setEditBrandName(b.name);
                                setEditBrandPrefix(b.serial_prefix);
                                setEditBrandPattern(b.serial_pattern);
                              }}
                              className="rounded border border-slate-200 p-1 text-slate-600 hover:bg-slate-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`حذف برند ${b.name}`}
                              onClick={() =>
                                void submitDelete(
                                  `/api/hardware/modem-brands/${b.id}`,
                                  'برند مودم حذف شد',
                                )
                              }
                              className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </>
                  )}
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
