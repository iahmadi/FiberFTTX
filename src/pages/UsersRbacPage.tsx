import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Clock, Plus, Shield, UserPlus } from 'lucide-react';
import type {
  ActivityLogItem,
  AuthUser,
  PermissionItem,
  RoleItem,
  UserAdminItem,
} from '../types/erp';
import { apiFetch } from '../utils/api';
import { toPersianDigits } from '../lib/jalali';
import { Modal } from '../components/Modal';
import { UserActivityLogTable } from '../components/UserActivityLogTable';

interface UsersRbacPageProps {
  user: AuthUser;
  onTimeoutUpdated: (minutes: number) => void;
}

export function UsersRbacPage({ user, onTimeoutUpdated }: UsersRbacPageProps) {
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [users, setUsers] = useState<UserAdminItem[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [timeoutMinutes, setTimeoutMinutes] = useState('30');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Create Role Modal
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRolePermIds, setNewRolePermIds] = useState<number[]>([]);

  // Create User Modal
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [uUsername, setUUsername] = useState('');
  const [uPassword, setUPassword] = useState('');
  const [uFirstName, setUFirstName] = useState('');
  const [uLastName, setULastName] = useState('');
  const [uRoleId, setURoleId] = useState('');

  const loadRbac = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        permissions: PermissionItem[];
        roles: RoleItem[];
        users: UserAdminItem[];
        activityLogs?: ActivityLogItem[];
        timeoutMinutes: number;
      }>('/api/rbac');
      setPermissions(res.permissions);
      setRoles(res.roles);
      setUsers(res.users);
      setActivityLogs(res.activityLogs ?? []);
      setTimeoutMinutes(String(res.timeoutMinutes));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت اطلاعات کاربران و دسترسی‌ها');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRbac();
  }, [loadRbac]);

  const handleToggleRolePerm = async (role: RoleItem, permId: number) => {
    if (!user.isSuperAdmin || role.role_name === 'SuperAdmin') return;
    setError(null);
    const exists = role.perm_ids.includes(permId);
    const nextPerms = exists
      ? role.perm_ids.filter((id) => id !== permId)
      : [...role.perm_ids, permId];

    try {
      await apiFetch(`/api/rbac/roles/${role.id}`, {
        method: 'PUT',
        body: JSON.stringify({ perm_ids: nextPerms }),
      });
      setRoles((prev) =>
        prev.map((r) => (r.id === role.id ? { ...r, perm_ids: nextPerms } : r)),
      );
      setNotice(`دسترسی‌های نقش «${role.role_name}» به‌روزرسانی شد.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در تغییر دسترسی');
    }
  };

  const handleCreateRole = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/rbac/roles', {
        method: 'POST',
        body: JSON.stringify({ role_name: newRoleName, perm_ids: newRolePermIds }),
      });
      setNewRoleName('');
      setNewRolePermIds([]);
      setRoleModalOpen(false);
      await loadRbac();
      setNotice('نقش جدید با دسترسی‌های انتخابی ایجاد شد.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ایجاد نقش');
    }
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/rbac/users', {
        method: 'POST',
        body: JSON.stringify({
          username: uUsername,
          password: uPassword,
          first_name: uFirstName,
          last_name: uLastName,
          role_id: Number(uRoleId),
        }),
      });
      setUUsername('');
      setUPassword('');
      setUFirstName('');
      setULastName('');
      setURoleId('');
      setUserModalOpen(false);
      await loadRbac();
      setNotice('کاربر جدید با موفقیت ثبت شد.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت کاربر');
    }
  };

  const handleToggleUserActive = async (target: UserAdminItem) => {
    setError(null);
    try {
      await apiFetch(`/api/rbac/users/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: target.is_active !== 1 }),
      });
      await loadRbac();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در تغییر وضعیت کاربر');
    }
  };

  const handleSaveTimeout = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{ timeoutMinutes: number }>('/api/rbac/settings', {
        method: 'PATCH',
        body: JSON.stringify({ session_timeout_minutes: Number(timeoutMinutes) }),
      });
      onTimeoutUpdated(res.timeoutMinutes);
      setNotice(`مدت زمان خروج خودکار به ${toPersianDigits(res.timeoutMinutes)} دقیقه تغییر یافت.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ذخیره تنظیمات نشست');
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
        در حال بارگذاری مدیریت کاربران و نقش‌ها...
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
      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          {notice}
        </div>
      )}

      {/* Users Table */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">کاربران سامانه</h2>
          <button
            type="button"
            onClick={() => setUserModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-teal-700"
          >
            <UserPlus className="h-4 w-4" />
            <span>افزودن کاربر جدید</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-medium text-slate-500">
              <tr>
                <th className="px-4 py-3">نام کاربری</th>
                <th className="px-4 py-3">نام و نام خانوادگی</th>
                <th className="px-4 py-3">نقش سازمانی</th>
                <th className="px-4 py-3">وضعیت حساب</th>
                <th className="px-4 py-3">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-mono font-medium text-slate-900 dir-ltr text-right">
                    {u.username}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {u.first_name} {u.last_name}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{u.role_name}</td>
                  <td className="px-4 py-3 font-medium">
                    <span className={u.is_active === 1 ? 'text-emerald-700' : 'text-red-600'}>
                      {u.is_active === 1 ? 'فعال' : 'غیرفعال'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.username !== 'admin' && (
                      <button
                        type="button"
                        onClick={() => handleToggleUserActive(u)}
                        className="rounded-md border border-slate-200 px-2.5 py-1 text-slate-700 hover:bg-slate-100"
                      >
                        {u.is_active === 1 ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Custom RBAC Matrix (SuperAdmin Only) */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-teal-600" />
            <h2 className="text-sm font-semibold text-slate-900">
              ماتریس نقش‌ها و مجوزهای دسترسی (RBAC)
            </h2>
          </div>
          {user.isSuperAdmin && (
            <button
              type="button"
              onClick={() => setRoleModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-teal-600 bg-teal-50 px-3.5 py-1.5 text-xs font-medium text-teal-800 hover:bg-teal-100"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>ایجاد نقش سفارشی</span>
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-medium text-slate-500">
              <tr>
                <th className="px-4 py-3">مجوز سیستمی</th>
                {roles.map((r) => (
                  <th key={r.id} className="px-3 py-3 text-center whitespace-nowrap">
                    {r.role_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {permissions.map((perm) => (
                <tr key={perm.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-900">{perm.descr}</div>
                    <div className="font-mono text-[11px] text-slate-400 dir-ltr text-right">
                      {perm.key_name}
                    </div>
                  </td>
                  {roles.map((r) => {
                    const isSuper = r.role_name === 'SuperAdmin';
                    const checked = isSuper || r.perm_ids.includes(perm.id);
                    return (
                      <td key={`${r.id}-${perm.id}`} className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isSuper || !user.isSuperAdmin}
                          aria-label={`${perm.descr} برای ${r.role_name}`}
                          onChange={() => handleToggleRolePerm(r, perm.id)}
                          className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-600 disabled:opacity-50"
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

      {/* User Activity Log Component */}
      <UserActivityLogTable logs={activityLogs} onRefresh={loadRbac} />

      {/* Security Session Timeout Setting (SuperAdmin Only) */}
      {user.isSuperAdmin && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-600" />
            <h2 className="text-sm font-semibold text-slate-900">تنظیم خروج خودکار (Session Timeout)</h2>
          </div>
          <form onSubmit={handleSaveTimeout} className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="timeout-min" className="mb-1 block text-xs text-slate-600">
                مدت عدم فعالیت مجاز (دقیقه)
              </label>
              <input
                id="timeout-min"
                type="number"
                min={1}
                max={1440}
                value={timeoutMinutes}
                onChange={(e) => setTimeoutMinutes(e.target.value)}
                className="h-9 w-36 rounded-lg border border-slate-300 px-3 text-xs tabular-nums focus:border-teal-600 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="h-9 rounded-lg bg-slate-900 px-4 text-xs font-medium text-white hover:bg-slate-800"
            >
              ذخیره تنظیمات نشست
            </button>
          </form>
        </div>
      )}

      {/* Create Role Modal */}
      <Modal open={roleModalOpen} onClose={() => setRoleModalOpen(false)} title="ایجاد نقش کاربری سفارشی">
        <form onSubmit={handleCreateRole} className="space-y-4">
          <div>
            <label htmlFor="new-role-name" className="mb-1 block text-xs font-medium text-slate-700">
              نام نقش سفارشی
            </label>
            <input
              id="new-role-name"
              type="text"
              required
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="مثال: سرپرست فنی منطقه"
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-teal-600 focus:outline-none"
            />
          </div>
          <div className="max-h-60 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
            <div className="text-xs font-semibold text-slate-700">انتخاب مجوزهای دسترسی</div>
            {permissions.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={newRolePermIds.includes(p.id)}
                  onChange={(e) => {
                    setNewRolePermIds((prev) =>
                      e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id),
                    );
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600"
                />
                <span>{p.descr}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setRoleModalOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs text-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700"
            >
              ایجاد نقش
            </button>
          </div>
        </form>
      </Modal>

      {/* Create User Modal */}
      <Modal open={userModalOpen} onClose={() => setUserModalOpen(false)} title="ایجاد کاربر جدید">
        <form onSubmit={handleCreateUser} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="u-first" className="mb-1 block text-xs font-medium text-slate-700">
                نام
              </label>
              <input
                id="u-first"
                type="text"
                required
                value={uFirstName}
                onChange={(e) => setUFirstName(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs"
              />
            </div>
            <div>
              <label htmlFor="u-last" className="mb-1 block text-xs font-medium text-slate-700">
                نام خانوادگی
              </label>
              <input
                id="u-last"
                type="text"
                required
                value={uLastName}
                onChange={(e) => setULastName(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs"
              />
            </div>
          </div>
          <div>
            <label htmlFor="u-uname" className="mb-1 block text-xs font-medium text-slate-700">
              نام کاربری (انگلیسی)
            </label>
            <input
              id="u-uname"
              type="text"
              required
              value={uUsername}
              onChange={(e) => setUUsername(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs dir-ltr text-left"
            />
          </div>
          <div>
            <label htmlFor="u-pass" className="mb-1 block text-xs font-medium text-slate-700">
              رمز عبور (حداقل ۶ کاراکتر)
            </label>
            <input
              id="u-pass"
              type="password"
              required
              minLength={6}
              value={uPassword}
              onChange={(e) => setUPassword(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs dir-ltr text-left"
            />
          </div>
          <div>
            <label htmlFor="u-role" className="mb-1 block text-xs font-medium text-slate-700">
              نقش کاربری
            </label>
            <select
              id="u-role"
              required
              value={uRoleId}
              onChange={(e) => setURoleId(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs"
            >
              <option value="">انتخاب نقش...</option>
              {roles
                .filter((r) => user.isSuperAdmin || r.role_name !== 'SuperAdmin')
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.role_name}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setUserModalOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs text-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700"
            >
              ثبت کاربر
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
