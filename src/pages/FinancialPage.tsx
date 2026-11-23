import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Banknote, Settings2 } from 'lucide-react';
import type {
  AuthUser,
  BalanceSummary,
  LedgerItem,
  MonthlyContractorEarning,
  TariffItem,
} from '../types/erp';
import type { TariffCalcType } from '../lib/fiberLogic';
import { apiFetch } from '../utils/api';
import { formatDateTimeToJalali, formatToman, toPersianDigits } from '../lib/jalali';
import { Modal } from '../components/Modal';
import { SearchableSelect } from '../components/SearchableSelect';
import { ContractorMonthlyEarningsReport } from '../components/ContractorMonthlyEarningsReport';

interface InstallerOption {
  id: number;
  first_name: string;
  last_name: string;
  role_name: string;
}

export function FinancialPage({ user }: { user: AuthUser }) {
  const [tariffs, setTariffs] = useState<TariffItem[]>([]);
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [balances, setBalances] = useState<BalanceSummary[]>([]);
  const [monthlyEarnings, setMonthlyEarnings] = useState<MonthlyContractorEarning[]>([]);
  const [isScopedToSelf, setIsScopedToSelf] = useState(false);
  const [installers, setInstallers] = useState<InstallerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tariff Modal
  const [tariffOpen, setTariffOpen] = useState(false);
  const [tInstallerId, setTInstallerId] = useState('');
  const [tCalcType, setTCalcType] = useState<TariffCalcType>('hybrid');
  const [tBasePrice, setTBasePrice] = useState('950000');
  const [tMeterLimit, setTMeterLimit] = useState('50');
  const [tExtraPrice, setTExtraPrice] = useState('15000');
  const [tBonusCount, setTBonusCount] = useState('5');
  const [tBonusAmount, setTBonusAmount] = useState('500000');

  // Payout Modal
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [pUserId, setPUserId] = useState('');
  const [pAmount, setPAmount] = useState('');
  const [pDesc, setPDesc] = useState('');

  const canManageTariffs = user.isSuperAdmin || user.permissions.includes('can_manage_tariffs');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        tariffs: TariffItem[];
        ledger: LedgerItem[];
        balances: BalanceSummary[];
        monthlyEarnings?: MonthlyContractorEarning[];
        isScopedToSelf?: boolean;
      }>('/api/financial');
      setTariffs(res.tariffs);
      setLedger(res.ledger);
      setBalances(res.balances);
      setMonthlyEarnings(res.monthlyEarnings ?? []);
      setIsScopedToSelf(Boolean(res.isScopedToSelf));
      if (canManageTariffs) {
        const uRes = await apiFetch<{ users: InstallerOption[] }>('/api/users/installers');
        setInstallers(uRes.users);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت اطلاعات مالی');
    } finally {
      setLoading(false);
    }
  }, [canManageTariffs]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveTariff = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/financial/tariffs', {
        method: 'POST',
        body: JSON.stringify({
          installer_id: Number(tInstallerId),
          calc_type: tCalcType,
          base_price: Number(tBasePrice) || 0,
          meter_limit: Number(tMeterLimit) || 0,
          extra_meter_price: Number(tExtraPrice) || 0,
          bonus_target_count: Number(tBonusCount) || 0,
          bonus_amount: Number(tBonusAmount) || 0,
        }),
      });
      setTariffOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ذخیره تعرفه');
    }
  };

  const handlePayout = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/financial/payout', {
        method: 'POST',
        body: JSON.stringify({
          user_id: Number(pUserId),
          amount: Number(pAmount),
          description: pDesc,
        }),
      });
      setPAmount('');
      setPDesc('');
      setPayoutOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت سند پرداخت');
    }
  };

  const openEditTariff = (tf?: TariffItem) => {
    if (tf) {
      setTInstallerId(String(tf.installer_id));
      setTCalcType(tf.calc_type);
      setTBasePrice(String(tf.base_price));
      setTMeterLimit(String(tf.meter_limit));
      setTExtraPrice(String(tf.extra_meter_price));
      setTBonusCount(String(tf.bonus_target_count || 0));
      setTBonusAmount(String(tf.bonus_amount || 0));
    } else {
      setTInstallerId('');
      setTCalcType('hybrid');
    }
    setTariffOpen(true);
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
        در حال بارگذاری حسابداری و تعرفه‌ها...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {canManageTariffs && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => openEditTariff()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
          >
            <Settings2 className="h-4 w-4" />
            <span>تنظیم تعرفه نصاب</span>
          </button>
          <button
            type="button"
            onClick={() => setPayoutOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700"
          >
            <Banknote className="h-4 w-4" />
            <span>ثبت پرداخت / تسویه حساب</span>
          </button>
        </div>
      )}

      {/* Monthly Contractor Earnings Bar Chart Report with Time-Range Filter & Excel Export */}
      <ContractorMonthlyEarningsReport
        monthlyEarnings={monthlyEarnings}
        ledger={ledger}
        contractorScopeLabel={
          isScopedToSelf ? `${user.first_name} ${user.last_name}` : 'تمامی پیمانکاران'
        }
      />

      {/* Installer Balances Summary */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">تراز مالی و مانده حساب پرسنل</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th className="px-4 py-3">نام و نام خانوادگی</th>
                <th className="px-4 py-3">نقش</th>
                <th className="px-4 py-3">جمع بستانکاری (کارکرد)</th>
                <th className="px-4 py-3">جمع بدهکاری (پرداختی شرکت)</th>
                <th className="px-4 py-3">مانده قابل پرداخت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {balances.map((b) => (
                <tr key={b.user_id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-medium text-slate-900">{b.full_name}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{b.role_name}</td>
                  <td className="px-4 py-3 text-xs text-emerald-700 tabular-nums">
                    {formatToman(b.totalCredit)}
                  </td>
                  <td className="px-4 py-3 text-xs text-red-600 tabular-nums">
                    {formatToman(b.totalDebit)}
                  </td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-900 tabular-nums">
                    {formatToman(b.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tariffs Table */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">تعرفه‌های فعال نصابان</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-medium text-slate-500">
              <tr>
                <th className="px-4 py-3">نصاب</th>
                <th className="px-4 py-3">مدل محاسبه</th>
                <th className="px-4 py-3">مبلغ پایه</th>
                <th className="px-4 py-3">سقف متراژ رایگان</th>
                <th className="px-4 py-3">نرخ هر متر مازاد</th>
                <th className="px-4 py-3">پاداش هدف</th>
                {canManageTariffs && <th className="px-4 py-3">ویرایش</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tariffs.map((tf) => (
                <tr key={tf.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{tf.installer_name}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {tf.calc_type === 'fixed'
                      ? 'ثابت (Fixed)'
                      : tf.calc_type === 'per_meter'
                        ? 'متراژی (Per-Meter)'
                        : 'ترکیبی (Hybrid)'}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatToman(tf.base_price)}</td>
                  <td className="px-4 py-3 tabular-nums">{toPersianDigits(tf.meter_limit)} متر</td>
                  <td className="px-4 py-3 tabular-nums">{formatToman(tf.extra_meter_price)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {tf.bonus_target_count > 0
                      ? `هر ${toPersianDigits(tf.bonus_target_count)} نصب: ${formatToman(tf.bonus_amount)}`
                      : 'ندارد'}
                  </td>
                  {canManageTariffs && (
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openEditTariff(tf)}
                        className="text-teal-700 hover:underline"
                      >
                        ویرایش
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Double-Entry Ledger */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">دفتر کل تراکنش‌های مالی (Ledger)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-medium text-slate-500">
              <tr>
                <th className="px-4 py-3">شماره سند</th>
                <th className="px-4 py-3">شخص</th>
                <th className="px-4 py-3">نوع سند</th>
                <th className="px-4 py-3">مبلغ</th>
                <th className="px-4 py-3">شرح سند</th>
                <th className="px-4 py-3">تاریخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledger.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3 font-medium text-slate-800 tabular-nums">
                    #{toPersianDigits(l.id)}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{l.user_name}</td>
                  <td className="px-4 py-3 font-medium">
                    <span className={l.type === 'credit' ? 'text-emerald-700' : 'text-red-600'}>
                      {l.type === 'credit' ? 'بستانکار (دستمزد)' : 'بدهکار (پرداختی)'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900 tabular-nums">
                    {formatToman(l.amount)}
                  </td>
                  <td className="px-4 py-3 text-slate-600 tabular-nums">
                    {l.description ? toPersianDigits(l.description) : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 tabular-nums">
                    {formatDateTimeToJalali(l.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tariff Modal */}
      <Modal open={tariffOpen} onClose={() => setTariffOpen(false)} title="تنظیم مدل تعرفه نصاب">
        <form onSubmit={handleSaveTariff} className="space-y-4">
          <SearchableSelect
            label="انتخاب نصاب"
            required
            options={installers.map((u) => ({
              value: u.id,
              label: `${u.first_name} ${u.last_name}`,
              sublabel: u.role_name,
            }))}
            value={tInstallerId}
            onChange={setTInstallerId}
          />
          <div>
            <label htmlFor="tf-type" className="mb-1 block text-xs font-medium text-slate-700">
              مدل محاسبه
            </label>
            <select
              id="tf-type"
              value={tCalcType}
              onChange={(e) => setTCalcType(e.target.value as TariffCalcType)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs focus:border-teal-600 focus:outline-none"
            >
              <option value="fixed">ثابت (Fixed)</option>
              <option value="per_meter">بر اساس متراژ (Per-Meter)</option>
              <option value="hybrid">ترکیبی: پایه + مازاد متراژ (Hybrid)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="tf-base" className="mb-1 block text-xs font-medium text-slate-700">
                مبلغ پایه (تومان)
              </label>
              <input
                id="tf-base"
                type="number"
                min={0}
                value={tBasePrice}
                onChange={(e) => setTBasePrice(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="tf-limit" className="mb-1 block text-xs font-medium text-slate-700">
                سقف متراژ پایه (متر)
              </label>
              <input
                id="tf-limit"
                type="number"
                min={0}
                value={tMeterLimit}
                onChange={(e) => setTMeterLimit(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="tf-extra" className="mb-1 block text-xs font-medium text-slate-700">
                نرخ هر متر اضافه (تومان)
              </label>
              <input
                id="tf-extra"
                type="number"
                min={0}
                value={tExtraPrice}
                onChange={(e) => setTExtraPrice(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="tf-bcount" className="mb-1 block text-xs font-medium text-slate-700">
                تعداد هدف پاداش
              </label>
              <input
                id="tf-bcount"
                type="number"
                min={0}
                value={tBonusCount}
                onChange={(e) => setTBonusCount(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs tabular-nums"
              />
            </div>
          </div>
          <div>
            <label htmlFor="tf-bamt" className="mb-1 block text-xs font-medium text-slate-700">
              مبلغ پاداش هدف (تومان)
            </label>
            <input
              id="tf-bamt"
              type="number"
              min={0}
              value={tBonusAmount}
              onChange={(e) => setTBonusAmount(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs tabular-nums"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setTariffOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs text-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={!tInstallerId}
              className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              ذخیره تعرفه
            </button>
          </div>
        </form>
      </Modal>

      {/* Payout Modal */}
      <Modal open={payoutOpen} onClose={() => setPayoutOpen(false)} title="ثبت سند پرداخت مالی به نصاب">
        <form onSubmit={handlePayout} className="space-y-4">
          <SearchableSelect
            label="دریافت‌کننده وجه"
            required
            options={installers.map((u) => ({
              value: u.id,
              label: `${u.first_name} ${u.last_name}`,
              sublabel: u.role_name,
            }))}
            value={pUserId}
            onChange={setPUserId}
          />
          <div>
            <label htmlFor="pay-amount" className="mb-1 block text-xs font-medium text-slate-700">
              مبلغ پرداختی (تومان)
            </label>
            <input
              id="pay-amount"
              type="number"
              min={1}
              required
              value={pAmount}
              onChange={(e) => setPAmount(e.target.value)}
              placeholder="مثال: 1500000"
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm tabular-nums focus:border-teal-600 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="pay-desc" className="mb-1 block text-xs font-medium text-slate-700">
              شرح پرداخت / شماره فیش
            </label>
            <input
              id="pay-desc"
              type="text"
              value={pDesc}
              onChange={(e) => setPDesc(e.target.value)}
              placeholder="مثال: تسویه حساب هفته آخر آبان - حواله شماره ۱۲۳"
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-xs focus:border-teal-600 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPayoutOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs text-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={!pUserId || !pAmount}
              className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              ثبت در دفتر کل
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
