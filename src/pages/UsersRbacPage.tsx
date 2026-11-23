import { useState, type FormEvent } from 'react';
import { Check, Pencil, Plus, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react';
import { UserActivityLogTable } from '../components/UserActivityLogTable';
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
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRoleId, setNewRoleId] = useState('');

  // Custom role creation & editing states
  const [customRoleName, setCustomRoleName] = useState('');
  const [customRolePermIds, setCustomRolePermIds] = useState<number[]>([]);
  const [creatingRole, setCreatingRole] = useState(false);

  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
  const [editingRoleName, setEditingRoleName] = useState('');
  const [savingRoleEdit, setSavingRoleEdit] = useState(false);

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          username: newUsername,
          full_name: newFullName,
          password: newPassword,
          role_id: Number(newRoleId),
        }),
      });
      onNotify('success', `کاربر «${newFullName}» ایجاد شد`);
      setNewUsername('');
      setNewFullName('');
      setNewPassword('');
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در ایجاد کاربر', err instanceof Error ? err.message : undefined);
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
      {/* Users + Add Form */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
          <UserPlus className="h-5 w-5 text-teal-700" />
          <span>مدیریت کاربران و تخصیص سطح دسترسی</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2.5 font-bold">نام کامل</th>
                <th className="px-3 py-2.5 font-bold">نام کاربری</th>
                <th className="px-3 py-2.5 font-bold">سطح دسترسی (نقش)</th>
                <th className="px-3 py-2.5 font-bold">وضعیت</th>
                <th className="px-3 py-2.5 font-bold">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-3 py-2.5 font-semibold text-slate-900">{u.full_name}</td>
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
                    {u.username !== 'admin' && (
                      <button
                        type="button"
                        onClick={() => handleToggleActive(u)}
                        className="min-h-[34px] rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {u.is_active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form
          onSubmit={handleCreateUser}
          className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-5"
        >
          <input
            type="text"
            required
            dir="ltr"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="username"
            className="min-h-[42px] rounded-lg border border-slate-300 px-3 text-left text-xs"
          />
          <input
            type="text"
            required
            value={newFullName}
            onChange={(e) => setNewFullName(e.target.value)}
            placeholder="نام و نام خانوادگی"
            className="min-h-[42px] rounded-lg border border-slate-300 px-3 text-xs"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="رمز شبکه داخلی (اختیاری)"
            className="min-h-[42px] rounded-lg border border-slate-300 px-3 text-xs"
          />
          <select
            required
            value={newRoleId}
            onChange={(e) => setNewRoleId(e.target.value)}
            className="min-h-[42px] rounded-lg border border-slate-300 bg-white px-2 text-xs"
          >
            <option value="">انتخاب سطح دسترسی...</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="min-h-[42px] rounded-lg bg-teal-700 px-4 text-xs font-bold text-white hover:bg-teal-800"
          >
            افزودن کاربر
          </button>
        </form>
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
    </div>
  );
}
