import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { Layout, type NavTab } from './components/Layout';
import { ToastContainer, type ToastMessage } from './components/Toast';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { auth } from './lib/firebase';
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
import { ServiceFormPage } from './pages/ServiceFormPage';
import { TicketsPage } from './pages/TicketsPage';
import { UsersRbacPage } from './pages/UsersRbacPage';
import type {
  ActivityLogItem,
  AuthUser,
  ContractorBalanceSummary,
  FatItem,
  FFatItem,
  InventoryItemRecord,
  KafItem,
  LedgerEntryItem,
  ModemBrandItem,
  OltItem,
  PermissionDef,
  PromotionItem,
  RoleWithPerms,
  SpoolItem,
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

export default function App() {
  const isOnline = useOnlineStatus();

  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [selectedServiceTicketId, setSelectedServiceTicketId] = useState<number | null>(null);
  const [focusTicketId, setFocusTicketId] = useState<number | null>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

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

  const [templates, setTemplates] = useState<TariffTemplateItem[]>([]);
  const [promotions, setPromotions] = useState<PromotionItem[]>([]);
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
    try {
      const [dashRes, tktRes, hwRes, invRes, finRes] = await Promise.all([
        apiFetch<DashboardPayload>('/api/dashboard'),
        apiFetch<{
          tickets: TicketItem[];
          installers: Array<{ id: number; full_name: string; username: string; role_name: string }>;
        }>('/api/tickets'),
        apiFetch<{
          kafs: KafItem[];
          olts: OltItem[];
          fats: FatItem[];
          ffats: FFatItem[];
          modemBrands: ModemBrandItem[];
        }>('/api/hardware'),
        apiFetch<{
          spools: SpoolItem[];
          items: InventoryItemRecord[];
          vanStock: VanStockItem[];
          installers: Array<{ id: number; full_name: string }>;
        }>('/api/inventory'),
        apiFetch<{
          templates: TariffTemplateItem[];
          promotions: PromotionItem[];
          userTariffs: UserTariffAssignment[];
          ledger: LedgerEntryItem[];
          contractorSummaries: ContractorBalanceSummary[];
          users: Array<{ id: number; username: string; full_name: string }>;
        }>('/api/financial'),
      ]);

      setDashboardData(dashRes);
      setTickets(tktRes.tickets);
      setTicketInstallers(tktRes.installers);
      setKafs(hwRes.kafs);
      setOlts(hwRes.olts);
      setFats(hwRes.fats);
      setFfats(hwRes.ffats);
      setModemBrands(hwRes.modemBrands);
      setSpools(invRes.spools);
      setInventoryItems(invRes.items);
      setVanStock(invRes.vanStock);
      setInventoryInstallers(invRes.installers);
      setTemplates(finRes.templates);
      setPromotions(finRes.promotions);
      setUserTariffs(finRes.userTariffs);
      setLedger(finRes.ledger);
      setContractorSummaries(finRes.contractorSummaries);
      setFinancialUsers(finRes.users);

      await Promise.all([
        saveOfflineSnapshot('dashboard', dashRes),
        saveOfflineSnapshot('tickets', tktRes),
        saveOfflineSnapshot('hardware', hwRes),
        saveOfflineSnapshot('inventory', invRes),
        saveOfflineSnapshot('financial', finRes),
      ]);

      if (userHasPermission(currentUser, 'can_manage_users')) {
        const [usersRes, logsRes] = await Promise.all([
          apiFetch<{
            users: UserAccountRow[];
            roles: RoleWithPerms[];
            permissions: PermissionDef[];
          }>('/api/users'),
          apiFetch<{ logs: ActivityLogItem[] }>('/api/activity-logs'),
        ]);
        setAdminUsers(usersRes.users);
        setRoles(usersRes.roles);
        setPermissions(usersRes.permissions);
        setActivityLogs(logsRes.logs);
      }
    } catch {
      // Offline fallback: hydrate snapshots from IndexedDB
      const [dashSnap, tktSnap, hwSnap, invSnap, finSnap] = await Promise.all([
        loadOfflineSnapshot<DashboardPayload>('dashboard'),
        loadOfflineSnapshot<{
          tickets: TicketItem[];
          installers: Array<{ id: number; full_name: string; username: string; role_name: string }>;
        }>('tickets'),
        loadOfflineSnapshot<{
          kafs: KafItem[];
          olts: OltItem[];
          fats: FatItem[];
          ffats: FFatItem[];
          modemBrands: ModemBrandItem[];
        }>('hardware'),
        loadOfflineSnapshot<{
          spools: SpoolItem[];
          items: InventoryItemRecord[];
          vanStock: VanStockItem[];
          installers: Array<{ id: number; full_name: string }>;
        }>('inventory'),
        loadOfflineSnapshot<{
          templates: TariffTemplateItem[];
          promotions: PromotionItem[];
          userTariffs: UserTariffAssignment[];
          ledger: LedgerEntryItem[];
          contractorSummaries: ContractorBalanceSummary[];
          users: Array<{ id: number; username: string; full_name: string }>;
        }>('financial'),
      ]);
      if (dashSnap) setDashboardData(dashSnap);
      if (tktSnap) {
        setTickets(tktSnap.tickets);
        setTicketInstallers(tktSnap.installers);
      }
      if (hwSnap) {
        setKafs(hwSnap.kafs);
        setOlts(hwSnap.olts);
        setFats(hwSnap.fats);
        setFfats(hwSnap.ffats);
        setModemBrands(hwSnap.modemBrands);
      }
      if (invSnap) {
        setSpools(invSnap.spools);
        setInventoryItems(invSnap.items);
        setVanStock(invSnap.vanStock);
        setInventoryInstallers(invSnap.installers);
      }
      if (finSnap) {
        setTemplates(finSnap.templates);
        setPromotions(finSnap.promotions);
        setUserTariffs(finSnap.userTariffs);
        setLedger(finSnap.ledger);
        setContractorSummaries(finSnap.contractorSummaries);
        setFinancialUsers(finSnap.users);
      }
    }
  }, []);

  const refreshSessionAndData = useCallback(async () => {
    const res = await apiFetch<{ user: AuthUser }>('/api/auth/session');
    setUser(res.user);
    await saveOfflineSnapshot('active_user', res.user);
    await loadAllData(res.user);
  }, [loadAllData]);

  const handleSyncNow = useCallback(async () => {
    if (!isOnline || isSyncing || !user) return;
    const pending = await listOutboxItems();
    if (pending.length === 0) {
      setPendingSyncCount(0);
      return;
    }

    setIsSyncing(true);
    try {
      const result = await syncOutboxQueue({
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
        await loadAllData(user);
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
    if (isOnline && user) {
      void handleSyncNow();
    }
  }, [isOnline, user, handleSyncNow]);

  const handleLogout = async () => {
    setMemoryAuthToken(null);
    setUser(null);
    try {
      await signOut(auth);
    } catch {
      // Local intranet logout
    }
  };

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        در حال بارگذاری سامانه آوانتورک ERP...
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LoginPage onAuthenticated={refreshSessionAndData} />
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
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onLogout={handleLogout}
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
            isOnline={isOnline}
            initialFocusTicketId={focusTicketId}
            onRefresh={() => loadAllData(user)}
            onOpenServiceForm={(ticketId) => {
              setSelectedServiceTicketId(ticketId);
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
            isOnline={isOnline}
            onSelectTicketId={setSelectedServiceTicketId}
            onCompleted={async () => {
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
            installers={inventoryInstallers}
            onRefresh={() => loadAllData(user)}
            onNotify={notify}
          />
        )}

        {activeTab === 'financial' && (
          <FinancialPage
            user={user}
            templates={templates}
            promotions={promotions}
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
      </Layout>

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </>
  );
}
