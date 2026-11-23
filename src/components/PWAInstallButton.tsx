import { useState } from 'react';
import { Download, Share, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Modal } from './Modal';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-teal-700/20 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100"
      >
        <Download className="h-4 w-4 shrink-0" />
        <span>نصب اپلیکیشن</span>
      </button>

      <Modal
        open={showGuide}
        onClose={() => setShowGuide(false)}
        title="نصب آوانتورک به عنوان اپلیکیشن آفلاین (PWA)"
        subtitle="برای دسترسی سریع و اجرای مستقل از مرورگر روی دستگاه"
        maxWidthClass="max-w-md"
      >
        {isIOS ? (
          <div className="space-y-3 text-sm text-slate-700">
            <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <Share className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
              <p>
                در مرورگر Safari آیفون یا آیپد، دکمه <strong>اشتراک‌گذاری (Share)</strong> در نوار
                پایین را لمس کنید و گزینه <strong>Add to Home Screen</strong> را بزنید.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm text-slate-700">
            <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
              <p>
                در مرورگر Chrome یا Edge، از منوی بالای مرورگر گزینه{' '}
                <strong>Install App / افزودن به صفحه اصلی</strong> را انتخاب کنید تا آوانتورک به
                صورت برنامه مستقل و آفلاین نصب شود.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
