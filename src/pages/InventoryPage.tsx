import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeftRight, PackagePlus } from 'lucide-react';
import type { AuthUser, SpoolItem } from '../types/erp';
import { apiFetch } from '../utils/api';
import { toPersianDigits } from '../lib/jalali';
import { Modal } from '../components/Modal';
import { SearchableSelect } from '../components/SearchableSelect';

interface InstallerOption {
  id: number;
  first_name: string;
  last_name: string;
  role_name: string;
}

export function InventoryPage({ user }: { user: AuthUser }) {
  const [spools, setSpools] = useState<SpoolItem[]>([]);
  const [installers, setInstallers] = useState<InstallerOption[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'outdoor' | 'indoor'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add Spool Modal
  const [addOpen, setAddOpen] = useState(false);
  const [spoolCode, setSpoolCode] = useState('');
  const [cableType, setCableType] = useState<'outdoor' | 'indoor'>('outdoor');
  const [initialLength, setInitialLength] = useState('1000');
  const [assignOnCreate, setAssignOnCreate] = useState('');

  // Transfer Spool Modal
  const [transferSpool, setTransferSpool] = useState<SpoolItem | null>(null);
  const [transferTarget, setTransferTarget] = useState('');

  const canManage = user.isSuperAdmin || user.permissions.includes('can_manage_inventory');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sRes = await apiFetch<{ spools: SpoolItem[] }>('/api/spools');
      setSpools(sRes.spools);
      if (canManage) {
        const uRes = await apiFetch<{ users: InstallerOption[] }>('/api/users/installers');
        setInstallers(uRes.users);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت موجودی انبار');
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredSpools = useMemo(
    () => spools.filter((s) => filterType === 'all' || s.cable_type === filterType),
    [spools, filterType],
  );

  const installerOptions = useMemo(
    () => [
      { value: '', label: 'انبار مرکزی (تحویل به انبار)' },
      ...installers.map((u) => ({
        value: u.id,
        label: `${u.first_name} ${u.last_name}`,
        sublabel: u.role_name,
      })),
    ],
    [installers],
  );

  const handleCreateSpool = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/spools', {
        method: 'POST',
        body: JSON.stringify({
          spool_code: spoolCode,
          cable_type: cableType,
          initial_length: Number(initialLength),
          assigned_installer_id: assignOnCreate ? Number(assignOnCreate) : null,
        }),
      });
      setSpoolCode('');
      setAddOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت قرقره جدید');
    }
  };

  const handleTransfer = async (e: FormEvent) => {
    e.preventDefault();
    if (!transferSpool) return;
    setError(null);
    try {
      await apiFetch(`/api/spools/${transferSpool.id}/transfer`, {
        method: 'PATCH',
        body: JSON.stringify({
          assigned_installer_id: transferTarget ? Number(transferTarget) : null,
        }),
      });
      setTransferSpool(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در انتقال قرقره');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(
            [
              ['all', 'همه قرقره‌ها'],
              ['outdoor', 'کابل بیرونی (Outdoor)'],
              ['indoor', 'کابل داخلی (Indoor)'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterType(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filterType === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700"
          >
            <PackagePlus className="h-4 w-4" />
            <span>ثبت قرقره جدید</span>
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">در حال بارگذاری قرقره‌ها...</div>
        ) : filteredSpools.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">هیچ قرقره‌ای ثبت نشده است.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-4 py-3">کد قرقره</th>
                  <th className="px-4 py-3">نوع کابل</th>
                  <th className="px-4 py-3">متراژ اولیه</th>
                  <th className="px-4 py-3">مانده فعلی</th>
                  <th className="px-4 py-3">تحویل‌گیرنده (Van Stock)</th>
                  {canManage && <th className="px-4 py-3">انتقال</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSpools.map((s) => {
                  const pct = Math.max(0, Math.min(100, Math.round((s.current_length / s.initial_length) * 100)));
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70">
                      <td dir="ltr" className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                        {s.spool_code}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        {s.cable_type === 'outdoor' ? 'فضای باز (Outdoor)' : 'داخلی (Indoor)'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 tabular-nums">
                        {toPersianDigits(s.initial_length)} متر
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="w-20 text-xs font-semibold text-slate-900 tabular-nums">
                            {toPersianDigits(s.current_length)} متر
                          </span>
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              style={{ width: `${pct}%` }}
                              className={`h-full ${pct < 20 ? 'bg-red-600' : 'bg-teal-600'}`}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-700">
                        {s.installer_name ? `خودرو: ${s.installer_name}` : 'انبار مرکزی'}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              setTransferSpool(s);
                              setTransferTarget(
                                s.assigned_installer_id ? String(s.assigned_installer_id) : '',
                              );
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <ArrowLeftRight className="h-3.5 w-3.5" />
                            <span>انتقال / تحویل</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Spool Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="ثبت قرقره کابل جدید">
        <form onSubmit={handleCreateSpool} className="space-y-4">
          <div>
            <label htmlFor="sp-code" className="mb-1 block text-xs font-medium text-slate-700">
              کد یکتای قرقره
            </label>
            <input
              id="sp-code"
              type="text"
              required
              value={spoolCode}
              onChange={(e) => setSpoolCode(e.target.value.toUpperCase())}
              placeholder="مثال: OUT-1405-08"
              className="h-10 w-full rounded-lg border border-slate-300 px-3 font-mono text-xs dir-ltr text-left focus:border-teal-600 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sp-type" className="mb-1 block text-xs font-medium text-slate-700">
                نوع کابل
              </label>
              <select
                id="sp-type"
                value={cableType}
                onChange={(e) => setCableType(e.target.value as 'outdoor' | 'indoor')}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs focus:border-teal-600 focus:outline-none"
              >
                <option value="outdoor">فضای باز (Outdoor)</option>
                <option value="indoor">داخلی (Indoor)</option>
              </select>
            </div>
            <div>
              <label htmlFor="sp-len" className="mb-1 block text-xs font-medium text-slate-700">
                متراژ اولیه (متر)
              </label>
              <input
                id="sp-len"
                type="number"
                min={1}
                required
                value={initialLength}
                onChange={(e) => setInitialLength(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm tabular-nums focus:border-teal-600 focus:outline-none"
              />
            </div>
          </div>
          <SearchableSelect
            label="تحویل اولیه به نصاب"
            options={installerOptions}
            value={assignOnCreate}
            onChange={setAssignOnCreate}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs text-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700"
            >
              ذخیره قرقره
            </button>
          </div>
        </form>
      </Modal>

      {/* Transfer Spool Modal */}
      <Modal
        open={Boolean(transferSpool)}
        onClose={() => setTransferSpool(null)}
        title={transferSpool ? `انتقال قرقره ${transferSpool.spool_code}` : 'انتقال قرقره'}
      >
        <form onSubmit={handleTransfer} className="space-y-4">
          <SearchableSelect
            label="مقصد جدید (خودروی نصاب یا انبار مرکزی)"
            options={installerOptions}
            value={transferTarget}
            onChange={setTransferTarget}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setTransferSpool(null)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs text-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700"
            >
              تایید انتقال
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
