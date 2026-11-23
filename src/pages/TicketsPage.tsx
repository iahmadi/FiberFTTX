import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Eye, Plus, Search, UserPlus, Wrench, X } from 'lucide-react';
import type { AuthUser, ServiceRecordDetail, TicketItem } from '../types/erp';
import { apiFetch } from '../utils/api';
import { formatDateTimeToJalali, formatToman, toPersianDigits } from '../lib/jalali';
import { filterTicketsByQuery } from '../lib/searchFilter';
import { Modal } from '../components/Modal';
import { SearchableSelect } from '../components/SearchableSelect';

interface InstallerOption {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  role_name: string;
}

interface TicketsPageProps {
  user: AuthUser;
  onStartTicketService: (ticket: TicketItem) => void;
}

export function TicketsPage({ user, onStartTicketService }: TicketsPageProps) {
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [installers, setInstallers] = useState<InstallerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'assigned' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Create Ticket Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [ticketType, setTicketType] = useState<'install' | 'fault'>('install');
  const [createInstallerId, setCreateInstallerId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Assign Installer Modal
  const [assignTicket, setAssignTicket] = useState<TicketItem | null>(null);
  const [assignInstallerId, setAssignInstallerId] = useState('');

  // View Completed Service Record Modal
  const [detailRecord, setDetailRecord] = useState<ServiceRecordDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const canCreate = user.isSuperAdmin || user.permissions.includes('can_create_tickets');
  const canAssign = user.isSuperAdmin || user.permissions.includes('can_assign_tickets');
  const canExecute = user.isSuperAdmin || user.permissions.includes('can_execute_service');

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ tickets: TicketItem[] }>('/api/tickets');
      setTickets(res.tickets);
      if (canAssign) {
        const uRes = await apiFetch<{ users: InstallerOption[] }>('/api/users/installers');
        setInstallers(uRes.users);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت تیکت‌ها');
    } finally {
      setLoading(false);
    }
  }, [canAssign]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const filteredTickets = useMemo(
    () => filterTicketsByQuery(tickets, searchQuery, statusFilter),
    [tickets, searchQuery, statusFilter],
  );

  const installerOptions = useMemo(
    () =>
      installers.map((u) => ({
        value: u.id,
        label: `${u.first_name} ${u.last_name}`,
        sublabel: u.role_name,
      })),
    [installers],
  );

  const handleCreateTicket = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          customer_name: customerName,
          address,
          type: ticketType,
          assigned_installer: createInstallerId ? Number(createInstallerId) : null,
        }),
      });
      setCustomerName('');
      setAddress('');
      setCreateInstallerId('');
      setCreateOpen(false);
      await loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت تیکت');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!assignTicket || !assignInstallerId) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/tickets/${assignTicket.id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ assigned_installer: Number(assignInstallerId) }),
      });
      setAssignTicket(null);
      setAssignInstallerId('');
      await loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ارجاع تیکت');
    } finally {
      setSubmitting(false);
    }
  };

  const openRecordDetail = async (ticketId: number) => {
    setDetailLoading(true);
    setDetailRecord(null);
    try {
      const res = await apiFetch<{ record: ServiceRecordDetail }>(`/api/tickets/${ticketId}/record`);
      setDetailRecord(res.record);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت جزئیات پرونده');
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                ['all', 'همه'],
                ['pending', 'در انتظار ارجاع'],
                ['assigned', 'ارجاع‌شده'],
                ['completed', 'تکمیل‌شده'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  statusFilter === key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 right-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              aria-label="جستجوی لحظه‌ای بر اساس نام مشتری یا آدرس"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجوی لحظه‌ای نام مشتری، آدرس یا کد فنی..."
              className="h-9 w-80 max-w-full rounded-lg border border-slate-300 pr-9 pl-8 text-xs focus:border-teal-600 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="پاک کردن جستجوی تیکت"
                onClick={() => setSearchQuery('')}
                className="absolute top-2 left-2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <span className="text-xs text-slate-500 tabular-nums">
            نمایش {toPersianDigits(filteredTickets.length)} از {toPersianDigits(tickets.length)} تیکت
          </span>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>ثبت تیکت جدید</span>
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Tickets Table */}
      <div className="rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">در حال بارگذاری تیکت‌ها...</div>
        ) : filteredTickets.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            تیکتی با این فیلتر یافت نشد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-4 py-3">شماره</th>
                  <th className="px-4 py-3">نام مشترک</th>
                  <th className="px-4 py-3">نوع و کد فنی</th>
                  <th className="px-4 py-3">آدرس</th>
                  <th className="px-4 py-3">نصاب</th>
                  <th className="px-4 py-3">تاریخ ثبت</th>
                  <th className="px-4 py-3">وضعیت</th>
                  <th className="px-4 py-3">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900 tabular-nums">
                      #{toPersianDigits(t.id)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{t.customer_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <div>{t.type === 'install' ? 'نصب فیبر' : 'رفع خرابی'}</div>
                      {(t.ffat_code || t.modem_serial) && (
                        <div dir="ltr" className="mt-0.5 text-right font-mono text-[11px] text-slate-400">
                          {[t.ffat_code, t.modem_serial].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-xs text-slate-600" title={t.address}>
                      {t.address}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {t.installer_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 tabular-nums">
                      {formatDateTimeToJalali(t.created_at)}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium">
                      {t.status === 'completed' ? (
                        <span className="text-emerald-700">تکمیل‌شده</span>
                      ) : t.status === 'assigned' ? (
                        <span className="text-amber-700">ارجاع‌شده</span>
                      ) : (
                        <span className="text-slate-600">در انتظار ارجاع</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {t.status !== 'completed' && canAssign && (
                          <button
                            type="button"
                            onClick={() => {
                              setAssignTicket(t);
                              setAssignInstallerId(t.assigned_installer ? String(t.assigned_installer) : '');
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            <span>{t.assigned_installer ? 'تغییر نصاب' : 'ارجاع'}</span>
                          </button>
                        )}
                        {t.status !== 'completed' && canExecute && (
                          <button
                            type="button"
                            onClick={() => onStartTicketService(t)}
                            className="inline-flex items-center gap-1 rounded-md bg-teal-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-700 whitespace-nowrap"
                          >
                            <Wrench className="h-3.5 w-3.5" />
                            <span>ثبت اجرا</span>
                          </button>
                        )}
                        {t.status === 'completed' && (
                          <button
                            type="button"
                            onClick={() => openRecordDetail(t.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>پرونده اجرا</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Ticket Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="ثبت تیکت جدید">
        <form onSubmit={handleCreateTicket} className="space-y-4">
          <div>
            <label htmlFor="t-customer" className="mb-1.5 block text-xs font-medium text-slate-700">
              نام مشترک / شرکت <span className="text-red-600">*</span>
            </label>
            <input
              id="t-customer"
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="مثال: مهندس آرش کریمی"
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-teal-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="t-type" className="mb-1.5 block text-xs font-medium text-slate-700">
              نوع درخواست <span className="text-red-600">*</span>
            </label>
            <select
              id="t-type"
              value={ticketType}
              onChange={(e) => setTicketType(e.target.value as 'install' | 'fault')}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-teal-600 focus:outline-none"
            >
              <option value="install">نصب جدید (FTTH Installation)</option>
              <option value="fault">رفع خرابی (Fault / Maintenance)</option>
            </select>
          </div>

          <div>
            <label htmlFor="t-address" className="mb-1.5 block text-xs font-medium text-slate-700">
              آدرس دقیق محل <span className="text-red-600">*</span>
            </label>
            <textarea
              id="t-address"
              required
              rows={3}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="منطقه، خیابان، پلاک، طبقه و واحد..."
              className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-teal-600 focus:outline-none"
            />
          </div>

          {canAssign && (
            <SearchableSelect
              label="ارجاع همزمان به نصاب (اختیاری)"
              options={installerOptions}
              value={createInstallerId}
              onChange={setCreateInstallerId}
              placeholder="در انتظار ارجاع بماند یا نصاب انتخاب کنید..."
            />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-60"
            >
              {submitting ? 'در حال ثبت...' : 'ذخیره تیکت'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Assign Installer Modal */}
      <Modal
        open={Boolean(assignTicket)}
        onClose={() => setAssignTicket(null)}
        title={assignTicket ? `ارجاع تیکت #${toPersianDigits(assignTicket.id)}` : 'ارجاع تیکت'}
      >
        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <p className="text-xs text-slate-600">
            مشترک: <span className="font-semibold text-slate-900">{assignTicket?.customer_name}</span>
          </p>
          <SearchableSelect
            label="انتخاب نصاب مسئول"
            required
            options={installerOptions}
            value={assignInstallerId}
            onChange={setAssignInstallerId}
            placeholder="جستجوی نام نصاب..."
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAssignTicket(null)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={submitting || !assignInstallerId}
              className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-60"
            >
              تایید ارجاع
            </button>
          </div>
        </form>
      </Modal>

      {/* Completed Service Record Modal */}
      <Modal
        open={detailLoading || Boolean(detailRecord)}
        onClose={() => {
          setDetailLoading(false);
          setDetailRecord(null);
        }}
        title={
          detailRecord
            ? `پرونده عملیات تیکت #${toPersianDigits(detailRecord.ticket_id)}`
            : 'در حال بارگذاری پرونده...'
        }
        maxWidthClass="max-w-2xl"
      >
        {detailLoading ? (
          <div className="py-8 text-center text-sm text-slate-400">در حال دریافت اطلاعات...</div>
        ) : detailRecord ? (
          <div className="space-y-5 text-xs">
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
              <div>
                <div className="text-slate-500">مشترک</div>
                <div className="mt-1 font-semibold text-slate-900">{detailRecord.customer_name}</div>
              </div>
              <div>
                <div className="text-slate-500">نصاب مجری</div>
                <div className="mt-1 font-semibold text-slate-900">{detailRecord.installer_name}</div>
              </div>
              <div>
                <div className="text-slate-500">تاریخ اجرا (شمسی)</div>
                <div className="mt-1 font-semibold text-slate-900 tabular-nums">
                  {detailRecord.service_date_jalali || formatDateTimeToJalali(detailRecord.created_at)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">زنجیره تجهیزات</div>
                <div className="mt-1 font-medium text-slate-900 tabular-nums">
                  {detailRecord.kaf_name} / {detailRecord.olt_name} / FAT {toPersianDigits(detailRecord.fat_number)} / {detailRecord.ffat_code}
                </div>
              </div>
              <div>
                <div className="text-slate-500">سریال مودم</div>
                <div dir="ltr" className="mt-1 text-right font-mono font-medium text-slate-900">
                  {detailRecord.modem_serial}
                </div>
              </div>
              <div>
                <div className="text-slate-500">مصرف کابل</div>
                <div className="mt-1 font-medium text-slate-900 tabular-nums">
                  بیرونی: {toPersianDigits(detailRecord.out_total_meter)}م ({detailRecord.out_spool_code || '—'}) · داخلی: {toPersianDigits(detailRecord.in_total_meter)}م ({detailRecord.in_spool_code || '—'})
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <div className="mb-2 font-semibold text-slate-900">اسنپ‌شات محاسبه تعرفه (تغییرناپذیر)</div>
              <div className="grid grid-cols-2 gap-2 text-slate-600 sm:grid-cols-4">
                <div>
                  نوع تعرفه:{' '}
                  <span className="font-medium text-slate-900">
                    {detailRecord.price_snapshot.calc_type === 'fixed'
                      ? 'ثابت'
                      : detailRecord.price_snapshot.calc_type === 'per_meter'
                        ? 'متراژی'
                        : 'ترکیبی (Hybrid)'}
                  </span>
                </div>
                <div className="tabular-nums">
                  مبلغ پایه: {formatToman(detailRecord.price_snapshot.base_price)}
                </div>
                <div className="tabular-nums">
                  مازاد متراژ ({toPersianDigits(detailRecord.price_snapshot.billable_extra_meter)}م):{' '}
                  {formatToman(detailRecord.price_snapshot.extra_meter_fee)}
                </div>
                <div className="font-bold text-teal-700 tabular-nums">
                  جمع دستمزد: {formatToman(detailRecord.price_snapshot.total_earned)}
                </div>
              </div>
            </div>

            {detailRecord.notes && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-700">
                توضیحات فنی: {detailRecord.notes}
              </div>
            )}

            <div>
              <div className="mb-2 font-semibold text-slate-900">مستندات تصویری فشرده‌شده</div>
              {detailRecord.images.length === 0 ? (
                <div className="text-slate-400">تصویری برای این پرونده ثبت نشده است.</div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {detailRecord.images.map((img) => (
                    <div key={img.id} className="overflow-hidden rounded-lg border border-slate-200">
                      <img
                        src={img.file_path}
                        alt={img.image_type}
                        referrerPolicy="no-referrer"
                        className="h-32 w-full object-cover"
                      />
                      <div className="bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-700">
                        {img.image_type}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
