import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, ImagePlus, Plus, Trash2, Upload } from 'lucide-react';
import type {
  AuthUser,
  FFatItem,
  FatItem,
  KafItem,
  ModemBrandItem,
  OltItem,
  SpoolItem,
  TicketItem,
} from '../types/erp';
import { apiFetch, uploadCompressedImage } from '../utils/api';
import { compressImageForUpload, formatBytesFa } from '../utils/imageCompression';
import { generateFFatCode, validateModemSerial } from '../lib/fiberLogic';
import { formatJalaliYmd, getTodayJalali, toPersianDigits } from '../lib/jalali';
import { SearchableSelect } from '../components/SearchableSelect';
import { JalaliDatePicker } from '../components/JalaliDatePicker';

interface ServiceFormPageProps {
  user: AuthUser;
  initialTicket: TicketItem | null;
  onCompleted: () => void;
}

interface PendingImage {
  localId: string;
  imageType: string;
  previewUrl: string;
  originalSize: number;
  compressedSize: number;
  uploadedPath: string | null;
  uploading: boolean;
  blob: Blob;
  filename: string;
}

export function ServiceFormPage({
  user,
  initialTicket,
  onCompleted,
}: ServiceFormPageProps) {
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [kafs, setKafs] = useState<KafItem[]>([]);
  const [olts, setOlts] = useState<OltItem[]>([]);
  const [fats, setFats] = useState<FatItem[]>([]);
  const [ffats, setFFats] = useState<FFatItem[]>([]);
  const [modemBrands, setModemBrands] = useState<ModemBrandItem[]>([]);
  const [spools, setSpools] = useState<SpoolItem[]>([]);

  const [selectedTicketId, setSelectedTicketId] = useState(
    initialTicket ? String(initialTicket.id) : '',
  );
  const [kafId, setKafId] = useState('');
  const [oltId, setOltId] = useState('');
  const [fatId, setFatId] = useState('');
  const [ffatId, setFFatId] = useState('');

  // Quick F-FAT creation when permitted (can_add_fat)
  const [newFFatSuffix, setNewFFatSuffix] = useState('');
  const [addingFFat, setAddingFFat] = useState(false);

  // Spools & Meters
  const [outSpoolId, setOutSpoolId] = useState('');
  const [outMeter, setOutMeter] = useState('0');
  const [inSpoolId, setInSpoolId] = useState('');
  const [inMeter, setInMeter] = useState('0');

  // Modem
  const [modemBrandId, setModemBrandId] = useState('');
  const [modemSerial, setModemSerial] = useState('');

  // Date & Notes
  const today = getTodayJalali();
  const [serviceDate, setServiceDate] = useState(formatJalaliYmd(today.jy, today.jm, today.jd));
  const [notes, setNotes] = useState('');

  // Images
  const [imageCategory, setImageCategory] = useState('تست پاورمتر (OTDR/OPM)');
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const canAddFat =
    user.isSuperAdmin ||
    user.permissions.includes('can_add_fat') ||
    user.permissions.includes('can_manage_hardware');
  const canCrossUse = user.isSuperAdmin || user.permissions.includes('can_cross_use_cables');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      apiFetch<{ tickets: TicketItem[] }>('/api/tickets'),
      apiFetch<{
        kafs: KafItem[];
        olts: OltItem[];
        fats: FatItem[];
        ffats: FFatItem[];
        modemBrands: ModemBrandItem[];
      }>('/api/hardware'),
      apiFetch<{ spools: SpoolItem[] }>('/api/spools'),
    ])
      .then(([tRes, hRes, sRes]) => {
        if (!active) return;
        const openTickets = tRes.tickets.filter((t) => t.status !== 'completed');
        setTickets(openTickets);
        if (initialTicket && openTickets.some((t) => t.id === initialTicket.id)) {
          setSelectedTicketId(String(initialTicket.id));
        } else if (!selectedTicketId && openTickets.length > 0) {
          setSelectedTicketId(String(openTickets[0].id));
        }
        setKafs(hRes.kafs);
        setOlts(hRes.olts);
        setFats(hRes.fats);
        setFFats(hRes.ffats);
        setModemBrands(hRes.modemBrands);
        setSpools(sRes.spools);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'خطا در بارگذاری اطلاعات فرم');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialTicket]);

  const activeTicket = useMemo(
    () => tickets.find((t) => String(t.id) === selectedTicketId) || null,
    [tickets, selectedTicketId],
  );

  // Cascading hardware lists
  const filteredOlts = useMemo(
    () => olts.filter((o) => String(o.kaf_id) === kafId),
    [olts, kafId],
  );
  const filteredFats = useMemo(
    () => fats.filter((f) => String(f.olt_id) === oltId),
    [fats, oltId],
  );
  const filteredFFats = useMemo(
    () => ffats.filter((ff) => String(ff.fat_id) === fatId),
    [ffats, fatId],
  );
  const selectedFatObj = useMemo(
    () => fats.find((f) => String(f.id) === fatId) || null,
    [fats, fatId],
  );

  // Spools available to the ticket's installer (or all if can_cross_use_cables)
  const targetInstallerId = activeTicket?.assigned_installer ?? user.id;

  const outdoorSpools = useMemo(
    () =>
      spools.filter(
        (s) =>
          s.cable_type === 'outdoor' &&
          s.current_length > 0 &&
          (s.assigned_installer_id === targetInstallerId ||
            (canCrossUse && s.assigned_installer_id !== null)),
      ),
    [spools, targetInstallerId, canCrossUse],
  );

  const indoorSpools = useMemo(
    () =>
      spools.filter(
        (s) =>
          s.cable_type === 'indoor' &&
          s.current_length > 0 &&
          (s.assigned_installer_id === targetInstallerId ||
            (canCrossUse && s.assigned_installer_id !== null)),
      ),
    [spools, targetInstallerId, canCrossUse],
  );

  // Real-time Modem Serial validation
  const selectedBrand = useMemo(
    () => modemBrands.find((b) => String(b.id) === modemBrandId) || null,
    [modemBrands, modemBrandId],
  );
  const serialValidation = useMemo(() => {
    if (!selectedBrand || !modemSerial.trim()) return null;
    return validateModemSerial(modemSerial, selectedBrand);
  }, [selectedBrand, modemSerial]);

  const handleQuickAddFFat = async () => {
    if (!selectedFatObj || !newFFatSuffix.trim()) return;
    setAddingFFat(true);
    setError(null);
    try {
      const created = await apiFetch<FFatItem>('/api/hardware/ffats', {
        method: 'POST',
        body: JSON.stringify({ fat_id: selectedFatObj.id, suffix: newFFatSuffix }),
      });
      setFFats((prev) => [created, ...prev]);
      setFFatId(String(created.id));
      setNewFFatSuffix('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت F-FAT');
    } finally {
      setAddingFFat(false);
    }
  };

  const handleImageSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeTicket) return;
    setError(null);

    for (const file of Array.from(files)) {
      try {
        const compressed = await compressImageForUpload(file, 1280, 0.7);
        const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const entry: PendingImage = {
          localId,
          imageType: imageCategory,
          previewUrl: compressed.previewUrl,
          originalSize: compressed.originalSize,
          compressedSize: compressed.compressedSize,
          uploadedPath: null,
          uploading: true,
          blob: compressed.blob,
          filename: compressed.filename,
        };
        setPendingImages((prev) => [...prev, entry]);

        // Upload compressed Blob immediately via AJAX FormData
        uploadCompressedImage(
          activeTicket.id,
          imageCategory,
          compressed.blob,
          compressed.filename,
        )
          .then((res) => {
            setPendingImages((prev) =>
              prev.map((item) =>
                item.localId === localId
                  ? { ...item, uploadedPath: res.file_path, uploading: false }
                  : item,
              ),
            );
          })
          .catch((uploadErr) => {
            setError(
              uploadErr instanceof Error ? uploadErr.message : 'بارگذاری تصویر با خطا مواجه شد',
            );
            setPendingImages((prev) => prev.filter((item) => item.localId !== localId));
          });
      } catch (compErr) {
        setError(compErr instanceof Error ? compErr.message : 'فشرده‌سازی تصویر ناموفق بود');
      }
    }
    e.target.value = '';
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!activeTicket) {
      setError('تیکت فعالی انتخاب نشده است.');
      return;
    }
    if (!kafId || !oltId || !fatId || !ffatId) {
      setError('انتخاب کامل مسیر تجهیزات (KAF تا F-FAT) الزامی است.');
      return;
    }
    if (!selectedBrand || !serialValidation?.valid) {
      setError(serialValidation?.reason || 'سریال مودم معتبر نیست.');
      return;
    }
    if (pendingImages.some((i) => i.uploading)) {
      setError('لطفاً تا پایان بارگذاری تصاویر فشرده‌شده صبر کنید.');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/api/service-records', {
        method: 'POST',
        body: JSON.stringify({
          ticket_id: activeTicket.id,
          kaf_id: Number(kafId),
          olt_id: Number(oltId),
          fat_id: Number(fatId),
          ffat_id: Number(ffatId),
          out_spool_id: outSpoolId ? Number(outSpoolId) : null,
          out_total_meter: Number(outMeter) || 0,
          in_spool_id: inSpoolId ? Number(inSpoolId) : null,
          in_total_meter: Number(inMeter) || 0,
          modem_brand_id: Number(modemBrandId),
          modem_serial: modemSerial.trim(),
          service_date_jalali: serviceDate,
          notes,
          images: pendingImages
            .filter((i) => i.uploadedPath)
            .map((i) => ({ image_type: i.imageType, file_path: i.uploadedPath })),
        }),
      });
      setSuccessMsg('عملیات با موفقیت ثبت شد، متراژ قرقره‌ها کسر و سند دستمزد در دفتر کل صادر گردید.');
      setTimeout(() => onCompleted(), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت فرم عملیات');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
        در حال آماده‌سازی فرم عملیات...
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        در حال حاضر هیچ تیکت باز یا ارجاع‌شده‌ای برای تکمیل وجود ندارد.
      </div>
    );
  }

  let ffatPreview = '';
  if (selectedFatObj && newFFatSuffix.trim()) {
    try {
      ffatPreview = generateFFatCode(selectedFatObj.fat_number, newFFatSuffix);
    } catch {
      ffatPreview = '';
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-6">
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Section 1: Ticket & Date */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">۱. انتخاب تیکت و زمان اجرا</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <SearchableSelect
              label="تیکت عملیاتی"
              required
              options={tickets.map((t) => ({
                value: t.id,
                label: `#${toPersianDigits(t.id)} — ${t.customer_name} (${t.type === 'install' ? 'نصب' : 'خرابی'})`,
                sublabel: t.installer_name || 'بدون نصاب',
              }))}
              value={selectedTicketId}
              onChange={(val) => setSelectedTicketId(val)}
            />
          </div>
          <JalaliDatePicker
            label="تاریخ اجرای عملیات (شمسی)"
            value={serviceDate}
            onChange={setServiceDate}
          />
        </div>
        {activeTicket && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
            آدرس محل سرویس: <span className="font-medium text-slate-900">{activeTicket.address}</span>
          </div>
        )}
      </div>

      {/* Section 2: Cascading Hardware Topology (KAF -> OLT -> FAT -> F-FAT) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">۲. توپولوژی شبکه (KAF تا F-FAT)</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SearchableSelect
            label="کافو (KAF)"
            required
            options={kafs.map((k) => ({ value: k.id, label: k.name }))}
            value={kafId}
            onChange={(v) => {
              setKafId(v);
              setOltId('');
              setFatId('');
              setFFatId('');
            }}
          />
          <SearchableSelect
            label="دستگاه OLT"
            required
            disabled={!kafId}
            options={filteredOlts.map((o) => ({ value: o.id, label: o.name }))}
            value={oltId}
            onChange={(v) => {
              setOltId(v);
              setFatId('');
              setFFatId('');
            }}
          />
          <SearchableSelect
            label="باکس FAT"
            required
            disabled={!oltId}
            options={filteredFats.map((f) => ({
              value: f.id,
              label: `FAT ${toPersianDigits(f.fat_number)}`,
            }))}
            value={fatId}
            onChange={(v) => {
              setFatId(v);
              setFFatId('');
            }}
          />
          <SearchableSelect
            label="باکس F-FAT"
            required
            disabled={!fatId}
            options={filteredFFats.map((ff) => ({ value: ff.id, label: ff.ffat_code }))}
            value={ffatId}
            onChange={setFFatId}
          />
        </div>

        {canAddFat && selectedFatObj && (
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
            <div>
              <label htmlFor="quick-ffat" className="mb-1 block text-xs text-slate-600">
                تولید سریع کد F-FAT جدید روی FAT {toPersianDigits(selectedFatObj.fat_number)}
              </label>
              <input
                id="quick-ffat"
                type="text"
                dir="ltr"
                value={newFFatSuffix}
                onChange={(e) => setNewFFatSuffix(e.target.value)}
                placeholder="A4"
                className="h-9 w-44 rounded-lg border border-slate-300 px-3 text-left text-xs focus:border-teal-600 focus:outline-none"
              />
            </div>
            <button
              type="button"
              disabled={addingFFat || !ffatPreview}
              onClick={handleQuickAddFFat}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-teal-600 bg-teal-50 px-3 text-xs font-medium text-teal-800 hover:bg-teal-100 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{ffatPreview ? `افزودن ${ffatPreview}` : 'ثبت F-FAT'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Section 3: Spool Tracking & Cable Meters */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">۳. مصرف کابل و کسر از قرقره (Van Stock)</h2>
          <span className="text-xs text-slate-500">
            {canCrossUse ? 'مجوز مصرف مشترک قرقره‌ها فعال است' : 'فقط قرقره‌های تحویلی به نصاب مجاز هستند'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-slate-200 p-4">
            <div className="text-xs font-semibold text-slate-800">کابل فضای باز (Outdoor)</div>
            <SearchableSelect
              label="انتخاب قرقره بیرونی"
              options={outdoorSpools.map((s) => ({
                value: s.id,
                label: `${s.spool_code} — مانده: ${toPersianDigits(s.current_length)} متر`,
                sublabel: s.installer_name || 'انبار',
              }))}
              value={outSpoolId}
              onChange={setOutSpoolId}
            />
            <div>
              <label htmlFor="out-meter" className="mb-1 block text-xs font-medium text-slate-700">
                متراژ مصرفی بیرونی (متر)
              </label>
              <input
                id="out-meter"
                type="number"
                min={0}
                value={outMeter}
                onChange={(e) => setOutMeter(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm tabular-nums focus:border-teal-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-slate-200 p-4">
            <div className="text-xs font-semibold text-slate-800">کابل داخلی (Indoor)</div>
            <SearchableSelect
              label="انتخاب قرقره داخلی"
              options={indoorSpools.map((s) => ({
                value: s.id,
                label: `${s.spool_code} — مانده: ${toPersianDigits(s.current_length)} متر`,
                sublabel: s.installer_name || 'انبار',
              }))}
              value={inSpoolId}
              onChange={setInSpoolId}
            />
            <div>
              <label htmlFor="in-meter" className="mb-1 block text-xs font-medium text-slate-700">
                متراژ مصرفی داخلی (متر)
              </label>
              <input
                id="in-meter"
                type="number"
                min={0}
                value={inMeter}
                onChange={(e) => setInMeter(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm tabular-nums focus:border-teal-600 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: Modem Brand & Regex Serial Validation */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">۴. مشخصات مودم و اعتبارسنجی سریال</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SearchableSelect
            label="برند مودم"
            required
            options={modemBrands.map((b) => ({
              value: b.id,
              label: b.name,
              sublabel: `پیشوند: ${b.serial_prefix}`,
            }))}
            value={modemBrandId}
            onChange={setModemBrandId}
          />
          <div>
            <label htmlFor="modem-serial" className="mb-1.5 block text-xs font-medium text-slate-700">
              شماره سریال مودم (S/N) <span className="text-red-600">*</span>
            </label>
            <input
              id="modem-serial"
              type="text"
              dir="ltr"
              required
              value={modemSerial}
              onChange={(e) => setModemSerial(e.target.value.toUpperCase())}
              placeholder={selectedBrand ? `${selectedBrand.serial_prefix}...` : 'S/N'}
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-left font-mono text-sm focus:border-teal-600 focus:outline-none"
            />
            {serialValidation && (
              <p
                className={`mt-1.5 text-xs ${
                  serialValidation.valid ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                {serialValidation.valid
                  ? 'فرمت سریال با الگوی کارخانه مطابقت دارد.'
                  : serialValidation.reason}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Section 5: Client-Side Canvas Image Compression & Upload */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">۵. مستندات تصویری (فشرده‌سازی خودکار قبل از ارسال)</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              تصاویر گالری در مرورگر به حداکثر ۱۲۸۰ پیکسل و فرمت JPEG ۷۰٪ فشرده می‌شوند تا پهنای باند شبکه محلی اشغال نشود.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-60">
            <label htmlFor="img-cat" className="mb-1 block text-xs font-medium text-slate-700">
              نوع تصویر
            </label>
            <select
              id="img-cat"
              value={imageCategory}
              onChange={(e) => setImageCategory(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs focus:border-teal-600 focus:outline-none"
            >
              <option value="تست پاورمتر (OTDR/OPM)">تست پاورمتر (OTDR/OPM)</option>
              <option value="پچ‌کورد و پورت باکس FAT">پچ‌کورد و پورت باکس FAT</option>
              <option value="نصب نهایی و برچسب مودم">نصب نهایی و برچسب مودم</option>
              <option value="مسیر کابل‌کشی">مسیر کابل‌کشی</option>
            </select>
          </div>

          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-teal-600 bg-teal-50 px-4 text-xs font-medium text-teal-800 hover:bg-teal-100">
            <ImagePlus className="h-4 w-4" />
            <span>انتخاب و فشرده‌سازی تصویر</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageSelect}
              className="hidden"
            />
          </label>
        </div>

        {pendingImages.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingImages.map((img) => (
              <div key={img.localId} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <img
                  src={img.previewUrl}
                  alt={img.imageType}
                  className="h-32 w-full object-cover"
                />
                <div className="p-2.5 text-xs">
                  <div className="font-medium text-slate-800">{img.imageType}</div>
                  <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                    حجم اصلی: {formatBytesFa(img.originalSize)} ← فشرده: {formatBytesFa(img.compressedSize)}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className={img.uploading ? 'text-amber-600' : 'text-emerald-700'}>
                      {img.uploading ? 'در حال ارسال...' : 'ذخیره شده در سرور'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingImages((prev) => prev.filter((p) => p.localId !== img.localId))
                      }
                      aria-label="حذف تصویر"
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 6: Technical Notes & Submit */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <label htmlFor="service-notes" className="mb-1.5 block text-xs font-medium text-slate-700">
          توضیحات فنی و عدد پاورمتر (dBm)
        </label>
        <textarea
          id="service-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="مثال: توان دریافتی -18.2 dBm، فیوژن تمیز و تحویل به مشترک"
          className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-teal-600 focus:outline-none"
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <span className="text-xs text-slate-500">
            محاسبه تعرفه و کسر موجودی قرقره به صورت خودکار و امن در سمت سرور انجام می‌شود.
          </span>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            <span>{submitting ? 'در حال ثبت نهایی...' : 'ثبت نهایی عملیات و صدور دستمزد'}</span>
          </button>
        </div>
      </div>
    </form>
  );
}
