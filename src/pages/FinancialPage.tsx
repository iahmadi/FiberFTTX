import { useState, type FormEvent } from 'react';
import { Award, Layers, Plus, Wallet } from 'lucide-react';
import { ContractorMonthlyEarningsReport } from '../components/ContractorMonthlyEarningsReport';
import { JalaliDatePicker } from '../components/JalaliDatePicker';
import {
  TICKET_TYPES,
  TICKET_TYPE_LABELS,
  type TariffCalcMode,
  type TariffTemplateRulesJson,
} from '../lib/fiberLogic';
import { formatCurrencyToman, formatIsoToJalaliDisplay, toPersianDigits } from '../lib/jalali';
import { userHasPermission } from '../lib/permissions';
import type {
  AuthUser,
  ContractorBalanceSummary,
  LedgerEntryItem,
  PromotionItem,
  TariffTemplateItem,
  UserTariffAssignment,
} from '../types/erp';
import { apiFetch } from '../utils/api';

interface FinancialPageProps {
  user: AuthUser;
  templates: TariffTemplateItem[];
  promotions: PromotionItem[];
  userTariffs: UserTariffAssignment[];
  ledger: LedgerEntryItem[];
  contractorSummaries: ContractorBalanceSummary[];
  users: Array<{ id: number; username: string; full_name: string }>;
  onRefresh: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, desc?: string) => void;
}

const DEFAULT_RULES: TariffTemplateRulesJson = {
  internet_install: { calc_type: 'hybrid', base_price: 1000000, meter_limit: 120, extra_meter_price: 25000 },
  internet_fault: { calc_type: 'fixed', base_price: 450000, meter_limit: 0, extra_meter_price: 0 },
  ffat_install: { calc_type: 'per_meter', base_price: 350000, meter_limit: 0, extra_meter_price: 20000 },
  ffat_fault: { calc_type: 'fixed', base_price: 600000, meter_limit: 0, extra_meter_price: 0 },
  voip_install: { calc_type: 'fixed', base_price: 750000, meter_limit: 0, extra_meter_price: 0 },
};

export function FinancialPage({
  user,
  templates,
  promotions,
  userTariffs,
  ledger,
  contractorSummaries,
  users,
  onRefresh,
  onNotify,
}: FinancialPageProps) {
  const canManageTariffs = userHasPermission(user, 'can_manage_tariffs');

  const [tplName, setTplName] = useState('');
  const [tplRules, setTplRules] = useState<TariffTemplateRulesJson>(DEFAULT_RULES);

  const [promoName, setPromoName] = useState('');
  const [promoTargetType, setPromoTargetType] = useState('installs');
  const [promoTargetVal, setPromoTargetVal] = useState('20');
  const [promoReward, setPromoReward] = useState('15000000');
  const [promoCycle, setPromoCycle] = useState<'weekly' | 'monthly' | 'campaign'>('monthly');
  const [promoStart, setPromoStart] = useState('2026-10-01');
  const [promoEnd, setPromoEnd] = useState('2027-03-20');
  const [promoCarryOver, setPromoCarryOver] = useState(false);

  const [assignUserId, setAssignUserId] = useState('');
  const [assignTplId, setAssignTplId] = useState('');
  const [assignPromoId, setAssignPromoId] = useState('');

  const [payoutUserId, setPayoutUserId] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutDesc, setPayoutDesc] = useState('تسویه حساب دوره');

  const handleCreateTemplate = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/financial/templates', {
        method: 'POST',
        body: JSON.stringify({ name: tplName, rules_json: tplRules }),
      });
      onNotify('success', `الگوی تعرفه «${tplName}» ذخیره شد`);
      setTplName('');
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در ذخیره الگوی تعرفه', err instanceof Error ? err.message : undefined);
    }
  };

  const handleCreatePromo = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/financial/promotions', {
        method: 'POST',
        body: JSON.stringify({
          name: promoName,
          target_type: promoTargetType,
          target_value: Number(promoTargetVal),
          reward_amount: Number(promoReward),
          reset_cycle: promoCycle,
          start_date: promoStart,
          end_date: promoEnd,
          carry_over: promoCarryOver,
        }),
      });
      onNotify('success', `کمپین پاداش «${promoName}» ثبت شد`);
      setPromoName('');
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در ثبت کمپین', err instanceof Error ? err.message : undefined);
    }
  };

  const handleAssignTariff = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/financial/assign-tariff', {
        method: 'POST',
        body: JSON.stringify({
          user_id: Number(assignUserId),
          template_id: Number(assignTplId),
          promotion_id: assignPromoId ? Number(assignPromoId) : null,
        }),
      });
      onNotify('success', 'الگوی تعرفه و کمپین به پیمانکار تخصیص داده شد');
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در تخصیص تعرفه', err instanceof Error ? err.message : undefined);
    }
  };

  const handlePayout = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/financial/payouts', {
        method: 'POST',
        body: JSON.stringify({
          user_id: Number(payoutUserId),
          amount: Number(payoutAmount),
          description: payoutDesc,
        }),
      });
      onNotify('success', 'سند پرداخت تسویه در دفتر کل ثبت شد');
      setPayoutAmount('');
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در ثبت پرداخت', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-6">
      {/* Contractor Balances & Promotion Progress */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {contractorSummaries.map((c) => (
          <div key={c.user_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-slate-900">{c.full_name}</div>
                <div dir="ltr" className="text-xs text-slate-400">
                  @{c.username}
                </div>
              </div>
              <Wallet className="h-5 w-5 text-teal-700" />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2.5 text-[11px]">
              <div>
                <div className="text-slate-500">بستانکار</div>
                <div className="mt-0.5 font-bold tabular-nums text-emerald-700">
                  {formatCurrencyToman(c.totalCredit)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">پرداختی</div>
                <div className="mt-0.5 font-bold tabular-nums text-slate-700">
                  {formatCurrencyToman(c.totalDebit)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">مانده</div>
                <div className="mt-0.5 font-bold tabular-nums text-teal-800">
                  {formatCurrencyToman(c.balance)}
                </div>
              </div>
            </div>

            {c.promotionProgress && (
              <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50/60 p-2.5 text-xs">
                <div className="flex items-center justify-between font-bold text-teal-900">
                  <span className="flex items-center gap-1">
                    <Award className="h-3.5 w-3.5" />
                    {c.promotionProgress.promotion_name}
                  </span>
                  <span className="tabular-nums">
                    {toPersianDigits(c.promotionProgress.cycle_count)} /{' '}
                    {toPersianDigits(c.promotionProgress.target_value)}
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-teal-100">
                  <div
                    className="h-full bg-teal-700"
                    style={{ width: `${c.promotionProgress.progress_percent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Monthly Contractor Earnings Chart & Excel Export */}
      <ContractorMonthlyEarningsReport
        ledger={ledger}
        onExported={(fname) => onNotify('success', 'فایل اکسل آماده و دانلود شد', fname)}
      />

      {/* Management Section: Templates, Promotions, Assignments & Payouts */}
      {canManageTariffs && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {/* Tariff Template Creator */}
          <form
            onSubmit={handleCreateTemplate}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Layers className="h-5 w-5 text-teal-700" />
              <span>تعریف الگوی تعرفه ۵گانه (ثابت / متری / ترکیبی)</span>
            </div>

            <input
              type="text"
              required
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="نام الگوی تعرفه (مثلاً قرارداد درجه یک ۱۴۰۵)"
              className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 text-xs"
            />

            <div className="space-y-2.5">
              {TICKET_TYPES.map((tKey) => {
                const rule = tplRules[tKey];
                return (
                  <div
                    key={tKey}
                    className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs sm:grid-cols-5"
                  >
                    <div className="col-span-2 flex items-center font-bold text-slate-800 sm:col-span-1">
                      {TICKET_TYPE_LABELS[tKey]}
                    </div>
                    <select
                      value={rule.calc_type}
                      onChange={(e) =>
                        setTplRules((prev) => ({
                          ...prev,
                          [tKey]: { ...prev[tKey], calc_type: e.target.value as TariffCalcMode },
                        }))
                      }
                      className="rounded border border-slate-300 bg-white px-2 py-1"
                    >
                      <option value="fixed">ثابت</option>
                      <option value="per_meter">متری</option>
                      <option value="hybrid">ترکیبی</option>
                    </select>
                    <input
                      type="number"
                      value={rule.base_price}
                      onChange={(e) =>
                        setTplRules((prev) => ({
                          ...prev,
                          [tKey]: { ...prev[tKey], base_price: Number(e.target.value) },
                        }))
                      }
                      placeholder="اجرت پایه"
                      className="rounded border border-slate-300 bg-white px-2 py-1 tabular-nums"
                    />
                    <input
                      type="number"
                      value={rule.meter_limit}
                      onChange={(e) =>
                        setTplRules((prev) => ({
                          ...prev,
                          [tKey]: { ...prev[tKey], meter_limit: Number(e.target.value) },
                        }))
                      }
                      placeholder="سقف متراژ"
                      className="rounded border border-slate-300 bg-white px-2 py-1 tabular-nums"
                    />
                    <input
                      type="number"
                      value={rule.extra_meter_price}
                      onChange={(e) =>
                        setTplRules((prev) => ({
                          ...prev,
                          [tKey]: { ...prev[tKey], extra_meter_price: Number(e.target.value) },
                        }))
                      }
                      placeholder="فی مازاد متر"
                      className="rounded border border-slate-300 bg-white px-2 py-1 tabular-nums"
                    />
                  </div>
                );
              })}
            </div>

            <button
              type="submit"
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-teal-700 px-4 text-xs font-bold text-white"
            >
              <Plus className="h-4 w-4" />
              <span>ذخیره الگوی تعرفه</span>
            </button>
          </form>

          {/* Promotions + Assignment + Payout */}
          <div className="space-y-6">
            <form
              onSubmit={handleCreatePromo}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-3"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Award className="h-5 w-5 text-teal-700" />
                <span>تعریف کمپین پاداش و تارگت (هفتگی / ماهانه / انتقالی)</span>
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <input
                  type="text"
                  required
                  value={promoName}
                  onChange={(e) => setPromoName(e.target.value)}
                  placeholder="عنوان کمپین"
                  className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-xs"
                />
                <select
                  value={promoTargetType}
                  onChange={(e) => setPromoTargetType(e.target.value)}
                  className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-2 text-xs"
                >
                  <option value="installs">همه نصب‌ها</option>
                  <option value="all">کل تیکت‌ها</option>
                  {TICKET_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TICKET_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  required
                  value={promoTargetVal}
                  onChange={(e) => setPromoTargetVal(e.target.value)}
                  placeholder="تعداد هدف"
                  className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-xs tabular-nums"
                />
                <input
                  type="number"
                  min={0}
                  required
                  value={promoReward}
                  onChange={(e) => setPromoReward(e.target.value)}
                  placeholder="مبلغ پاداش (تومان)"
                  className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-xs tabular-nums"
                />
                <select
                  value={promoCycle}
                  onChange={(e) =>
                    setPromoCycle(e.target.value as 'weekly' | 'monthly' | 'campaign')
                  }
                  className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-2 text-xs"
                >
                  <option value="monthly">ریست ماهانه (شمسی)</option>
                  <option value="weekly">ریست هفتگی</option>
                  <option value="campaign">کل دوره کمپین</option>
                </select>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={promoCarryOver}
                    onChange={(e) => setPromoCarryOver(e.target.checked)}
                    className="h-4 w-4 accent-teal-700"
                  />
                  <span>انتقال مازاد به دوره بعد (Carry Over)</span>
                </label>
                <div>
                  <span className="mb-1 block text-[11px] text-slate-500">شروع کمپین</span>
                  <JalaliDatePicker valueIso={promoStart} onChangeIso={setPromoStart} />
                </div>
                <div>
                  <span className="mb-1 block text-[11px] text-slate-500">پایان کمپین</span>
                  <JalaliDatePicker valueIso={promoEnd} onChangeIso={setPromoEnd} />
                </div>
              </div>
              <button
                type="submit"
                className="min-h-[40px] rounded-lg bg-teal-700 px-4 text-xs font-bold text-white"
              >
                ثبت کمپین پاداش
              </button>
            </form>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <form
                onSubmit={handleAssignTariff}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-2.5"
              >
                <div className="text-xs font-bold text-slate-900">تخصیص تعرفه و کمپین به نصاب</div>
                <select
                  required
                  value={assignUserId}
                  onChange={(e) => setAssignUserId(e.target.value)}
                  className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2 text-xs"
                >
                  <option value="">انتخاب نصاب...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
                <select
                  required
                  value={assignTplId}
                  onChange={(e) => setAssignTplId(e.target.value)}
                  className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2 text-xs"
                >
                  <option value="">الگوی تعرفه...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <select
                  value={assignPromoId}
                  onChange={(e) => setAssignPromoId(e.target.value)}
                  className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2 text-xs"
                >
                  <option value="">بدون کمپین</option>
                  {promotions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="min-h-[38px] w-full rounded-lg bg-slate-900 text-xs font-bold text-white"
                >
                  تخصیص قرارداد
                </button>
              </form>

              <form
                onSubmit={handlePayout}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-2.5"
              >
                <div className="text-xs font-bold text-slate-900">ثبت پرداخت تسویه (بدهکار)</div>
                <select
                  required
                  value={payoutUserId}
                  onChange={(e) => setPayoutUserId(e.target.value)}
                  className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2 text-xs"
                >
                  <option value="">انتخاب پیمانکار...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  required
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  placeholder="مبلغ پرداختی (تومان)"
                  className="min-h-[40px] w-full rounded-lg border border-slate-300 px-2.5 text-xs tabular-nums"
                />
                <input
                  type="text"
                  value={payoutDesc}
                  onChange={(e) => setPayoutDesc(e.target.value)}
                  placeholder="شرح پرداخت"
                  className="min-h-[40px] w-full rounded-lg border border-slate-300 px-2.5 text-xs"
                />
                <button
                  type="submit"
                  className="min-h-[38px] w-full rounded-lg bg-emerald-700 text-xs font-bold text-white"
                >
                  ثبت سند پرداخت
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Active Assignments & Ledger History */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">دفتر کل تراکنش‌های مالی (Ledger)</h3>
          <span className="text-xs text-slate-500">
            قراردادهای فعال: {toPersianDigits(userTariffs.length)} پیمانکار
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-bold">پیمانکار</th>
                <th className="px-3 py-2 font-bold">نوع سند</th>
                <th className="px-3 py-2 font-bold">مبلغ</th>
                <th className="px-3 py-2 font-bold">شرح</th>
                <th className="px-3 py-2 font-bold">تاریخ (شمسی)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledger.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2 font-semibold text-slate-900">{l.user_full_name}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`font-bold ${
                        l.type === 'credit' ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {l.type === 'credit' ? 'بستانکار (کارکرد)' : 'بدهکار (تسویه)'}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums font-bold">
                    {formatCurrencyToman(l.amount)}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{l.description}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-500">
                    {formatIsoToJalaliDisplay(l.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
