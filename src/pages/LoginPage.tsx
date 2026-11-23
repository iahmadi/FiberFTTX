import { useEffect, useState, type FormEvent } from 'react';
import { Cable, KeyRound, Lock, ShieldCheck, UserCheck } from 'lucide-react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { apiFetch, setMemoryAuthToken } from '../utils/api';

interface LoginPageProps {
  onAuthenticated: () => Promise<void>;
}

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const [adminNeedsClaim, setAdminNeedsClaim] = useState<boolean>(false);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(true);
  const [mode, setMode] = useState<'login' | 'claim'>('login');

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [claimFullName, setClaimFullName] = useState('مدیر کل آوانتورک');
  const [claimPassword, setClaimPassword] = useState('');
  const [claimConfirm, setClaimConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<{ adminNeedsClaim: boolean }>('/api/auth/bootstrap-status')
      .then((res) => {
        if (!active) return;
        setAdminNeedsClaim(res.adminNeedsClaim);
        if (res.adminNeedsClaim) {
          setMode('claim');
        }
      })
      .catch(() => {
        // Offline or unreachable
      })
      .finally(() => {
        if (active) setCheckingStatus(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      const idToken = await cred.user.getIdToken();
      setMemoryAuthToken(idToken);
      await onAuthenticated();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'ورود با حساب گوگل ناموفق بود. در شبکه اینترانت بدون اینترنت از ورود محلی استفاده کنید.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLocalLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string }>('/api/auth/local-login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setMemoryAuthToken(res.token);
      await onAuthenticated();
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
      const res = await apiFetch<{ token: string }>('/api/auth/claim-admin', {
        method: 'POST',
        body: JSON.stringify({
          password: claimPassword,
          full_name: claimFullName,
        }),
      });
      setMemoryAuthToken(res.token);
      await onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فعال‌سازی حساب مدیر کل ناموفق بود.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
            <Cable className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">آوانتورک ERP فیبر نوری</h1>
            <p className="text-xs text-slate-500">سامانه یکپارچه عملیات، انبار و مالی (آفلاین-اول)</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800">
            {error}
          </div>
        )}

        {/* Primary Google Sign-In */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="flex min-h-[46px] w-full items-center justify-center gap-2.5 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-teal-800 disabled:opacity-60"
        >
          <ShieldCheck className="h-5 w-5" />
          <span>ورود امن با حساب گوگل</span>
        </button>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-[11px] font-medium text-slate-400">
            ورود شبکه داخلی (اینترانت بدون اینترنت)
          </span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        {checkingStatus ? (
          <div className="py-4 text-center text-xs text-slate-500">در حال بررسی وضعیت سامانه...</div>
        ) : adminNeedsClaim && mode === 'claim' ? (
          <form onSubmit={handleClaimAdmin} className="space-y-3.5">
            <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
              <strong className="block font-bold">راه‌اندازی اولیه مدیر کل (SuperAdmin)</strong>
              <span className="mt-0.5 block opacity-90">
                برای فعال‌سازی حساب کاربری <code>admin</code> در شبکه داخلی، رمز عبور دلخواه تعیین
                کنید.
              </span>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">نام کامل مدیر</label>
              <input
                type="text"
                value={claimFullName}
                onChange={(e) => setClaimFullName(e.target.value)}
                required
                className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                رمز عبور جدید (حداقل ۶ کاراکتر)
              </label>
              <input
                type="password"
                value={claimPassword}
                onChange={(e) => setClaimPassword(e.target.value)}
                required
                minLength={6}
                placeholder="رمز عبور امن مدیر"
                className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">تکرار رمز عبور</label>
              <input
                type="password"
                value={claimConfirm}
                onChange={(e) => setClaimConfirm(e.target.value)}
                required
                minLength={6}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-teal-700 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              <KeyRound className="h-4 w-4" />
              <span>تعیین رمز مدیر کل و ورود</span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleLocalLogin} className="space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">نام کاربری</label>
              <input
                type="text"
                dir="ltr"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-left text-sm focus:border-teal-700 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">رمز عبور</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-teal-700 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              <Lock className="h-4 w-4" />
              <span>ورود با حساب شبکه داخلی</span>
            </button>
            {adminNeedsClaim && (
              <button
                type="button"
                onClick={() => setMode('claim')}
                className="flex w-full items-center justify-center gap-1 pt-1 text-xs font-medium text-teal-700 hover:underline"
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span>تنظیم اولیه رمز مدیر کل</span>
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
