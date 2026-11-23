import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Cpu, Plus, Router, Search, X } from 'lucide-react';
import type {
  AuthUser,
  FFatItem,
  FatItem,
  KafItem,
  ModemBrandItem,
  OltItem,
} from '../types/erp';
import { apiFetch } from '../utils/api';
import { generateFFatCode, validateModemSerial } from '../lib/fiberLogic';
import { toPersianDigits } from '../lib/jalali';
import { matchesHardwareQuery } from '../lib/searchFilter';
import { SearchableSelect } from '../components/SearchableSelect';

export function HardwarePage({ user }: { user: AuthUser }) {
  const [tab, setTab] = useState<'topology' | 'modems'>('topology');
  const [searchQuery, setSearchQuery] = useState('');
  const [kafs, setKafs] = useState<KafItem[]>([]);
  const [olts, setOlts] = useState<OltItem[]>([]);
  const [fats, setFats] = useState<FatItem[]>([]);
  const [ffats, setFFats] = useState<FFatItem[]>([]);
  const [brands, setBrands] = useState<ModemBrandItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Forms
  const [kafName, setKafName] = useState('');
  const [oltKafId, setOltKafId] = useState('');
  const [oltName, setOltName] = useState('');
  const [fatOltId, setFatOltId] = useState('');
  const [fatNumber, setFatNumber] = useState('');
  const [ffatFatId, setFFatFatId] = useState('');
  const [ffatSuffix, setFFatSuffix] = useState('');

  const [brandName, setBrandName] = useState('');
  const [brandPrefix, setBrandPrefix] = useState('');
  const [brandPattern, setBrandPattern] = useState('');
  const [testSerial, setTestSerial] = useState('');
  const [testBrandId, setTestBrandId] = useState('');

  const canManageHardware = user.isSuperAdmin || user.permissions.includes('can_manage_hardware');
  const canAddFat = canManageHardware || user.permissions.includes('can_add_fat');

  const loadHardware = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        kafs: KafItem[];
        olts: OltItem[];
        fats: FatItem[];
        ffats: FFatItem[];
        modemBrands: ModemBrandItem[];
      }>('/api/hardware');
      setKafs(res.kafs);
      setOlts(res.olts);
      setFats(res.fats);
      setFFats(res.ffats);
      setBrands(res.modemBrands);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت اطلاعات تجهیزات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHardware();
  }, [loadHardware]);

  const handleAddKaf = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/hardware/kafs', {
        method: 'POST',
        body: JSON.stringify({ name: kafName }),
      });
      setKafName('');
      await loadHardware();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت کافو');
    }
  };

  const handleAddOlt = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/hardware/olts', {
        method: 'POST',
        body: JSON.stringify({ kaf_id: Number(oltKafId), name: oltName }),
      });
      setOltName('');
      await loadHardware();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت OLT');
    }
  };

  const handleAddFat = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/hardware/fats', {
        method: 'POST',
        body: JSON.stringify({ olt_id: Number(fatOltId), fat_number: Number(fatNumber) }),
      });
      setFatNumber('');
      await loadHardware();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت FAT');
    }
  };

  const handleAddFFat = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/hardware/ffats', {
        method: 'POST',
        body: JSON.stringify({ fat_id: Number(ffatFatId), suffix: ffatSuffix }),
      });
      setFFatSuffix('');
      await loadHardware();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت F-FAT');
    }
  };

  const handleAddBrand = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/hardware/modem-brands', {
        method: 'POST',
        body: JSON.stringify({
          name: brandName,
          serial_prefix: brandPrefix,
          serial_pattern: brandPattern,
        }),
      });
      setBrandName('');
      setBrandPrefix('');
      setBrandPattern('');
      await loadHardware();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت برند مودم');
    }
  };

  const selectedFat = fats.find((f) => String(f.id) === ffatFatId);
  let ffatPreview = '';
  if (selectedFat && ffatSuffix.trim()) {
    try {
      ffatPreview = generateFFatCode(selectedFat.fat_number, ffatSuffix);
    } catch {
      ffatPreview = '';
    }
  }

  const testerBrand = brands.find((b) => String(b.id) === testBrandId);
  const testerResult =
    testerBrand && testSerial.trim() ? validateModemSerial(testSerial, testerBrand) : null;

  const filteredKafs = useMemo(
    () => kafs.filter((k) => matchesHardwareQuery([k.name, k.id], searchQuery)),
    [kafs, searchQuery],
  );
  const filteredOlts = useMemo(
    () => olts.filter((o) => matchesHardwareQuery([o.name, o.kaf_name, o.id], searchQuery)),
    [olts, searchQuery],
  );
  const filteredFats = useMemo(
    () =>
      fats.filter((f) =>
        matchesHardwareQuery([`FAT ${f.fat_number}`, `FAT${f.fat_number}`, f.fat_number, f.olt_name], searchQuery),
      ),
    [fats, searchQuery],
  );
  const filteredFFats = useMemo(
    () =>
      ffats.filter((ff) =>
        matchesHardwareQuery([ff.ffat_code, `FAT ${ff.fat_number}`, ff.fat_number], searchQuery),
      ),
    [ffats, searchQuery],
  );
  const filteredBrands = useMemo(
    () =>
      brands.filter((b) =>
        matchesHardwareQuery([b.name, b.serial_prefix, b.serial_pattern], searchQuery),
      ),
    [brands, searchQuery],
  );

  return (
    <div className="space-y-5">
      {/* Segmented Tabs + Real-time Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setTab('topology')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              tab === 'topology' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            <Cpu className="h-3.5 w-3.5" />
            <span>توپولوژی KAF / OLT / FAT / F-FAT</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('modems')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              tab === 'modems' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            <Router className="h-3.5 w-3.5" />
            <span>برندهای مودم و الگوی سریال (Regex)</span>
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 right-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            aria-label="جستجوی لحظه‌ای تجهیزات"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجوی نام تجهیز یا کد فنی (FAT101، KAF، OLT)..."
            className="h-9 w-72 rounded-lg border border-slate-300 pr-9 pl-8 text-xs focus:border-teal-600 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="پاک کردن جستجوی تجهیزات"
              onClick={() => setSearchQuery('')}
              className="absolute top-2 left-2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          در حال بارگذاری تجهیزات...
        </div>
      ) : tab === 'topology' ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* KAF & OLT */}
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">کافوها (KAF)</h2>
              {canManageHardware && (
                <form onSubmit={handleAddKaf} className="mb-4 flex gap-2">
                  <input
                    type="text"
                    required
                    value={kafName}
                    onChange={(e) => setKafName(e.target.value)}
                    placeholder="نام کافو جدید (مثال: کافو غرب KAF-GH04)"
                    className="h-9 flex-1 rounded-lg border border-slate-300 px-3 text-xs focus:border-teal-600 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center gap-1 rounded-lg bg-teal-600 px-3 text-xs font-medium text-white hover:bg-teal-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>افزودن</span>
                  </button>
                </form>
              )}
              <ul className="divide-y divide-slate-100 text-xs">
                {filteredKafs.length === 0 ? (
                  <li className="py-4 text-center text-slate-400">کافویی با این عبارت یافت نشد.</li>
                ) : (
                  filteredKafs.map((k) => (
                    <li key={k.id} className="flex items-center justify-between py-2">
                      <span className="font-medium text-slate-800">{k.name}</span>
                      <span className="text-slate-400 tabular-nums">
                        {toPersianDigits(olts.filter((o) => o.kaf_id === k.id).length)} OLT
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">دستگاه‌های OLT</h2>
              {canManageHardware && (
                <form onSubmit={handleAddOlt} className="mb-4 space-y-2">
                  <SearchableSelect
                    label="کافو والد"
                    required
                    options={kafs.map((k) => ({ value: k.id, label: k.name }))}
                    value={oltKafId}
                    onChange={setOltKafId}
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={oltName}
                      onChange={(e) => setOltName(e.target.value)}
                      placeholder="نام OLT (مثال: OLT-ZTE-C600-04)"
                      className="h-9 flex-1 rounded-lg border border-slate-300 px-3 text-xs focus:border-teal-600 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!oltKafId}
                      className="inline-flex h-9 items-center gap-1 rounded-lg bg-teal-600 px-3 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>ثبت OLT</span>
                    </button>
                  </div>
                </form>
              )}
              <ul className="divide-y divide-slate-100 text-xs">
                {filteredOlts.length === 0 ? (
                  <li className="py-4 text-center text-slate-400">دستگاه OLT با این عبارت یافت نشد.</li>
                ) : (
                  filteredOlts.map((o) => (
                    <li key={o.id} className="flex items-center justify-between py-2">
                      <span className="font-medium text-slate-800 dir-ltr">{o.name}</span>
                      <span className="text-slate-500">{o.kaf_name}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>

          {/* FAT & Dynamic F-FAT */}
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">باکس‌های FAT</h2>
              {canAddFat && (
                <form onSubmit={handleAddFat} className="mb-4 space-y-2">
                  <SearchableSelect
                    label="OLT والد"
                    required
                    options={olts.map((o) => ({
                      value: o.id,
                      label: o.name,
                      sublabel: o.kaf_name,
                    }))}
                    value={fatOltId}
                    onChange={setFatOltId}
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      required
                      value={fatNumber}
                      onChange={(e) => setFatNumber(e.target.value)}
                      placeholder="شماره عددی FAT (مثال: 105)"
                      className="h-9 flex-1 rounded-lg border border-slate-300 px-3 text-xs tabular-nums focus:border-teal-600 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!fatOltId}
                      className="inline-flex h-9 items-center gap-1 rounded-lg bg-teal-600 px-3 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>ثبت FAT</span>
                    </button>
                  </div>
                </form>
              )}
              <ul className="max-h-52 divide-y divide-slate-100 overflow-y-auto text-xs">
                {filteredFats.length === 0 ? (
                  <li className="py-4 text-center text-slate-400">باکس FAT با این عبارت یافت نشد.</li>
                ) : (
                  filteredFats.map((f) => (
                    <li key={f.id} className="flex items-center justify-between py-2">
                      <span className="font-semibold text-slate-900 tabular-nums">
                        FAT {toPersianDigits(f.fat_number)}
                      </span>
                      <span className="text-slate-500 dir-ltr">{f.olt_name}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">باکس‌های F-FAT (تولید کد پویا)</h2>
              {canAddFat && (
                <form onSubmit={handleAddFFat} className="mb-4 space-y-2">
                  <SearchableSelect
                    label="انتخاب FAT والد"
                    required
                    options={fats.map((f) => ({
                      value: f.id,
                      label: `FAT ${toPersianDigits(f.fat_number)}`,
                      sublabel: f.olt_name,
                    }))}
                    value={ffatFatId}
                    onChange={setFFatFatId}
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={ffatSuffix}
                      onChange={(e) => setFFatSuffix(e.target.value)}
                      placeholder="پسوند (مثال: A3 یا B1)"
                      className="h-9 flex-1 rounded-lg border border-slate-300 px-3 text-xs dir-ltr text-left focus:border-teal-600 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!ffatFatId || !ffatPreview}
                      className="inline-flex h-9 items-center gap-1 rounded-lg bg-teal-600 px-3 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{ffatPreview ? `ساخت ${ffatPreview}` : 'ثبت F-FAT'}</span>
                    </button>
                  </div>
                </form>
              )}
              <div className="max-h-52 overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2">کد F-FAT</th>
                      <th className="py-2">FAT والد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredFFats.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="py-4 text-center text-slate-400">
                          کد F-FAT با این عبارت یافت نشد.
                        </td>
                      </tr>
                    ) : (
                      filteredFFats.map((ff) => (
                        <tr key={ff.id}>
                          <td className="py-2 font-mono font-medium text-slate-900 dir-ltr text-right">
                            {ff.ffat_code}
                          </td>
                          <td className="py-2 text-slate-500 tabular-nums">
                            FAT {toPersianDigits(ff.fat_number || '')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">فهرست برندها و قواعد سریال مودم</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">نام برند</th>
                    <th className="px-3 py-2.5">پیشوند مجاز</th>
                    <th className="px-3 py-2.5">الگوی Regex</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBrands.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-slate-400">
                        برند مودمی با این عبارت یافت نشد.
                      </td>
                    </tr>
                  ) : (
                    filteredBrands.map((b) => (
                      <tr key={b.id}>
                        <td className="px-3 py-2.5 font-semibold text-slate-900">{b.name}</td>
                        <td className="px-3 py-2.5 font-mono text-teal-700 dir-ltr text-right">
                          {b.serial_prefix}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-600 dir-ltr text-right">
                          {b.serial_pattern}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Live Regex Tester */}
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 text-xs font-semibold text-slate-800">آزمایشگر اعتبارسنجی سریال مودم</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SearchableSelect
                  label="برند آزمایشی"
                  options={brands.map((b) => ({ value: b.id, label: b.name }))}
                  value={testBrandId}
                  onChange={setTestBrandId}
                />
                <div>
                  <label htmlFor="test-serial" className="mb-1.5 block text-xs font-medium text-slate-700">
                    سریال آزمایشی
                  </label>
                  <input
                    id="test-serial"
                    type="text"
                    value={testSerial}
                    onChange={(e) => setTestSerial(e.target.value.toUpperCase())}
                    placeholder="48575443A1B2C3D4"
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs dir-ltr text-left focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>
              {testerResult && (
                <p
                  className={`mt-2 text-xs font-medium ${
                    testerResult.valid ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {testerResult.valid ? 'سریال معتبر است.' : testerResult.reason}
                </p>
              )}
            </div>
          </div>

          {canManageHardware && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-slate-900">افزودن برند جدید مودم</h2>
              <form onSubmit={handleAddBrand} className="space-y-3">
                <div>
                  <label htmlFor="b-name" className="mb-1 block text-xs font-medium text-slate-700">
                    نام برند و مدل
                  </label>
                  <input
                    id="b-name"
                    type="text"
                    required
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="مثال: Nokia G-2425G-A"
                    className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="b-prefix" className="mb-1 block text-xs font-medium text-slate-700">
                    پیشوند سریال
                  </label>
                  <input
                    id="b-prefix"
                    type="text"
                    required
                    value={brandPrefix}
                    onChange={(e) => setBrandPrefix(e.target.value.toUpperCase())}
                    placeholder="ALCL"
                    className="h-9 w-full rounded-lg border border-slate-300 px-3 font-mono text-xs dir-ltr text-left focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="b-pattern" className="mb-1 block text-xs font-medium text-slate-700">
                    عبارت منظم (Regex)
                  </label>
                  <input
                    id="b-pattern"
                    type="text"
                    required
                    value={brandPattern}
                    onChange={(e) => setBrandPattern(e.target.value)}
                    placeholder="^ALCL[A-F0-9]{8}$"
                    className="h-9 w-full rounded-lg border border-slate-300 px-3 font-mono text-xs dir-ltr text-left focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="h-9 w-full rounded-lg bg-teal-600 text-xs font-medium text-white hover:bg-teal-700"
                >
                  ثبت برند مودم
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
