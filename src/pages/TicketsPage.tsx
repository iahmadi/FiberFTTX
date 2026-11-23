import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Clock,
  FileText,
  MapPin,
  MessageSquare,
  Play,
  Plus,
  Search,
  Send,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { JalaliDatePicker } from '../components/JalaliDatePicker';
import { Modal } from '../components/Modal';
import { ProvisioningConfigBox } from '../components/ProvisioningConfigBox';
import { ServiceRecordPdfReport } from '../components/ServiceRecordPdfReport';
import {
  TICKET_TYPES,
  TICKET_TYPE_LABELS,
  getTicketTypeFieldVisibility,
  type TicketStatus,
  type TicketTypeKey,
} from '../lib/fiberLogic';
import { formatIsoToJalaliDisplay, isoToJalaliYmd, toPersianDigits } from '../lib/jalali';
import { queueOfflineMutation } from '../lib/offlineDb';
import { userHasPermission } from '../lib/permissions';
import type { AuthUser, ServiceRecordDetail, TicketCommentItem, TicketItem } from '../types/erp';
import { apiFetch } from '../utils/api';

interface InstallerRef {
  id: number;
  full_name: string;
  username: string;
  role_name: string;
}

interface TicketsPageProps {
  user: AuthUser;
  tickets: TicketItem[];
  installers: InstallerRef[];
  isOnline: boolean;
  initialFocusTicketId?: number | null;
  onRefresh: () => Promise<void>;
  onOpenServiceForm: (ticketId: number) => void;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, desc?: string) => void;
  onOutboxChanged: () => Promise<void>;
}

const STATUS_LABELS: Record<TicketStatus, string> = {
  pending: 'در انتظار اجرا',
  in_progress: 'در حال اجرا',
  completed: 'تکمیل شده',
  failed: 'ناموفق',
};

const STATUS_STYLE: Record<TicketStatus, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-900',
  in_progress: 'border-sky-200 bg-sky-50 text-sky-900',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  failed: 'border-red-200 bg-red-50 text-red-900',
};

export function TicketsPage({
  user,
  tickets,
  installers,
  isOnline,
  initialFocusTicketId,
  onRefresh,
  onOpenServiceForm,
  onNotify,
  onOutboxChanged,
}: TicketsPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Create Ticket modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [newType, setNewType] = useState<TicketTypeKey>('internet_install');
  const [newCustomer, setNewCustomer] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newPppoeUser, setNewPppoeUser] = useState('');
  const [newPppoePass, setNewPppoePass] = useState('');
  const [newVlanId, setNewVlanId] = useState('');
  const [newVoipConfig, setNewVoipConfig] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newInstallerId, setNewInstallerId] = useState('');
  const [newScheduleDate, setNewScheduleDate] = useState('');
  const [newScheduleTime, setNewScheduleTime] = useState('10:00');
  const [submitting, setSubmitting] = useState(false);

  // Assign modal
  const [assignTicket, setAssignTicket] = useState<TicketItem | null>(null);
  const [assignInstallerId, setAssignInstallerId] = useState('');
  const [assignDate, setAssignDate] = useState('');
  const [assignTime, setAssignTime] = useState('10:00');

  // Detail & Immutable comments drawer/modal
  const [detailTicket, setDetailTicket] = useState<TicketItem | null>(null);
  const [comments, setComments] = useState<TicketCommentItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');

  // Service Record PDF modal
  const [pdfRecord, setPdfRecord] = useState<ServiceRecordDetail | null>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

  const canCreate = userHasPermission(user, 'can_create_tickets');
  const canAssign = userHasPermission(user, 'can_assign_tickets');
  const canExecute = userHasPermission(user, 'can_execute_service');

  const visibility = getTicketTypeFieldVisibility(newType);

  // Instant real-time search by customer_name or address
  const filteredTickets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tickets.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        t.customer_name.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q) ||
        String(t.id).includes(q)
      );
    });
  }, [tickets, searchQuery, typeFilter, statusFilter]);

  const openTicketDetail = async (ticket: TicketItem) => {
    setDetailTicket(ticket);
    setComments([]);
    setCommentsLoading(true);
    try {
      const res = await apiFetch<{ comments: TicketCommentItem[] }>(
        `/api/tickets/${ticket.id}/comments`,
      );
      setComments(res.comments);
    } catch {
      // Offline fallback: comments empty if uncached
    } finally {
      setCommentsLoading(false);
    }
  };

  useEffect(() => {
    if (initialFocusTicketId) {
      const found = tickets.find((t) => t.id === initialFocusTicketId);
      if (found) {
        void openTicketDetail(found);
      }
    }
  }, [initialFocusTicketId]);

  const handleCreateTicket = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          type: newType,
          customer_name: newCustomer,
          address: newAddress,
          pppoe_user: visibility.showPppoeVlan ? newPppoeUser : null,
          pppoe_pass: visibility.showPppoeVlan ? newPppoePass : null,
          vlan_id: visibility.showPppoeVlan ? newVlanId : null,
          voip_config: visibility.showVoip ? newVoipConfig : null,
          operator_notes: newNotes,
          assigned_installer: newInstallerId ? Number(newInstallerId) : null,
          scheduled_date: newScheduleDate || null,
          scheduled_time: newScheduleTime || null,
        }),
      });
      onNotify('success', 'تیکت جدید با موفقیت ثبت شد');
      setCreateOpen(false);
      setNewCustomer('');
      setNewAddress('');
      setNewPppoeUser('');
      setNewPppoePass('');
      setNewVlanId('');
      setNewVoipConfig('');
      setNewNotes('');
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در ثبت تیکت', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!assignTicket) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/tickets/${assignTicket.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({
          assigned_installer: assignInstallerId ? Number(assignInstallerId) : null,
          scheduled_date: assignDate || null,
          scheduled_time: assignTime || null,
        }),
      });
      onNotify('success', `تیکت #${toPersianDigits(assignTicket.id)} ارجاع و زمان‌بندی شد`);
      setAssignTicket(null);
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در ارجاع تیکت', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartTicket = async (ticket: TicketItem) => {
    if (!isOnline) {
      await queueOfflineMutation({
        kind: 'ticket_start',
        ticketId: ticket.id,
        payload: {},
      });
      await onOutboxChanged();
      onNotify(
        'info',
        'شروع عملیات در صف آفلاین ذخیره شد',
        'پس از اتصال به شبکه به صورت خودکار ارسال می‌شود.',
      );
      return;
    }

    try {
      await apiFetch(`/api/tickets/${ticket.id}/start`, { method: 'POST', body: '{}' });
      onNotify('success', `عملیات تیکت #${toPersianDigits(ticket.id)} آغاز شد (SLA ثبت گردید)`);
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در شروع عملیات', err instanceof Error ? err.message : undefined);
    }
  };

  const handleAddComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!detailTicket || !newCommentText.trim()) return;

    if (!isOnline) {
      await queueOfflineMutation({
        kind: 'ticket_comment',
        ticketId: detailTicket.id,
        payload: { comment: newCommentText.trim() },
      });
      await onOutboxChanged();
      setComments((prev) => [
        ...prev,
        {
          id: Date.now(),
          ticket_id: detailTicket.id,
          user_id: user.id,
          user_full_name: user.full_name,
          user_role_name: `${user.role_name} (در صف همگام‌سازی)`,
          comment: newCommentText.trim(),
          created_at: new Date().toISOString(),
        },
      ]);
      setNewCommentText('');
      onNotify('info', 'یادداشت در حافظه آفلاین ذخیره شد');
      return;
    }

    try {
      const res = await apiFetch<{ comment: TicketCommentItem }>(
        `/api/tickets/${detailTicket.id}/comments`,
        {
          method: 'POST',
          body: JSON.stringify({ comment: newCommentText.trim() }),
        },
      );
      setComments((prev) => [...prev, res.comment]);
      setNewCommentText('');
    } catch (err) {
      onNotify('error', 'خطا در ثبت نظر', err instanceof Error ? err.message : undefined);
    }
  };

  const handleOpenPdfReport = async (ticketId: number) => {
    try {
      const res = await apiFetch<{ record: ServiceRecordDetail }>(
        `/api/tickets/${ticketId}/service-record`,
      );
      setPdfRecord(res.record);
      setPdfModalOpen(true);
    } catch (err) {
      onNotify(
        'error',
        'گزارش تکمیل عملیات یافت نشد',
        err instanceof Error ? err.message : undefined,
      );
    }
  };

  return (
    <div className="space-y-5">
      {/* Search + Filters + Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجوی لحظه‌ای بر اساس نام مشترک یا آدرس..."
              className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white pr-9 pl-3 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800"
          >
            <option value="all">همه انواع ۵گانه</option>
            {TICKET_TYPES.map((t) => (
              <option key={t} value={t}>
                {TICKET_TYPE_LABELS[t]}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800"
          >
            <option value="all">همه وضعیت‌ها</option>
            <option value="pending">در انتظار اجرا</option>
            <option value="in_progress">در حال اجرا</option>
            <option value="completed">تکمیل شده</option>
            <option value="failed">ناموفق</option>
          </select>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800"
          >
            <Plus className="h-4 w-4" />
            <span>ثبت تیکت جدید</span>
          </button>
        )}
      </div>

      {/* Tickets List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredTickets.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            هیچ تیکتی مطابق فیلترهای فعلی یافت نشد.
          </div>
        ) : (
          filteredTickets.map((ticket) => (
            <div
              key={ticket.id}
              data-ticket-id={ticket.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-colors hover:border-slate-300"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold tabular-nums text-slate-900">
                      #{toPersianDigits(ticket.id)} — {ticket.customer_name}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {TICKET_TYPE_LABELS[ticket.type]}
                    </span>
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                        STATUS_STYLE[ticket.status]
                      }`}
                    >
                      {STATUS_LABELS[ticket.status]}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span>{ticket.address}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11px] text-slate-500">
                    <span>
                      نصاب مسئول:{' '}
                      <strong className="text-slate-700">
                        {ticket.installer_name || 'تخصیص نیافته'}
                      </strong>
                    </span>
                    {ticket.scheduled_date && (
                      <span className="tabular-nums">
                        زمان‌بندی:{' '}
                        <strong className="text-slate-700">
                          {toPersianDigits(isoToJalaliYmd(ticket.scheduled_date))}{' '}
                          {ticket.scheduled_time ? `ساعت ${toPersianDigits(ticket.scheduled_time)}` : ''}
                        </strong>
                      </span>
                    )}
                    {ticket.started_at && (
                      <span className="inline-flex items-center gap-1 tabular-nums text-sky-700">
                        <Clock className="h-3 w-3" />
                        شروع: {formatIsoToJalaliDisplay(ticket.started_at)}
                      </span>
                    )}
                    {ticket.completed_at && (
                      <span className="tabular-nums text-emerald-700">
                        تکمیل: {formatIsoToJalaliDisplay(ticket.completed_at)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openTicketDetail(ticket)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>جزئیات و نظرات</span>
                  </button>

                  {canAssign && ticket.status !== 'completed' && (
                    <button
                      type="button"
                      onClick={() => {
                        setAssignTicket(ticket);
                        setAssignInstallerId(
                          ticket.assigned_installer ? String(ticket.assigned_installer) : '',
                        );
                        setAssignDate(ticket.scheduled_date || '');
                        setAssignTime(ticket.scheduled_time || '10:00');
                      }}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      <span>ارجاع</span>
                    </button>
                  )}

                  {canExecute && ticket.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => handleStartTicket(ticket)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>شروع عملیات</span>
                    </button>
                  )}

                  {canExecute && ticket.status !== 'completed' && (
                    <button
                      type="button"
                      onClick={() => onOpenServiceForm(ticket.id)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
                    >
                      <Wrench className="h-3.5 w-3.5" />
                      <span>فرم تکمیل عملیات</span>
                    </button>
                  )}

                  {ticket.status === 'completed' && (
                    <button
                      type="button"
                      onClick={() => handleOpenPdfReport(ticket.id)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>فاکتور و PDF گزارش</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create 5-Type Ticket Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="ثبت تیکت عملیاتی جدید (سیستم ۵گانه)"
        subtitle="فیلدهای شبکه بر اساس نوع تیکت به صورت خودکار نمایش داده می‌شوند"
      >
        <form onSubmit={handleCreateTicket} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">نوع تیکت</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as TicketTypeKey)}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              >
                {TICKET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TICKET_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">نام مشترک</label>
              <input
                type="text"
                required
                value={newCustomer}
                onChange={(e) => setNewCustomer(e.target.value)}
                placeholder="مثلاً شرکت فراز یا محمد حسینی"
                className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">آدرس دقیق</label>
            <input
              type="text"
              required
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder="خیابان، پلاک، واحد"
              className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </div>

          {visibility.showPppoeVlan && (
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  PPPoE Username
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={newPppoeUser}
                  onChange={(e) => setNewPppoeUser(e.target.value)}
                  placeholder="user@avafiber.ir"
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-left text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  PPPoE Password
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={newPppoePass}
                  onChange={(e) => setNewPppoePass(e.target.value)}
                  placeholder="Ava#1234"
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-left text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">VLAN ID</label>
                <input
                  type="text"
                  dir="ltr"
                  value={newVlanId}
                  onChange={(e) => setNewVlanId(e.target.value)}
                  placeholder="402"
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-left text-xs tabular-nums"
                />
              </div>
            </div>
          )}

          {visibility.showVoip && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                تنظیمات تلفن VoIP (SIP Proxy / DID / Password)
              </label>
              <input
                type="text"
                dir="ltr"
                value={newVoipConfig}
                onChange={(e) => setNewVoipConfig(e.target.value)}
                placeholder="SIP: 10.40.10.2 | DID: 02188901234"
                className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-left text-xs"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">ارجاع به نصاب</label>
              <select
                value={newInstallerId}
                onChange={(e) => setNewInstallerId(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs"
              >
                <option value="">بدون تخصیص فوری</option>
                {installers.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.full_name} ({inst.role_name})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                تاریخ زمان‌بندی (شمسی)
              </label>
              <JalaliDatePicker valueIso={newScheduleDate} onChangeIso={setNewScheduleDate} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">ساعت مراجعه</label>
              <input
                type="time"
                value={newScheduleTime}
                onChange={(e) => setNewScheduleTime(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">توضیحات اپراتور</label>
            <textarea
              rows={2}
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="min-h-[42px] rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[42px] rounded-lg bg-teal-700 px-5 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              ثبت تیکت
            </button>
          </div>
        </form>
      </Modal>

      {/* Assign / Schedule Modal */}
      <Modal
        open={Boolean(assignTicket)}
        onClose={() => setAssignTicket(null)}
        title={`ارجاع تیکت #${assignTicket ? toPersianDigits(assignTicket.id) : ''}`}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">انتخاب نصاب</label>
            <select
              value={assignInstallerId}
              onChange={(e) => setAssignInstallerId(e.target.value)}
              required
              className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">انتخاب کنید...</option>
              {installers.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">تاریخ مراجعه</label>
            <JalaliDatePicker valueIso={assignDate} onChangeIso={setAssignDate} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">ساعت</label>
            <input
              type="time"
              value={assignTime}
              onChange={(e) => setAssignTime(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[42px] rounded-lg bg-teal-700 px-5 text-xs font-bold text-white"
            >
              ذخیره ارجاع
            </button>
          </div>
        </form>
      </Modal>

      {/* Ticket Detail & Immutable Comments Timeline */}
      <Modal
        open={Boolean(detailTicket)}
        onClose={() => setDetailTicket(null)}
        title={
          detailTicket
            ? `پرونده تیکت #${toPersianDigits(detailTicket.id)} — ${detailTicket.customer_name}`
            : ''
        }
        subtitle={detailTicket ? TICKET_TYPE_LABELS[detailTicket.type] : undefined}
      >
        {detailTicket && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-3">
              <div>
                <span className="text-slate-500">ثبت / ارجاع: </span>
                <strong className="tabular-nums">
                  {formatIsoToJalaliDisplay(detailTicket.assigned_at || detailTicket.created_at)}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">شروع عملیات: </span>
                <strong className="tabular-nums">
                  {formatIsoToJalaliDisplay(detailTicket.started_at)}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">پایان عملیات: </span>
                <strong className="tabular-nums">
                  {formatIsoToJalaliDisplay(detailTicket.completed_at)}
                </strong>
              </div>
            </div>

            <ProvisioningConfigBox ticket={detailTicket} />

            <div>
              <div className="mb-2 text-xs font-bold text-slate-900">
                خط زمانی نظرات و گزارش‌ها (ثبت قطعی و غیرقابل ویرایش)
              </div>
              <div className="max-h-60 space-y-2.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                {commentsLoading ? (
                  <div className="text-xs text-slate-500">در حال بارگذاری...</div>
                ) : comments.length === 0 ? (
                  <div className="text-xs text-slate-500">هنوز نظری ثبت نشده است.</div>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-bold text-slate-900">
                          {c.user_full_name}{' '}
                          <span className="font-normal text-slate-500">({c.user_role_name})</span>
                        </span>
                        <span className="tabular-nums text-slate-400">
                          {formatIsoToJalaliDisplay(c.created_at)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs leading-5 text-slate-800">{c.comment}</p>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAddComment} className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="گزارش میدانی یا یادداشت غیرقابل ویرایش بنویسید..."
                  className="min-h-[42px] flex-1 rounded-lg border border-slate-300 px-3 text-xs focus:border-teal-700 focus:outline-none"
                />
                <button
                  type="submit"
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-teal-700 px-4 text-xs font-bold text-white hover:bg-teal-800"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>ثبت</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </Modal>

      {/* Printable PDF Invoice & Service Record */}
      <Modal
        open={pdfModalOpen}
        onClose={() => setPdfModalOpen(false)}
        title="فاکتور و صورت‌جلسه رسمی تکمیل عملیات"
        maxWidthClass="max-w-4xl"
      >
        {pdfRecord && <ServiceRecordPdfReport record={pdfRecord} />}
      </Modal>
    </div>
  );
}
