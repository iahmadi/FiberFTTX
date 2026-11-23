import { useState, type ReactNode } from 'react';
import {
  Activity,
  Cable,
  ClipboardList,
  HardDrive,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ShieldCheck,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import { userHasPermission } from '../lib/permissions';
import type { AuthUser } from '../types/erp';
import { OfflineIndicator } from './OfflineIndicator';
import { PWAInstallButton } from './PWAInstallButton';

export type NavTab =
  | 'dashboard'
  | 'tickets'
  | 'service'
  | 'hardware'
  | 'inventory'
  | 'financial'
  | 'users';

interface LayoutProps {
  user: AuthUser;
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onLogout: () => void;
  isOnline: boolean;
  pendingSyncCount: number;
  isSyncing: boolean;
  onSyncNow: () => void;
  children: ReactNode;
}

interface NavItemDef {
  id: NavTab;
  label: string;
  icon: typeof LayoutDashboard;
  requiredPerms: string[];
}

const NAV_ITEMS: NavItemDef[] = [
  { id: 'dashboard', label: 'داشبورد و برنامه', icon: LayoutDashboard, requiredPerms: [] },
  { id: 'tickets', label: 'تیکت‌های ۵گانه', icon: ClipboardList, requiredPerms: [] },
  {
    id: 'service',
    label: 'فرم اجرای عملیات',
    icon: Wrench,
    requiredPerms: ['can_execute_service'],
  },
  {
    id: 'hardware',
    label: 'توپولوژی و مودم‌ها',
    icon: HardDrive,
    requiredPerms: ['can_manage_hardware', 'can_add_fat', 'can_execute_service'],
  },
  {
    id: 'inventory',
    label: 'انبار قرقره و خودرو',
    icon: Package,
    requiredPerms: ['can_manage_inventory', 'can_execute_service'],
  },
  {
    id: 'financial',
    label: 'مالی، تعرفه و کمپین',
    icon: Wallet,
    requiredPerms: ['can_view_financials', 'can_manage_tariffs', 'can_execute_service'],
  },
  {
    id: 'users',
    label: 'کاربران، RBAC و لاگ',
    icon: ShieldCheck,
    requiredPerms: ['can_manage_users'],
  },
];

export function Layout({
  user,
  activeTab,
  onSelectTab,
  onLogout,
  isOnline,
  pendingSyncCount,
  isSyncing,
  onSyncNow,
  children,
}: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const visibleNav = NAV_ITEMS.filter(
    (item) =>
      item.requiredPerms.length === 0 || userHasPermission(user, ...item.requiredPerms),
  );

  const handleNavClick = (tab: NavTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col justify-between bg-slate-900 text-slate-100">
      <div>
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
              <Cable className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">آوانتورک ERP</div>
              <div className="text-[11px] text-slate-400">عملیات فیبر نوری</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 lg:hidden"
            aria-label="بستن منو"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="space-y-1 p-3" aria-label="منوی اصلی">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2.5 text-right text-sm font-medium transition-colors ${
                  active
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-slate-800 p-4">
        <div className="mb-3 rounded-lg bg-slate-800/80 p-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 shrink-0 text-teal-400" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{user.full_name}</div>
              <div className="truncate text-xs text-slate-400">{user.role_name}</div>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-red-950/60 hover:text-red-200"
        >
          <LogOut className="h-4 w-4" />
          <span>خروج از سامانه</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop sidebar */}
      <aside className="no-print hidden w-64 shrink-0 lg:block">{renderSidebarContent()}</aside>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-72 max-w-[85vw]">{renderSidebarContent()}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="باز کردن منو"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-base font-bold text-slate-900">
                {visibleNav.find((n) => n.id === activeTab)?.label || 'آوانتورک ERP'}
              </h1>
              <p className="hidden text-xs text-slate-500 sm:block">
                شبکه اینترانت یکپارچه مدیریت تیکتینگ، قرقره کابل، توپولوژی و حسابداری فیبر نوری
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <OfflineIndicator
              isOnline={isOnline}
              pendingCount={pendingSyncCount}
              isSyncing={isSyncing}
              onSyncNow={onSyncNow}
            />
            <PWAInstallButton />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
