import { useState, type FormEvent } from 'react';
import { ShieldCheck, UserPlus } from 'lucide-react';
import { UserActivityLogTable } from '../components/UserActivityLogTable';
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
          <span>مدیریت کاربران و نقش‌ها</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2.5 font-bold">نام کامل</th>
                <th className="px-3 py-2.5 font-bold">نام کاربری</th>
                <th className="px-3 py-2.5 font-bold">نقش</th>
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
                  <td className="px-3 py-2.5 text-teal-800">{u.role_name}</td>
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
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
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
            className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-left text-xs"
          />
          <input
            type="text"
            required
            value={newFullName}
            onChange={(e) => setNewFullName(e.target.value)}
            placeholder="نام و نام خانوادگی"
            className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-xs"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="رمز شبکه داخلی (اختیاری)"
            className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-xs"
          />
          <select
            required
            value={newRoleId}
            onChange={(e) => setNewRoleId(e.target.value)}
            className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-2 text-xs"
          >
            <option value="">انتخاب نقش...</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="min-h-[40px] rounded-lg bg-teal-700 px-4 text-xs font-bold text-white"
          >
            افزودن کاربر
          </button>
        </form>
      </div>

      {/* Granular RBAC Matrix */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
          <ShieldCheck className="h-5 w-5 text-teal-700" />
          <span>ماتریس سطوح دسترسی پویا (Dynamic RBAC Matrix)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2.5 font-bold">کلید مجوز و شرح</th>
                {roles.map((r) => (
                  <th key={r.id} className="px-3 py-2.5 text-center font-bold">
                    {r.name}
                  </th>
                ))}
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
