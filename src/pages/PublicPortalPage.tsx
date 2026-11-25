import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ArrowLeft,
  Building2,
  Cable,
  CheckCircle2,
  CloudOff,
  FileImage,
  LocateFixed,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  Wrench,
} from 'lucide-react';
import heroVisual from '../assets/images/fiber_portal_hero_1795515317079.jpg';
import { validatePublicRegistrationPayload } from '../lib/fiberLogic';
import { toPersianDigits } from '../lib/jalali';
import { queueOfflineMutation, type OutboxStoredImage } from '../lib/offlineDb';
import type { RegionItem, SystemSettings } from '../types/erp';
import { uploadPublicIdentityImage } from '../utils/api';
import { compressImageForUpload, formatBytesFa } from '../utils/imageCompression';

interface PublicPortalPageProps {
  settings: SystemSettings;
  regions: RegionItem[];
  isOnline: boolean;
  pendingSyncCount: number;
  isSyncing: boolean;
  onSyncNow: () => Promise<void>;
  onOutboxChanged: () => Promise<void>;
  onNavigateDashboard: () => void;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, desc?: string) => void;
}

interface CompressedDocSlot {
  imageType: string;
  label: string;
  blob: Blob;
  filename: string;
  previewUrl: string;
  originalSize: number;
  compressedSize: number;
}

const REAL_DOC_SLOTS = [
  { key: 'national_card', label: 'تصویر کارت ملی' },
  { key: 'birth_cert', label: 'تصویر صفحه اول شناسنامه' },
  { key: 'postal_proof', label: 'تصویر تاییدیه کد پستی / قبض' },
] as const;

const LEGAL_DOC_SLOTS = [
  { key: 'gazette', label: 'تصویر روزنامه رسمی تاسیس / تغییرات' },
  { key: 'statutes', label: 'تصویر اساسنامه شرکت' },
  { key: 'request_letter', label: 'نامه درخواست رسمی با مهر شرکت' },
] as const;

export function PublicPortalPage({
  settings,
  regions,
  isOnline,
  pendingSyncCount,
  isSyncing,
  onSyncNow,
  onOutboxChanged,
  onNavigateDashboard,
  onNotify,
}: PublicPortalPageProps) {
  const [requestedService, setRequestedService] = useState<'new_service' | 'fault_report'>(
    'new_service',
  );
  const [entityType, setEntityType] = useState<'real' | 'legal'>('real');
  const [regionId, setRegionId] = useState<string>('');

  // Real entity fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [nationalCode, setNationalCode] = useState('');

  // Legal entity fields
  const [companyName, setCompanyName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [economicCode, setEconomicCode] = useState('');

  // Shared fields
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [phone1, setPhone1] = useState('');
  const [phone2, setPhone2] = useState('');
  const [locationGps, setLocationGps] = useState('');
  const [faultDescription, setFaultDescription] = useState('');
  const [locating, setLocating] = useState(false);

  // Compressed docs map keyed by slot key
  const [docs, setDocs] = useState<Record<string, CompressedDocSlot>>({});
  const [compressingKey, setCompressingKey] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submittedResult, setSubmittedResult] = useState<{
    mode: 'online' | 'offline_queued';
    trackingCode?: string;
    customerName: string;
  } | null>(null);

  useEffect(() => {
    if (!regionId && regions.length > 0) {
      setRegionId(String(regions[0].id));
    }
  }, [regions, regionId]);

  const activeDocSlots =
    requestedService === 'fault_report'
      ? [{ key: 'fault_photo', label: 'تصویر محل خرابی یا مودم (اختیاری)' }]
      : entityType === 'real'
        ? REAL_DOC_SLOTS
        : LEGAL_DOC_SLOTS;

  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      onNotify('warning', 'مرورگر از موقعیت‌یاب GPS پشتیبانی نمی‌کند. لطفاً مختصات را دستی وارد کنید.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
        setLocationGps(coords);
        setLocating(false);
        onNotify('success', 'موقعیت مکانی GPS دریافت شد', coords);
      },
      () => {
        setLocating(false);
        onNotify(
          'warning',
          'دریافت خودکار موقعیت ممکن نشد',
          'می‌توانید عرض و طول جغرافیایی را با فرمت 35.7219, 51.3347 به صورت دستی وارد نمایید.',
        );
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const handleDocFileChange = async (
    slotKey: string,
    slotLabel: string,
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressingKey(slotKey);
    setFormError(null);
    try {
      const res = await compressImageForUpload(file, 1280, 0.7);
      setDocs((prev) => ({
        ...prev,
        [slotKey]: {
          imageType: slotKey,
          label: slotLabel,
          blob: res.blob,
          filename: res.filename,
          previewUrl: res.previewUrl,
          originalSize: res.originalSize,
          compressedSize: res.compressedSize,
        },
      }));
      onNotify(
        'success',
        `${slotLabel} فشرده‌سازی شد`,
        `${formatBytesFa(res.originalSize)} ← ${formatBytesFa(res.compressedSize)}`,
      );
    } catch (err) {
      onNotify(
        'error',
        'خطا در آماده‌سازی تصویر مدرک',
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setCompressingKey(null);
      e.target.value = '';
    }
  };

  const removeDoc = (slotKey: string) => {
    setDocs((prev) => {
      const next = { ...prev };
      delete next[slotKey];
      return next;
    });
  };

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setFatherName('');
    setNationalCode('');
    setCompanyName('');
    setRegistrationNumber('');
    setNationalId('');
    setEconomicCode('');
    setAddress('');
    setPostalCode('');
    setPhone1('');
    setPhone2('');
    setLocationGps('');
    setFaultDescription('');
    setDocs({});
    setFormError(null);
    setSubmittedResult(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const activeSlotKeys = new Set(activeDocSlots.map((s) => s.key));
    const selectedDocs = Object.values(docs).filter((d) => activeSlotKeys.has(d.imageType));

    const payload = {
      requested_service: requestedService,
      entity_type: entityType,
      region_id: Number(regionId),
      address: address.trim(),
      location_gps: locationGps.trim(),
      postal_code: postalCode.trim(),
      phone_1: phone1.trim(),
      phone_2: phone2.trim() || undefined,
      first_name: entityType === 'real' ? firstName.trim() : undefined,
      last_name: entityType === 'real' ? lastName.trim() : undefined,
      father_name: entityType === 'real' ? fatherName.trim() : undefined,
      national_code: entityType === 'real' ? nationalCode.trim() || undefined : undefined,
      company_name: entityType === 'legal' ? companyName.trim() : undefined,
      registration_number: entityType === 'legal' ? registrationNumber.trim() : undefined,
      national_id: entityType === 'legal' ? nationalId.trim() : undefined,
      economic_code: entityType === 'legal' ? economicCode.trim() : undefined,
      fault_description:
        requestedService === 'fault_report' ? faultDescription.trim() || undefined : undefined,
    };

    const validation = validatePublicRegistrationPayload({
      ...payload,
      uploadedImageTypes: selectedDocs.map((d) => d.imageType),
    });

    if (!validation.ok) {
      setFormError(validation.error || 'لطفاً فیلدهای الزامی را به درستی تکمیل کنید.');
      return;
    }

    const queueIntoOfflineDb = async () => {
      const outboxImages: OutboxStoredImage[] = selectedDocs.map((d) => ({
        imageType: d.imageType,
        filename: d.filename,
        caption: d.label,
        blob: d.blob,
        originalSize: d.originalSize,
        compressedSize: d.compressedSize,
      }));
      await queueOfflineMutation({
        kind: 'public_preregistration',
        ticketId: 0,
        payload,
        images: outboxImages,
      });
      await onOutboxChanged();
      setSubmittedResult({
        mode: 'offline_queued',
        customerName: validation.customerName,
      });
      onNotify(
        'info',
        'درخواست در حافظه آفلاین مرورگر ذخیره شد',
        'پس از برقراری اتصال شبکه به صورت خودکار به سرور ارسال می‌شود.',
      );
    };

    setSubmitting(true);
    try {
      if (!navigator.onLine || !isOnline) {
        await queueIntoOfflineDb();
        return;
      }

      const uploadedImages: Array<{ image_type: string; file_path: string; caption?: string }> = [];
      for (const d of selectedDocs) {
        const up = await uploadPublicIdentityImage(d.imageType, d.blob, d.filename);
        uploadedImages.push({
          image_type: d.imageType,
          file_path: up.file_path,
          caption: d.label,
        });
      }

      const res = await fetch('/api/public/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          ...payload,
          images: uploadedImages,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'خطا در ثبت درخواست آنلاین');
      }

      setSubmittedResult({
        mode: 'online',
        trackingCode: data.trackingCode,
        customerName: validation.customerName,
      });
      onNotify('success', 'درخواست شما با موفقیت ثبت شد', `کد پیگیری: ${data.trackingCode}`);
    } catch (err) {
      if (!navigator.onLine || err instanceof TypeError) {
        await queueIntoOfflineDb();
      } else {
        const msg = err instanceof Error ? err.message : 'خطا در ارسال درخواست';
        setFormError(msg);
        onNotify('error', 'خطا در ثبت درخواست', msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const gpsParts = locationGps.split(',').map((s) => Number(s.trim()));
  const hasValidGpsPreview =
    gpsParts.length === 2 && !Number.isNaN(gpsParts[0]) && !Number.isNaN(gpsParts[1]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Clean Single-Line 3-Zone Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex shrink-0 items-center gap-2.5 whitespace-nowrap">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-xs"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <Cable className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">{settings.system_name}</div>
              <div className="text-[11px] text-slate-500">پرتال ثبت سرویس و پشتیبانی مشترکین</div>
            </div>
          </div>

          <nav
            aria-label="لینک‌های پرتال"
            className="hidden items-center gap-6 whitespace-nowrap text-xs font-semibold text-slate-600 md:flex"
          >
            <a href="#rollout-steps" className="hover:text-slate-900 hover:underline">
              فرآیند نصب فیبر
            </a>
            <a href="#preregister-form" className="hover:text-slate-900 hover:underline">
              فرم ثبت درخواست
            </a>
          </nav>

          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            {pendingSyncCount > 0 && isOnline && (
              <button
                type="button"
                onClick={() => void onSyncNow()}
                disabled={isSyncing}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-900 hover:bg-amber-100"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>ارسال {toPersianDigits(pendingSyncCount)} صف آفلاین</span>
              </button>
            )}
            <button
              type="button"
              onClick={onNavigateDashboard}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-900 transition-colors hover:bg-slate-100"
            >
              <ShieldCheck className="h-4 w-4" style={{ color: 'var(--brand-primary)' }} />
              <span>ورود پرسنل</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-12 lg:py-14">
          <div className="space-y-5 lg:col-span-6">
            <p className="text-xs font-bold text-slate-500">
              اینترنت پرسرعت فیبر نوری (FTTH) · پوشش مناطق شهری و تجاری
            </p>
            <h1
              className="font-bold leading-tight text-slate-900"
              style={{ fontSize: 'clamp(1.75rem, 3.2vw, 2.65rem)' }}
            >
              درخواست آنلاین اشتراک فیبر نوری و پشتیبانی فنی در {settings.system_name}
            </h1>
            <p className="max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
              متقاضیان حقیقی و حقوقی می‌توانند پیش‌ثبت‌نام سرویس اینترنت FTTH یا گزارش خرابی خط
              خود را با ثبت موقعیت دقیق مکانی و مدارک هویتی ارسال کنند تا بلافاصله در کارتابل
              اپراتور بررسی و به تیم فنی منطقه ارجاع شود.
            </p>
            <div className="pt-1">
              <a
                href="#preregister-form"
                className="inline-flex min-h-[46px] items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <span>ثبت درخواست سرویس یا اعلام خرابی</span>
                <ArrowLeft className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
              <img
                src={heroVisual}
                alt="تجهیزات فیبر نوری خانگی و مودم FTTH"
                className="aspect-video w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 3-Step Rollout Process */}
      <section id="rollout-steps" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-6">
          <h2 className="text-lg font-bold text-slate-900">مراحل بررسی و اجرای سرویس</h2>
          <p className="mt-1 text-xs text-slate-500">
            فرآیند شفاف از ثبت آنلاین تا تحویل مودم و فعال‌سازی خط فیبر نوری
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-bold" style={{ color: 'var(--brand-primary)' }}>
              ۰۱. ثبت مشخصات و مدارک
            </div>
            <h3 className="mt-1.5 text-sm font-bold text-slate-900">پیش‌ثبت‌نام آنلاین یا آفلاین</h3>
            <p className="mt-1.5 text-xs leading-6 text-slate-600">
              انتخاب منطقه، ثبت کد پستی ۱۰ رقمی، مختصات GPS و تصویر مدارک (فشرده‌شده به صورت خودکار).
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-bold" style={{ color: 'var(--brand-primary)' }}>
              ۰۲. بررسی و تایید اپراتور
            </div>
            <h3 className="mt-1.5 text-sm font-bold text-slate-900">تخصیص پکیج و تیم اجرایی</h3>
            <p className="mt-1.5 text-xs leading-6 text-slate-600">
              امکان‌سنجی باکس FAT/F-FAT، تعیین مودم و پکیج فروش و زمان‌بندی مراجعه کارشناس فنی.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-bold" style={{ color: 'var(--brand-primary)' }}>
              ۰۳. نصب و تحویل رسمی
            </div>
            <h3 className="mt-1.5 text-sm font-bold text-slate-900">فیوژن، تست خط و فاکتور</h3>
            <p className="mt-1.5 text-xs leading-6 text-slate-600">
              اجرای کابل‌کشی، کانفیگ مودم و صدور صورت‌جلسه و فاکتور رسمی قابل چاپ مشترک.
            </p>
          </div>
        </div>
      </section>

      {/* Main Pre-Registration Form */}
      <section id="preregister-form" className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        {!isOnline && (
          <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-950">
            <CloudOff className="h-4 w-4 shrink-0 text-amber-700" />
            <span>
              در حال حاضر اتصال شبکه برقرار نیست. درخواست شما با تصاویر فشرده در حافظه آفلاین
              مرورگر ذخیره شده و بلافاصله پس از اتصال به صورت خودکار ارسال می‌شود.
            </span>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-8">
          {submittedResult ? (
            <div className="space-y-4 py-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                {submittedResult.mode === 'online'
                  ? 'درخواست شما با موفقیت در سامانه ثبت شد'
                  : 'درخواست شما در صف آفلاین ذخیره شد'}
              </h2>
              <p className="mx-auto max-w-md text-xs leading-6 text-slate-600">
                {submittedResult.mode === 'online' ? (
                  <>
                    مشترک گرامی <strong>{submittedResult.customerName}</strong>، درخواست شما در صف
                    بررسی اپراتور قرار گرفت. همکاران ما پس از امکان‌سنجی فنی با شما تماس خواهند
                    گرفت.
                  </>
                ) : (
                  <>
                    اطلاعات و مدارک <strong>{submittedResult.customerName}</strong> در حافظه مرورگر
                    ذخیره شد و پس از اتصال مجدد به شبکه به طور خودکار ارسال می‌گردد.
                  </>
                )}
              </p>

              {submittedResult.trackingCode && (
                <div className="mx-auto inline-block rounded-xl border border-slate-200 bg-slate-50 px-6 py-3">
                  <div className="text-[11px] text-slate-500">کد پیگیری درخواست</div>
                  <div
                    dir="ltr"
                    data-testid="public-tracking-code"
                    className="mt-1 font-mono text-xl font-bold tracking-wider text-slate-900 tabular-nums"
                  >
                    {submittedResult.trackingCode}
                  </div>
                </div>
              )}

              <div className="pt-3">
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 text-xs font-bold text-white"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <span>ثبت درخواست جدید</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                  فرم پیش‌ثبت‌نام سرویس اینترنت و اعلام خرابی
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  تمامی فیلدهای ستاره‌دار (*) برای بررسی دقیق مهندسی و استقرار تیم فنی الزامی است.
                </p>
              </div>

              {formError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800"
                >
                  {formError}
                </div>
              )}

              {/* Segmented Controls: Service Type + Entity Type */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">نوع درخواست</span>
                  <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setRequestedService('new_service')}
                      className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition-colors ${
                        requestedService === 'new_service'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Cable className="h-4 w-4" />
                      <span>سرویس اینترنت جدید</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRequestedService('fault_report')}
                      className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition-colors ${
                        requestedService === 'fault_report'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Wrench className="h-4 w-4" />
                      <span>اعلام خرابی</span>
                    </button>
                  </div>
                </div>

                <div>
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">نوع متقاضی</span>
                  <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setEntityType('real')}
                      className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition-colors ${
                        entityType === 'real'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <User className="h-4 w-4" />
                      <span>حقیقی</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEntityType('legal')}
                      className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition-colors ${
                        entityType === 'legal'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Building2 className="h-4 w-4" />
                      <span>حقوقی (شرکت/سازمان)</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Dynamic Identity Fields */}
              {entityType === 'real' ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label
                      htmlFor="pub-first-name"
                      className="mb-1 block text-xs font-semibold text-slate-700"
                    >
                      * نام
                    </label>
                    <input
                      id="pub-first-name"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="مثلاً سارا"
                      className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="pub-last-name"
                      className="mb-1 block text-xs font-semibold text-slate-700"
                    >
                      * نام خانوادگی
                    </label>
                    <input
                      id="pub-last-name"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="مثلاً محمدی"
                      className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="pub-father-name"
                      className="mb-1 block text-xs font-semibold text-slate-700"
                    >
                      * نام پدر
                    </label>
                    <input
                      id="pub-father-name"
                      type="text"
                      value={fatherName}
                      onChange={(e) => setFatherName(e.target.value)}
                      placeholder="مثلاً علی"
                      className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="pub-national-code"
                      className="mb-1 block text-xs font-semibold text-slate-700"
                    >
                      کد ملی (۱۰ رقم)
                    </label>
                    <input
                      id="pub-national-code"
                      type="text"
                      dir="ltr"
                      maxLength={10}
                      value={nationalCode}
                      onChange={(e) => setNationalCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="0012345678"
                      className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-left text-sm tabular-nums focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label
                      htmlFor="pub-company-name"
                      className="mb-1 block text-xs font-semibold text-slate-700"
                    >
                      * نام شرکت / سازمان
                    </label>
                    <input
                      id="pub-company-name"
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="شرکت پیشرو پردازش"
                      className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="pub-reg-num"
                      className="mb-1 block text-xs font-semibold text-slate-700"
                    >
                      * شماره ثبت
                    </label>
                    <input
                      id="pub-reg-num"
                      type="text"
                      dir="ltr"
                      value={registrationNumber}
                      onChange={(e) => setRegistrationNumber(e.target.value)}
                      placeholder="482910"
                      className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-left text-sm tabular-nums focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="pub-national-id"
                      className="mb-1 block text-xs font-semibold text-slate-700"
                    >
                      * شناسه ملی شرکت
                    </label>
                    <input
                      id="pub-national-id"
                      type="text"
                      dir="ltr"
                      value={nationalId}
                      onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ''))}
                      placeholder="14008123456"
                      className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-left text-sm tabular-nums focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="pub-economic-code"
                      className="mb-1 block text-xs font-semibold text-slate-700"
                    >
                      * کد اقتصادی
                    </label>
                    <input
                      id="pub-economic-code"
                      type="text"
                      dir="ltr"
                      value={economicCode}
                      onChange={(e) => setEconomicCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="411512345678"
                      className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-left text-sm tabular-nums focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Region, Contact, Address, Postal Code */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label
                    htmlFor="pub-region"
                    className="mb-1 block text-xs font-semibold text-slate-700"
                  >
                    * منطقه تحت پوشش
                  </label>
                  <select
                    id="pub-region"
                    value={regionId}
                    onChange={(e) => setRegionId(e.target.value)}
                    className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-teal-700 focus:outline-none"
                  >
                    <option value="">انتخاب منطقه...</option>
                    {regions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="pub-postal-code"
                    className="mb-1 block text-xs font-semibold text-slate-700"
                  >
                    * کد پستی (۱۰ رقم)
                  </label>
                  <input
                    id="pub-postal-code"
                    type="text"
                    dir="ltr"
                    maxLength={10}
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="1415512345"
                    className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-left text-sm tabular-nums focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="pub-phone-1"
                    className="mb-1 block text-xs font-semibold text-slate-700"
                  >
                    * شماره تماس اصلی
                  </label>
                  <input
                    id="pub-phone-1"
                    type="tel"
                    dir="ltr"
                    maxLength={11}
                    value={phone1}
                    onChange={(e) => setPhone1(e.target.value.replace(/\D/g, ''))}
                    placeholder="09121234567"
                    className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-left text-sm tabular-nums focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="pub-phone-2"
                    className="mb-1 block text-xs font-semibold text-slate-700"
                  >
                    شماره تماس دوم (اختیاری)
                  </label>
                  <input
                    id="pub-phone-2"
                    type="tel"
                    dir="ltr"
                    maxLength={11}
                    value={phone2}
                    onChange={(e) => setPhone2(e.target.value.replace(/\D/g, ''))}
                    placeholder="02188123456"
                    className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-left text-sm tabular-nums focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="lg:col-span-7">
                  <label
                    htmlFor="pub-address"
                    className="mb-1 block text-xs font-semibold text-slate-700"
                  >
                    * نشانی دقیق محل نصب / خرابی
                  </label>
                  <input
                    id="pub-address"
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="خیابان، کوچه، پلاک، طبقه و واحد"
                    className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div className="lg:col-span-5">
                  <label
                    htmlFor="pub-gps"
                    className="mb-1 block text-xs font-semibold text-slate-700"
                  >
                    * موقعیت مکانی (مختصات GPS: عرض، طول)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="pub-gps"
                      type="text"
                      dir="ltr"
                      value={locationGps}
                      onChange={(e) => setLocationGps(e.target.value)}
                      placeholder="35.7219, 51.3347"
                      className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3 text-left text-xs tabular-nums focus:border-teal-700 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCaptureGps}
                      disabled={locating}
                      className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                    >
                      <LocateFixed className="h-4 w-4" />
                      <span>{locating ? 'دریافت...' : 'ثبت GPS'}</span>
                    </button>
                  </div>
                  {hasValidGpsPreview && (
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700">
                      <MapPin className="h-3.5 w-3.5" />
                      <span dir="ltr" className="tabular-nums">
                        {gpsParts[0].toFixed(5)}, {gpsParts[1].toFixed(5)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {requestedService === 'fault_report' && (
                <div>
                  <label
                    htmlFor="pub-fault-desc"
                    className="mb-1 block text-xs font-semibold text-slate-700"
                  >
                    شرح خرابی و وضعیت چراغ‌های مودم
                  </label>
                  <textarea
                    id="pub-fault-desc"
                    rows={3}
                    value={faultDescription}
                    onChange={(e) => setFaultDescription(e.target.value)}
                    placeholder="مثلاً: چراغ قرمز LOS روی مودم روشن شده یا اینترنت قطع و وصل می‌شود..."
                    className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-teal-700 focus:outline-none"
                  />
                </div>
              )}

              {/* Compressed Identity / Legal Documents Upload */}
              <div className="space-y-3 border-t border-slate-100 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      {requestedService === 'new_service'
                        ? '* مدارک هویتی و نشانی (فشرده‌سازی خودکار قبل از ارسال)'
                        : 'مستندات تصویری خرابی (اختیاری)'}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      تصاویر در مرورگر با فرمت بهینه JPEG فشرده می‌شوند تا حتی در اینترنت ضعیف سریع
                      ارسال شوند.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {activeDocSlots.map((slot) => {
                    const uploaded = docs[slot.key];
                    const busy = compressingKey === slot.key;
                    return (
                      <div
                        key={slot.key}
                        className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-800">{slot.label}</span>
                          {uploaded && (
                            <button
                              type="button"
                              onClick={() => removeDoc(slot.key)}
                              aria-label={`حذف ${slot.label}`}
                              className="rounded p-1 text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {uploaded ? (
                          <div className="space-y-2">
                            <img
                              src={uploaded.previewUrl}
                              alt={slot.label}
                              className="h-28 w-full rounded-lg border border-slate-200 bg-white object-cover"
                            />
                            <div className="flex items-center justify-between text-[11px] text-slate-600">
                              <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                                <FileImage className="h-3.5 w-3.5" />
                                آماده ارسال
                              </span>
                              <span className="tabular-nums">
                                {formatBytesFa(uploaded.compressedSize)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <label className="flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white p-3 text-center text-xs text-slate-600 hover:border-slate-400 hover:bg-slate-50">
                            <Upload className="h-5 w-5 text-slate-500" />
                            <span className="font-semibold">
                              {busy ? 'در حال فشرده‌سازی...' : 'انتخاب تصویر مدرک'}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              data-doc-slot={slot.key}
                              disabled={busy}
                              onChange={(e) => void handleDocFileChange(slot.key, slot.label, e)}
                              className="sr-only"
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <span className="text-xs text-slate-500">
                  پس از ثبت، کد پیگیری ۵ رقمی به شما نمایش داده می‌شود.
                </span>
                <button
                  type="submit"
                  disabled={submitting || Boolean(compressingKey)}
                  className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl px-7 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <span>
                    {submitting
                      ? 'در حال ثبت درخواست...'
                      : isOnline
                        ? 'ثبت و ارسال درخواست'
                        : 'ذخیره در صف آفلاین'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
