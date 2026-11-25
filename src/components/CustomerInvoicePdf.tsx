import { Printer } from 'lucide-react';
import { TICKET_TYPE_LABELS } from '../lib/fiberLogic';
import { formatCurrencyToman, formatIsoToJalaliDisplay, toPersianDigits } from '../lib/jalali';
import type { ServiceRecordDetail } from '../types/erp';

interface CustomerInvoicePdfProps {
  record: ServiceRecordDetail;
  systemName: string;
}

export function CustomerInvoicePdf({ record, systemName }: CustomerInvoicePdfProps) {
  const handlePrint = () => {
    document.body.classList.add('printing-service-record');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-service-record'), 400);
  };

  const inv = record.customer_invoice_snapshot;
  const paidTotal = Math.max(0, Number(record.customer_payments_total || 0));
  const payableTotal = inv?.total_customer_payable ?? 0;
  const remainingPayable = Math.max(0, payableTotal - paidTotal);

  return (
    <div className="print-portal-root space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs text-slate-600">
          فاکتور رسمی هزینه‌های مشترک بر اساس پکیج فروش، تجهیزات تحویلی و مصالح مصرفی (فرمت A4)
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          <Printer className="h-4 w-4" />
          <span>چاپ / ذخیره PDF فاکتور مشترک</span>
        </button>
      </div>

      <div className="print-sheet rounded-xl border border-slate-300 bg-white p-6 text-slate-900">
        <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              فاکتور رسمی فروش، نصب و راه‌اندازی سرویس فیبر نوری
            </h2>
            <p className="mt-1 text-xs text-slate-600">{systemName} — نسخه رسمی مشترک</p>
          </div>
          <div className="text-left text-xs tabular-nums">
            <div>
              <span className="text-slate-500">شماره پرونده / تیکت: </span>
              <strong>AVA-{toPersianDigits(String(record.ticket_id).padStart(5, '0'))}</strong>
            </div>
            <div className="mt-1">
              <span className="text-slate-500">تاریخ صدور: </span>
              <strong>{formatIsoToJalaliDisplay(inv?.computed_at || record.created_at)}</strong>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3 text-xs">
            <div className="mb-1.5 font-bold text-slate-800">مشخصات مشترک</div>
            <div className="space-y-1">
              <div>
                <span className="text-slate-500">نام مشترک / شرکت: </span>
                <strong>{record.customer_name}</strong>
              </div>
              <div>
                <span className="text-slate-500">نشانی: </span>
                <span>{record.address}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 text-xs">
            <div className="mb-1.5 font-bold text-slate-800">اطلاعات سرویس و پکیج فروش</div>
            <div className="space-y-1">
              <div>
                <span className="text-slate-500">نوع عملیات: </span>
                <strong>{TICKET_TYPE_LABELS[record.ticket_type]}</strong>
              </div>
              <div>
                <span className="text-slate-500">پکیج فروش: </span>
                <strong>{inv?.package_name || 'تعرفه آزاد'}</strong>
              </div>
              <div>
                <span className="text-slate-500">مودم تحویلی: </span>
                <span className="tabular-nums">
                  {record.modem_brand_name || '—'}{' '}
                  {record.modem_serial ? `(${record.modem_serial})` : ''} (
                  {record.modem_source === 'company' ? 'تجهیز شرکت' : 'مودم مشترک'})
                </span>
              </div>
            </div>
          </div>
        </div>

        {!inv ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
            برای این پرونده قبلاً پیش‌فاکتور مشتری ذخیره نشده است. با ویرایش فرم تکمیل‌شده، تصویر
            مالی فاکتور مشترک به صورت خودکار محاسبه و ثبت می‌شود.
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-3 py-2.5 font-bold">شرح خدمات و تجهیزات</th>
                  <th className="px-3 py-2.5 font-bold">جزئیات / تخفیف / متراژ</th>
                  <th className="px-3 py-2.5 font-bold">مبلغ (تومان)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="px-3 py-2">هزینه پایه نصب و راه‌اندازی</td>
                  <td className="px-3 py-2 tabular-nums">
                    مبلغ پایه {formatCurrencyToman(inv.install_fee_gross)}
                    {inv.install_discount_pct > 0
                      ? ` — تخفیف ${toPersianDigits(inv.install_discount_pct)}٪`
                      : ''}
                  </td>
                  <td className="px-3 py-2 font-semibold tabular-nums">
                    {formatCurrencyToman(inv.install_fee_net)}
                  </td>
                </tr>

                <tr>
                  <td className="px-3 py-2">هزینه کانفیگ و فعال‌سازی خط</td>
                  <td className="px-3 py-2">
                    {inv.config_fee === 0 ? 'مشمول کانفیگ رایگان پکیج' : 'تعرفه کانفیگ سرویس'}
                  </td>
                  <td className="px-3 py-2 font-semibold tabular-nums">
                    {formatCurrencyToman(inv.config_fee)}
                  </td>
                </tr>

                <tr>
                  <td className="px-3 py-2">کابل‌کشی فیبر نوری (داخلی و بیرونی)</td>
                  <td className="px-3 py-2 tabular-nums">
                    کل مصرف {toPersianDigits(inv.total_meter)} متر — سهمیه رایگان{' '}
                    {toPersianDigits(inv.free_meter_limit)} متر — مازاد{' '}
                    {toPersianDigits(inv.billable_extra_meter)} متر ×{' '}
                    {formatCurrencyToman(inv.extra_meter_price)}
                  </td>
                  <td className="px-3 py-2 font-semibold tabular-nums">
                    {formatCurrencyToman(inv.extra_meter_fee)}
                  </td>
                </tr>

                <tr>
                  <td className="px-3 py-2">تجهیز مودم فیبر نوری</td>
                  <td className="px-3 py-2">
                    {inv.modem_source === 'customer'
                      ? 'متعلق به مشترک'
                      : inv.modem_included
                        ? 'رایگان / مشمول پکیج'
                        : 'تحویل از انبار شرکت'}
                  </td>
                  <td className="px-3 py-2 font-semibold tabular-nums">
                    {formatCurrencyToman(inv.modem_fee)}
                  </td>
                </tr>

                {inv.materials_breakdown.map((m) => (
                  <tr key={m.item_id}>
                    <td className="px-3 py-2">تجهیزات مصرفی: {m.item_name}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {toPersianDigits(m.quantity)} عدد × {formatCurrencyToman(m.unit_price)}
                    </td>
                    <td className="px-3 py-2 font-semibold tabular-nums">
                      {formatCurrencyToman(m.line_total)}
                    </td>
                  </tr>
                ))}

                {!inv.charge_materials && record.dynamic_materials.length > 0 && (
                  <tr>
                    <td className="px-3 py-2">اقلام جانبی نصب (پچ‌کورد، آداپتور، باکس)</td>
                    <td className="px-3 py-2">رایگان / مشمول پکیج انتخابی</td>
                    <td className="px-3 py-2 font-semibold tabular-nums">۰ تومان</td>
                  </tr>
                )}

                <tr className="bg-slate-50 font-bold text-slate-900">
                  <td className="px-3 py-2.5" colSpan={2}>
                    جمع کل مبلغ قابل پرداخت مشترک
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-teal-800">
                    {formatCurrencyToman(payableTotal)}
                  </td>
                </tr>

                <tr>
                  <td className="px-3 py-2 text-slate-600" colSpan={2}>
                    جمع واریزی‌های ثبت‌شده مشترک در سیستم مالی
                  </td>
                  <td className="px-3 py-2 font-semibold tabular-nums text-emerald-700">
                    {formatCurrencyToman(paidTotal)}
                  </td>
                </tr>

                <tr className="bg-slate-100 font-bold text-slate-900">
                  <td className="px-3 py-2.5" colSpan={2}>
                    مانده قابل پرداخت مشترک
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-950">
                    {formatCurrencyToman(remainingPayable)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 gap-8 border-t border-slate-200 pt-6 text-center text-xs text-slate-600">
          <div>مهر و تایید واحد فروش و مالی {systemName}</div>
          <div>امضاء مشترک و تایید دریافت سرویس و تجهیزات</div>
        </div>
      </div>
    </div>
  );
}
