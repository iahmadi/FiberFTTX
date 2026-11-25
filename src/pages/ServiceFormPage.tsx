import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  CloudOff,
  PackagePlus,
  Plus,
  Radio,
  Split,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import { ProvisioningConfigBox } from '../components/ProvisioningConfigBox';
import { SearchableSelect } from '../components/SearchableSelect';
import {
  ALL_TICKET_TYPE_LABELS,
  SPLITTER_OPTIONS,
  getSpoolPercentRemaining,
  getTicketTypeFieldVisibility,
  validateModemSerial,
  validatePortNumber,
  validateSplitterChanges,
  type DynamicMaterialUsageItem,
  type ModemSource,
  type ServiceSourceType,
  type TicketTypeKey,
} from '../lib/fiberLogic';
import { toPersianDigits } from '../lib/jalali';
import {
  clearServiceFormDraft,
  loadServiceFormDraft,
  queueOfflineMutation,
  saveServiceFormDraft,
  type OutboxStoredImage,
} from '../lib/offlineDb';
import { userHasPermission } from '../lib/permissions';
import type {
  AuthUser,
  FatItem,
  FFatItem,
  ModemBrandItem,
  ServiceRecordDetail,
  SpoolItem,
  TicketItem,
  VanStockItem,
} from '../types/erp';
import { apiFetch, uploadCompressedImage } from '../utils/api';
import { compressImageForUpload, formatBytesFa } from '../utils/imageCompression';

interface ServiceFormPageProps {
  user: AuthUser;
  tickets: TicketItem[];
  fats: FatItem[];
  ffats: FFatItem[];
  modemBrands: ModemBrandItem[];
  spools: SpoolItem[];
  vanStock: VanStockItem[];
  selectedTicketId: number | null;
  editingCompletedTicketId?: number | null;
  isOnline: boolean;
  onSelectTicketId: (id: number | null) => void;
  onCancelEdit?: () => void;
  onCompleted: () => Promise<void>;
  onOutboxChanged: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, desc?: string) => void;
}

interface PendingPhoto extends OutboxStoredImage {
  id: string;
  previewUrl: string;
  caption: string;
}

interface ExistingServerPhoto {
  id: number;
  image_type: string;
  file_path: string;
  caption: string;
}

interface DynamicMaterialFormRow {
  rowId: string;
  item_id: string;
  quantity: string;
}

interface ServiceFormDraft {
  sourceType: ServiceSourceType;
  sourceId: string;
  portNumber: string;
  fusionCount: string;
  outSpoolId: string;
  outMeter: string;
  inSpoolId: string;
  inMeter: string;
  modemSource: ModemSource;
  vanStockId: string;
  modemBrandId: string;
  modemSerial: string;
  dynamicMaterials: DynamicMaterialFormRow[];
  parentRemovedSplitter: string;
  parentInstalledSplitters: string[];
  ffatInstalledSplitter: string;
  notes: string;
}

const SPLITTER_LABELS: Record<string, string> = {
  none: 'بدون اسپلیتر',
  '1:2': 'اسپلیتر ۱ به ۲',
  '1:4': 'اسپلیتر ۱ به ۴',
  '1:8': 'اسپلیتر ۱ به ۸',
  '1:16': 'اسپلیتر ۱ به ۱۶',
  '1:32': 'اسپلیتر ۱ به ۳۲',
  '1:64': 'اسپلیتر ۱ به ۶۴',
};

export function ServiceFormPage({
  user,
  tickets,
  fats,
  ffats,
  modemBrands,
  spools,
  vanStock,
  selectedTicketId,
  editingCompletedTicketId = null,
  isOnline,
  onSelectTicketId,
  onCancelEdit,
  onCompleted,
  onOutboxChanged,
  onNotify,
}: ServiceFormPageProps) {
  const isEditMode = Boolean(editingCompletedTicketId);

  const openTickets = useMemo(
    () =>
      tickets.filter(
        (t): t is TicketItem & { type: TicketTypeKey } =>
          t.type !== 'public_preregistration' &&
          t.status !== 'pending_operator' &&
          t.status !== 'completed' &&
          t.status !== 'failed',
      ),
    [tickets],
  );

  const activeTicket = useMemo(() => {
    if (editingCompletedTicketId) {
      return tickets.find((t) => t.id === editingCompletedTicketId) || null;
    }
    return (
      openTickets.find((t) => t.id === selectedTicketId) ||
      openTickets[0] ||
      null
    );
  }, [editingCompletedTicketId, tickets, openTickets, selectedTicketId]);

  const [sourceType, setSourceType] = useState<ServiceSourceType>('FAT');
  const [sourceId, setSourceId] = useState('');
  const [portNumber, setPortNumber] = useState('');
  const [fusionCount, setFusionCount] = useState('0');
  const [outSpoolId, setOutSpoolId] = useState('');
  const [outMeter, setOutMeter] = useState('0');
  const [inSpoolId, setInSpoolId] = useState('');
  const [inMeter, setInMeter] = useState('0');

  const [modemSource, setModemSource] = useState<ModemSource>('company');
  const [vanStockId, setVanStockId] = useState('');
  const [modemBrandId, setModemBrandId] = useState('');
  const [modemSerial, setModemSerial] = useState('');

  // Dynamic Van Stock 'unit' materials (ATB, OTO, Pigtails, Adapters)
  const [dynamicMaterials, setDynamicMaterials] = useState<DynamicMaterialFormRow[]>([]);
  const [originalEditMaterials, setOriginalEditMaterials] = useState<DynamicMaterialUsageItem[]>([]);
  const [originalEditRecord, setOriginalEditRecord] = useState<ServiceRecordDetail | null>(null);

  // F-FAT Splitter Changes
  const [parentRemovedSplitter, setParentRemovedSplitter] = useState('none');
  const [parentInstalledSplitters, setParentInstalledSplitters] = useState<string[]>(['1:8']);
  const [ffatInstalledSplitter, setFfatInstalledSplitter] = useState('1:8');

  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [existingImages, setExistingImages] = useState<ExistingServerPhoto[]>([]);
  const [draftLoadedForTicket, setDraftLoadedForTicket] = useState<number | null>(null);
  const [loadingEditRecord, setLoadingEditRecord] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canCrossUseCable = userHasPermission(user, 'can_cross_use_cable');
  const canViewAll = userHasPermission(user, 'can_view_all_tickets');
  const effectiveInstallerId = activeTicket?.assigned_installer || user.id;

  // Load existing service record when editing a completed ticket
  useEffect(() => {
    if (!editingCompletedTicketId) {
      setOriginalEditRecord(null);
      setOriginalEditMaterials([]);
      setExistingImages([]);
      return;
    }

    let cancelled = false;
    setLoadingEditRecord(true);
    apiFetch<{ record: ServiceRecordDetail }>(`/api/tickets/${editingCompletedTicketId}/service-record`)
      .then((res) => {
        if (cancelled) return;
        const rec = res.record;
        setOriginalEditRecord(rec);
        setSourceType(rec.source_type);
        setSourceId(String(rec.source_id));
        setPortNumber(rec.port_number !== null && rec.port_number !== undefined ? String(rec.port_number) : '');
        setFusionCount(String(rec.fusion_count ?? 0));
        setOutSpoolId(rec.out_spool_id ? String(rec.out_spool_id) : '');
        setOutMeter(String(rec.out_total_meter ?? 0));
        setInSpoolId(rec.in_spool_id ? String(rec.in_spool_id) : '');
        setInMeter(String(rec.in_total_meter ?? 0));
        setModemSource(rec.modem_source);
        setVanStockId(rec.van_stock_id ? String(rec.van_stock_id) : '');
        setModemBrandId(rec.modem_brand_id ? String(rec.modem_brand_id) : '');
        setModemSerial(rec.modem_serial || '');
        const dynMats = Array.isArray(rec.dynamic_materials) ? rec.dynamic_materials : [];
        setOriginalEditMaterials(dynMats);
        setDynamicMaterials(
          dynMats.map((m, idx) => ({
            rowId: `edit-mat-${idx}-${m.item_id}`,
            item_id: String(m.item_id),
            quantity: String(m.quantity),
          })),
        );
        if (rec.splitter_changes) {
          setParentRemovedSplitter(rec.splitter_changes.parent_fat_removed_splitter || 'none');
          setParentInstalledSplitters(
            rec.splitter_changes.parent_fat_installed_splitters?.length > 0
              ? rec.splitter_changes.parent_fat_installed_splitters
              : ['1:8'],
          );
          setFfatInstalledSplitter(rec.splitter_changes.ffat_installed_splitter || '1:8');
        }
        setNotes(rec.notes || '');
        setExistingImages(
          (rec.images || []).map((img) => ({
            id: img.id,
            image_type: img.image_type,
            file_path: img.file_path,
            caption: img.caption || '',
          })),
        );
        setPhotos([]);
        setDraftLoadedForTicket(editingCompletedTicketId);
      })
      .catch((err) => {
        if (!cancelled) {
          onNotify('error', 'خطا در بارگذاری اطلاعات فرم تکمیل‌شده', err instanceof Error ? err.message : undefined);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingEditRecord(false);
      });

    return () => {
      cancelled = true;
    };
  }, [editingCompletedTicketId, onNotify]);

  // Load saved offline draft when switching active ticket (create mode)
  useEffect(() => {
    if (isEditMode || !activeTicket) return;
    if (draftLoadedForTicket === activeTicket.id) return;

    let cancelled = false;
    loadServiceFormDraft<ServiceFormDraft>(activeTicket.id).then((draft) => {
      if (cancelled) return;
      if (draft) {
        setSourceType(draft.sourceType || 'FAT');
        setSourceId(draft.sourceId || '');
        setPortNumber(draft.portNumber || '');
        setFusionCount(draft.fusionCount || '0');
        setOutSpoolId(draft.outSpoolId || '');
        setOutMeter(draft.outMeter || '0');
        setInSpoolId(draft.inSpoolId || '');
        setInMeter(draft.inMeter || '0');
        setModemSource(draft.modemSource || 'company');
        setVanStockId(draft.vanStockId || '');
        setModemBrandId(draft.modemBrandId || '');
        setModemSerial(draft.modemSerial || '');
        setDynamicMaterials(Array.isArray(draft.dynamicMaterials) ? draft.dynamicMaterials : []);
        setParentRemovedSplitter(draft.parentRemovedSplitter || 'none');
        setParentInstalledSplitters(
          Array.isArray(draft.parentInstalledSplitters) && draft.parentInstalledSplitters.length > 0
            ? draft.parentInstalledSplitters
            : ['1:8'],
        );
        setFfatInstalledSplitter(draft.ffatInstalledSplitter || '1:8');
        setNotes(draft.notes || '');
      }
      setDraftLoadedForTicket(activeTicket.id);
    });

    return () => {
      cancelled = true;
    };
  }, [isEditMode, activeTicket, draftLoadedForTicket]);

  // Auto-save form draft into IndexedDB on changes (create mode)
  useEffect(() => {
    if (isEditMode || !activeTicket || draftLoadedForTicket !== activeTicket.id) return;
    const timer = setTimeout(() => {
      const draft: ServiceFormDraft = {
        sourceType,
        sourceId,
        portNumber,
        fusionCount,
        outSpoolId,
        outMeter,
        inSpoolId,
        inMeter,
        modemSource,
        vanStockId,
        modemBrandId,
        modemSerial,
        dynamicMaterials,
        parentRemovedSplitter,
        parentInstalledSplitters,
        ffatInstalledSplitter,
        notes,
      };
      void saveServiceFormDraft(activeTicket.id, draft);
    }, 350);

    return () => clearTimeout(timer);
  }, [
    isEditMode,
    activeTicket,
    draftLoadedForTicket,
    sourceType,
    sourceId,
    portNumber,
    fusionCount,
    outSpoolId,
    outMeter,
    inSpoolId,
    inMeter,
    modemSource,
    vanStockId,
    modemBrandId,
    modemSerial,
    dynamicMaterials,
    parentRemovedSplitter,
    parentInstalledSplitters,
    ffatInstalledSplitter,
    notes,
  ]);

  const sourceOptions = useMemo(() => {
    if (sourceType === 'FAT') {
      return fats.map((f) => ({
        value: String(f.id),
        label: `FAT ${toPersianDigits(f.fat_number)}`,
        sublabel: f.olt_name || undefined,
      }));
    }
    return ffats.map((ff) => ({
      value: String(ff.id),
      label: ff.ffat_code,
      sublabel: ff.fat_number ? `متصل به FAT ${toPersianDigits(ff.fat_number)}` : undefined,
    }));
  }, [sourceType, fats, ffats]);

  const outdoorSpoolOptions = useMemo(
    () =>
      spools
        .filter((s) => {
          const isOwnOrCross = canCrossUseCable || s.assigned_installer_id === effectiveInstallerId;
          const isPreviouslySelected = isEditMode && originalEditRecord?.out_spool_id === s.id;
          return (
            s.cable_type === 'outdoor' &&
            ((s.current_length > 0 && isOwnOrCross) || isPreviouslySelected)
          );
        })
        .map((s) => ({
          value: String(s.id),
          label: `${s.spool_code} (${toPersianDigits(s.current_length)} متر باقیمانده)`,
          sublabel: `${s.installer_name || 'انبار مرکزی'} — ${toPersianDigits(
            getSpoolPercentRemaining(s),
          )}٪`,
        })),
    [spools, canCrossUseCable, effectiveInstallerId, isEditMode, originalEditRecord],
  );

  const indoorSpoolOptions = useMemo(
    () =>
      spools
        .filter((s) => {
          const isOwnOrCross = canCrossUseCable || s.assigned_installer_id === effectiveInstallerId;
          const isPreviouslySelected = isEditMode && originalEditRecord?.in_spool_id === s.id;
          return (
            s.cable_type === 'indoor' &&
            ((s.current_length > 0 && isOwnOrCross) || isPreviouslySelected)
          );
        })
        .map((s) => ({
          value: String(s.id),
          label: `${s.spool_code} (${toPersianDigits(s.current_length)} متر باقیمانده)`,
          sublabel: `${s.installer_name || 'انبار مرکزی'} — ${toPersianDigits(
            getSpoolPercentRemaining(s),
          )}٪`,
        })),
    [spools, canCrossUseCable, effectiveInstallerId, isEditMode, originalEditRecord],
  );

  const installerVanModems = useMemo(
    () =>
      vanStock.filter(
        (v) =>
          v.item_type === 'modem' &&
          v.quantity > 0 &&
          (canViewAll || v.user_id === effectiveInstallerId),
      ),
    [vanStock, canViewAll, effectiveInstallerId],
  );

  // Aggregate available 'unit' Van Stock items for dynamic material rows
  const availableUnitItems = useMemo(() => {
    const byItem = new Map<number, { item_id: number; item_name: string; available: number }>();
    for (const v of vanStock) {
      if (v.item_type !== 'unit') continue;
      if (!canViewAll && v.user_id !== effectiveInstallerId) continue;
      if (v.quantity <= 0) continue;
      const existing = byItem.get(v.item_id);
      if (existing) {
        existing.available += Number(v.quantity);
      } else {
        byItem.set(v.item_id, {
          item_id: v.item_id,
          item_name: v.item_name,
          available: Number(v.quantity),
        });
      }
    }
    if (isEditMode) {
      for (const prevMat of originalEditMaterials) {
        const existing = byItem.get(prevMat.item_id);
        if (existing) {
          existing.available += prevMat.quantity;
        } else {
          byItem.set(prevMat.item_id, {
            item_id: prevMat.item_id,
            item_name: prevMat.item_name,
            available: prevMat.quantity,
          });
        }
      }
    }
    return Array.from(byItem.values());
  }, [vanStock, canViewAll, effectiveInstallerId, isEditMode, originalEditMaterials]);

  const selectedBrand = useMemo(
    () => modemBrands.find((b) => String(b.id) === modemBrandId),
    [modemBrands, modemBrandId],
  );

  const serialValidation = useMemo(() => {
    if (!selectedBrand || !modemSerial.trim()) return null;
    return validateModemSerial(modemSerial, selectedBrand);
  }, [selectedBrand, modemSerial]);

  const handleSelectVanModem = (idStr: string) => {
    setVanStockId(idStr);
    const found = installerVanModems.find((v) => String(v.id) === idStr);
    if (found) {
      if (found.modem_brand_id) setModemBrandId(String(found.modem_brand_id));
      if (found.serial_number) setModemSerial(found.serial_number);
    }
  };

  const handleAddDynamicMaterialRow = () => {
    const defaultItemId = availableUnitItems[0] ? String(availableUnitItems[0].item_id) : '';
    setDynamicMaterials((prev) => [
      ...prev,
      { rowId: `mat-${Date.now()}-${Math.random()}`, item_id: defaultItemId, quantity: '1' },
    ]);
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>, imageType: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressing(true);
    try {
      const res = await compressImageForUpload(file, 1280, 0.7);
      setPhotos((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          imageType,
          filename: res.filename,
          caption: '',
          blob: res.blob,
          previewUrl: res.previewUrl,
          originalSize: res.originalSize,
          compressedSize: res.compressedSize,
        },
      ]);
      onNotify(
        'success',
        'تصویر فشرده‌سازی شد',
        `${formatBytesFa(res.originalSize)} ← ${formatBytesFa(res.compressedSize)}`,
      );
    } catch (err) {
      onNotify('error', 'خطا در فشرده‌سازی تصویر', err instanceof Error ? err.message : undefined);
    } finally {
      setCompressing(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeTicket || activeTicket.type === 'public_preregistration') return;

    if (!sourceId) {
      onNotify('error', 'انتخاب پورت تجهیزات مبدا (FAT یا F-FAT) الزامی است');
      return;
    }

    const isPortRequired = activeTicket.type !== 'ffat_install';
    const portCheck = validatePortNumber(portNumber, isPortRequired);
    if (!portCheck.ok) {
      onNotify('error', 'شماره پورت نامعتبر است', portCheck.error);
      return;
    }

    const parsedFusionCount = Math.max(0, Math.round(Number(fusionCount) || 0));

    const splitterInput =
      activeTicket.type === 'ffat_install'
        ? {
            parent_fat_removed_splitter: parentRemovedSplitter,
            parent_fat_installed_splitters: parentInstalledSplitters.filter(Boolean),
            ffat_installed_splitter: ffatInstalledSplitter,
          }
        : null;
    const splitterCheck = validateSplitterChanges(activeTicket.type, splitterInput);
    if (!splitterCheck.ok) {
      onNotify('error', 'اطلاعات اسپلیترهای F-FAT ناقص است', splitterCheck.error);
      return;
    }

    const cleanedDynamicMaterials = dynamicMaterials
      .filter((r) => r.item_id && Number(r.quantity) > 0)
      .map((r) => ({ item_id: Number(r.item_id), quantity: Math.round(Number(r.quantity)) }));

    const vis = getTicketTypeFieldVisibility(activeTicket.type);
    if ((vis.requiresModem || modemSerial.trim()) && selectedBrand) {
      const check = validateModemSerial(modemSerial, selectedBrand);
      if (!check.valid) {
        onNotify('error', 'سریال مودم معتبر نیست', check.reason);
        return;
      }
    }

    const payload = {
      ticket_id: activeTicket.id,
      source_type: sourceType,
      source_id: Number(sourceId),
      port_number: portCheck.value,
      fusion_count: parsedFusionCount,
      out_spool_id: outSpoolId ? Number(outSpoolId) : null,
      out_total_meter: Number(outMeter) || 0,
      in_spool_id: inSpoolId ? Number(inSpoolId) : null,
      in_total_meter: Number(inMeter) || 0,
      modem_source: modemSource,
      van_stock_id: modemSource === 'company' && vanStockId ? Number(vanStockId) : null,
      modem_brand_id: modemBrandId ? Number(modemBrandId) : null,
      modem_serial: modemSerial.trim() || null,
      dynamic_materials: cleanedDynamicMaterials,
      splitter_changes: splitterCheck.normalized,
      notes: notes.trim() || null,
    };

    const queueIntoIndexedDb = async () => {
      await queueOfflineMutation({
        kind: 'service_record',
        ticketId: activeTicket.id,
        payload,
        images: photos.map((p) => ({
          imageType: p.imageType,
          filename: p.filename,
          caption: p.caption.trim() || undefined,
          blob: p.blob,
          originalSize: p.originalSize,
          compressedSize: p.compressedSize,
        })),
      });
      await clearServiceFormDraft(activeTicket.id);
      await onOutboxChanged();
      onNotify(
        'info',
        'گزارش عملیات در حافظه آفلاین (IndexedDB) ذخیره شد',
        'به محض برقراری اینترنت، تصاویر، متریال و فرم به صورت خودکار ارسال می‌شود.',
      );
      setNotes('');
      setPhotos([]);
      setDynamicMaterials([]);
    };

    setSubmitting(true);
    try {
      if (!isOnline && !isEditMode) {
        await queueIntoIndexedDb();
        return;
      }

      const uploadedImages: Array<{ image_type: string; file_path: string; caption?: string }> =
        isEditMode
          ? existingImages.map((img) => ({
              image_type: img.image_type,
              file_path: img.file_path,
              caption: img.caption.trim() || undefined,
            }))
          : [];

      for (const photo of photos) {
        const up = await uploadCompressedImage(
          activeTicket.id,
          photo.imageType,
          photo.blob,
          photo.filename,
        );
        uploadedImages.push({
          image_type: up.image_type,
          file_path: up.file_path,
          caption: photo.caption.trim() || undefined,
        });
      }

      if (isEditMode) {
        await apiFetch(`/api/service-records/${activeTicket.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...payload, images: uploadedImages }),
        });
        onNotify(
          'success',
          'فرم عملیات با موفقیت ویرایش و تاریخچه تغییرات ثبت شد',
          'تغییرات موجودی قرقره‌ها، متریال انبار خودرو و سند مالی به صورت خودکار اصلاح گردید.',
        );
        await onCompleted();
        return;
      }

      const res = await apiFetch<{
        lowSpoolAlerts?: Array<{ spool_code: string; percentRemaining: number }>;
      }>('/api/service-records', {
        method: 'POST',
        body: JSON.stringify({ ...payload, images: uploadedImages }),
      });

      await clearServiceFormDraft(activeTicket.id);

      if (res.lowSpoolAlerts && res.lowSpoolAlerts.length > 0) {
        for (const alert of res.lowSpoolAlerts) {
          onNotify(
            'error',
            `هشدار کاهش موجودی قرقره ${alert.spool_code}`,
            `موجودی قرقره به ${toPersianDigits(alert.percentRemaining)}٪ رسید (زیر ۱۰٪ آستانه).`,
          );
        }
      }

      onNotify('success', 'گزارش تکمیل عملیات ثبت و دستمزد (شامل فیوژن) به دفتر کل اضافه شد');
      setSourceId('');
      setPortNumber('');
      setFusionCount('0');
      setOutMeter('0');
      setInMeter('0');
      setModemSerial('');
      setDynamicMaterials([]);
      setNotes('');
      setPhotos([]);
      await onCompleted();
    } catch (err) {
      if (!navigator.onLine && !isEditMode) {
        await queueIntoIndexedDb();
      } else {
        onNotify('error', 'خطا در ثبت گزارش عملیات', err instanceof Error ? err.message : undefined);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!isEditMode && openTickets.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        تیکت فعالی در وضعیت در انتظار یا در حال اجرا وجود ندارد.
      </div>
    );
  }

  if (loadingEditRecord) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        در حال بارگذاری اطلاعات فرم عملیات تکمیل‌شده...
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {isEditMode && activeTicket && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-xs text-sky-950">
          <div>
            <strong>حالت ویرایش فرم تکمیل‌شده (تیکت #{toPersianDigits(activeTicket.id)}): </strong>
            <span>
              نسخه قبلی در تاریخچه (Audit History) بایگانی شده و مابه‌التفاوت قرقره، متریال خودرو و
              دفتر کل مالی به صورت خودکار اعمال می‌شود.
            </span>
          </div>
          {onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-sky-300 bg-white px-3 text-xs font-bold text-sky-900 hover:bg-sky-100"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              <span>بازگشت به تیکت‌ها</span>
            </button>
          )}
        </div>
      )}

      {!isOnline && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
          <CloudOff className="h-4 w-4 shrink-0" />
          <span>
            شما در حالت آفلاین هستید؛ تمام اطلاعات، ردیف‌های متریال و تصاویر فشرده‌شده در IndexedDB
            ذخیره و پس از اتصال همگام‌سازی می‌شوند.
          </span>
        </div>
      )}

      {/* Active Ticket Selector & Read-Only Provisioning Box */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">
              {isEditMode ? 'تیکت در حال ویرایش' : 'انتخاب تیکت جهت تکمیل عملیات'}
            </label>
            {isEditMode && activeTicket ? (
              <div className="flex min-h-[44px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900">
                #{toPersianDigits(activeTicket.id)} — {activeTicket.customer_name} (
                {ALL_TICKET_TYPE_LABELS[activeTicket.type]})
              </div>
            ) : (
              <select
                value={activeTicket?.id || ''}
                onChange={(e) => {
                  const nextId = Number(e.target.value);
                  setDraftLoadedForTicket(null);
                  onSelectTicketId(nextId);
                }}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium"
              >
                {openTickets.map((t) => (
                  <option key={t.id} value={t.id}>
                    #{toPersianDigits(t.id)} — {t.customer_name} ({ALL_TICKET_TYPE_LABELS[t.type]})
                  </option>
                ))}
              </select>
            )}
          </div>
          {activeTicket && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="font-bold text-slate-900">{activeTicket.customer_name}</div>
              <div className="mt-1 text-slate-600">{activeTicket.address}</div>
            </div>
          )}
        </div>

        {activeTicket && <ProvisioningConfigBox ticket={activeTicket} />}
      </div>

      {/* Hardware Connection Source Toggle: FAT vs FFAT + Port Number (1-128) */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Radio className="h-4 w-4 text-teal-700" />
          <span>نقطه اتصال مبدا در توپولوژی شبکه (FAT یا F-FAT) و شماره پورت</span>
        </div>

        <div className="grid max-w-md grid-cols-2 gap-3">
          <label
            className={`flex min-h-[46px] cursor-pointer items-center justify-center gap-2 rounded-lg border text-xs font-bold transition-colors ${
              sourceType === 'FAT'
                ? 'border-teal-700 bg-teal-50 text-teal-900'
                : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            <input
              type="radio"
              name="source_type"
              value="FAT"
              checked={sourceType === 'FAT'}
              onChange={() => {
                setSourceType('FAT');
                setSourceId('');
              }}
              className="accent-teal-700"
            />
            <span>اتصال مستقیم از FAT</span>
          </label>

          <label
            className={`flex min-h-[46px] cursor-pointer items-center justify-center gap-2 rounded-lg border text-xs font-bold transition-colors ${
              sourceType === 'FFAT'
                ? 'border-teal-700 bg-teal-50 text-teal-900'
                : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            <input
              type="radio"
              name="source_type"
              value="FFAT"
              checked={sourceType === 'FFAT'}
              onChange={() => {
                setSourceType('FFAT');
                setSourceId('');
              }}
              className="accent-teal-700"
            />
            <span>اتصال از F-FAT</span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              {sourceType === 'FAT' ? 'انتخاب پورت / باکس FAT' : 'انتخاب کد F-FAT'}
            </label>
            <SearchableSelect
              id="service-source-select"
              options={sourceOptions}
              value={sourceId}
              onChange={setSourceId}
              placeholder={sourceType === 'FAT' ? 'انتخاب FAT...' : 'انتخاب F-FAT...'}
            />
          </div>

          <div>
            <label
              htmlFor="service-port-number"
              className="mb-1.5 block text-xs font-semibold text-slate-700"
            >
              شماره پورت استفاده‌شده (۱ تا ۱۲۸)
              {activeTicket?.type !== 'ffat_install' && <span className="text-red-600"> *</span>}
            </label>
            <input
              id="service-port-number"
              type="number"
              min={1}
              max={128}
              required={activeTicket?.type !== 'ffat_install'}
              value={portNumber}
              onChange={(e) => setPortNumber(e.target.value)}
              placeholder="مثلاً 12"
              className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm tabular-nums focus:border-teal-700 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* F-FAT Splitter Changes (Shown strictly for ffat_install) */}
      {activeTicket?.type === 'ffat_install' && (
        <div className="space-y-4 rounded-xl border border-teal-200 bg-teal-50/40 p-5 shadow-xs">
          <div className="flex items-center gap-2 text-sm font-bold text-teal-950">
            <Split className="h-4 w-4 text-teal-700" />
            <span>تغییرات اسپلیتر باکس FAT والد و F-FAT جدید (الزامی برای نصب F-FAT)</span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                اسپلیتر حذف / تعویض‌شده از FAT والد
              </label>
              <select
                value={parentRemovedSplitter}
                onChange={(e) => setParentRemovedSplitter(e.target.value)}
                className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium"
              >
                {SPLITTER_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {SPLITTER_LABELS[opt] || opt} ({opt})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                اسپلیتر نصب‌شده در باکس F-FAT جدید
              </label>
              <select
                value={ffatInstalledSplitter}
                onChange={(e) => setFfatInstalledSplitter(e.target.value)}
                className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium"
              >
                {SPLITTER_OPTIONS.filter((o) => o !== 'none').map((opt) => (
                  <option key={opt} value={opt}>
                    {SPLITTER_LABELS[opt] || opt} ({opt})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                اسپلیتر(های) نصب‌شده روی FAT والد
              </span>
              <button
                type="button"
                onClick={() => setParentInstalledSplitters((prev) => [...prev, '1:8'])}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-teal-300 bg-white px-2.5 text-[11px] font-bold text-teal-800 hover:bg-teal-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>افزودن اسپلیتر والد</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {parentInstalledSplitters.map((val, idx) => (
                <div
                  key={`parent-sp-${idx}`}
                  className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-1"
                >
                  <select
                    value={val}
                    onChange={(e) =>
                      setParentInstalledSplitters((prev) =>
                        prev.map((item, i) => (i === idx ? e.target.value : item)),
                      )
                    }
                    className="min-h-[34px] rounded px-2 text-xs font-medium focus:outline-none"
                  >
                    {SPLITTER_OPTIONS.filter((o) => o !== 'none').map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  {parentInstalledSplitters.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setParentInstalledSplitters((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="rounded p-1 text-red-600 hover:bg-red-50"
                      aria-label="حذف اسپلیتر"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Exact Spool Consumption + Fusion Count */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">مصرف دقیق کابل قرقره‌ها و تعداد فیوژن</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-bold text-slate-800">کابل فضای باز (Outdoor)</div>
            <SearchableSelect
              options={outdoorSpoolOptions}
              value={outSpoolId}
              onChange={setOutSpoolId}
              placeholder="انتخاب قرقره فضای باز..."
            />
            <div>
              <label className="mb-1 block text-xs text-slate-600">متراژ مصرف‌شده (متر)</label>
              <input
                type="number"
                min={0}
                value={outMeter}
                onChange={(e) => setOutMeter(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-bold text-slate-800">کابل داخلی (Indoor)</div>
            <SearchableSelect
              options={indoorSpoolOptions}
              value={inSpoolId}
              onChange={setInSpoolId}
              placeholder="انتخاب قرقره داخلی..."
            />
            <div>
              <label className="mb-1 block text-xs text-slate-600">متراژ مصرف‌شده (متر)</label>
              <input
                type="number"
                min={0}
                value={inMeter}
                onChange={(e) => setInMeter(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/50 p-4">
            <div className="flex items-center gap-1.5 text-xs font-bold text-teal-950">
              <Zap className="h-4 w-4 text-teal-700" />
              <span>تعداد فیوژن انجام‌شده (Fusion)</span>
            </div>
            <div>
              <label
                htmlFor="service-fusion-count"
                className="mb-1 block text-xs text-slate-600"
              >
                تعداد سرپیچ / مفصل فیوژن (محاسبه در تعرفه پیمانکار)
              </label>
              <input
                id="service-fusion-count"
                type="number"
                min={0}
                value={fusionCount}
                onChange={(e) => setFusionCount(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm tabular-nums"
              />
            </div>
            <p className="text-[11px] leading-4 text-slate-500">
              در صورت انجام فیوژن، اجرت پایه و فیوژن‌های مازاد مطابق قرارداد به صورت خودکار محاسبه
              می‌شود.
            </p>
          </div>
        </div>
      </div>

      {/* Dynamic Van Stock 'unit' Materials Consumption (ATB, OTO, Pigtails, Adapters) */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <PackagePlus className="h-4 w-4 text-teal-700" />
            <span>متریال و تجهیزات مصرفی از انبار خودرو (ATB، OTO، پیگتیل، آداپتور و...)</span>
          </div>
          <button
            type="button"
            disabled={availableUnitItems.length === 0}
            onClick={handleAddDynamicMaterialRow}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-teal-700 bg-teal-50 px-3 text-xs font-bold text-teal-900 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            <span>افزودن ردیف تجهیز</span>
          </button>
        </div>

        {availableUnitItems.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            تجهیز عددی (ATB، پیگتیل و...) در انبار خودروی نصاب ثبت نشده است.
          </div>
        ) : dynamicMaterials.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            در صورت مصرف تجهیزات جانبی (ATB، OTO، پیگتیل، پچ‌کورد و...) روی دکمه «افزودن ردیف تجهیز»
            کلیک کنید.
          </div>
        ) : (
          <div className="space-y-2.5">
            {dynamicMaterials.map((row) => (
              <div
                key={row.rowId}
                className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-12"
              >
                <div className="sm:col-span-7">
                  <select
                    value={row.item_id}
                    onChange={(e) =>
                      setDynamicMaterials((prev) =>
                        prev.map((r) =>
                          r.rowId === row.rowId ? { ...r, item_id: e.target.value } : r,
                        ),
                      )
                    }
                    className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium"
                  >
                    <option value="">انتخاب تجهیز از انبار خودرو...</option>
                    {availableUnitItems.map((it) => (
                      <option key={it.item_id} value={it.item_id}>
                        {it.item_name} (موجود: {toPersianDigits(it.available)} عدد)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <input
                    type="number"
                    min={1}
                    required
                    value={row.quantity}
                    onChange={(e) =>
                      setDynamicMaterials((prev) =>
                        prev.map((r) =>
                          r.rowId === row.rowId ? { ...r, quantity: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder="تعداد مصرفی"
                    className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs tabular-nums"
                  />
                </div>

                <div className="flex justify-end sm:col-span-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDynamicMaterials((prev) => prev.filter((r) => r.rowId !== row.rowId))
                    }
                    className="inline-flex min-h-[40px] w-full items-center justify-center gap-1 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>حذف</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modem & Van Stock + Live Regex Validation */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900">
          مشخصات مودم و کنترل انبار خودرو (Van Stock)
        </h3>

        <div className="flex flex-wrap gap-3">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 text-xs font-semibold">
            <input
              type="radio"
              name="modem_source"
              checked={modemSource === 'company'}
              onChange={() => setModemSource('company')}
              className="accent-teal-700"
            />
            <span>مودم تحویلی از انبار شرکت (کسر از Van Stock)</span>
          </label>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 text-xs font-semibold">
            <input
              type="radio"
              name="modem_source"
              checked={modemSource === 'customer'}
              onChange={() => {
                setModemSource('customer');
                setVanStockId('');
              }}
              className="accent-teal-700"
            />
            <span>مودم متعلق به مشترک (بدون کسر از انبار)</span>
          </label>
        </div>

        {modemSource === 'company' && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              انتخاب مودم از انبار خودروی نصاب
            </label>
            <select
              value={vanStockId}
              onChange={(e) => handleSelectVanModem(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">انتخاب مودم موجود در خودرو...</option>
              {installerVanModems.map((vm) => (
                <option key={vm.id} value={vm.id}>
                  {vm.item_name} — سریال: {vm.serial_number || 'ثبت‌نشده'} ({vm.installer_name})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">برند مودم</label>
            <select
              value={modemBrandId}
              onChange={(e) => setModemBrandId(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">انتخاب برند...</option>
              {modemBrands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} (پیشوند: {b.serial_prefix})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              شماره سریال مودم (S/N)
            </label>
            <input
              type="text"
              dir="ltr"
              value={modemSerial}
              onChange={(e) => setModemSerial(e.target.value)}
              placeholder={selectedBrand ? `${selectedBrand.serial_prefix}...` : '48575443...'}
              className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-left text-sm"
            />
            {serialValidation && (
              <p
                className={`mt-1 text-xs font-medium ${
                  serialValidation.valid ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                {serialValidation.valid
                  ? 'فرمت سریال مودم با الگوی کارخانه مطابقت دارد.'
                  : serialValidation.reason}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Client-Side Canvas Image Compression + Captions */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              تصاویر مستندات عملیات و کپشن اختیاری (فشرده‌سازی خودکار حداکثر ۱۲۸۰ پیکسل / JPEG 70%)
            </h3>
            <p className="text-xs text-slate-500">
              مناسب ذخیره آفلاین در گوشی و ارسال سریع روی شبکه اینترانت
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-teal-700 bg-teal-50 px-3.5 text-xs font-bold text-teal-900 hover:bg-teal-100">
              <Camera className="h-4 w-4" />
              <span>{compressing ? 'در حال فشرده‌سازی...' : 'ثبت عکس با دوربین'}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={compressing}
                onChange={(e) => handleFileChange(e, 'site_photo')}
                className="hidden"
              />
            </label>

            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-50">
              <Upload className="h-4 w-4" />
              <span>انتخاب از گالری</span>
              <input
                type="file"
                accept="image/*"
                disabled={compressing}
                onChange={(e) => handleFileChange(e, 'power_meter')}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {(existingImages.length > 0 || photos.length > 0) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {existingImages.map((img) => (
              <div
                key={`existing-${img.id}`}
                className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
              >
                <img
                  src={img.file_path}
                  alt={img.caption || img.image_type}
                  className="h-28 w-full object-cover"
                />
                <div className="space-y-1.5 p-2">
                  <input
                    type="text"
                    value={img.caption}
                    onChange={(e) =>
                      setExistingImages((prev) =>
                        prev.map((item) =>
                          item.id === img.id ? { ...item, caption: e.target.value } : item,
                        ),
                      )
                    }
                    placeholder="توضیح (کپشن) تصویر..."
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                  />
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>تصویر ثبت‌شده</span>
                    <button
                      type="button"
                      onClick={() =>
                        setExistingImages((prev) => prev.filter((item) => item.id !== img.id))
                      }
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {photos.map((p) => (
              <div
                key={p.id}
                className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
              >
                <img
                  src={p.previewUrl}
                  alt={p.caption || p.filename}
                  className="h-28 w-full object-cover"
                />
                <div className="space-y-1.5 p-2">
                  <input
                    type="text"
                    value={p.caption}
                    onChange={(e) =>
                      setPhotos((prev) =>
                        prev.map((item) =>
                          item.id === p.id ? { ...item, caption: e.target.value } : item,
                        ),
                      )
                    }
                    placeholder="توضیح (کپشن) تصویر..."
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                  />
                  <div className="flex items-center justify-between gap-1 text-[11px]">
                    <span className="truncate text-slate-600">{formatBytesFa(p.compressedSize)}</span>
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((item) => item.id !== p.id))}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">
            توضیحات فنی نصاب (پاور نوری، شماره پورت، وضعیت تحویل)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="مثلاً تست پاور -18.5 dBm و تحویل سرویس با موفقیت..."
            className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3">
        {isEditMode && onCancelEdit && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            انصراف
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || compressing}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-teal-700 px-6 text-sm font-bold text-white shadow-sm hover:bg-teal-800 disabled:opacity-60"
        >
          <CheckCircle2 className="h-5 w-5" />
          <span>
            {submitting
              ? 'در حال ثبت...'
              : isEditMode
                ? 'ذخیره ویرایش فرم و اصلاح موجودی'
                : 'ثبت نهایی و تکمیل عملیات'}
          </span>
        </button>
      </div>
    </form>
  );
}
