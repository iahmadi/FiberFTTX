import { useCallback, useEffect, useState } from 'react';
import type { AuthUser, PageKey, TicketItem } from './types/erp';
import { apiFetch, clearMemorySession, setMemorySession, setUnauthorizedHandler } from './utils/api';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { TicketsPage } from './pages/TicketsPage';
import { ServiceFormPage } from './pages/ServiceFormPage';
import { HardwarePage } from './pages/HardwarePage';
import { InventoryPage } from './pages/InventoryPage';
import { FinancialPage } from './pages/FinancialPage';
import { UsersRbacPage } from './pages/UsersRbacPage';

interface AuthStatus {
  adminClaimed: boolean;
  timeoutMinutes: number;
  demoModeAvailable: boolean;
}

export default function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [timeoutMinutes, setTimeoutMinutes] = useState(30);
  const [activePage, setActivePage] = useState<PageKey>('dashboard');
  const [selectedTicketForForm, setSelectedTicketForForm] = useState<TicketItem | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const handleLogout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore if already expired
    }
    clearMemorySession();
    setUser(null);
    setActivePage('dashboard');
    setSelectedTicketForForm(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setSessionNotice('مهلت نشست کاربری به پایان رسید. لطفاً دوباره وارد شوید.');
    });

    apiFetch<AuthStatus>('/api/auth/status')
      .then(async (status) => {
        setAuthStatus(status);
        setTimeoutMinutes(status.timeoutMinutes);

        // Support ?autostart=1 for automated preview verification when demo mode is active
        const params = new URLSearchParams(window.location.search);
        if (params.get('autostart') === '1' && status.demoModeAvailable) {
          const res = await apiFetch<{
            token: string;
            csrfToken: string;
            timeoutMinutes: number;
            user: AuthUser;
          }>('/api/auth/demo-login', {
            method: 'POST',
            body: JSON.stringify({ username: 'admin' }),
          });
          setMemorySession(res.token, res.csrfToken);
          setUser(res.user);
          setTimeoutMinutes(res.timeoutMinutes);
        }
      })
      .catch(() => {
        setAuthStatus({ adminClaimed: false, timeoutMinutes: 30, demoModeAvailable: true });
      });
  }, []);

  if (!authStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        در حال راه‌اندازی سامانه محلی...
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        adminClaimed={authStatus.adminClaimed}
        demoModeAvailable={authStatus.demoModeAvailable}
        sessionNotice={sessionNotice}
        onAuthenticated={(loggedInUser, minutes) => {
          setSessionNotice(null);
          setUser(loggedInUser);
          setTimeoutMinutes(minutes);
          setActivePage('dashboard');
        }}
      />
    );
  }

  const handleStartTicketService = (ticket: TicketItem) => {
    setSelectedTicketForForm(ticket);
    setActivePage('service-form');
  };

  return (
    <Layout
      user={user}
      activePage={activePage}
      onNavigate={(page) => {
        if (page !== 'service-form') {
          setSelectedTicketForForm(null);
        }
        setActivePage(page);
      }}
      onLogout={handleLogout}
      timeoutMinutes={timeoutMinutes}
    >
      {activePage === 'dashboard' && (
        <DashboardPage
          user={user}
          onStartTicketService={handleStartTicketService}
          onGoToTickets={() => setActivePage('tickets')}
        />
      )}
      {activePage === 'tickets' && (
        <TicketsPage user={user} onStartTicketService={handleStartTicketService} />
      )}
      {activePage === 'service-form' && (
        <ServiceFormPage
          user={user}
          initialTicket={selectedTicketForForm}
          onCompleted={() => {
            setSelectedTicketForForm(null);
            setActivePage('tickets');
          }}
        />
      )}
      {activePage === 'hardware' && <HardwarePage user={user} />}
      {activePage === 'inventory' && <InventoryPage user={user} />}
      {activePage === 'financial' && <FinancialPage user={user} />}
      {activePage === 'users' && (
        <UsersRbacPage
          user={user}
          onTimeoutUpdated={(m) => setTimeoutMinutes(m)}
        />
      )}
    </Layout>
  );
}
