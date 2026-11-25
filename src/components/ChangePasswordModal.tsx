import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { Modal } from './Modal';

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, desc?: string) => void;
}

export function ChangePasswordModal({ open, onClose, onNotify }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      onNotify('warning', 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد');
      return;
    }
    if (newPassword !== confirmPassword) {
      onNotify('warning', 'تکرار رمز عبور با رمز جدید مطابقت ندارد');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      onNotify('success', 'رمز عبور شما با موفقیت تغییر یافت');
      handleClose();
    } catch (err) {
      onNotify('error', 'خطا در تغییر رمز عبور', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="تغییر رمز عبور حساب کاربری"
      subtitle="رمز عبور جدید باید حداقل ۶ کاراکتر باشد"
      maxWidthClass="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="self-current-password"
            className="mb-1 block text-xs font-semibold text-slate-700"
          >
            رمز عبور فعلی
          </label>
          <input
            id="self-current-password"
            type="password"
            required
            dir="ltr"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 text-left text-sm focus:border-teal-700 focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="self-new-password"
            className="mb-1 block text-xs font-semibold text-slate-700"
          >
            رمز عبور جدید
          </label>
          <input
            id="self-new-password"
            type="password"
            required
            minLength={6}
            dir="ltr"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 text-left text-sm focus:border-teal-700 focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="self-confirm-password"
            className="mb-1 block text-xs font-semibold text-slate-700"
          >
            تکرار رمز عبور جدید
          </label>
          <input
            id="self-confirm-password"
            type="password"
            required
            minLength={6}
            dir="ltr"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 text-left text-sm focus:border-teal-700 focus:outline-none"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={handleClose}
            className="min-h-[40px] rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700"
          >
            انصراف
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-700 px-5 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span>{submitting ? 'در حال ثبت...' : 'تغییر رمز عبور'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
