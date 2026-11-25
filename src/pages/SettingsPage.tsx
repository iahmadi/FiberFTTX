import { useEffect, useState, type FormEvent } from 'react';
import { Check, MapPin, Palette, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import type { RegionItem, SystemSettings } from '../types/erp';
import { apiFetch } from '../utils/api';

interface SettingsPageProps {
  settings: SystemSettings;
  regions: RegionItem[];
  onRefresh: () => Promise<void>;
  onSettingsUpdated: (next: SystemSettings) => void;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, desc?: string) => void;
}

const COLOR_PRESETS = [
  { label: 'سبز فیروزه‌ای (پیش‌فرض)', hex: '#0f766e' },
  { label: 'آبی مخابراتی', hex: '#0369a1' },
  { label: 'سرمه‌ای سازمانی', hex: '#1e3a8a' },
  { label: 'زمردی', hex: '#047857' },
  { label: 'زغالی مدرن', hex: '#334155' },
];

export function SettingsPage({
  settings,
  regions,
  onRefresh,
  onSettingsUpdated,
  onNotify,
}: SettingsPageProps) {
  const [systemName, setSystemName] = useState(settings.system_name);
  const [primaryColor, setPrimaryColor] = useState(settings.primary_color);
  const [savingBrand, setSavingBrand] = useState(false);

  const [newRegionName, setNewRegionName] = useState('');
  const [creatingRegion, setCreatingRegion] = useState(false);
  const [editingRegionId, setEditingRegionId] = useState<number | null>(null);
  const [editingRegionName, setEditingRegionName] = useState('');

  useEffect(() => {
    setSystemName(settings.system_name);
    setPrimaryColor(settings.primary_color);
  }, [settings]);

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSavingBrand(true);
    try {
      const res = await apiFetch<{ settings: SystemSettings }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          system_name: systemName.trim(),
          primary_color: primaryColor.trim(),
        }),
      });
      onSettingsUpdated(res.settings);
      onNotify('success', 'تنظیمات کلی و برندینگ سامانه ذخیره شد');
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در ذخیره تنظیمات', err instanceof Error ? err.message : undefined);
    } finally {
      setSavingBrand(false);
    }
  };

  const handleCreateRegion = async (e: FormEvent) => {
    e.preventDefault();
    if (!newRegionName.trim()) return;
    setCreatingRegion(true);
    try {
      await apiFetch('/api/regions', {
        method: 'POST',
        body: JSON.stringify({ name: newRegionName.trim(), is_active: true }),
      });
      onNotify('success', `منطقه «${newRegionName.trim()}» اضافه شد`);
      setNewRegionName('');
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در افزودن منطقه', err instanceof Error ? err.message : undefined);
    } finally {
      setCreatingRegion(false);
    }
  };

  const handleSaveRegionEdit = async (regionId: number) => {
    if (!editingRegionName.trim()) return;
    try {
      await apiFetch(`/api/regions/${regionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editingRegionName.trim() }),
      });
      onNotify('success', 'نام منطقه بروزرسانی شد');
      setEditingRegionId(null);
      setEditingRegionName('');
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در ویرایش منطقه', err instanceof Error ? err.message : undefined);
    }
  };

  const handleToggleRegionActive = async (r: RegionItem) => {
    try {
      await apiFetch(`/api/regions/${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !r.is_active }),
      });
      onNotify('success', `وضعیت منطقه «${r.name}» تغییر یافت`);
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در تغییر وضعیت منطقه', err instanceof Error ? err.message : undefined);
    }
  };

  const handleDeleteRegion = async (r: RegionItem) => {
    try {
      await apiFetch(`/api/regions/${r.id}`, { method: 'DELETE' });
      onNotify('success', `منطقه «${r.name}» حذف شد`);
      await onRefresh();
    } catch (err) {
      onNotify('error', 'خطا در حذف منطقه', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      {/* Global Branding Settings */}
      <form
        onSubmit={handleSaveSettings}
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-xs xl:col-span-5"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 text-sm font-bold text-slate-900">
          <Palette className="h-5 w-5" style={{ color: 'var(--brand-primary)' }} />
          <span>تنظیمات برندینگ و عنوان سامانه</span>
        </div>

        <div>
          <label
            htmlFor="settings-system-name"
            className="mb-1.5 block text-xs font-semibold text-slate-700"
          >
            نام سامانه (نمایش در پرتال عمومی، داشبورد و فاکتورها)
          </label>
          <input
            id="settings-system-name"
            type="text"
            required
            value={systemName}
            onChange={(e) => setSystemName(e.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-teal-700 focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="settings-primary-color"
            className="mb-1.5 block text-xs font-semibold text-slate-700"
          >
            رنگ سازمانی اصلی (Primary Brand Color)
          </label>
          <div className="flex items-center gap-3">
            <input
              id="settings-primary-color"
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-11 w-16 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
            />
            <input
              type="text"
              dir="ltr"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3 text-left font-mono text-sm"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset.hex}
                type="button"
                onClick={() => setPrimaryColor(preset.hex)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  primaryColor.toLowerCase() === preset.hex
                    ? 'border-slate-900 bg-slate-100 text-slate-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span
                  className="h-3 w-3 rounded-sm"
                  style={{ backgroundColor: preset.hex }}
                />
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={savingBrand}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-lg px-5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: primaryColor }}
        >
          <Save className="h-4 w-4" />
          <span>{savingBrand ? 'در حال ذخیره...' : 'ذخیره تنظیمات برندینگ'}</span>
        </button>
      </form>

      {/* Dynamic Coverage Regions CRUD */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs xl:col-span-7">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <MapPin className="h-5 w-5" style={{ color: 'var(--brand-primary)' }} />
            <span>مدیریت مناطق تحت پوشش (نمایش پویا در پرتال مشتریان)</span>
          </div>
        </div>

        <form onSubmit={handleCreateRegion} className="flex flex-wrap gap-2">
          <input
            type="text"
            required
            value={newRegionName}
            onChange={(e) => setNewRegionName(e.target.value)}
            placeholder="نام منطقه جدید (مثلاً شهرک غرب و سعادت‌آباد)..."
            className="min-h-[42px] flex-1 rounded-lg border border-slate-300 px-3 text-xs focus:border-teal-700 focus:outline-none"
          />
          <button
            type="submit"
            disabled={creatingRegion}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg px-4 text-xs font-bold text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <Plus className="h-4 w-4" />
            <span>افزودن منطقه</span>
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2.5 font-bold">نام منطقه</th>
                <th className="px-3 py-2.5 font-bold">وضعیت نمایش در پرتال</th>
                <th className="px-3 py-2.5 font-bold">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {regions.map((r) => {
                const isEditing = editingRegionId === r.id;
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2.5 font-semibold text-slate-900">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editingRegionName}
                            onChange={(e) => setEditingRegionName(e.target.value)}
                            className="min-h-[34px] flex-1 rounded border border-teal-600 px-2.5 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => void handleSaveRegionEdit(r.id)}
                            aria-label={`ذخیره منطقه ${r.name}`}
                            className="inline-flex h-8 items-center rounded bg-teal-700 px-2.5 text-white"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingRegionId(null)}
                            aria-label="انصراف"
                            className="inline-flex h-8 items-center rounded border border-slate-300 px-2 text-slate-600"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        r.name
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`font-bold ${r.is_active ? 'text-emerald-700' : 'text-slate-400'}`}
                      >
                        {r.is_active ? 'فعال (نمایش در پرتال)' : 'غیرفعال'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRegionId(r.id);
                            setEditingRegionName(r.name);
                          }}
                          aria-label={`ویرایش منطقه ${r.name}`}
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil className="h-3 w-3" />
                          <span>ویرایش</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleRegionActive(r)}
                          className="min-h-[34px] rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {r.is_active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteRegion(r)}
                          aria-label={`حذف منطقه ${r.name}`}
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-red-200 px-2.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>حذف</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
