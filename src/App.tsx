import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { Layout, type NavTab } from './components/Layout';
import { ToastContainer, type ToastMessage } from './components/Toast';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { auth } from './lib/firebase';
import {
  detectCriticalSlaStatusTransitions,
  type CriticalSlaComparableTicket,
  type CriticalSlaTransitionAlert,
} from './lib/fiberLogic';
import { toPersianDigits } from './lib/jalali';
import {
  listOutboxItems,
  loadOfflineSnapshot,
  saveOfflineSnapshot,
  syncOutboxQueue,
} from './lib/offlineDb';
import { userHasPermission } from './lib/permissions';
import { DashboardPage, type DashboardPayload } from './pages/DashboardPage';
import { FinancialPage } from './pages/FinancialPage';
import { HardwarePage } from './pages/HardwarePage';
import { InventoryPage } from './pages/InventoryPage';
import { LoginPage } from './pages/LoginPage';
import { PublicPortalPage } from './pages/PublicPortalPage';
import { ServiceFormPage } from './pages/ServiceFormPage';
import { SettingsPage } from './pages/SettingsPage';
import { TicketsPage } from './pages/TicketsPage';
import { UsersRbacPage } from './pages/UsersRbacPage';
import type {
  ActivityLogItem,
  AuthUser,
  ContractorBalanceSummary,
  CustomerPackageItem,
  FatItem,
  FFatItem,
  InventoryItemRecord,
  KafItem,
  LedgerEntryItem,
  ModemBrandItem,
  OltItem,
  PermissionDef,
  PromotionItem,
  RegionItem,
  RoleWithPerms,
  SpoolConsumptionHistoryItem,
  SpoolItem,
  SystemSettings,
  TariffTemplateItem,
  TicketItem,
  UserAccountRow,
  UserTariffAssignment,
  VanStockItem,
} from './types/erp';
import {
  apiFetch,
  getMemoryAuthToken,
  setMemoryAuthToken,
  setUnauthorizedHandler,
  uploadCompressedImage,
} from './utils/api';

const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  system_name: 'آوانتورک ERP فیبر نوری',
  primary_color: '#0f766e',
};

function isDashboardPath(pathname: string): boolean {
  return pathname.startsWith('/dashboard');
}

export default function App() {
  const isOnline = useOnlineStatus();

  const [routePath, setRoutePath] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname || '/' : '/',
  );
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [selectedServiceTicketId, setSelectedServiceTicketId] = useState<number | null>(null);
  const [editingCompletedTicketId, setEditingCompletedTicketId] = useState<number | null>(null);
  const [focusTicketId, setFocusTicketId] = useState<number | null>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [criticalSlaAlerts, setCriticalSlaAlerts] = useState<CriticalSlaTransitionAlert[]>([]);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const lastComparableTicketsRef = useRef<CriticalSlaComparableTicket[]>([]);
  const seenCriticalSlaKeysRef = useRef<Set<string>>(
    (() => {
      try {
        const raw = sessionStorage.getItem('ava_seen_critical_sla_alerts');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return new Set<string>(parsed);
        }
      } catch {
        // ignore storage restrictions
      }
      return new Set<string>();
    })(),
  );

  // Branding & Public Portal states
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(DEFAULT_SYSTEM_SETTINGS);
  const [publicRegions, setPublicRegions] = useState<RegionItem[]>([]);
  const [adminRegions, setAdminRegions] = useState<RegionItem[]>([]);

  // Domain states
  const [dashboardData, setDashboardData] = useState<DashboardPayload | null>(null);
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [ticketInstallers, setTicketInstallers] = useState<
    Array<{ id: number; full_name: string; username: string; role_name: string }>
  >([]);

  const [kafs, setKafs] = useState<KafItem[]>([]);
  const [olts, setOlts] = useState<OltItem[]>([]);
  const [fats, setFats] = useState<FatItem[]>([]);
  const [ffats, setFfats] = useState<FFatItem[]>([]);
  const [modemBrands, setModemBrands] = useState<ModemBrandItem[]>([]);

  const [spools, setSpools] = useState<SpoolItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemRecord[]>([]);
  const [vanStock, setVanStock] = useState<VanStockItem[]>([]);
  const [inventoryInstallers, setInventoryInstallers] = useState<
    Array<{ id: number; full_name: string }>
  >([]);
  const [consumptionHistory, setConsumptionHistory] = useState<SpoolConsumptionHistoryItem[]>([]);

  const [templates, setTemplates] = useState<TariffTemplateItem[]>([]);
  const [promotions, setPromotions] = useState<PromotionItem[]>([]);
  const [customerPackages, setCustomerPackages] = useState<CustomerPackageItem[]>([]);
  const [userTariffs, setUserTariffs] = useState<UserTariffAssignment[]>([]);
  const [ledger, setLedger] = useState<LedgerEntryItem[]>([]);
  const [contractorSummaries, setContractorSummaries] = useState<ContractorBalanceSummary[]>([]);
  const [financialUsers, setFinancialUsers] = useState<
    Array<{ id: number; username: string; full_name: string }>
  >([]);

  const [adminUsers, setAdminUsers] = useState<UserAccountRow[]>([]);
  const [roles, setRoles] = useState<RoleWithPerms[]>([]);
  const [permissions, setPermissions] = useState<PermissionDef[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);

  const navigateTo = useCallback((path: string) => {
    if (typeof window !== 'undefined' && window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setRoutePath(path);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setRoutePath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const color = systemSettings.primary_color || '#0f766e';
    const name = systemSettings.system_name || DEFAULT_SYSTEM_SETTINGS.system_name;
    document.documentElement.style.setProperty('--brand-primary', color);
    document.title = `${name} — سامانه جامع عملیات فیبر نوری`;
  }, [systemSettings]);

  const loadPortalConfig = useCallback(async () => {
    try {
      const cfg = await apiFetch<{
        settings: SystemSettings;
        regions: RegionItem[];
      }>('/api/public/portal-config');
      if (cfg.settings) {
        setSystemSettings(cfg.settings);
      }
      if (Array.isArray(cfg.regions)) {
        setPublicRegions(cfg.regions);
      }
      await saveOfflineSnapshot('portal_config', cfg);
    } catch {
      const snap = await loadOfflineSnapshot<{
        settings: SystemSettings;
        regions: RegionItem[];
      }>('portal_config');
      if (snap?.settings) setSystemSettings(snap.settings);
      if (Array.isArray(snap?.regions)) setPublicRegions(snap.regions);
    }
  }, []);

  useEffect(() => {
    void loadPortalConfig();
  }, [loadPortalConfig]);

  const pushCriticalSlaAlerts = useCallback((incoming: CriticalSlaTransitionAlert[] | undefined) => {
    if (!incoming || incoming.length === 0) return;
    const unseen = incoming.filter((a) => !seenCriticalSlaKeysRef.current.has(a.eventKey));
    if (unseen.length === 0) return;

    for (const alert of unseen) {
      seenCriticalSlaKeysRef.current.add(alert.eventKey);
      setTimeout(() => {
        setCriticalSlaAlerts((prev) => prev.filter((item) => item.eventKey !== alert.eventKey));
      }, 18000);
    }

    try {
      const latestKeys = Array.from(seenCriticalSlaKeysRef.current).slice(-50);
      sessionStorage.setItem('ava_seen_critical_sla_alerts', JSON.stringify(latestKeys));
    } catch {
      // ignore storage restrictions
    }

    setCriticalSlaAlerts((prev) => [...prev, ...unseen].slice(-4));
  }, []);

  const dismissCriticalSlaAlert = useCallback((eventKey: string) => {
    setCriticalSlaAlerts((prev) => prev.filter((item) => item.eventKey !== eventKey));
  }, []);

  const notify = useCallback(
    (type: ToastMessage['type'], title: string, description?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-4), { id, type, title, description }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 6500);
    },
    [],
  );

  const refreshOutboxCount = useCallback(async () => {
    const items = await listOutboxItems();
    setPendingSyncCount(items.length);
  }, []);

  const loadAllData = useCallback(async (currentUser: AuthUser) => {
    const canHardware = userHasPermission(
      currentUser,
      'can_manage_hardware',
      'can_add_fat',
      'can_execute_service',
    );
    const canInventory = userHasPermission(
      currentUser,
      'can_manage_inventory',
      'can_execute_service',
    );
    const canFinancial = userHasPermission(
      currentUser,
      'can_view_financials',
      'can_manage_tariffs',
      'can_execute_service',
    );
    const canUsers = userHasPermission(currentUser, 'can_manage_users');
    const canSettings = userHasPermission(currentUser, 'can_manage_settings');

    const [dashRes, tktRes, hwRes, invRes, finRes, usersRes, logsRes, settingsRes] =
      await Promise.allSettled([
        apiFetch<DashboardPayload>('/api/dashboard'),
        apiFetch<{
          tickets: TicketItem[];
          installers: Array<{ id: number; full_name: string; username: string; role_name: string }>;
          packages?: CustomerPackageItem[];
          modemBrands?: ModemBrandItem[];
          regions?: RegionItem[];
        }>('/api/tickets'),
        canHardware
          ? apiFetch<{
              kafs: KafItem[];
              olts: OltItem[];
              fats: FatItem[];
              ffats: FFatItem[];
              modemBrands: ModemBrandItem[];
            }>('/api/hardware')
          : Promise.resolve(null),
        canInventory
          ? apiFetch<{
              spools: SpoolItem[];
              items: InventoryItemRecord[];
              vanStock: VanStockItem[];
              installers: Array<{ id: number; full_name: string }>;
              consumptionHistory?: SpoolConsumptionHistoryItem[];
            }>('/api/inventory')
          : Promise.resolve(null),
        canFinancial
          ? apiFetch<{
              templates: TariffTemplateItem[];
              promotions: PromotionItem[];
              packages?: CustomerPackageItem[];
              userTariffs: UserTariffAssignment[];
              ledger: LedgerEntryItem[];
              contractorSummaries: ContractorBalanceSummary[];
              users: Array<{ id: number; username: string; full_name: string }>;
            }>('/api/financial')
          : Promise.resolve(null),
        canUsers
          ? apiFetch<{
              users: UserAccountRow[];
              roles: RoleWithPerms[];
              permissions: PermissionDef[];
            }>('/api/users')
          : Promise.resolve(null),
        canUsers
          ? apiFetch<{ logs: ActivityLogItem[] }>('/api/activity-logs')
          : Promise.resolve(null),
        canSettings
          ? apiFetch<{ settings: SystemSettings; regions: RegionItem[] }>('/api/settings')
          : Promise.resolve(null),
      ]);

    if (dashRes.status === 'fulfilled') {
      setDashboardData(dashRes.value);
      pushCriticalSlaAlerts(dashRes.value.recentCriticalSlaTransitions);
      if (lastComparableTicketsRef.current.length > 0) {
        pushCriticalSlaAlerts(
          detectCriticalSlaStatusTransitions(
            lastComparableTicketsRef.current,
            dashRes.value.scheduledTickets,
          ),
        );
      }
      lastComparableTicketsRef.current = dashRes.value.scheduledTickets;
      await saveOfflineSnapshot('dashboard', dashRes.value);
    } else {
      const dashSnap = await loadOfflineSnapshot<DashboardPayload>('dashboard');
      if (dashSnap) setDashboardData(dashSnap);
    }

    let fallbackPackages: CustomerPackageItem[] = [];
    let fallbackModemBrands: ModemBrandItem[] = [];
    let fallbackRegions: RegionItem[] = [];

    if (tktRes.status === 'fulfilled') {
      if (lastComparableTicketsRef.current.length > 0) {
        pushCriticalSlaAlerts(
          detectCriticalSlaStatusTransitions(
            lastComparableTicketsRef.current,
            tktRes.value.tickets,
          ),
        );
      }
      lastComparableTicketsRef.current = tktRes.value.tickets;
      setTickets(tktRes.value.tickets);
      setTicketInstallers(tktRes.value.installers);
      fallbackPackages = tktRes.value.packages ?? [];
      fallbackModemBrands = tktRes.value.modemBrands ?? [];
      fallbackRegions = tktRes.value.regions ?? [];
      await saveOfflineSnapshot('tickets', tktRes.value);
    } else {
      const tktSnap = await loadOfflineSnapshot<{
        tickets: TicketItem[];
        installers: Array<{ id: number; full_name: string; username: string; role_name: string }>;
        packages?: CustomerPackageItem[];
        modemBrands?: ModemBrandItem[];
        regions?: RegionItem[];
      }>('tickets');
      if (tktSnap) {
        setTickets(tktSnap.tickets);
        setTicketInstallers(tktSnap.installers);
        fallbackPackages = tktSnap.packages ?? [];
        fallbackModemBrands = tktSnap.modemBrands ?? [];
        fallbackRegions = tktSnap.regions ?? [];
      }
    }

    if (canHardware) {
      if (hwRes.status === 'fulfilled' && hwRes.value) {
        setKafs(hwRes.value.kafs);
        setOlts(hwRes.value.olts);
        setFats(hwRes.value.fats);
        setFfats(hwRes.value.ffats);
        setModemBrands(hwRes.value.modemBrands);
        await saveOfflineSnapshot('hardware', hwRes.value);
      } else {
        const hwSnap = await loadOfflineSnapshot<{
          kafs: KafItem[];
          olts: OltItem[];
          fats: FatItem[];
          ffats: FFatItem[];
          modemBrands: ModemBrandItem[];
        }>('hardware');
        if (hwSnap) {
          setKafs(hwSnap.kafs);
          setOlts(hwSnap.olts);
          setFats(hwSnap.fats);
          setFfats(hwSnap.ffats);
          setModemBrands(hwSnap.modemBrands);
        } else {
          setModemBrands(fallbackModemBrands);
        }
      }
    } else {
      setKafs([]);
      setOlts([]);
      setFats([]);
      setFfats([]);
      setModemBrands(fallbackModemBrands);
    }

    if (canInventory) {
      if (invRes.status === 'fulfilled' && invRes.value) {
        setSpools(invRes.value.spools);
        setInventoryItems(invRes.value.items);
        setVanStock(invRes.value.vanStock);
        setInventoryInstallers(invRes.value.installers);
        setConsumptionHistory(invRes.value.consumptionHistory ?? []);
        await saveOfflineSnapshot('inventory', invRes.value);
      } else {
        const invSnap = await loadOfflineSnapshot<{
          spools: SpoolItem[];
          items: InventoryItemRecord[];
          vanStock: VanStockItem[];
          installers: Array<{ id: number; full_name: string }>;
          consumptionHistory?: SpoolConsumptionHistoryItem[];
        }>('inventory');
        if (invSnap) {
          setSpools(invSnap.spools);
          setInventoryItems(invSnap.items);
          setVanStock(invSnap.vanStock);
          setInventoryInstallers(invSnap.installers);
          setConsumptionHistory(invSnap.consumptionHistory ?? []);
        }
      }
    } else {
      setSpools([]);
      setInventoryItems([]);
      setVanStock([]);
      setInventoryInstallers([]);
      setConsumptionHistory([]);
    }

    if (canFinancial) {
      if (finRes.status === 'fulfilled' && finRes.value) {
        setTemplates(finRes.value.templates);
        setPromotions(finRes.value.promotions);
        setCustomerPackages(finRes.value.packages ?? fallbackPackages);
        setUserTariffs(finRes.value.userTariffs);
        setLedger(finRes.value.ledger);
        setContractorSummaries(finRes.value.contractorSummaries);
        setFinancialUsers(finRes.value.users);
        await saveOfflineSnapshot('financial', finRes.value);
      } else {
        const finSnap = await loadOfflineSnapshot<{
          templates: TariffTemplateItem[];
          promotions: PromotionItem[];
          packages?: CustomerPackageItem[];
          userTariffs: UserTariffAssignment[];
          ledger: LedgerEntryItem[];
          contractorSummaries: ContractorBalanceSummary[];
          users: Array<{ id: number; username: string; full_name: string }>;
        }>('financial');
        if (finSnap) {
          setTemplates(finSnap.templates);
          setPromotions(finSnap.promotions);
          setCustomerPackages(finSnap.packages ?? fallbackPackages);
          setUserTariffs(finSnap.userTariffs);
          setLedger(finSnap.ledger);
          setContractorSummaries(finSnap.contractorSummaries);
          setFinancialUsers(finSnap.users);
        } else {
          setCustomerPackages(fallbackPackages);
        }
      }
    } else {
      setTemplates([]);
      setPromotions([]);
      setCustomerPackages(fallbackPackages);
      setUserTariffs([]);
      setLedger([]);
      setContractorSummaries([]);
      setFinancialUsers([]);
    }

    if (canUsers && usersRes.status === 'fulfilled' && usersRes.value) {
      setAdminUsers(usersRes.value.users);
      setRoles(usersRes.value.roles);
      setPermissions(usersRes.value.permissions);
    } else if (!canUsers) {
      setAdminUsers([]);
      setRoles([]);
      setPermissions([]);
    }

    if (canUsers && logsRes.status === 'fulfilled' && logsRes.value) {
      setActivityLogs(logsRes.value.logs);
    } else if (!canUsers) {
      setActivityLogs([]);
    }

    if (canSettings && settingsRes.status === 'fulfilled' && settingsRes.value) {
      setSystemSettings(settingsRes.value.settings);
      setAdminRegions(settingsRes.value.regions);
      setPublicRegions(settingsRes.value.regions.filter((r) => r.is_active));
    } else {
      setAdminRegions(fallbackRegions);
    }
  }, [pushCriticalSlaAlerts]);

  const refreshSessionAndData = useCallback(async () => {
    const res = await apiFetch<{ user: AuthUser }>('/api/auth/session');
    setUser(res.user);
    await saveOfflineSnapshot('active_user', res.user);
    await loadAllData(res.user);
  }, [loadAllData]);

  const handleSyncNow = useCallback(async () => {
    if (!isOnline || isSyncing) return;
    const pending = await listOutboxItems();
    const relevantPending = user
      ? pending
      : pending.filter((p) => p.kind === 'public_preregistration');

    if (relevantPending.length === 0) {
      if (user) setPendingSyncCount(pending.length);
      return;
    }

    setIsSyncing(true);
    try {
      const result = await syncOutboxQueue({
        onlyKinds: user ? undefined : ['public_preregistration'],
        uploadBlob: uploadCompressedImage,
        apiPost: (url, body) =>
          apiFetch(url, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
      });
      await refreshOutboxCount();
      if (result.syncedCount > 0) {
        notify(
          'success',
          `${toPersianDigits(result.syncedCount)} مورد آفلاین با سرور همگام‌سازی شد`,
        );
        if (user) {
          await loadAllData(user);
        }
      }
      if (result.failedCount > 0) {
        notify(
          'warning',
          `${toPersianDigits(result.failedCount)} مورد در همگام‌سازی با خطا مواجه شد`,
        );
      }
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing, user, refreshOutboxCount, notify, loadAllData]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
    });
    void refreshOutboxCount();
  }, [refreshOutboxCount]);

  useEffect(() => {
    let settled = false;
    const finishBoot = () => {
      if (!settled) {
        settled = true;
        setAuthReady(true);
      }
    };

    const timeoutId = setTimeout(async () => {
      if (!navigator.onLine) {
        const cachedUser = await loadOfflineSnapshot<AuthUser>('active_user');
        if (cachedUser) {
          setUser(cachedUser);
          await loadAllData(cachedUser);
        }
      }
      finishBoot();
    }, 800);

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      clearTimeout(timeoutId);
      if (fbUser) {
        try {
          const token = await fbUser.getIdToken();
          setMemoryAuthToken(token);
          await refreshSessionAndData();
        } catch {
          const cachedUser = await loadOfflineSnapshot<AuthUser>('active_user');
          if (cachedUser) {
            setUser(cachedUser);
            await loadAllData(cachedUser);
          }
        }
      } else if (getMemoryAuthToken()) {
        try {
          await refreshSessionAndData();
        } catch {
          setUser(null);
        }
      }
      finishBoot();
    });

    return () => {
      clearTimeout(timeoutId);
      unsub();
    };
  }, [refreshSessionAndData, loadAllData]);

  // Auto-sync IndexedDB outbox immediately when online state returns
  useEffect(() => {
    if (isOnline) {
      void handleSyncNow();
    }
  }, [isOnline, user, handleSyncNow]);

  // Live poll dashboard every 5s while active so Critical SLA updates by technicians alert immediately
  useEffect(() => {
    if (!isDashboardPath(routePath) || activeTab !== 'dashboard' || !isOnline || !user) return;
    let cancelled = false;

    const timer = setInterval(async () => {
      try {
        const freshDash = await apiFetch<DashboardPayload>('/api/dashboard');
        if (cancelled) return;
        setDashboardData(freshDash);
        pushCriticalSlaAlerts(freshDash.recentCriticalSlaTransitions);
        if (lastComparableTicketsRef.current.length > 0) {
          pushCriticalSlaAlerts(
            detectCriticalSlaStatusTransitions(
              lastComparableTicketsRef.current,
              freshDash.scheduledTickets,
            ),
          );
        }
        lastComparableTicketsRef.current = freshDash.scheduledTickets;
      } catch {
        // Ignore transient offline/polling hiccups
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [routePath, activeTab, isOnline, user, pushCriticalSlaAlerts]);

  const handleLogout = async () => {
    setMemoryAuthToken(null);
    setUser(null);
    try {
      await signOut(auth);
    } catch {
      // Local intranet logout
    }
  };

  // Public Customer Landing Portal (/)
  if (!isDashboardPath(routePath)) {
    return (
      <>
        <PublicPortalPage
          settings={systemSettings}
          regions={publicRegions}
          isOnline={isOnline}
          pendingSyncCount={pendingSyncCount}
          isSyncing={isSyncing}
          onSyncNow={handleSyncNow}
          onOutboxChanged={refreshOutboxCount}
          onNavigateDashboard={() => navigateTo('/dashboard')}
          onNotify={notify}
        />
        <ToastContainer
          toasts={toasts}
          onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
        />
      </>
    );
  }

  // Protected ERP Dashboard (/dashboard)
  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        در حال بارگذاری {systemSettings.system_name}...
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LoginPage
          systemSettings={systemSettings}
          onAuthenticated={refreshSessionAndData}
          onNavigatePublicPortal={() => navigateTo('/')}
        />
        <ToastContainer
          toasts={toasts}
          onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
        />
      </>
    );
  }

  return (
    <>
      <Layout
        user={user}
        systemSettings={systemSettings}
        activeTab={activeTab}
        onSelectTab={(tab) => {
          if (tab !== 'service') {
            setEditingCompletedTicketId(null);
          }
          setActiveTab(tab);
        }}
        onNavigatePublicPortal={() => navigateTo('/')}
        onLogout={handleLogout}
        onNotify={notify}
        isOnline={isOnline}
        pendingSyncCount={pendingSyncCount}
        isSyncing={isSyncing}
        onSyncNow={() => void handleSyncNow()}
      >
        {activeTab === 'dashboard' && (
          <DashboardPage
            data={dashboardData}
            loading={!dashboardData}
            pendingOutboxCount={pendingSyncCount}
            criticalSlaAlerts={criticalSlaAlerts}
            onDismissCriticalSlaAlert={dismissCriticalSlaAlert}
            onNavigateToTicket={(ticketId) => {
              setFocusTicketId(ticketId);
              setActiveTab('tickets');
            }}
            onNavigateToInventory={() => setActiveTab('inventory')}
          />
        )}

        {activeTab === 'tickets' && (
          <TicketsPage
            user={user}
            tickets={tickets}
            installers={ticketInstallers}
            packages={customerPackages}
            modemBrands={modemBrands}
            regions={adminRegions}
            systemSettings={systemSettings}
            isOnline={isOnline}
            initialFocusTicketId={focusTicketId}
            onRefresh={() => loadAllData(user)}
            onOpenServiceForm={(ticketId, editCompleted) => {
              if (editCompleted) {
                setEditingCompletedTicketId(ticketId);
                setSelectedServiceTicketId(ticketId);
              } else {
                setEditingCompletedTicketId(null);
                setSelectedServiceTicketId(ticketId);
              }
              setActiveTab('service');
            }}
            onNotify={notify}
            onOutboxChanged={refreshOutboxCount}
          />
        )}

        {activeTab === 'service' && (
          <ServiceFormPage
            user={user}
            tickets={tickets}
            fats={fats}
            ffats={ffats}
            modemBrands={modemBrands}
            spools={spools}
            vanStock={vanStock}
            selectedTicketId={selectedServiceTicketId}
            editingCompletedTicketId={editingCompletedTicketId}
            isOnline={isOnline}
            onSelectTicketId={setSelectedServiceTicketId}
            onCancelEdit={() => {
              setEditingCompletedTicketId(null);
              setActiveTab('tickets');
            }}
            onCompleted={async () => {
              setEditingCompletedTicketId(null);
              await loadAllData(user);
              setActiveTab('tickets');
            }}
            onOutboxChanged={refreshOutboxCount}
            onNotify={notify}
          />
        )}

        {activeTab === 'hardware' && (
          <HardwarePage
            user={user}
            kafs={kafs}
            olts={olts}
            fats={fats}
            ffats={ffats}
            modemBrands={modemBrands}
            onRefresh={() => loadAllData(user)}
            onNotify={notify}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryPage
            user={user}
            spools={spools}
            items={inventoryItems}
            vanStock={vanStock}
            modemBrands={modemBrands}
            installers={inventoryInstallers}
            consumptionHistory={consumptionHistory}
            onRefresh={() => loadAllData(user)}
            onNotify={notify}
          />
        )}

        {activeTab === 'financial' && (
          <FinancialPage
            user={user}
            templates={templates}
            promotions={promotions}
            packages={customerPackages}
            tickets={tickets}
            userTariffs={userTariffs}
            ledger={ledger}
            contractorSummaries={contractorSummaries}
            users={financialUsers}
            onRefresh={() => loadAllData(user)}
            onNotify={notify}
          />
        )}

        {activeTab === 'users' && (
          <UsersRbacPage
            users={adminUsers}
            roles={roles}
            permissions={permissions}
            activityLogs={activityLogs}
            onRefresh={() => loadAllData(user)}
            onNotify={notify}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPage
            settings={systemSettings}
            regions={adminRegions}
            onRefresh={() => loadAllData(user)}
            onSettingsUpdated={(next) => setSystemSettings(next)}
            onNotify={notify}
          />
        )}
      </Layout>

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </>
  );
}

