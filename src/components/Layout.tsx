import { useEffect, useState, type ReactNode } from 'react';
import {
  Cable,
  ClipboardList,
  Cpu,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import type { AuthUser, PageKey } from '../types/erp';
import { formatDateToJalali, toPersianDigits } from '../lib/jalali';

interface NavItem {
  key: PageKey;
  label: string;
  icon: ReactNode;
  visible: (user: AuthUser) => boolean;
}

interface LayoutProps {
  user: AuthUser;
  activePage: PageKey;
  onNavigate: (page: PageKey) => void;
  onLogout: () => void;
  timeoutMinutes: number;
  children: ReactNode;
}

const PAGE_TITLES: Record<PageKey, string> = {
  dashboard: 'داشبورد و کارتابل عملیاتی',
  tickets: 'مدیریت تیکت‌ها و ارجاع کار',
  'service-form': 'فرم ثبت نصب و رفع خرابی',
  hardware: 'تجهیزات شبکه و مودم‌ها',
  inventory: 'انبار قرقره‌ها و خودروی نصاب',
  financial: 'امور مالی، تعرفه و دفتر کل',
  users: 'کاربران، نقش‌ها و سطح دسترسی',
};

export function Layout({
  user,
  activePage,
  onNavigate,
  onLogout,
  timeoutMinutes,
  children,
}: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [idleSecondsLeft, setIdleSecondsLeft] = useState(timeoutMinutes * 60);

  const hasPerm = (perm: string) => user.isSuperAdmin || user.permissions.includes(perm);

  const navItems: NavItem[] = [
    {
      key: 'dashboard',
      label: 'داشبورد و کارتابل',
      icon: <LayoutDashboard className="h-4 w-4" />,
      visible: () => true,
    },
    {
      key: 'tickets',
      label: 'تیکت‌ها و ارجاع',
      icon: <ClipboardList className="h-4 w-4" />,
      visible: () =>
        hasPerm('can_view_all_tickets') ||
        hasPerm('can_create_tickets') ||
        hasPerm('can_assign_tickets') ||
        hasPerm('can_execute_service'),
    },
    {
      key: 'service-form',
      label: 'ثبت عملیات نصب',
      icon: <Cable className="h-4 w-4" />,
      visible: () => hasPerm('can_execute_service'),
    },
    {
      key: 'hardware',
      label: 'تجهیزات و مودم',
      icon: <Cpu className="h-4 w-4" />,
      visible: () =>
        hasPerm('can_manage_hardware') ||
        hasPerm('can_add_fat') ||
        hasPerm('can_execute_service'),
    },
    {
      key: 'inventory',
      label: 'انبار و قرقره‌ها',
      icon: <Package className="h-4 w-4" />,
      visible: () =>
        hasPerm('can_manage_inventory') ||
        hasPerm('can_execute_service') ||
        hasPerm('can_cross_use_cables'),
    },
    {
      key: 'financial',
      label: 'مالی و تعرفه‌ها',
      icon: <Wallet className="h-4 w-4" />,
      visible: () =>
        hasPerm('can_view_financials') ||
        hasPerm('can_manage_tariffs') ||
        hasPerm('can_execute_service'),
    },
    {
      key: 'users',
      label: 'کاربران و RBAC',
      icon: <ShieldCheck className="h-4 w-4" />,
      visible: () => hasPerm('can_manage_users'),
    },
  ];

  // Auto-logout inactivity countdown
  useEffect(() => {
    const totalSec = Math.max(60, timeoutMinutes * 60);
    setIdleSecondsLeft(totalSec);

    const resetTimer = () => setIdleSecondsLeft(totalSec);
    const events = ['mousemove', 'keydown', 'click', 'scroll'];
    for (const ev of events) {
      window.addEventListener(ev, resetTimer, { passive: true });
    }

    const timer = window.setInterval(() => {
      setIdleSecondsLeft((prev) => {
        if (prev <= 1) {
          onLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(timer);
      for (const ev of events) {
        window.removeEventListener(ev, resetTimer);
      }
    };
  }, [timeoutMinutes, onLogout]);

  const visibleNav = navItems.filter((item) => item.visible(user));
  const todayJalali = formatDateToJalali(new Date());
  const idleMinutesDisplay = Math.ceil(idleSecondsLeft / 60);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Sidebar (header.php navigation equivalent) */}
      <aside className="hidden w-64 shrink-0 flex-col border-l border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center border-b border-slate-200 px-5">
          <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            سامانه جامع فیبر نوری
          </span>
        </div>

        <nav aria-label="منوی اصلی" className="flex-1 space-y-1 p-3">
          {visibleNav.map((item) => {
            const active = activePage === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate(item.key)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4 text-xs text-slate-500">
          <div className="font-medium text-slate-800">
            {user.first_name} {user.last_name}
          </div>
          <div className="mt-0.5 text-slate-500">{user.role_name}</div>
          <div className="mt-2 text-[11px] text-slate-400 tabular-nums">
            خروج خودکار: {toPersianDigits(idleMinutesDisplay)} دقیقه عدم فعالیت
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 flex w-64 flex-col bg-white shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
              <span className="text-base font-bold text-slate-900">سامانه جامع فیبر نوری</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="بستن منو"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 p-3">
              {visibleNav.map((item) => {
                const active = activePage === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      onNavigate(item.key);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      active ? 'bg-teal-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar (3-zone contract: Hamburger/Breadcrumb - Date - User/Logout) */}
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="باز کردن منو"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="truncate text-sm font-semibold text-slate-900 sm:text-base">
              {PAGE_TITLES[activePage]}
            </h1>
          </div>

          <div className="flex items-center gap-4 shrink-0 text-xs text-slate-500">
            <span className="hidden sm:inline tabular-nums">امروز: {todayJalali}</span>
            <span className="hidden md:inline text-slate-300">|</span>
            <span className="hidden md:inline font-medium text-slate-700">
              {user.first_name} {user.last_name}
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>خروج</span>
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 sm:p-6">{children}</main>

        {/* Quiet Footer (footer.php equivalent) */}
        <footer className="border-t border-slate-200 bg-white px-6 py-3 text-xs text-slate-400">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>سامانه مدیریت عملیات و پیمانکاری شبکه فیبر نوری (نسخه شبکه محلی آفلاین)</span>
            <span className="tabular-nums">۱۴۰۵ © تمامی حقوق محفوظ است</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
