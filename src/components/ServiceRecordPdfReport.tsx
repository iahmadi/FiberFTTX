import { Printer } from 'lucide-react';
import { TICKET_TYPE_LABELS } from '../lib/fiberLogic';
import { formatCurrencyToman, formatIsoToJalaliDisplay, toPersianDigits } from '../lib/jalali';
import type { ServiceRecordDetail } from '../types/erp';

interface ServiceRecordPdfReportProps {
  record: ServiceRecordDetail;
}

export function ServiceRecordPdfReport({ record }: ServiceRecordPdfReportProps) {
  const handlePrint = () => {
    document.body.classList.add('printing-service-record');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-service-record'), 400);
  };

  const snap = record.price_snapshot;
  const fusionCount = snap.fusion_count ?? record.fusion_count ?? 0;
  const fusionFee = snap.fusion_fee ?? 0;
  const dynamicMaterials = Array.isArray(record.dynamic_materials) ? record.dynamic_materials : [];
  const historyList = Array.isArray(record.history) ? record.history : [];

  return (
    <div className="print-portal-root space-y-4">
      <div className="no-print flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs text-slate-600">
          فرمت استاندارد A4 آماده چاپ و تحویل نسخه چاپی / PDF به مشترک و واحد مالی
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800"
        >
          <Printer className="h-4 w-4" />
          <span>چاپ / ذخیره PDF رسمی</span>
        </button>
      </div>

      <div className="print-sheet rounded-xl border border-slate-300 bg-white p-6 text-slate-900">
        <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              صورت‌جلسه تکمیل عملیات و فاکتور سرویس فیبر نوری
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              شبکه مخابراتی و پیمانکاری آوانتورک — نسخه رسمی تحویل به مشترک
            </p>
          </div>
          <div className="text-left text-xs tabular-nums">
            <div>
              <span className="text-slate-500">شماره تیکت: </span>
              <strong>#{toPersianDigits(record.ticket_id)}</strong>
            </div>
            <div className="mt-1">
              <span className="text-slate-500">تاریخ ثبت: </span>
              <strong>{formatIsoToJalaliDisplay(record.created_at)}</strong>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3 text-xs">
            <div className="mb-2 font-bold text-slate-800">مشخصات مشترک و سرویس</div>
            <div className="space-y-1.5">
              <div>
                <span className="text-slate-500">نام مشترک: </span>
                <strong>{record.customer_name}</strong>
              </div>
              <div>
                <span className="text-slate-500">نوع سرویس: </span>
                <strong>{TICKET_TYPE_LABELS[record.ticket_type]}</strong>
              </div>
              <div>
                <span className="text-slate-500">آدرس: </span>
                <span>{record.address}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 text-xs">
            <div className="mb-2 font-bold text-slate-800">اطلاعات فنی و توپولوژی اتصال</div>
            <div className="space-y-1.5">
              <div>
                <span className="text-slate-500">کارشناس اجرا: </span>
                <strong>{record.installer_name}</strong>
              </div>
              <div>
                <span className="text-slate-500">مسیر شبکه: </span>
                <span className="tabular-nums">
                  <bdi>{record.kaf_name || '—'}</bdi> ← <bdi>{record.olt_name || '—'}</bdi> ←{' '}
                  <strong dir="ltr" className="inline-block">
                    {record.source_label}
                  </strong>{' '}
                  ({record.source_type})
                  {record.port_number ? ` — پورت #${toPersianDigits(record.port_number)}` : ''}
                </span>
              </div>
              <div>
                <span className="text-slate-500">تجهیز مودم: </span>
                <span className="tabular-nums">
                  {record.modem_brand_name || '—'}{' '}
                  {record.modem_serial ? `(${record.modem_serial})` : ''} —{' '}
                  {record.modem_source === 'company' ? 'تحویل از انبار خودرو شرکت' : 'متعلق به مشترک'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {record.splitter_changes && (
          <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50/40 p-3 text-xs">
            <div className="mb-1.5 font-bold text-teal-950">تغییرات اسپلیتر F-FAT</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <span className="text-slate-500">اسپلیتر حذف‌شده والد: </span>
                <strong dir="ltr">{record.splitter_changes.parent_fat_removed_splitter}</strong>
              </div>
              <div>
                <span className="text-slate-500">اسپلیترهای نصب‌شده والد: </span>
                <strong dir="ltr">
                  {record.splitter_changes.parent_fat_installed_splitters.join(' , ')}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">اسپلیتر باکس F-FAT: </span>
                <strong dir="ltr">{record.splitter_changes.ffat_installed_splitter}</strong>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-3 py-2 font-bold">شرح اقلام و محاسبات تعرفه (Snapshot)</th>
                <th className="px-3 py-2 font-bold">مقدار / جزئیات</th>
                <th className="px-3 py-2 font-bold">مبلغ (تومان)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="px-3 py-2">
                  اجرت پایه ({snap.template_name} —{' '}
                  {snap.calc_type === 'fixed'
                    ? 'نرخ ثابت'
                    : snap.calc_type === 'per_meter'
                      ? 'متری'
                      : 'ترکیبی'}
                  )
                </td>
                <td className="px-3 py-2 tabular-nums">
                  سقف مشمول: {toPersianDigits(snap.meter_limit)} متر
                </td>
                <td className="px-3 py-2 font-semibold tabular-nums">
                  {formatCurrencyToman(snap.base_price)}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2">کابل مصرفی فضای باز (Outdoor)</td>
                <td className="px-3 py-2 tabular-nums">
                  {record.out_spool_code || '—'} ({toPersianDigits(record.out_total_meter)} متر)
                </td>
                <td className="px-3 py-2 text-slate-500">محاسبه در متراژ کل</td>
              </tr>
              <tr>
                <td className="px-3 py-2">کابل مصرفی داخلی (Indoor)</td>
                <td className="px-3 py-2 tabular-nums">
                  {record.in_spool_code || '—'} ({toPersianDigits(record.in_total_meter)} متر)
                </td>
                <td className="px-3 py-2 text-slate-500">محاسبه در متراژ کل</td>
              </tr>
              <tr>
                <td className="px-3 py-2">هزینه مازاد متراژ کابل</td>
                <td className="px-3 py-2 tabular-nums">
                  {toPersianDigits(snap.billable_extra_meter)} متر ×{' '}
                  {formatCurrencyToman(snap.extra_meter_price)}
                </td>
                <td className="px-3 py-2 font-semibold tabular-nums">
                  {formatCurrencyToman(snap.extra_meter_fee)}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2">تعداد و اجرت فیوژن (Fusion)</td>
                <td className="px-3 py-2 tabular-nums">
                  {toPersianDigits(fusionCount)} عدد (سقف پایه:{' '}
                  {toPersianDigits(snap.fusion_limit ?? 0)})
                </td>
                <td className="px-3 py-2 font-semibold tabular-nums">
                  {formatCurrencyToman(fusionFee)}
                </td>
              </tr>
              {snap.promotion_bonus > 0 && (
                <tr className="bg-emerald-50/60">
                  <td className="px-3 py-2 font-semibold text-emerald-900">
                    پاداش کمپین ({snap.promotion_name})
                  </td>
                  <td className="px-3 py-2 text-emerald-800">محقق‌شده در این سرویس</td>
                  <td className="px-3 py-2 font-bold tabular-nums text-emerald-900">
                    {formatCurrencyToman(snap.promotion_bonus)}
                  </td>
                </tr>
              )}
              <tr className="bg-slate-50 font-bold text-slate-900">
                <td className="px-3 py-2.5" colSpan={2}>
                  جمع کل دستمزد ثبت‌شده در دفتر کل (تضمین‌شده بدون تغییر آتی)
                </td>
                <td className="px-3 py-2.5 tabular-nums text-teal-800">
                  {formatCurrencyToman(snap.total_earned)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {dynamicMaterials.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-200 p-3 text-xs">
            <div className="mb-2 font-bold text-slate-800">
              متریال و تجهیزات جانبی مصرفی از انبار خودرو (Van Stock)
            </div>
            <div className="flex flex-wrap gap-2">
              {dynamicMaterials.map((m) => (
                <span
                  key={m.item_id}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium tabular-nums"
                >
                  {m.item_name}: {toPersianDigits(m.quantity)} عدد
                </span>
              ))}
            </div>
          </div>
        )}

        {record.notes && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <strong>توضیحات فنی نصاب: </strong>
            {record.notes}
          </div>
        )}

        {record.images.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-xs font-bold text-slate-800">مستندات تصویری عملیات</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {record.images.map((img) => (
                <div key={img.id} className="overflow-hidden rounded-lg border border-slate-200">
                  <img
                    src={img.file_path}
                    alt={img.caption || img.image_type}
                    className="h-32 w-full object-cover"
                  />
                  <div className="bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                    {img.caption ? img.caption : img.image_type}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {historyList.length > 0 && (
          <div className="no-print mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs">
            <div className="mb-1.5 font-bold text-amber-950">
              تاریخچه ویرایش‌های پس از تکمیل ({toPersianDigits(historyList.length)} مورد)
            </div>
            <ul className="space-y-1 text-[11px] text-amber-900">
              {historyList.map((h) => (
                <li key={h.id} className="tabular-nums">
                  • ویرایش توسط <strong>{h.changed_by_name || 'سیستم'}</strong> در تاریخ{' '}
                  {formatIsoToJalaliDisplay(h.changed_at)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 gap-8 border-t border-slate-200 pt-6 text-center text-xs text-slate-600">
          <div>امضاء و مهر کارشناس / پیمانکار اجرا</div>
          <div>امضاء مشترک و تایید تحویل سرویس</div>
        </div>
      </div>
    </div>
  );
}
