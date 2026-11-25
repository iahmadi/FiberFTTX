import { useState, type FormEvent } from 'react';
import { Check, KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react';
import { Modal } from '../components/Modal';
import { UserActivityLogTable } from '../components/UserActivityLogTable';
import { validateUserProfileV3 } from '../lib/fiberLogic';
import { toPersianDigits } from '../lib/jalali';
import type { ActivityLogItem, PermissionDef, RoleWithPerms, UserAccountRow } from '../types/erp';
import { apiFetch } from '../utils/api';

interface UsersRbacPageProps {
  users: UserAccountRow[];
  roles: RoleWithPerms[];
  permissions: PermissionDef[];
  activityLogs: ActivityLogItem[];
  onRefresh: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, desc?: string) => void;
}

export function UsersRbacPage({
  users,
  roles,
  permissions,
  activityLogs,
  onRefresh,
  onNotify,
}: UsersRbacPageProps) {
  // HR Personnel Create / Edit Modal states
  const [hrModalOpen, setHrModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccountRow | null>(null);
  const [hrUsername, setHrUsername] = useState('');
  const [hrPassword, setHrPassword] = useState('');
  const [hrRoleId, setHrRoleId] = useState('');
  const [hrFirstName, setHrFirstName] = useState('');
  const [hrLastName, setHrLastName] = useState('');
  const [hrFatherName, setHrFatherName] = useState('');
  const [hrBirthDate, setHrBirthDate] = useState('');
  const [hrNationalCode, setHrNationalCode] = useState('');
  const [hrIdNumber, setHrIdNumber] = useState('');
  const [hrEmail, setHrEmail] = useState('');
  const [hrPhone1, setHrPhone1] = useState('');
  const [hrPhone2, setHrPhone2] = useState('');
  const [hrAddress, setHrAddress] = useState('');
  const [hrReferrer, setHrReferrer] = useState('');
  const [hrSaving, setHrSaving] = useState(false);

  // Custom role creation & editing states
  const [customRoleName, setCustomRoleName] = useState('');
  const [customRolePermIds, setCustomRolePermIds] = useState<number[]>([]);
  const [creatingRole, setCreatingRole] = useState(false);

  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
  const [editingRoleName, setEditingRoleName] = useState('');
  const [savingRoleEdit, setSavingRoleEdit] = useState(false);

  // Admin password reset modal state
  const [resetPwUser, setResetPwUser] = useState<UserAccountRow | null>(null);
  const [resetPwValue, setResetPwValue] = useState('');
  const [resetPwSaving, setResetPwSaving] = useState(false);

  const openCreateHrModal = () => {
    setEditingUser(null);
    setHrUsername('');
    setHrPassword('');
    setHrRoleId(roles[0] ? String(roles[0].id) : '');
    setHrFirstName('');
    setHrLastName('');
    setHrFatherName('');
    setHrBirthDate('');
    setHrNationalCode('');
    setHrIdNumber('');
    setHrEmail('');
    setHrPhone1('');
    setHrPhone2('');
    setHrAddress('');
    setHrReferrer('');
    setHrModalOpen(true);
  };

  const openEditHrModal = (u: UserAccountRow) => {
    setEditingUser(u);
    setHrUsername(u.username);
    setHrPassword('');
    setHrRoleId(String(u.role_id));
    setHrFirstName(u.first_name || '');
    setHrLastName(u.last_name || '');
    setHrFatherName(u.father_name || '');
    setHrBirthDate(u.birth_date || '');
    setHrNationalCode(u.national_code || '');
    setHrIdNumber(u.id_number || '');
    setHrEmail(u.email || '');
    setHrPhone1(u.phone_1 || '');
    setHrPhone2(u.phone_2 || '');
    setHrAddress(u.address || '');
    setHrReferrer(u.referrer || '');
    setHrModalOpen(true);
  };

  const handleSaveHrUser = async (e: FormEvent) => {
    e.preventDefault();
    const check = validateUserProfileV3({
      first_name: hrFirstName,
      last_name: hrLastName,
      father_name: hrFatherName,
      birth_date: hrBirthDate,
      national_code: hrNationalCode,
      id_number: hrIdNumber,
      email: hrEmail,
      phone_1: hrPhone1,
      phone_2: hrPhone2 || null,
      address: hrAddress,
      referrer: hrReferrer || null,
    });
    if (!check.ok) {
      onNotify('warning', check.error || 'اطلاعات پرسنلی کامل نیست');
      return;
    }
    if (hrPassword && hrPassword.length < 6) {
      onNotify('warning', 'رمز عبور باید حداقل ۶ کاراکتر باشد');
      return;
    }

    setHrSaving(true);
    try {
      if (editingUser) {
        await apiFetch(`/api/users/${editingUser.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...check.normalized,
            role_id: editingUser.username === 'admin' ? undefined : Number(hrRoleId),
            password: hrPassword.trim() ? hrPassword : undefined,
          }),
        });
        onNotify('success', `پرونده پرسنلی «${check.fullName}» بروزرسانی شد`);
      } else {
        if (!hrUsername.trim() || !hrRoleId) {
          onNotify('warning', 'نام کاربری و نقش دسترسی الزامی است');
          setHrSaving(false);
          return;
        }
        await apiFetch('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            username: hrUsername.trim(),
            password: hrPassword.trim(),
            role_id: Number(hrRoleId),
            ...check.normalized,
          }),
        });
        onNotify('success', `پرسنل جدید «${check.fullName}» ثبت شد`);
      }
      setHrModalOpen(false);
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در ذخیره پرونده پرسنل', err instanceof Error ? err.message : undefined);
    } finally {
      setHrSaving(false);
    }
  };

  const handleDeleteUser = async (u: UserAccountRow) => {
    if (u.username === 'admin') return;
    try {
      await apiFetch(`/api/users/${u.id}`, { method: 'DELETE' });
      onNotify('success', `حساب کاربری «${u.full_name}» حذف شد`);
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در حذف کاربر', err instanceof Error ? err.message : undefined);
    }
  };

  const handleToggleActive = async (u: UserAccountRow) => {
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      onNotify('success', `وضعیت حساب «${u.full_name}» تغییر یافت`);
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در تغییر وضعیت کاربر', err instanceof Error ? err.message : undefined);
    }
  };

  const handleChangeUserRole = async (u: UserAccountRow, nextRoleId: number) => {
    if (!nextRoleId || nextRoleId === u.role_id) return;
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role_id: nextRoleId }),
      });
      const roleName = roles.find((r) => r.id === nextRoleId)?.name || '';
      onNotify('success', `نقش «${u.full_name}» به «${roleName}» تغییر یافت`);
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در تغییر نقش کاربر', err instanceof Error ? err.message : undefined);
    }
  };

  const handleResetUserPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetPwUser) return;
    if (resetPwValue.length < 6) {
      onNotify('warning', 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد');
      return;
    }
    setResetPwSaving(true);
    try {
      await apiFetch(`/api/users/${resetPwUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ password: resetPwValue }),
      });
      onNotify('success', `رمز عبور کاربر «${resetPwUser.full_name}» بازنشانی شد`);
      setResetPwUser(null);
      setResetPwValue('');
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در بازنشانی رمز عبور', err instanceof Error ? err.message : undefined);
    } finally {
      setResetPwSaving(false);
    }
  };

  const handleToggleNewRolePerm = (permId: number) => {
    setCustomRolePermIds((prev) =>
      prev.includes(permId) ? prev.filter((id) => id !== permId) : [...prev, permId],
    );
  };

  const handleCreateRole = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = customRoleName.trim();
    if (trimmed.length < 2) {
      onNotify('warning', 'نام سطح دسترسی باید حداقل ۲ کاراکتر باشد');
      return;
    }
    setCreatingRole(true);
    try {
      await apiFetch('/api/roles', {
        method: 'POST',
        body: JSON.stringify({
          name: trimmed,
          permissionIds: customRolePermIds,
        }),
      });
      onNotify(
        'success',
        `سطح دسترسی جدید «${trimmed}» ایجاد شد`,
        `${toPersianDigits(customRolePermIds.length)} مجوز برای این سطح دسترسی فعال گردید.`,
      );
      setCustomRoleName('');
      setCustomRolePermIds([]);
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در ایجاد سطح دسترسی', err instanceof Error ? err.message : undefined);
    } finally {
      setCreatingRole(false);
    }
  };

  const handleSaveRoleRename = async (roleId: number) => {
    const trimmed = editingRoleName.trim();
    if (trimmed.length < 2) {
      onNotify('warning', 'نام سطح دسترسی باید حداقل ۲ کاراکتر باشد');
      return;
    }
    setSavingRoleEdit(true);
    try {
      await apiFetch(`/api/roles/${roleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: trimmed }),
      });
      onNotify('success', `نام سطح دسترسی به «${trimmed}» تغییر یافت`);
      setEditingRoleId(null);
      setEditingRoleName('');
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در ویرایش نام سطح دسترسی', err instanceof Error ? err.message : undefined);
    } finally {
      setSavingRoleEdit(false);
    }
  };

  const handleDeleteRole = async (role: RoleWithPerms) => {
    if (role.name === 'SuperAdmin') return;
    try {
      await apiFetch(`/api/roles/${role.id}`, { method: 'DELETE' });
      onNotify('success', `سطح دسترسی «${role.name}» حذف شد`);
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در حذف سطح دسترسی', err instanceof Error ? err.message : undefined);
    }
  };

  const handleToggleRolePermission = async (role: RoleWithPerms, permId: number) => {
    if (role.name === 'SuperAdmin') return;
    const exists = role.permissionIds.includes(permId);
    const nextIds = exists
      ? role.permissionIds.filter((id) => id !== permId)
      : [...role.permissionIds, permId];
    try {
      await apiFetch(`/api/roles/${role.id}/permissions`, {
        method: 'POST',
        body: JSON.stringify({ permissionIds: nextIds }),
      });
      onNotify('success', `مجوزهای نقش «${role.name}» بروزرسانی شد`);
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در ویرایش ماتریس RBAC', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-6">
      {/* Users + Add HR Personnel Button */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <UserPlus className="h-5 w-5 text-teal-700" />
            <span>مدیریت پرونده پرسنلی و تخصیص سطح دسترسی</span>
          </div>
          <button
            type="button"
            onClick={openCreateHrModal}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-700 px-4 text-xs font-bold text-white hover:bg-teal-800"
          >
            <Plus className="h-4 w-4" />
            <span>افزودن پرسنل جدید</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2.5 font-bold">نام و مشخصات هویتی</th>
                <th className="px-3 py-2.5 font-bold">تماس و ایمیل</th>
                <th className="px-3 py-2.5 font-bold">نام کاربری</th>
                <th className="px-3 py-2.5 font-bold">سطح دسترسی (نقش)</th>
                <th className="px-3 py-2.5 font-bold">وضعیت</th>
                <th className="px-3 py-2.5 font-bold">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-slate-900">{u.full_name}</div>
                    <div className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                      کد ملی: {toPersianDigits(u.national_code || '—')} | پدر:{' '}
                      {u.father_name || '—'}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div dir="ltr" className="text-right font-mono tabular-nums text-slate-800">
                      {u.phone_1 || '—'}
                    </div>
                    {u.email && (
                      <div dir="ltr" className="text-right text-[11px] text-slate-400">
                        {u.email}
                      </div>
                    )}
                  </td>
                  <td dir="ltr" className="px-3 py-2.5 text-right font-mono text-slate-600">
                    {u.username}
                  </td>
                  <td className="px-3 py-2.5">
                    {u.username === 'admin' ? (
                      <span className="font-bold text-teal-800">{u.role_name}</span>
                    ) : (
                      <select
                        aria-label={`سطح دسترسی ${u.full_name}`}
                        value={u.role_id}
                        onChange={(e) => void handleChangeUserRole(u, Number(e.target.value))}
                        className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-teal-900 focus:border-teal-700 focus:outline-none"
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`font-bold ${u.is_active ? 'text-emerald-700' : 'text-red-600'}`}
                    >
                      {u.is_active ? 'فعال' : 'غیرفعال'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditHrModal(u)}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Pencil className="h-3 w-3 text-teal-700" />
                        <span>ویرایش مشخصات</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setResetPwUser(u);
                          setResetPwValue('');
                        }}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <KeyRound className="h-3 w-3 text-teal-700" />
                        <span>تغییر رمز</span>
                      </button>
                      {u.username !== 'admin' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(u)}
                            className="min-h-[34px] rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            {u.is_active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteUser(u)}
                            aria-label={`حذف ${u.full_name}`}
                            title="حذف حساب کاربری"
                            className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Custom Access Level + Granular RBAC Matrix */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <ShieldCheck className="h-5 w-5 text-teal-700" />
            <span>ایجاد، ویرایش و ماتریس سطوح دسترسی (RBAC)</span>
          </div>
          <span className="text-[11px] font-medium text-slate-500">
            {toPersianDigits(roles.length)} سطح دسترسی فعال در سیستم
          </span>
        </div>

        {/* Create Custom Role Form */}
        <form
          onSubmit={handleCreateRole}
          className="mb-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4"
        >
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <label
                htmlFor="custom-role-name"
                className="mb-1 block text-xs font-bold text-slate-800"
              >
                ایجاد سطح دسترسی جدید با نام انتخابی
              </label>
              <input
                id="custom-role-name"
                type="text"
                required
                minLength={2}
                maxLength={60}
                value={customRoleName}
                onChange={(e) => setCustomRoleName(e.target.value)}
                placeholder="مثلاً: سرپرست منطقه‌ای، ناظر مالی یا بازرس کیفیت"
                className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={creatingRole}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-teal-700 px-4 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              <span>ایجاد سطح دسترسی</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {permissions.map((perm) => {
              const selected = customRolePermIds.includes(perm.id);
              return (
                <label
                  key={perm.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
                    selected
                      ? 'border-teal-300 bg-teal-50/80 text-teal-950'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => handleToggleNewRolePerm(perm.id)}
                    className="h-4 w-4 accent-teal-700"
                  />
                  <span className="font-medium">{perm.descr}</span>
                </label>
              );
            })}
          </div>
        </form>

        {/* RBAC Matrix Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2.5 font-bold">کلید مجوز و شرح عملیات حساس</th>
                {roles.map((r) => {
                  const assignedCount = users.filter((u) => u.role_id === r.id).length;
                  const isEditing = editingRoleId === r.id;
                  return (
                    <th key={r.id} className="min-w-[140px] px-3 py-2.5 text-center font-bold">
                      {isEditing ? (
                        <div className="flex flex-col items-center gap-1.5">
                          <input
                            type="text"
                            aria-label={`نام جدید برای ${r.name}`}
                            value={editingRoleName}
                            onChange={(e) => setEditingRoleName(e.target.value)}
                            className="min-h-[34px] w-full min-w-[120px] rounded-md border border-teal-500 bg-white px-2 text-center text-xs font-bold text-slate-900 focus:outline-none"
                          />
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={savingRoleEdit}
                              onClick={() => void handleSaveRoleRename(r.id)}
                              aria-label={`ذخیره نام ${r.name}`}
                              className="inline-flex h-7 items-center gap-1 rounded-md bg-teal-700 px-2 text-[11px] font-bold text-white hover:bg-teal-800"
                            >
                              <Check className="h-3 w-3" />
                              <span>ذخیره</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRoleId(null);
                                setEditingRoleName('');
                              }}
                              aria-label="انصراف از ویرایش نام"
                              className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-slate-900">{r.name}</span>
                            {r.name !== 'SuperAdmin' && (
                              <>
                                <button
                                  type="button"
                                  aria-label={`ویرایش نام ${r.name}`}
                                  onClick={() => {
                                    setEditingRoleId(r.id);
                                    setEditingRoleName(r.name);
                                  }}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                                  title="ویرایش نام سطح دسترسی"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  disabled={assignedCount > 0}
                                  aria-label={`حذف ${r.name}`}
                                  onClick={() => void handleDeleteRole(r)}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                                  title={
                                    assignedCount > 0
                                      ? 'ابتدا کاربران این نقش را تغییر دهید'
                                      : 'حذف سطح دسترسی'
                                  }
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </div>
                          <span className="text-[10px] font-normal text-slate-400 tabular-nums">
                            {r.name === 'SuperAdmin'
                              ? 'دسترسی کامل سیستمی'
                              : `${toPersianDigits(assignedCount)} کاربر`}
                          </span>
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {permissions.map((perm) => (
                <tr key={perm.id}>
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-slate-900">{perm.descr}</div>
                    <div dir="ltr" className="text-right font-mono text-[11px] text-slate-400">
                      {perm.key_name}
                    </div>
                  </td>
                  {roles.map((role) => {
                    const checked =
                      role.name === 'SuperAdmin' || role.permissionIds.includes(perm.id);
                    return (
                      <td key={role.id} className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${perm.descr} برای ${role.name}`}
                          checked={checked}
                          disabled={role.name === 'SuperAdmin'}
                          onChange={() => handleToggleRolePermission(role, perm.id)}
                          className="h-4 w-4 cursor-pointer accent-teal-700 disabled:cursor-not-allowed"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Activity Log */}
      <UserActivityLogTable logs={activityLogs} />

      {/* Create / Edit Personnel HR Modal */}
      <Modal
        open={hrModalOpen}
        onClose={() => setHrModalOpen(false)}
        title={editingUser ? `ویرایش پرونده پرسنلی «${editingUser.full_name}»` : 'ثبت پرسنل جدید'}
        subtitle="کلیه مشخصات هویتی، تماس و نشانی پرسنل در شبکه ثبت می‌شود."
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleSaveHrUser} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">نام کاربری *</label>
              <input
                type="text"
                dir="ltr"
                required
                disabled={Boolean(editingUser)}
                value={hrUsername}
                onChange={(e) => setHrUsername(e.target.value)}
                placeholder="username"
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-left text-xs disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">نام *</label>
              <input
                type="text"
                required
                value={hrFirstName}
                onChange={(e) => setHrFirstName(e.target.value)}
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">نام خانوادگی *</label>
              <input
                type="text"
                required
                value={hrLastName}
                onChange={(e) => setHrLastName(e.target.value)}
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-xs"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">نام پدر *</label>
              <input
                type="text"
                required
                value={hrFatherName}
                onChange={(e) => setHrFatherName(e.target.value)}
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                تاریخ تولد (شمسی) *
              </label>
              <input
                type="text"
                dir="ltr"
                required
                value={hrBirthDate}
                onChange={(e) => setHrBirthDate(e.target.value)}
                placeholder="1370/05/12"
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-left text-xs tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                کد ملی (۱۰ رقم) *
              </label>
              <input
                type="text"
                dir="ltr"
                required
                maxLength={10}
                value={hrNationalCode}
                onChange={(e) => setHrNationalCode(e.target.value.replace(/\D/g, ''))}
                placeholder="0012345678"
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-left text-xs tabular-nums"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                شماره شناسنامه *
              </label>
              <input
                type="text"
                dir="ltr"
                required
                value={hrIdNumber}
                onChange={(e) => setHrIdNumber(e.target.value)}
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-left text-xs tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">ایمیل *</label>
              <input
                type="email"
                dir="ltr"
                required
                value={hrEmail}
                onChange={(e) => setHrEmail(e.target.value)}
                placeholder="staff@avanet.ir"
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-left text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                شماره تماس ۱ (۱۱ رقم با ۰) *
              </label>
              <input
                type="text"
                dir="ltr"
                required
                maxLength={11}
                value={hrPhone1}
                onChange={(e) => setHrPhone1(e.target.value.replace(/\D/g, ''))}
                placeholder="09121234567"
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-left text-xs tabular-nums"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                شماره تماس ۲ (اختیاری)
              </label>
              <input
                type="text"
                dir="ltr"
                maxLength={11}
                value={hrPhone2}
                onChange={(e) => setHrPhone2(e.target.value.replace(/\D/g, ''))}
                placeholder="02188001122"
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-left text-xs tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">معرف (اختیاری)</label>
              <input
                type="text"
                value={hrReferrer}
                onChange={(e) => setHrReferrer(e.target.value)}
                placeholder="نام معرف یا واحد ارجاع"
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                سطح دسترسی (نقش) *
              </label>
              <select
                required
                disabled={editingUser?.username === 'admin'}
                value={hrRoleId}
                onChange={(e) => setHrRoleId(e.target.value)}
                className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2 text-xs disabled:bg-slate-100"
              >
                <option value="">انتخاب نقش...</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                نشانی دقیق محل سکونت *
              </label>
              <input
                type="text"
                required
                value={hrAddress}
                onChange={(e) => setHrAddress(e.target.value)}
                placeholder="استان، شهر، خیابان، پلاک..."
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                {editingUser ? 'رمز جدید (در صورت تغییر)' : 'رمز شبکه داخلی (اختیاری)'}
              </label>
              <input
                type="password"
                dir="ltr"
                value={hrPassword}
                onChange={(e) => setHrPassword(e.target.value)}
                placeholder="حداقل ۶ کاراکتر"
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-left text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setHrModalOpen(false)}
              className="min-h-[40px] rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={hrSaving}
              className="min-h-[40px] rounded-lg bg-teal-700 px-5 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {hrSaving ? 'در حال ثبت...' : editingUser ? 'ذخیره تغییرات پرسنل' : 'ثبت پرسنل جدید'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Admin Password Reset Modal */}
      <Modal
        open={Boolean(resetPwUser)}
        onClose={() => {
          setResetPwUser(null);
          setResetPwValue('');
        }}
        title={resetPwUser ? `تغییر رمز عبور «${resetPwUser.full_name}»` : ''}
        subtitle={resetPwUser ? `نام کاربری: ${resetPwUser.username}` : undefined}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleResetUserPassword} className="space-y-4">
          <div>
            <label
              htmlFor="admin-reset-user-pw"
              className="mb-1 block text-xs font-semibold text-slate-700"
            >
              رمز عبور جدید (حداقل ۶ کاراکتر)
            </label>
            <input
              id="admin-reset-user-pw"
              type="password"
              required
              minLength={6}
              dir="ltr"
              value={resetPwValue}
              onChange={(e) => setResetPwValue(e.target.value)}
              placeholder="رمز عبور جدید..."
              className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 text-left text-sm focus:border-teal-700 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => {
                setResetPwUser(null);
                setResetPwValue('');
              }}
              className="min-h-[40px] rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={resetPwSaving}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-700 px-5 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>{resetPwSaving ? 'در حال ثبت...' : 'ذخیره رمز جدید'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

