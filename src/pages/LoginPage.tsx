import { useState, type FormEvent } from 'react';
import { Cable, KeyRound, Lock, Shield, UserCheck } from 'lucide-react';
import type { AuthUser } from '../types/erp';
import { apiFetch, setMemorySession } from '../utils/api';

interface LoginResponse {
  token: string;
  csrfToken: string;
  timeoutMinutes: number;
  user: AuthUser;
}

interface LoginPageProps {
  adminClaimed: boolean;
  demoModeAvailable: boolean;
  onAuthenticated: (user: AuthUser, timeoutMinutes: number) => void;
  sessionNotice?: string | null;
}

export function LoginPage({
  adminClaimed,
  demoModeAvailable,
  onAuthenticated,
  sessionNotice,
}: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [claimPassword, setClaimPassword] = useState('');
  const [claimConfirm, setClaimConfirm] = useState('');
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setMemorySession(res.token, res.csrfToken);
      onAuthenticated(res.user, res.timeoutMinutes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ورود ناموفق بود.');
    } finally {
      setLoading(false);
    }
  };

  const handleClaimAdmin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (claimPassword.length < 6) {
      setError('رمز عبور مدیر کل باید حداقل ۶ کاراکتر باشد.');
      return;
    }
    if (claimPassword !== claimConfirm) {
      setError('تکرار رمز عبور مطابقت ندارد.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<LoginResponse>('/api/auth/claim-admin', {
        method: 'POST',
        body: JSON.stringify({ password: claimPassword }),
      });
      setMemorySession(res.token, res.csrfToken);
      onAuthenticated(res.user, res.timeoutMinutes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تنظیم رمز عبور ناموفق بود.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoUsername: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<LoginResponse>('/api/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ username: demoUsername }),
      });
      setMemorySession(res.token, res.csrfToken);
      onAuthenticated(res.user, res.timeoutMinutes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ورود آزمایشی ناموفق بود.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-600 text-white">
            <Cable className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">سامانه جامع فیبر نوری</h1>
            <p className="text-xs text-slate-500">مدیریت عملیات نصب، انبار، تیکتینگ و امور مالی</p>
          </div>
        </div>

        {sessionNotice && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
            {sessionNotice}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700"
          >
            {error}
          </div>
        )}

        {!adminClaimed && showClaimForm ? (
          <form onSubmit={handleClaimAdmin} className="space-y-4">
            <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-3 text-xs text-teal-900">
              راه‌اندازی اولیه: برای حساب مدیر کل (admin) یک رمز عبور امن تعیین کنید تا دسترسی‌های مدیریتی قفل شوند.
            </div>
            <div>
              <label htmlFor="claim-pass" className="mb-1.5 block text-xs font-medium text-slate-700">
                رمز عبور جدید مدیر کل
              </label>
              <input
                id="claim-pass"
                type="password"
                required
                minLength={6}
                value={claimPassword}
                onChange={(e) => setClaimPassword(e.target.value)}
                placeholder="حداقل ۶ کاراکتر"
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
              />
            </div>
            <div>
              <label htmlFor="claim-confirm" className="mb-1.5 block text-xs font-medium text-slate-700">
                تکرار رمز عبور
              </label>
              <input
                id="claim-confirm"
                type="password"
                required
                minLength={6}
                value={claimConfirm}
                onChange={(e) => setClaimConfirm(e.target.value)}
                placeholder="تکرار رمز عبور"
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-teal-600 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
            >
              <KeyRound className="h-4 w-4" />
              <span>{loading ? 'در حال ثبت...' : 'تنظیم رمز مدیر کل و ورود'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowClaimForm(false)}
              className="w-full text-center text-xs text-slate-500 hover:text-slate-700"
            >
              بازگشت به صفحه ورود
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="login-username" className="mb-1.5 block text-xs font-medium text-slate-700">
                  نام کاربری
                </label>
                <input
                  id="login-username"
                  type="text"
                  dir="ltr"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin / installer1"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 text-left text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
                />
              </div>

              <div>
                <label htmlFor="login-password" className="mb-1.5 block text-xs font-medium text-slate-700">
                  رمز عبور
                </label>
                <input
                  id="login-password"
                  type="password"
                  dir="ltr"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 text-left text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-teal-600 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
              >
                <Lock className="h-4 w-4" />
                <span>{loading ? 'در حال بررسی...' : 'ورود به سامانه'}</span>
              </button>
            </form>

            {demoModeAvailable && (
              <div className="mt-6 border-t border-slate-200 pt-5">
                <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
                  <span>ورود سریع محیط ارزیابی محلی (پیش از تنظیم رمز)</span>
                  <button
                    type="button"
                    onClick={() => setShowClaimForm(true)}
                    className="font-medium text-teal-700 hover:underline"
                  >
                    تنظیم رمز مدیر کل
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleDemoLogin('admin')}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 hover:border-teal-600 hover:bg-teal-50"
                  >
                    <Shield className="h-3.5 w-3.5 text-teal-700" />
                    <span>مدیر کل (SuperAdmin)</span>
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleDemoLogin('operator')}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 hover:border-teal-600 hover:bg-teal-50"
                  >
                    <UserCheck className="h-3.5 w-3.5 text-slate-600" />
                    <span>اپراتور تیکتینگ</span>
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleDemoLogin('installer1')}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 hover:border-teal-600 hover:bg-teal-50"
                  >
                    <Cable className="h-3.5 w-3.5 text-slate-600" />
                    <span>نصاب ۱ (حسین کریمی)</span>
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleDemoLogin('installer2')}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 hover:border-teal-600 hover:bg-teal-50"
                  >
                    <Cable className="h-3.5 w-3.5 text-slate-600" />
                    <span>نصاب ۲ (رضا قاسمی)</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
