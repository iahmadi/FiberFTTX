import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import type { ServiceRecordDetail } from '../types/erp';
import { buildServiceRecordPrintMeta } from '../lib/fiberLogic';
import { formatDateTimeToJalali, formatDateToJalali, formatToman, toPersianDigits } from '../lib/jalali';

interface ServiceRecordPdfReportProps {
  record: ServiceRecordDetail | null;
  onClose: () => void;
}

export function ServiceRecordPdfReport({ record, onClose }: ServiceRecordPdfReportProps) {
  useEffect(() => {
    if (!record) return;
    document.body.classList.add('printing-service-report');

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.classList.remove('printing-service-report');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [record, onClose]);

  if (!record) return null;

  const meta = buildServiceRecordPrintMeta(record);
  const serviceDateDisplay =
    record.service_date_jalali || formatDateToJalali(record.created_at, true);
  const printedAtDisplay = formatDateTimeToJalali(new Date(), true);

  return createPortal(
    <div
      id="print-report-portal"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={`گزارش PDF تحویل سرویس تیکت ${toPersianDigits(record.ticket_id)}`}
      className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/75 p-4 sm:p-6"
    >
      {/* Print Preview Top Toolbar (Hidden on @media print) */}
      <div className="no-print mx-auto mb-4 flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
        <div>
          <div className="text-sm font-bold text-slate-900">
            پیش‌نمایش استاندارد A4 گزارش تحویل سرویس (نسخه PDF مشتری)
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            برای ذخیره به صورت فایل PDF یا چاپ مستقیم، دکمه چاپ را بزنید و گزینه Save as PDF را انتخاب کنید.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            data-testid="btn-print-pdf-report"
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700"
          >
            <Printer className="h-4 w-4" />
            <span>چاپ / ذخیره فایل PDF</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
            <span>بستن</span>
          </button>
        </div>
      </div>

      {/* Standard A4 Customer Handover Sheet */}
      <article
        id="service-record-print-sheet"
        data-testid="service-record-print-sheet"
        className="mx-auto w-full max-w-[210mm] rounded-lg border border-slate-300 bg-white p-8 text-slate-900 shadow-2xl"
      >
        {/* Document Header */}
        <header className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-4">
          <div>
            <div className="text-base font-extrabold text-slate-900">
              شرکت مهندسی و ارائه خدمات ارتباطات فیبر نوری
            </div>
            <h1 className="mt-1 text-sm font-bold text-teal-800">
              گزارش رسمی تکمیل عملیات، فاکتور نهایی و صورت‌جلسه تحویل به مشترک
            </h1>
            <div className="mt-1 text-xs text-slate-600">{meta.serviceTypeLabel}</div>
          </div>
          <div className="rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs leading-6 tabular-nums">
            <div>
              کد سند:{' '}
              <span dir="ltr" className="font-mono font-bold text-slate-900">
                {meta.documentCode}
              </span>
            </div>
            <div>
              شماره تیکت:{' '}
              <span className="font-bold text-slate-900">#{toPersianDigits(record.ticket_id)}</span>
            </div>
            <div>
              تاریخ اجرا:{' '}
              <span className="font-semibold text-slate-900">{serviceDateDisplay}</span>
            </div>
          </div>
        </header>

        {/* Section 1: Customer Information */}
        <section className="mt-5">
          <h2 className="mb-2 border-r-4 border-teal-700 pr-2 text-xs font-bold text-slate-900">
            ۱. مشخصات مشترک و محل ارائه سرویس
          </h2>
          <table className="w-full border-collapse border border-slate-300 text-xs">
            <tbody>
              <tr>
                <th className="w-36 border border-slate-300 bg-slate-50 px-3 py-2 text-right font-semibold text-slate-700">
                  نام مشترک / سازمان
                </th>
                <td className="border border-slate-300 px-3 py-2 font-bold text-slate-900">
                  {record.customer_name}
                </td>
                <th className="w-32 border border-slate-300 bg-slate-50 px-3 py-2 text-right font-semibold text-slate-700">
                  کارشناس مجری
                </th>
                <td className="border border-slate-300 px-3 py-2 font-medium text-slate-900">
                  {record.installer_name}
                </td>
              </tr>
              <tr>
                <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-right font-semibold text-slate-700">
                  آدرس کامل نصب
                </th>
                <td colSpan={3} className="border border-slate-300 px-3 py-2 text-slate-800">
                  {record.address}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Section 2: Technical Topology, Modem & Cable Consumption */}
        <section className="mt-5">
          <h2 className="mb-2 border-r-4 border-teal-700 pr-2 text-xs font-bold text-slate-900">
            ۲. مشخصات فنی شبکه نوری، تجهیزات و کابل‌کشی
          </h2>
          <table className="w-full border-collapse border border-slate-300 text-xs">
            <tbody>
              <tr>
                <th className="w-36 border border-slate-300 bg-slate-50 px-3 py-2 text-right font-semibold text-slate-700">
                  مسیر شبکه (Topology)
                </th>
                <td colSpan={3} className="border border-slate-300 px-3 py-2 font-medium text-slate-900 tabular-nums">
                  کافو: {record.kaf_name} · OLT: {record.olt_name} · FAT شماره {toPersianDigits(record.fat_number)} · کد انشعاب:{' '}
                  <span dir="ltr" className="inline-block font-mono font-bold">
                    {record.ffat_code}
                  </span>
                </td>
              </tr>
              <tr>
                <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-right font-semibold text-slate-700">
                  تجهیز مودم / ONT
                </th>
                <td className="border border-slate-300 px-3 py-2 text-slate-900">
                  {record.modem_brand_name || 'مودم نوری'} ({meta.modemSourceLabel})
                </td>
                <th className="w-32 border border-slate-300 bg-slate-50 px-3 py-2 text-right font-semibold text-slate-700">
                  سریال مودم (SN)
                </th>
                <td dir="ltr" className="border border-slate-300 px-3 py-2 text-right font-mono font-bold text-slate-900">
                  {record.modem_serial}
                </td>
              </tr>
              <tr>
                <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-right font-semibold text-slate-700">
                  کابل فضای باز (Outdoor)
                </th>
                <td className="border border-slate-300 px-3 py-2 tabular-nums">
                  {toPersianDigits(record.out_total_meter)} متر{' '}
                  {record.out_spool_code ? `(قرقره ${record.out_spool_code})` : ''}
                </td>
                <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-right font-semibold text-slate-700">
                  کابل داخلی (Indoor)
                </th>
                <td className="border border-slate-300 px-3 py-2 tabular-nums">
                  {toPersianDigits(record.in_total_meter)} متر{' '}
                  {record.in_spool_code ? `(قرقره ${record.in_spool_code})` : ''}
                </td>
              </tr>
              <tr>
                <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-right font-semibold text-slate-700">
                  مجموع متراژ کابل‌کشی
                </th>
                <td colSpan={3} className="border border-slate-300 px-3 py-2 font-bold text-slate-900 tabular-nums">
                  {toPersianDigits(meta.totalCableMeters)} متر
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Section 3: Service Provisioning Credentials for Customer */}
        <section className="mt-5">
          <h2 className="mb-2 border-r-4 border-teal-700 pr-2 text-xs font-bold text-slate-900">
            ۳. تنظیمات اتصال اینترنت و سرویس‌های راه‌اندازی‌شده
          </h2>
          <table className="w-full border-collapse border border-slate-300 text-xs">
            <tbody>
              <tr>
                <th className="w-36 border border-slate-300 bg-slate-50 px-3 py-2 text-right font-semibold text-slate-700">
                  نام کاربری PPPoE
                </th>
                <td dir="ltr" className="border border-slate-300 px-3 py-2 text-right font-mono font-semibold">
                  {record.config_pppoe_user || 'ثبت نشده'}
                </td>
                <th className="w-32 border border-slate-300 bg-slate-50 px-3 py-2 text-right font-semibold text-slate-700">
                  شناسه VLAN
                </th>
                <td className="border border-slate-300 px-3 py-2 font-mono font-semibold tabular-nums">
                  {record.config_vlan ? toPersianDigits(record.config_vlan) : 'ثبت نشده'}
                </td>
              </tr>
              <tr>
                <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-right font-semibold text-slate-700">
                  سرویس تلفن (VoIP)
                </th>
                <td colSpan={3} className="border border-slate-300 px-3 py-2">
                  {record.has_voip
                    ? record.config_voip_data || 'فعال و تست‌شده روی پورت تلفن مودم'
                    : 'ندارد'}
                </td>
              </tr>
              {(record.notes || record.operator_notes) && (
                <tr>
                  <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-right font-semibold text-slate-700">
                    ملاحظات فنی و اجرایی
                  </th>
                  <td colSpan={3} className="border border-slate-300 px-3 py-2 leading-5 text-slate-700">
                    {[record.notes, record.operator_notes].filter(Boolean).join(' — ')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Section 4: Final Service Invoice Breakdown */}
        <section className="mt-5" data-testid="pdf-final-invoice-section">
          <h2 className="mb-2 border-r-4 border-teal-700 pr-2 text-xs font-bold text-slate-900">
            ۴. فاکتور نهایی و خلاصه هزینه‌های خدمات فنی
          </h2>
          <table className="w-full border-collapse border border-slate-300 text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-700">
                <th className="border border-slate-300 px-3 py-2 text-right font-semibold">ردیف</th>
                <th className="border border-slate-300 px-3 py-2 text-right font-semibold">شرح خدمات و اقلام مصرفی</th>
                <th className="border border-slate-300 px-3 py-2 text-right font-semibold">مقدار / مبنا</th>
                <th className="border border-slate-300 px-3 py-2 text-left font-semibold">مبلغ (تومان)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 px-3 py-2 tabular-nums">۱</td>
                <td className="border border-slate-300 px-3 py-2">
                  تعرفه پایه عملیات ({record.price_snapshot.calc_type === 'fixed' ? 'ثابت' : record.price_snapshot.calc_type === 'per_meter' ? 'متراژی' : 'ترکیبی'})
                </td>
                <td className="border border-slate-300 px-3 py-2 tabular-nums">
                  پوشش تا {toPersianDigits(record.price_snapshot.meter_limit)} متر
                </td>
                <td className="border border-slate-300 px-3 py-2 text-left font-medium tabular-nums">
                  {formatToman(record.price_snapshot.base_price)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-2 tabular-nums">۲</td>
                <td className="border border-slate-300 px-3 py-2">هزینه متراژ کابل مصرفی مازاد</td>
                <td className="border border-slate-300 px-3 py-2 tabular-nums">
                  {toPersianDigits(record.price_snapshot.billable_extra_meter)} متر × {formatToman(record.price_snapshot.extra_meter_price, false)}
                </td>
                <td className="border border-slate-300 px-3 py-2 text-left font-medium tabular-nums">
                  {formatToman(record.price_snapshot.extra_meter_fee)}
                </td>
              </tr>
              {record.price_snapshot.bonus_applied > 0 && (
                <tr>
                  <td className="border border-slate-300 px-3 py-2 tabular-nums">۳</td>
                  <td className="border border-slate-300 px-3 py-2">پاداش و ضریب فنی عملیات</td>
                  <td className="border border-slate-300 px-3 py-2">مطابق تعرفه مصوب</td>
                  <td className="border border-slate-300 px-3 py-2 text-left font-medium tabular-nums">
                    {formatToman(record.price_snapshot.bonus_applied)}
                  </td>
                </tr>
              )}
              <tr className="bg-slate-100 font-bold text-slate-900">
                <td colSpan={3} className="border border-slate-300 px-3 py-2 text-right">
                  جمع کل مبلغ فاکتور نهایی عملیات
                </td>
                <td className="border border-slate-300 px-3 py-2 text-left text-teal-800 tabular-nums">
                  {formatToman(record.price_snapshot.total_earned)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Section 5: Compressed Operational Evidence Photos (if any) */}
        {record.images.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-2 border-r-4 border-teal-700 pr-2 text-xs font-bold text-slate-900">
              ۵. مستندات تصویری اجرای عملیات
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {record.images.slice(0, 3).map((img) => (
                <div key={img.id} className="overflow-hidden rounded border border-slate-300">
                  <img
                    src={img.file_path}
                    alt={img.image_type}
                    referrerPolicy="no-referrer"
                    className="h-28 w-full object-cover"
                  />
                  <div className="border-t border-slate-200 bg-slate-50 px-2 py-1 text-center text-[11px] font-medium text-slate-700">
                    {img.image_type}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Section 5: Handover Acknowledgment & Signatures */}
        <section className="mt-6 rounded-lg border border-slate-300 bg-slate-50/50 p-4">
          <p className="text-xs leading-6 text-slate-800">
            بدین‌وسیله تایید می‌گردد سرویس فیبر نوری و تجهیزات فوق مطابق با استانداردهای فنی نصب، تست لینک و سیگنال نوری انجام و در وضعیت سالم و آماده بهره‌برداری به مشترک تحویل داده شد.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-6 text-xs">
            <div className="rounded border border-slate-300 bg-white p-3">
              <div className="font-bold text-slate-800">تحویل‌دهنده (کارشناس فنی / نصاب)</div>
              <div className="mt-1 text-slate-600">نام و نام خانوادگی: {record.installer_name}</div>
              <div className="mt-10 border-t border-dashed border-slate-300 pt-1.5 text-[11px] text-slate-400">
                امضا و مهر کارشناس / پیمانکار
              </div>
            </div>
            <div className="rounded border border-slate-300 bg-white p-3">
              <div className="font-bold text-slate-800">تحویل‌گیرنده (مشترک / نماینده قانونی)</div>
              <div className="mt-1 text-slate-600">نام مشترک: {record.customer_name}</div>
              <div className="mt-10 border-t border-dashed border-slate-300 pt-1.5 text-[11px] text-slate-400">
                امضا و تاریخ تایید تحویل سرویس
              </div>
            </div>
          </div>
        </section>

        {/* Document Footer */}
        <footer className="mt-6 flex items-center justify-between border-t border-slate-200 pt-3 text-[11px] text-slate-500 tabular-nums">
          <span>نسخه چاپی رسمی سامانه مدیریت عملیات فیبر نوری</span>
          <span>زمان چاپ گزارش: {printedAtDisplay}</span>
        </footer>
      </article>
    </div>,
    document.body,
  );
}
