import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Camera, CheckCircle2, CloudOff, Radio, Trash2, Upload } from 'lucide-react';
import { ProvisioningConfigBox } from '../components/ProvisioningConfigBox';
import { SearchableSelect } from '../components/SearchableSelect';
import {
  TICKET_TYPE_LABELS,
  getSpoolPercentRemaining,
  getTicketTypeFieldVisibility,
  validateModemSerial,
  type ModemSource,
  type ServiceSourceType,
} from '../lib/fiberLogic';
import { toPersianDigits } from '../lib/jalali';
import { queueOfflineMutation, type OutboxStoredImage } from '../lib/offlineDb';
import { userHasPermission } from '../lib/permissions';
import type {
  AuthUser,
  FatItem,
  FFatItem,
  ModemBrandItem,
  SpoolItem,
  TicketItem,
  VanStockItem,
} from '../types/erp';
import { apiFetch, uploadCompressedImage } from '../utils/api';
import { compressImageForUpload, formatBytesFa } from '../utils/imageCompression';

interface ServiceFormPageProps {
  user: AuthUser;
  tickets: TicketItem[];
  fats: FatItem[];
  ffats: FFatItem[];
  modemBrands: ModemBrandItem[];
  spools: SpoolItem[];
  vanStock: VanStockItem[];
  selectedTicketId: number | null;
  isOnline: boolean;
  onSelectTicketId: (id: number | null) => void;
  onCompleted: () => Promise<void>;
  onOutboxChanged: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, desc?: string) => void;
}

interface PendingPhoto extends OutboxStoredImage {
  id: string;
  previewUrl: string;
}

export function ServiceFormPage({
  user,
  tickets,
  fats,
  ffats,
  modemBrands,
  spools,
  vanStock,
  selectedTicketId,
  isOnline,
  onSelectTicketId,
  onCompleted,
  onOutboxChanged,
  onNotify,
}: ServiceFormPageProps) {
  const openTickets = useMemo(
    () => tickets.filter((t) => t.status !== 'completed' && t.status !== 'failed'),
    [tickets],
  );

  const activeTicket = useMemo(
    () =>
      openTickets.find((t) => t.id === selectedTicketId) ||
      openTickets[0] ||
      null,
    [openTickets, selectedTicketId],
  );

  const [sourceType, setSourceType] = useState<ServiceSourceType>('FAT');
  const [sourceId, setSourceId] = useState('');
  const [outSpoolId, setOutSpoolId] = useState('');
  const [outMeter, setOutMeter] = useState('0');
  const [inSpoolId, setInSpoolId] = useState('');
  const [inMeter, setInMeter] = useState('0');

  const [modemSource, setModemSource] = useState<ModemSource>('company');
  const [vanStockId, setVanStockId] = useState('');
  const [modemBrandId, setModemBrandId] = useState('');
  const [modemSerial, setModemSerial] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canCrossUseCable = userHasPermission(user, 'can_cross_use_cable');
  const effectiveInstallerId = activeTicket?.assigned_installer || user.id;

  const sourceOptions = useMemo(() => {
    if (sourceType === 'FAT') {
      return fats.map((f) => ({
        value: String(f.id),
        label: `FAT ${toPersianDigits(f.fat_number)}`,
        sublabel: f.olt_name || undefined,
      }));
    }
    return ffats.map((ff) => ({
      value: String(ff.id),
      label: ff.ffat_code,
      sublabel: ff.fat_number ? `متصل به FAT ${toPersianDigits(ff.fat_number)}` : undefined,
    }));
  }, [sourceType, fats, ffats]);

  const outdoorSpoolOptions = useMemo(
    () =>
      spools
        .filter(
          (s) =>
            s.cable_type === 'outdoor' &&
            s.current_length > 0 &&
            (canCrossUseCable || s.assigned_installer_id === effectiveInstallerId),
        )
        .map((s) => ({
          value: String(s.id),
          label: `${s.spool_code} (${toPersianDigits(s.current_length)} متر باقیمانده)`,
          sublabel: `${s.installer_name || 'انبار مرکزی'} — ${toPersianDigits(
            getSpoolPercentRemaining(s),
          )}٪`,
        })),
    [spools, canCrossUseCable, effectiveInstallerId],
  );

  const indoorSpoolOptions = useMemo(
    () =>
      spools
        .filter(
          (s) =>
            s.cable_type === 'indoor' &&
            s.current_length > 0 &&
            (canCrossUseCable || s.assigned_installer_id === effectiveInstallerId),
        )
        .map((s) => ({
          value: String(s.id),
          label: `${s.spool_code} (${toPersianDigits(s.current_length)} متر باقیمانده)`,
          sublabel: `${s.installer_name || 'انبار مرکزی'} — ${toPersianDigits(
            getSpoolPercentRemaining(s),
          )}٪`,
        })),
    [spools, canCrossUseCable, effectiveInstallerId],
  );

  const installerVanModems = useMemo(
    () =>
      vanStock.filter(
        (v) =>
          v.item_type === 'modem' &&
          v.quantity > 0 &&
          (userHasPermission(user, 'can_view_all_tickets') || v.user_id === effectiveInstallerId),
      ),
    [vanStock, user, effectiveInstallerId],
  );

  const selectedBrand = useMemo(
    () => modemBrands.find((b) => String(b.id) === modemBrandId),
    [modemBrands, modemBrandId],
  );

  const serialValidation = useMemo(() => {
    if (!selectedBrand || !modemSerial.trim()) return null;
    return validateModemSerial(modemSerial, selectedBrand);
  }, [selectedBrand, modemSerial]);

  const handleSelectVanModem = (idStr: string) => {
    setVanStockId(idStr);
    const found = installerVanModems.find((v) => String(v.id) === idStr);
    if (found) {
      if (found.modem_brand_id) setModemBrandId(String(found.modem_brand_id));
      if (found.serial_number) setModemSerial(found.serial_number);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>, imageType: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressing(true);
    try {
      const res = await compressImageForUpload(file, 1280, 0.7);
      setPhotos((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          imageType,
          filename: res.filename,
          blob: res.blob,
          previewUrl: res.previewUrl,
          originalSize: res.originalSize,
          compressedSize: res.compressedSize,
        },
      ]);
      onNotify(
        'success',
        'تصویر فشرده‌سازی شد',
        `${formatBytesFa(res.originalSize)} ← ${formatBytesFa(res.compressedSize)}`,
      );
    } catch (err) {
      onNotify('error', 'خطا در فشرده‌سازی تصویر', err instanceof Error ? err.message : undefined);
    } finally {
      setCompressing(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeTicket) return;

    if (!sourceId) {
      onNotify('error', 'انتخاب پورت تجهیزات مبدا (FAT یا F-FAT) الزامی است');
      return;
    }

    const vis = getTicketTypeFieldVisibility(activeTicket.type);
    if ((vis.requiresModem || modemSerial.trim()) && selectedBrand) {
      const check = validateModemSerial(modemSerial, selectedBrand);
      if (!check.valid) {
        onNotify('error', 'سریال مودم معتبر نیست', check.reason);
        return;
      }
    }

    const payload = {
      ticket_id: activeTicket.id,
      source_type: sourceType,
      source_id: Number(sourceId),
      out_spool_id: outSpoolId ? Number(outSpoolId) : null,
      out_total_meter: Number(outMeter) || 0,
      in_spool_id: inSpoolId ? Number(inSpoolId) : null,
      in_total_meter: Number(inMeter) || 0,
      modem_source: modemSource,
      van_stock_id: modemSource === 'company' && vanStockId ? Number(vanStockId) : null,
      modem_brand_id: modemBrandId ? Number(modemBrandId) : null,
      modem_serial: modemSerial.trim() || null,
      notes: notes.trim() || null,
    };

    const queueIntoIndexedDb = async () => {
      await queueOfflineMutation({
        kind: 'service_record',
        ticketId: activeTicket.id,
        payload,
        images: photos.map((p) => ({
          imageType: p.imageType,
          filename: p.filename,
          blob: p.blob,
          originalSize: p.originalSize,
          compressedSize: p.compressedSize,
        })),
      });
      await onOutboxChanged();
      onNotify(
        'info',
        'گزارش عملیات در حافظه آفلاین (IndexedDB) ذخیره شد',
        'به محض برقراری اینترنت، تصاویر و فرم به صورت خودکار به سرور ارسال و کسر قرقره اعمال می‌شود.',
      );
      setNotes('');
      setPhotos([]);
    };

    setSubmitting(true);
    try {
      if (!isOnline) {
        await queueIntoIndexedDb();
        return;
      }

      const uploadedImages: Array<{ image_type: string; file_path: string }> = [];
      for (const photo of photos) {
        const up = await uploadCompressedImage(
          activeTicket.id,
          photo.imageType,
          photo.blob,
          photo.filename,
        );
        uploadedImages.push({ image_type: up.image_type, file_path: up.file_path });
      }

      const res = await apiFetch<{
        lowSpoolAlerts?: Array<{ spool_code: string; percentRemaining: number }>;
      }>('/api/service-records', {
        method: 'POST',
        body: JSON.stringify({ ...payload, images: uploadedImages }),
      });

      if (res.lowSpoolAlerts && res.lowSpoolAlerts.length > 0) {
        for (const alert of res.lowSpoolAlerts) {
          onNotify(
            'error',
            `هشدار کاهش موجودی قرقره ${alert.spool_code}`,
            `موجودی قرقره به ${toPersianDigits(alert.percentRemaining)}٪ رسید (زیر ۱۰٪ آستانه).`,
          );
        }
      }

      onNotify('success', 'گزارش تکمیل عملیات ثبت و دستمزد به دفتر کل اضافه شد');
      setSourceId('');
      setOutMeter('0');
      setInMeter('0');
      setModemSerial('');
      setNotes('');
      setPhotos([]);
      await onCompleted();
    } catch (err) {
      if (!navigator.onLine) {
        await queueIntoIndexedDb();
      } else {
        onNotify('error', 'خطا در ثبت گزارش عملیات', err instanceof Error ? err.message : undefined);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (openTickets.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        تیکت فعالی در وضعیت در انتظار یا در حال اجرا وجود ندارد.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {!isOnline && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
          <CloudOff className="h-4 w-4 shrink-0" />
          <span>
            شما در حالت آفلاین هستید؛ تمام اطلاعات و تصاویر فشرده‌شده در IndexedDB ذخیره و پس از
            اتصال همگام‌سازی می‌شوند.
          </span>
        </div>
      )}

      {/* Active Ticket Selector & Read-Only Provisioning Box */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">
              انتخاب تیکت جهت تکمیل عملیات
            </label>
            <select
              value={activeTicket?.id || ''}
              onChange={(e) => onSelectTicketId(Number(e.target.value))}
              className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium"
            >
              {openTickets.map((t) => (
                <option key={t.id} value={t.id}>
                  #{toPersianDigits(t.id)} — {t.customer_name} ({TICKET_TYPE_LABELS[t.type]})
                </option>
              ))}
            </select>
          </div>
          {activeTicket && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="font-bold text-slate-900">{activeTicket.customer_name}</div>
              <div className="mt-1 text-slate-600">{activeTicket.address}</div>
            </div>
          )}
        </div>

        {activeTicket && <ProvisioningConfigBox ticket={activeTicket} />}
      </div>

      {/* Hardware Connection Source Toggle: FAT vs FFAT */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Radio className="h-4 w-4 text-teal-700" />
          <span>نقطه اتصال مبدا در توپولوژی شبکه (FAT یا F-FAT)</span>
        </div>

        <div className="grid grid-cols-2 gap-3 max-w-md">
          <label
            className={`flex min-h-[46px] cursor-pointer items-center justify-center gap-2 rounded-lg border text-xs font-bold transition-colors ${
              sourceType === 'FAT'
                ? 'border-teal-700 bg-teal-50 text-teal-900'
                : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            <input
              type="radio"
              name="source_type"
              value="FAT"
              checked={sourceType === 'FAT'}
              onChange={() => {
                setSourceType('FAT');
                setSourceId('');
              }}
              className="accent-teal-700"
            />
            <span>اتصال مستقیم از FAT</span>
          </label>

          <label
            className={`flex min-h-[46px] cursor-pointer items-center justify-center gap-2 rounded-lg border text-xs font-bold transition-colors ${
              sourceType === 'FFAT'
                ? 'border-teal-700 bg-teal-50 text-teal-900'
                : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            <input
              type="radio"
              name="source_type"
              value="FFAT"
              checked={sourceType === 'FFAT'}
              onChange={() => {
                setSourceType('FFAT');
                setSourceId('');
              }}
              className="accent-teal-700"
            />
            <span>اتصال از F-FAT</span>
          </label>
        </div>

        <div className="max-w-lg">
          <label className="mb-1.5 block text-xs font-semibold text-slate-700">
            {sourceType === 'FAT' ? 'انتخاب پورت FAT' : 'انتخاب کد F-FAT'}
          </label>
          <SearchableSelect
            id="service-source-select"
            options={sourceOptions}
            value={sourceId}
            onChange={setSourceId}
            placeholder={sourceType === 'FAT' ? 'انتخاب FAT...' : 'انتخاب F-FAT...'}
          />
        </div>
      </div>

      {/* Exact Spool Consumption */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900">مصرف دقیق کابل از قرقره‌های خودرو</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-bold text-slate-800">کابل فضای باز (Outdoor)</div>
            <SearchableSelect
              options={outdoorSpoolOptions}
              value={outSpoolId}
              onChange={setOutSpoolId}
              placeholder="انتخاب قرقره فضای باز..."
            />
            <div>
              <label className="mb-1 block text-xs text-slate-600">متراژ مصرف‌شده (متر)</label>
              <input
                type="number"
                min={0}
                value={outMeter}
                onChange={(e) => setOutMeter(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-bold text-slate-800">کابل داخلی (Indoor)</div>
            <SearchableSelect
              options={indoorSpoolOptions}
              value={inSpoolId}
              onChange={setInSpoolId}
              placeholder="انتخاب قرقره داخلی..."
            />
            <div>
              <label className="mb-1 block text-xs text-slate-600">متراژ مصرف‌شده (متر)</label>
              <input
                type="number"
                min={0}
                value={inMeter}
                onChange={(e) => setInMeter(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm tabular-nums"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Modem & Van Stock + Live Regex Validation */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900">
          مشخصات مودم و کنترل انبار خودرو (Van Stock)
        </h3>

        <div className="flex flex-wrap gap-3">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 text-xs font-semibold">
            <input
              type="radio"
              name="modem_source"
              checked={modemSource === 'company'}
              onChange={() => setModemSource('company')}
              className="accent-teal-700"
            />
            <span>مودم تحویلی از انبار شرکت (کسر از Van Stock)</span>
          </label>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 text-xs font-semibold">
            <input
              type="radio"
              name="modem_source"
              checked={modemSource === 'customer'}
              onChange={() => {
                setModemSource('customer');
                setVanStockId('');
              }}
              className="accent-teal-700"
            />
            <span>مودم متعلق به مشترک (بدون کسر از انبار)</span>
          </label>
        </div>

        {modemSource === 'company' && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              انتخاب مودم از انبار خودروی نصاب
            </label>
            <select
              value={vanStockId}
              onChange={(e) => handleSelectVanModem(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">انتخاب مودم موجود در خودرو...</option>
              {installerVanModems.map((vm) => (
                <option key={vm.id} value={vm.id}>
                  {vm.item_name} — سریال: {vm.serial_number || 'ثبت‌نشده'} ({vm.installer_name})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">برند مودم</label>
            <select
              value={modemBrandId}
              onChange={(e) => setModemBrandId(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">انتخاب برند...</option>
              {modemBrands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} (پیشوند: {b.serial_prefix})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              شماره سریال مودم (S/N)
            </label>
            <input
              type="text"
              dir="ltr"
              value={modemSerial}
              onChange={(e) => setModemSerial(e.target.value)}
              placeholder={selectedBrand ? `${selectedBrand.serial_prefix}...` : '48575443...'}
              className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-left text-sm"
            />
            {serialValidation && (
              <p
                className={`mt-1 text-xs font-medium ${
                  serialValidation.valid ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                {serialValidation.valid
                  ? 'فرمت سریال مودم با الگوی کارخانه مطابقت دارد.'
                  : serialValidation.reason}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Client-Side Canvas Image Compression */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              تصاویر مستندات عملیات (فشرده‌سازی خودکار حداکثر ۱۲۸۰ پیکسل / JPEG 70%)
            </h3>
            <p className="text-xs text-slate-500">
              مناسب ذخیره آفلاین در گوشی و ارسال سریع روی شبکه اینترانت
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-teal-700 bg-teal-50 px-3.5 text-xs font-bold text-teal-900 hover:bg-teal-100">
              <Camera className="h-4 w-4" />
              <span>{compressing ? 'در حال فشرده‌سازی...' : 'ثبت عکس با دوربین'}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={compressing}
                onChange={(e) => handleFileChange(e, 'site_photo')}
                className="hidden"
              />
            </label>

            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-50">
              <Upload className="h-4 w-4" />
              <span>انتخاب از گالری</span>
              <input
                type="file"
                accept="image/*"
                disabled={compressing}
                onChange={(e) => handleFileChange(e, 'power_meter')}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {photos.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {photos.map((p) => (
              <div key={p.id} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <img src={p.previewUrl} alt={p.filename} className="h-28 w-full object-cover" />
                <div className="flex items-center justify-between gap-1 p-2 text-[11px]">
                  <span className="truncate text-slate-600">{formatBytesFa(p.compressedSize)}</span>
                  <button
                    type="button"
                    onClick={() => setPhotos((prev) => prev.filter((item) => item.id !== p.id))}
                    className="text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">
            توضیحات فنی نصاب (پاور نوری، شماره پورت، وضعیت تحویل)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="مثلاً تست پاور -18.5 dBm و تحویل سرویس با موفقیت..."
            className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting || compressing}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-teal-700 px-6 text-sm font-bold text-white shadow-sm hover:bg-teal-800 disabled:opacity-60"
        >
          <CheckCircle2 className="h-5 w-5" />
          <span>{submitting ? 'در حال ثبت...' : 'ثبت نهایی و تکمیل عملیات'}</span>
        </button>
      </div>
    </form>
  );
}
