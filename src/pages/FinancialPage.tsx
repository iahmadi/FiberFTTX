import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Award,
  FileCheck2,
  Layers,
  PackageCheck,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import { ContractorMonthlyEarningsReport } from '../components/ContractorMonthlyEarningsReport';
import { JalaliDatePicker } from '../components/JalaliDatePicker';
import { Modal } from '../components/Modal';
import {
  TICKET_TYPES,
  TICKET_TYPE_LABELS,
  type CustomerPackageRules,
  type TariffCalcMode,
  type TariffTemplateRulesJson,
} from '../lib/fiberLogic';
import { formatCurrencyToman, formatIsoToJalaliDisplay, toPersianDigits } from '../lib/jalali';
import { userHasPermission } from '../lib/permissions';
import type {
  AuthUser,
  ContractorBalanceSummary,
  CustomerPackageItem,
  LedgerEntryItem,
  PromotionItem,
  TariffTemplateItem,
  TicketItem,
  UserTariffAssignment,
} from '../types/erp';
import { apiFetch, uploadReceiptImage } from '../utils/api';
import { compressImageForUpload, formatBytesFa } from '../utils/imageCompression';

interface FinancialPageProps {
  user: AuthUser;
  templates: TariffTemplateItem[];
  promotions: PromotionItem[];
  packages: CustomerPackageItem[];
  tickets: TicketItem[];
  userTariffs: UserTariffAssignment[];
  ledger: LedgerEntryItem[];
  contractorSummaries: ContractorBalanceSummary[];
  users: Array<{ id: number; username: string; full_name: string }>;
  onRefresh: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, desc?: string) => void;
}

const DEFAULT_RULES: TariffTemplateRulesJson = {
  internet_install: {
    calc_type: 'hybrid',
    base_price: 1000000,
    meter_limit: 120,
    extra_meter_price: 25000,
    fusion_base_price: 150000,
    fusion_limit: 2,
    extra_fusion_price: 50000,
  },
  internet_fault: {
    calc_type: 'fixed',
    base_price: 450000,
    meter_limit: 0,
    extra_meter_price: 0,
    fusion_base_price: 100000,
    fusion_limit: 1,
    extra_fusion_price: 40000,
  },
  ffat_install: {
    calc_type: 'per_meter',
    base_price: 350000,
    meter_limit: 0,
    extra_meter_price: 20000,
    fusion_base_price: 200000,
    fusion_limit: 4,
    extra_fusion_price: 50000,
  },
  ffat_fault: {
    calc_type: 'fixed',
    base_price: 600000,
    meter_limit: 0,
    extra_meter_price: 0,
    fusion_base_price: 120000,
    fusion_limit: 2,
    extra_fusion_price: 45000,
  },
  voip_install: {
    calc_type: 'fixed',
    base_price: 750000,
    meter_limit: 0,
    extra_meter_price: 0,
    fusion_base_price: 100000,
    fusion_limit: 1,
    extra_fusion_price: 40000,
  },
};

const DEFAULT_PACKAGE_RULES: CustomerPackageRules = {
  install_fee: 1500000,
  install_discount_pct: 0,
  modem_price: 4500000,
  modem_included: false,
  free_config: false,
  config_fee: 350000,
  free_meter_limit: 100,
  extra_meter_price: 35000,
  charge_materials: true,
};

function getTodayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

export function FinancialPage({
  user,
  templates,
  promotions,
  packages,
  tickets,
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

  // Customer Package CRUD modal state
  const [pkgModalOpen, setPkgModalOpen] = useState(false);
  const [editingPkg, setEditingPkg] = useState<CustomerPackageItem | null>(null);
  const [pkgName, setPkgName] = useState('');
  const [pkgIsActive, setPkgIsActive] = useState(true);
  const [pkgRules, setPkgRules] = useState<CustomerPackageRules>(DEFAULT_PACKAGE_RULES);
  const [savingPkg, setSavingPkg] = useState(false);

  // Dual Settlement Tabs ('payout' | 'customer_payment')
  const [settlementTab, setSettlementTab] = useState<'payout' | 'customer_payment'>('payout');

  // Contractor Payout form states
  const [payoutUserId, setPayoutUserId] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutDesc, setPayoutDesc] = useState('تسویه حساب دوره');
  const [payoutBankName, setPayoutBankName] = useState('');
  const [payoutTrackingCode, setPayoutTrackingCode] = useState('');
  const [payoutTargetAccount, setPayoutTargetAccount] = useState('');
  const [payoutSourceAccount, setPayoutSourceAccount] = useState('');
  const [payoutDateIso, setPayoutDateIso] = useState(getTodayIso());
  const [payoutTime, setPayoutTime] = useState('12:00');
  const [receiptFile, setReceiptFile] = useState<{
    blob: Blob;
    filename: string;
    previewUrl: string;
    sizeLabel: string;
  } | null>(null);
  const [compressingReceipt, setCompressingReceipt] = useState(false);
  const [submittingPayout, setSubmittingPayout] = useState(false);

  // Customer Payment form states
  const [custPayName, setCustPayName] = useState('');
  const [custPayTicketId, setCustPayTicketId] = useState('');
  const [custPayAmount, setCustPayAmount] = useState('');
  const [custPayBankName, setCustPayBankName] = useState('');
  const [custPayTrackingCode, setCustPayTrackingCode] = useState('');
  const [custPayTargetAccount, setCustPayTargetAccount] = useState('');
  const [custPaySourceAccount, setCustPaySourceAccount] = useState('');
  const [custPayDateIso, setCustPayDateIso] = useState(getTodayIso());
  const [custPayTime, setCustPayTime] = useState('12:00');
  const [custPayDesc, setCustPayDesc] = useState('دریافت وجه نصب و اشتراک از مشترک');
  const [custPayReceipt, setCustPayReceipt] = useState<{
    blob: Blob;
    filename: string;
    previewUrl: string;
    sizeLabel: string;
  } | null>(null);
  const [compressingCustReceipt, setCompressingCustReceipt] = useState(false);
  const [submittingCustPay, setSubmittingCustPay] = useState(false);

  // Ledger Receipt Lightbox
  const [previewReceiptEntry, setPreviewReceiptEntry] = useState<LedgerEntryItem | null>(null);

  const openCreatePkgModal = () => {
    setEditingPkg(null);
    setPkgName('');
    setPkgIsActive(true);
    setPkgRules(DEFAULT_PACKAGE_RULES);
    setPkgModalOpen(true);
  };

  const openEditPkgModal = (pkg: CustomerPackageItem) => {
    setEditingPkg(pkg);
    setPkgName(pkg.name);
    setPkgIsActive(pkg.is_active);
    setPkgRules({
      install_fee: Number(pkg.rules_json.install_fee || 0),
      install_discount_pct: Number(pkg.rules_json.install_discount_pct || 0),
      modem_price: Number(pkg.rules_json.modem_price || 0),
      modem_included: Boolean(pkg.rules_json.modem_included),
      free_config: Boolean(pkg.rules_json.free_config),
      config_fee: Number(pkg.rules_json.config_fee || 0),
      free_meter_limit: Number(pkg.rules_json.free_meter_limit || 0),
      extra_meter_price: Number(pkg.rules_json.extra_meter_price || 0),
      charge_materials: Boolean(pkg.rules_json.charge_materials),
    });
    setPkgModalOpen(true);
  };

  const handleSavePackage = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = pkgName.trim();
    if (!trimmed) {
      onNotify('warning', 'نام پکیج فروش را وارد کنید');
      return;
    }
    setSavingPkg(true);
    try {
      if (editingPkg) {
        await apiFetch(`/api/financial/packages/${editingPkg.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: trimmed,
            is_active: pkgIsActive,
            rules_json: pkgRules,
          }),
        });
        onNotify('success', `پکیج «${trimmed}» ویرایش شد`);
      } else {
        await apiFetch('/api/financial/packages', {
          method: 'POST',
          body: JSON.stringify({
            name: trimmed,
            is_active: pkgIsActive,
            rules_json: pkgRules,
          }),
        });
        onNotify('success', `پکیج جدید «${trimmed}» ایجاد شد`);
      }
      setPkgModalOpen(false);
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در ذخیره پکیج فروش مشترک', err instanceof Error ? err.message : undefined);
    } finally {
      setSavingPkg(false);
    }
  };

  const handleTogglePackageActive = async (pkg: CustomerPackageItem) => {
    try {
      await apiFetch(`/api/financial/packages/${pkg.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !pkg.is_active }),
      });
      onNotify('success', `وضعیت پکیج «${pkg.name}» تغییر یافت`);
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در تغییر وضعیت پکیج', err instanceof Error ? err.message : undefined);
    }
  };

  const handleDeletePackage = async (pkg: CustomerPackageItem) => {
    try {
      await apiFetch(`/api/financial/packages/${pkg.id}`, { method: 'DELETE' });
      onNotify('success', `پکیج «${pkg.name}» حذف شد`);
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در حذف پکیج', err instanceof Error ? err.message : undefined);
    }
  };

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

  const handleReceiptSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressingReceipt(true);
    try {
      const res = await compressImageForUpload(file, 1280, 0.7);
      setReceiptFile({
        blob: res.blob,
        filename: res.filename,
        previewUrl: res.previewUrl,
        sizeLabel: formatBytesFa(res.compressedSize),
      });
      onNotify(
        'success',
        'تصویر فیش واریزی فشرده‌سازی شد',
        `${formatBytesFa(res.originalSize)} ← ${formatBytesFa(res.compressedSize)}`,
      );
    } catch (err) {
      onNotify('error', 'خطا در آماده‌سازی تصویر فیش', err instanceof Error ? err.message : undefined);
    } finally {
      setCompressingReceipt(false);
      e.target.value = '';
    }
  };

  const handleCustReceiptSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressingCustReceipt(true);
    try {
      const res = await compressImageForUpload(file, 1280, 0.7);
      setCustPayReceipt({
        blob: res.blob,
        filename: res.filename,
        previewUrl: res.previewUrl,
        sizeLabel: formatBytesFa(res.compressedSize),
      });
      onNotify(
        'success',
        'تصویر فیش واریزی مشترک فشرده‌سازی شد',
        `${formatBytesFa(res.originalSize)} ← ${formatBytesFa(res.compressedSize)}`,
      );
    } catch (err) {
      onNotify('error', 'خطا در آماده‌سازی تصویر فیش', err instanceof Error ? err.message : undefined);
    } finally {
      setCompressingCustReceipt(false);
      e.target.value = '';
    }
  };

  const handlePayout = async (e: FormEvent) => {
    e.preventDefault();
    setSubmittingPayout(true);
    try {
      let uploadedReceiptPath: string | null = null;
      if (receiptFile) {
        const up = await uploadReceiptImage(receiptFile.blob, receiptFile.filename);
        uploadedReceiptPath = up.file_path;
      }

      const paidAtIso = payoutDateIso
        ? `${payoutDateIso}T${payoutTime || '12:00'}:00`
        : new Date().toISOString();

      await apiFetch('/api/financial/payouts', {
        method: 'POST',
        body: JSON.stringify({
          user_id: Number(payoutUserId),
          amount: Number(payoutAmount),
          description: payoutDesc,
          bank_name: payoutBankName.trim() || null,
          tracking_code: payoutTrackingCode.trim() || null,
          target_account: payoutTargetAccount.trim() || null,
          source_account: payoutSourceAccount.trim() || null,
          paid_at: paidAtIso,
          receipt_image: uploadedReceiptPath,
        }),
      });
      onNotify('success', 'سند پرداخت تسویه پیمانکار و جزئیات بانکی در دفتر کل ثبت شد');
      setPayoutAmount('');
      setPayoutTrackingCode('');
      setPayoutBankName('');
      setPayoutTargetAccount('');
      setPayoutSourceAccount('');
      setReceiptFile(null);
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در ثبت پرداخت', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmittingPayout(false);
    }
  };

  const handleCustomerPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!custPayName.trim() || Number(custPayAmount) <= 0) {
      onNotify('warning', 'نام مشترک و مبلغ معتبر را وارد کنید');
      return;
    }
    setSubmittingCustPay(true);
    try {
      let uploadedReceiptPath: string | null = null;
      if (custPayReceipt) {
        const up = await uploadReceiptImage(custPayReceipt.blob, custPayReceipt.filename);
        uploadedReceiptPath = up.file_path;
      }

      const paidAtIso = custPayDateIso
        ? `${custPayDateIso}T${custPayTime || '12:00'}:00`
        : new Date().toISOString();

      await apiFetch('/api/financial/customer-payments', {
        method: 'POST',
        body: JSON.stringify({
          customer_name: custPayName.trim(),
          ticket_id: custPayTicketId ? Number(custPayTicketId) : null,
          amount: Number(custPayAmount),
          description: custPayDesc.trim() || 'دریافت وجه از مشترک',
          bank_name: custPayBankName.trim() || null,
          tracking_code: custPayTrackingCode.trim() || null,
          target_account: custPayTargetAccount.trim() || null,
          source_account: custPaySourceAccount.trim() || null,
          paid_at: paidAtIso,
          receipt_image: uploadedReceiptPath,
        }),
      });
      onNotify('success', `واریزی مشترک «${custPayName.trim()}» در دفتر کل ثبت شد`);
      setCustPayName('');
      setCustPayTicketId('');
      setCustPayAmount('');
      setCustPayBankName('');
      setCustPayTrackingCode('');
      setCustPayTargetAccount('');
      setCustPaySourceAccount('');
      setCustPayReceipt(null);
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در ثبت واریزی مشترک', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmittingCustPay(false);
    }
  };

  const getLedgerCategoryLabel = (l: LedgerEntryItem): { label: string; cls: string } => {
    if (l.ledger_type === 'customer_payment') {
      return { label: 'واریزی مشترک (بستانکار)', cls: 'text-sky-800' };
    }
    if (l.ledger_type === 'installer_payout' || l.type === 'debit') {
      return { label: 'تسویه پیمانکار (بدهکار)', cls: 'text-amber-700' };
    }
    return { label: 'کارکرد پیمانکار (بستانکار)', cls: 'text-emerald-700' };
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

      {/* Customer Sales Packages CRUD Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <PackageCheck className="h-5 w-5 text-teal-700" />
            <span>مدیریت پکیج‌های فروش و تعرفه مشترکین (فاکتور مشتری)</span>
          </div>
          {canManageTariffs && (
            <button
              type="button"
              onClick={openCreatePkgModal}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 text-xs font-bold text-white hover:bg-teal-800"
            >
              <Plus className="h-4 w-4" />
              <span>افزودن پکیج فروش</span>
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-bold">نام پکیج</th>
                <th className="px-3 py-2 font-bold">هزینه نصب</th>
                <th className="px-3 py-2 font-bold">تخفیف نصب</th>
                <th className="px-3 py-2 font-bold">مودم / کانفیگ</th>
                <th className="px-3 py-2 font-bold">سقف کابل رایگان / متر اضافه</th>
                <th className="px-3 py-2 font-bold">اقلام جانبی</th>
                <th className="px-3 py-2 font-bold">وضعیت</th>
                {canManageTariffs && <th className="px-3 py-2 font-bold">عملیات</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {packages.map((pkg) => {
                const r = pkg.rules_json;
                return (
                  <tr key={pkg.id}>
                    <td className="px-3 py-2.5 font-bold text-slate-900">{pkg.name}</td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-700">
                      {formatCurrencyToman(r.install_fee)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-emerald-700">
                      {r.install_discount_pct > 0
                        ? `${toPersianDigits(r.install_discount_pct)}٪`
                        : 'بدون تخفیف'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">
                      <div>
                        مودم:{' '}
                        {r.modem_included ? 'رایگان روی پکیج' : formatCurrencyToman(r.modem_price)}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        کانفیگ: {r.free_config ? 'رایگان' : formatCurrencyToman(r.config_fee || 0)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-700">
                      <div>تا {toPersianDigits(r.free_meter_limit)} متر رایگان</div>
                      <div className="text-[11px] text-slate-500">
                        مازاد: {formatCurrencyToman(r.extra_meter_price)} / متر
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {r.charge_materials ? 'محاسبه روی فاکتور' : 'رایگان / شامل پکیج'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`font-bold ${pkg.is_active ? 'text-emerald-700' : 'text-slate-400'}`}
                      >
                        {pkg.is_active ? 'فعال' : 'غیرفعال'}
                      </span>
                    </td>
                    {canManageTariffs && (
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditPkgModal(pkg)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-teal-700"
                            title="ویرایش پکیج"
                            aria-label={`ویرایش ${pkg.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleTogglePackageActive(pkg)}
                            className="min-h-[32px] rounded-lg border border-slate-200 px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            {pkg.is_active ? 'غیرفعال' : 'فعال'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeletePackage(pkg)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
                            title="حذف پکیج"
                            aria-label={`حذف ${pkg.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {packages.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                    پکیج فروشی ثبت نشده است.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Management Section: Templates, Promotions, Assignments & Dual Settlement */}
      {canManageTariffs && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {/* Tariff Template Creator (with Fusion Costs) */}
          <form
            onSubmit={handleCreateTemplate}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Layers className="h-5 w-5 text-teal-700" />
              <span>تعریف الگوی تعرفه ۵گانه پیمانکاران (شامل اجرت و سقف فیوژن)</span>
            </div>

            <input
              type="text"
              required
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="نام الگوی تعرفه (مثلاً قرارداد درجه یک ۱۴۰۵)"
              className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 text-xs"
            />

            <div className="space-y-3">
              {TICKET_TYPES.map((tKey) => {
                const rule = tplRules[tKey];
                return (
                  <div
                    key={tKey}
                    className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{TICKET_TYPE_LABELS[tKey]}</span>
                      <select
                        value={rule.calc_type}
                        onChange={(e) =>
                          setTplRules((prev) => ({
                            ...prev,
                            [tKey]: { ...prev[tKey], calc_type: e.target.value as TariffCalcMode },
                          }))
                        }
                        className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold"
                      >
                        <option value="fixed">ثابت</option>
                        <option value="per_meter">متری</option>
                        <option value="hybrid">ترکیبی</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <div>
                        <span className="mb-0.5 block text-[10px] text-slate-500">اجرت پایه (تومان)</span>
                        <input
                          type="number"
                          min={0}
                          value={rule.base_price}
                          onChange={(e) =>
                            setTplRules((prev) => ({
                              ...prev,
                              [tKey]: { ...prev[tKey], base_price: Number(e.target.value) },
                            }))
                          }
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1 tabular-nums"
                        />
                      </div>
                      <div>
                        <span className="mb-0.5 block text-[10px] text-slate-500">سقف متراژ پایه</span>
                        <input
                          type="number"
                          min={0}
                          value={rule.meter_limit}
                          onChange={(e) =>
                            setTplRules((prev) => ({
                              ...prev,
                              [tKey]: { ...prev[tKey], meter_limit: Number(e.target.value) },
                            }))
                          }
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1 tabular-nums"
                        />
                      </div>
                      <div>
                        <span className="mb-0.5 block text-[10px] text-slate-500">فی هر متر اضافه</span>
                        <input
                          type="number"
                          min={0}
                          value={rule.extra_meter_price}
                          onChange={(e) =>
                            setTplRules((prev) => ({
                              ...prev,
                              [tKey]: { ...prev[tKey], extra_meter_price: Number(e.target.value) },
                            }))
                          }
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1 tabular-nums"
                        />
                      </div>
                      <div>
                        <span className="mb-0.5 block text-[10px] text-teal-800">اجرت پایه فیوژن</span>
                        <input
                          type="number"
                          min={0}
                          value={rule.fusion_base_price ?? 0}
                          onChange={(e) =>
                            setTplRules((prev) => ({
                              ...prev,
                              [tKey]: { ...prev[tKey], fusion_base_price: Number(e.target.value) },
                            }))
                          }
                          className="w-full rounded border border-teal-200 bg-white px-2 py-1 tabular-nums"
                        />
                      </div>
                      <div>
                        <span className="mb-0.5 block text-[10px] text-teal-800">سقف تعداد فیوژن</span>
                        <input
                          type="number"
                          min={0}
                          value={rule.fusion_limit ?? 0}
                          onChange={(e) =>
                            setTplRules((prev) => ({
                              ...prev,
                              [tKey]: { ...prev[tKey], fusion_limit: Number(e.target.value) },
                            }))
                          }
                          className="w-full rounded border border-teal-200 bg-white px-2 py-1 tabular-nums"
                        />
                      </div>
                      <div>
                        <span className="mb-0.5 block text-[10px] text-teal-800">فی هر فیوژن اضافه</span>
                        <input
                          type="number"
                          min={0}
                          value={rule.extra_fusion_price ?? 0}
                          onChange={(e) =>
                            setTplRules((prev) => ({
                              ...prev,
                              [tKey]: { ...prev[tKey], extra_fusion_price: Number(e.target.value) },
                            }))
                          }
                          className="w-full rounded border border-teal-200 bg-white px-2 py-1 tabular-nums"
                        />
                      </div>
                    </div>
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

          {/* Promotions + Assignment + Dual Settlement Tabs */}
          <div className="space-y-6">
            <form
              onSubmit={handleCreatePromo}
              className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
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

            <form
              onSubmit={handleAssignTariff}
              className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
            >
              <div className="text-xs font-bold text-slate-900">تخصیص تعرفه و کمپین به نصاب</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
              </div>
              <button
                type="submit"
                className="min-h-[38px] rounded-lg bg-slate-900 px-5 text-xs font-bold text-white"
              >
                تخصیص قرارداد
              </button>
            </form>

            {/* Dual Settlement Card: Contractor Payout vs Customer Payment */}
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Receipt className="h-5 w-5 text-emerald-700" />
                  <span>ثبت اسناد بانکی و فیش واریزی</span>
                </div>
                <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setSettlementTab('payout')}
                    className={`rounded-md px-3 py-1.5 font-bold transition-colors ${
                      settlementTab === 'payout'
                        ? 'bg-amber-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ثبت تسویه پیمانکار
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettlementTab('customer_payment')}
                    className={`rounded-md px-3 py-1.5 font-bold transition-colors ${
                      settlementTab === 'customer_payment'
                        ? 'bg-sky-700 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ثبت واریزی مشترک
                  </button>
                </div>
              </div>

              {settlementTab === 'payout' ? (
                <form onSubmit={handlePayout} className="space-y-3">
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
                      value={payoutBankName}
                      onChange={(e) => setPayoutBankName(e.target.value)}
                      placeholder="نام بانک مبدا / واریز (مثلاً ملت، سامان)"
                      className="min-h-[40px] w-full rounded-lg border border-slate-300 px-2.5 text-xs"
                    />

                    <input
                      type="text"
                      dir="ltr"
                      value={payoutTrackingCode}
                      onChange={(e) => setPayoutTrackingCode(e.target.value)}
                      placeholder="شماره پیگیری / تراکنش (Transaction ID)"
                      className="min-h-[40px] w-full rounded-lg border border-slate-300 px-2.5 text-left text-xs tabular-nums"
                    />

                    <input
                      type="text"
                      dir="ltr"
                      value={payoutTargetAccount}
                      onChange={(e) => setPayoutTargetAccount(e.target.value)}
                      placeholder="شماره شبا / کارت مقصد پیمانکار (IR...)"
                      className="min-h-[40px] w-full rounded-lg border border-slate-300 px-2.5 text-left text-xs tabular-nums"
                    />

                    <input
                      type="text"
                      dir="ltr"
                      value={payoutSourceAccount}
                      onChange={(e) => setPayoutSourceAccount(e.target.value)}
                      placeholder="شماره حساب / شبا مبدا شرکت"
                      className="min-h-[40px] w-full rounded-lg border border-slate-300 px-2.5 text-left text-xs tabular-nums"
                    />

                    <div>
                      <span className="mb-1 block text-[11px] text-slate-500">تاریخ واریز (شمسی)</span>
                      <JalaliDatePicker valueIso={payoutDateIso} onChangeIso={setPayoutDateIso} />
                    </div>

                    <div>
                      <span className="mb-1 block text-[11px] text-slate-500">ساعت واریز</span>
                      <input
                        type="time"
                        value={payoutTime}
                        onChange={(e) => setPayoutTime(e.target.value)}
                        className="min-h-[40px] w-full rounded-lg border border-slate-300 px-2.5 text-xs tabular-nums"
                      />
                    </div>
                  </div>

                  <input
                    type="text"
                    value={payoutDesc}
                    onChange={(e) => setPayoutDesc(e.target.value)}
                    placeholder="شرح پرداخت و بابت..."
                    className="min-h-[40px] w-full rounded-lg border border-slate-300 px-2.5 text-xs"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                    <label className="inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100">
                      <Upload className="h-4 w-4 text-teal-700" />
                      <span>
                        {compressingReceipt
                          ? 'در حال فشرده‌سازی فیش...'
                          : 'آپلود تصویر فیش بانکی (اختیاری)'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={compressingReceipt}
                        onChange={handleReceiptSelect}
                        className="hidden"
                      />
                    </label>

                    {receiptFile && (
                      <div className="flex items-center gap-2 text-xs">
                        <img
                          src={receiptFile.previewUrl}
                          alt="پیش‌نمایش فیش"
                          className="h-10 w-10 rounded border border-slate-200 object-cover"
                        />
                        <span className="text-slate-600">{receiptFile.sizeLabel}</span>
                        <button
                          type="button"
                          onClick={() => setReceiptFile(null)}
                          className="rounded p-1 text-red-600 hover:bg-red-50"
                          aria-label="حذف تصویر فیش"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={submittingPayout || compressingReceipt}
                    className="min-h-[40px] w-full rounded-lg bg-emerald-700 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
                  >
                    {submittingPayout ? 'در حال ثبت سند...' : 'ثبت سند پرداخت و فیش تسویه پیمانکار'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleCustomerPayment} className="space-y-3">
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <select
                      value={custPayTicketId}
                      onChange={(e) => {
                        const tid = e.target.value;
                        setCustPayTicketId(tid);
                        if (tid) {
                          const found = tickets.find((t) => String(t.id) === tid);
                          if (found) setCustPayName(found.customer_name);
                        }
                      }}
                      className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2 text-xs"
                    >
                      <option value="">ارتباط با تیکت / پرونده مشترک (اختیاری)...</option>
                      {tickets.map((t) => (
                        <option key={t.id} value={t.id}>
                          #{toPersianDigits(t.id)} — {t.customer_name}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      required
                      value={custPayName}
                      onChange={(e) => setCustPayName(e.target.value)}
                      placeholder="نام کامل مشترک / شرکت پرداخت‌کننده *"
                      className="min-h-[40px] w-full rounded-lg border border-slate-300 px-2.5 text-xs"
                    />

                    <input
                      type="number"
                      min={1}
                      required
                      value={custPayAmount}
                      onChange={(e) => setCustPayAmount(e.target.value)}
                      placeholder="مبلغ واریزی مشترک (تومان) *"
                      className="min-h-[40px] w-full rounded-lg border border-slate-300 px-2.5 text-xs tabular-nums"
                    />

                    <input
                      type="text"
                      value={custPayBankName}
                      onChange={(e) => setCustPayBankName(e.target.value)}
                      placeholder="نام بانک مبدا / واریز"
                      className="min-h-[40px] w-full rounded-lg border border-slate-300 px-2.5 text-xs"
                    />

                    <input
                      type="text"
                      dir="ltr"
                      value={custPayTrackingCode}
                      onChange={(e) => setCustPayTrackingCode(e.target.value)}
                      placeholder="شماره پیگیری / ارجاع تراکنش"
                      className="min-h-[40px] w-full rounded-lg border border-slate-300 px-2.5 text-left text-xs tabular-nums"
                    />

                    <input
                      type="text"
                      dir="ltr"
                      value={custPayTargetAccount}
                      onChange={(e) => setCustPayTargetAccount(e.target.value)}
                      placeholder="حساب / شبا مقصد شرکت"
                      className="min-h-[40px] w-full rounded-lg border border-slate-300 px-2.5 text-left text-xs tabular-nums"
                    />

                    <input
                      type="text"
                      dir="ltr"
                      value={custPaySourceAccount}
                      onChange={(e) => setCustPaySourceAccount(e.target.value)}
                      placeholder="شماره کارت / شبا مبدا مشترک"
                      className="min-h-[40px] w-full rounded-lg border border-slate-300 px-2.5 text-left text-xs tabular-nums"
                    />

                    <div>
                      <span className="mb-1 block text-[11px] text-slate-500">تاریخ واریز (شمسی)</span>
                      <JalaliDatePicker valueIso={custPayDateIso} onChangeIso={setCustPayDateIso} />
                    </div>

                    <div>
                      <span className="mb-1 block text-[11px] text-slate-500">ساعت واریز</span>
                      <input
                        type="time"
                        value={custPayTime}
                        onChange={(e) => setCustPayTime(e.target.value)}
                        className="min-h-[40px] w-full rounded-lg border border-slate-300 px-2.5 text-xs tabular-nums"
                      />
                    </div>
                  </div>

                  <input
                    type="text"
                    value={custPayDesc}
                    onChange={(e) => setCustPayDesc(e.target.value)}
                    placeholder="شرح واریزی مشترک (مثلاً پیش‌پرداخت نصب، هزینه مودم...)"
                    className="min-h-[40px] w-full rounded-lg border border-slate-300 px-2.5 text-xs"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                    <label className="inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100">
                      <Upload className="h-4 w-4 text-sky-700" />
                      <span>
                        {compressingCustReceipt
                          ? 'در حال فشرده‌سازی فیش...'
                          : 'آپلود تصویر فیش واریزی مشترک (اختیاری)'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={compressingCustReceipt}
                        onChange={handleCustReceiptSelect}
                        className="hidden"
                      />
                    </label>

                    {custPayReceipt && (
                      <div className="flex items-center gap-2 text-xs">
                        <img
                          src={custPayReceipt.previewUrl}
                          alt="پیش‌نمایش فیش مشترک"
                          className="h-10 w-10 rounded border border-slate-200 object-cover"
                        />
                        <span className="text-slate-600">{custPayReceipt.sizeLabel}</span>
                        <button
                          type="button"
                          onClick={() => setCustPayReceipt(null)}
                          className="rounded p-1 text-red-600 hover:bg-red-50"
                          aria-label="حذف تصویر فیش مشترک"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={submittingCustPay || compressingCustReceipt}
                    className="min-h-[40px] w-full rounded-lg bg-sky-700 text-xs font-bold text-white hover:bg-sky-800 disabled:opacity-60"
                  >
                    {submittingCustPay ? 'در حال ثبت واریزی...' : 'ثبت سند واریزی مشترک در دفتر کل'}
                  </button>
                </form>
              )}
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
                <th className="px-3 py-2 font-bold">پیمانکار / مشترک</th>
                <th className="px-3 py-2 font-bold">نوع سند</th>
                <th className="px-3 py-2 font-bold">مبلغ</th>
                <th className="px-3 py-2 font-bold">شرح و مشخصات بانکی</th>
                <th className="px-3 py-2 font-bold">فیش</th>
                <th className="px-3 py-2 font-bold">تاریخ (شمسی)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledger.map((l) => {
                const cat = getLedgerCategoryLabel(l);
                return (
                  <tr key={l.id}>
                    <td className="px-3 py-2 font-semibold text-slate-900">
                      {l.user_full_name || l.customer_name || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`font-bold ${cat.cls}`}>{cat.label}</span>
                    </td>
                    <td className="px-3 py-2 font-bold tabular-nums">
                      {formatCurrencyToman(l.amount)}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      <div>{l.description}</div>
                      {(l.bank_name || l.tracking_code || l.target_account) && (
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                          {l.bank_name && <span>بانک: {l.bank_name}</span>}
                          {l.tracking_code && (
                            <span className="font-mono tabular-nums">پیگیری: {l.tracking_code}</span>
                          )}
                          {l.target_account && (
                            <span dir="ltr" className="font-mono tabular-nums">
                              مقصد: {l.target_account}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {l.receipt_image ? (
                        <button
                          type="button"
                          onClick={() => setPreviewReceiptEntry(l)}
                          className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 py-1 text-[11px] font-semibold text-teal-800 hover:bg-teal-100"
                        >
                          <FileCheck2 className="h-3.5 w-3.5" />
                          <span>مشاهده فیش</span>
                        </button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-500">
                      {formatIsoToJalaliDisplay(l.paid_at || l.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Package Create / Edit Modal */}
      <Modal
        open={pkgModalOpen}
        onClose={() => setPkgModalOpen(false)}
        title={editingPkg ? `ویرایش پکیج «${editingPkg.name}»` : 'تعریف پکیج فروش مشترک جدید'}
        subtitle="این قوانین مبنای محاسبه خودکار فاکتور PDF مشترک است."
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleSavePackage} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-700">نام پکیج فروش *</label>
              <input
                type="text"
                required
                value={pkgName}
                onChange={(e) => setPkgName(e.target.value)}
                placeholder="مثلاً: پکیج طلایی ۱۰۰ متری"
                className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 text-xs focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                هزینه پایه نصب (تومان)
              </label>
              <input
                type="number"
                min={0}
                value={pkgRules.install_fee}
                onChange={(e) =>
                  setPkgRules((p) => ({ ...p, install_fee: Number(e.target.value) }))
                }
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-xs tabular-nums"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                درصد تخفیف نصب (۰ تا ۱۰۰)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={pkgRules.install_discount_pct}
                onChange={(e) =>
                  setPkgRules((p) => ({ ...p, install_discount_pct: Number(e.target.value) }))
                }
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-xs tabular-nums"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                قیمت فروش مودم (تومان)
              </label>
              <input
                type="number"
                min={0}
                disabled={pkgRules.modem_included}
                value={pkgRules.modem_price}
                onChange={(e) =>
                  setPkgRules((p) => ({ ...p, modem_price: Number(e.target.value) }))
                }
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-xs tabular-nums disabled:bg-slate-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                هزینه کانفیگ و راه‌اندازی (تومان)
              </label>
              <input
                type="number"
                min={0}
                disabled={pkgRules.free_config}
                value={pkgRules.config_fee ?? 0}
                onChange={(e) =>
                  setPkgRules((p) => ({ ...p, config_fee: Number(e.target.value) }))
                }
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-xs tabular-nums disabled:bg-slate-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                سقف کابل رایگان (متر)
              </label>
              <input
                type="number"
                min={0}
                value={pkgRules.free_meter_limit}
                onChange={(e) =>
                  setPkgRules((p) => ({ ...p, free_meter_limit: Number(e.target.value) }))
                }
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-xs tabular-nums"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                تعرفه هر متر کابل اضافه (تومان)
              </label>
              <input
                type="number"
                min={0}
                value={pkgRules.extra_meter_price}
                onChange={(e) =>
                  setPkgRules((p) => ({ ...p, extra_meter_price: Number(e.target.value) }))
                }
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-xs tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-2">
            <label className="flex items-center gap-2 font-medium text-slate-800">
              <input
                type="checkbox"
                checked={pkgRules.modem_included}
                onChange={(e) =>
                  setPkgRules((p) => ({ ...p, modem_included: e.target.checked }))
                }
                className="h-4 w-4 accent-teal-700"
              />
              <span>مودم رایگان (شامل پکیج)</span>
            </label>
            <label className="flex items-center gap-2 font-medium text-slate-800">
              <input
                type="checkbox"
                checked={pkgRules.free_config}
                onChange={(e) => setPkgRules((p) => ({ ...p, free_config: e.target.checked }))}
                className="h-4 w-4 accent-teal-700"
              />
              <span>کانفیگ رایگان</span>
            </label>
            <label className="flex items-center gap-2 font-medium text-slate-800">
              <input
                type="checkbox"
                checked={pkgRules.charge_materials}
                onChange={(e) =>
                  setPkgRules((p) => ({ ...p, charge_materials: e.target.checked }))
                }
                className="h-4 w-4 accent-teal-700"
              />
              <span>محاسبه هزینه اقلام مصرفی در فاکتور</span>
            </label>
            <label className="flex items-center gap-2 font-medium text-slate-800">
              <input
                type="checkbox"
                checked={pkgIsActive}
                onChange={(e) => setPkgIsActive(e.target.checked)}
                className="h-4 w-4 accent-teal-700"
              />
              <span>پکیج فعال و قابل انتخاب</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setPkgModalOpen(false)}
              className="min-h-[40px] rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={savingPkg}
              className="min-h-[40px] rounded-lg bg-teal-700 px-5 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {savingPkg ? 'در حال ذخیره...' : editingPkg ? 'ذخیره تغییرات پکیج' : 'ایجاد پکیج'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Receipt Image Lightbox Modal */}
      <Modal
        open={Boolean(previewReceiptEntry)}
        onClose={() => setPreviewReceiptEntry(null)}
        title={
          previewReceiptEntry
            ? `فیش واریزی — ${
                previewReceiptEntry.user_full_name || previewReceiptEntry.customer_name || 'سند مالی'
              }`
            : ''
        }
        subtitle={
          previewReceiptEntry?.tracking_code
            ? `کد پیگیری: ${previewReceiptEntry.tracking_code}`
            : undefined
        }
        maxWidthClass="max-w-lg"
      >
        {previewReceiptEntry?.receipt_image && (
          <div className="space-y-3">
            <img
              src={previewReceiptEntry.receipt_image}
              alt="تصویر فیش واریزی"
              className="max-h-[70vh] w-full rounded-lg border border-slate-200 object-contain"
            />
            <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
              <div>مبلغ: {formatCurrencyToman(previewReceiptEntry.amount)}</div>
              {previewReceiptEntry.bank_name && <div>بانک: {previewReceiptEntry.bank_name}</div>}
              {previewReceiptEntry.source_account && (
                <div>حساب مبدا: {previewReceiptEntry.source_account}</div>
              )}
              {previewReceiptEntry.target_account && (
                <div>حساب مقصد: {previewReceiptEntry.target_account}</div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

