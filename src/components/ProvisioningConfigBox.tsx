import { useState } from 'react';
import { Check, Copy, Network, PhoneCall, StickyNote } from 'lucide-react';
import { hasTicketProvisioningConfig } from '../lib/fiberLogic';
import { toPersianDigits } from '../lib/jalali';

interface ProvisioningConfigBoxProps {
  config_pppoe_user?: string | null;
  config_pppoe_pass?: string | null;
  config_vlan?: number | null;
  has_voip?: number | boolean | null;
  config_voip_data?: string | null;
  operator_notes?: string | null;
  compact?: boolean;
}

export function ProvisioningConfigBox({
  config_pppoe_user,
  config_pppoe_pass,
  config_vlan,
  has_voip,
  config_voip_data,
  operator_notes,
  compact = false,
}: ProvisioningConfigBoxProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const hasConfig = hasTicketProvisioningConfig({
    config_pppoe_user,
    config_pppoe_pass,
    config_vlan,
    has_voip,
    config_voip_data,
  });

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      setTimeout(() => setCopiedField((prev) => (prev === key ? null : prev)), 1500);
    } catch {
      // Clipboard API may be unavailable in restricted contexts
    }
  };

  if (!hasConfig && !operator_notes) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500">
        تنظیمات اختصاصی کانفیگ (PPPoE / VLAN / VoIP) یا یادداشت اپراتور برای این تیکت ثبت نشده است.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {hasConfig && (
        <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-3.5">
          <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-teal-900">
            <Network className="h-4 w-4 text-teal-700" />
            <span>اطلاعات کانفیگ سرویس (PPPoE / VLAN / VoIP)</span>
          </div>

          <div className={`grid gap-3 text-xs ${compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
            {config_pppoe_user && (
              <div className="rounded-md border border-teal-100 bg-white px-3 py-2">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>نام کاربری PPPoE</span>
                  <button
                    type="button"
                    onClick={() => handleCopy('user', config_pppoe_user)}
                    aria-label="کپی نام کاربری PPPoE"
                    className="rounded p-0.5 text-slate-400 hover:text-teal-700"
                  >
                    {copiedField === 'user' ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <div dir="ltr" className="mt-1 text-left font-mono font-semibold text-slate-900">
                  {config_pppoe_user}
                </div>
              </div>
            )}

            {config_pppoe_pass && (
              <div className="rounded-md border border-teal-100 bg-white px-3 py-2">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>رمز عبور PPPoE</span>
                  <button
                    type="button"
                    onClick={() => handleCopy('pass', config_pppoe_pass)}
                    aria-label="کپی رمز عبور PPPoE"
                    className="rounded p-0.5 text-slate-400 hover:text-teal-700"
                  >
                    {copiedField === 'pass' ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <div dir="ltr" className="mt-1 text-left font-mono font-semibold text-slate-900">
                  {config_pppoe_pass}
                </div>
              </div>
            )}

            {config_vlan !== null && config_vlan !== undefined && Number(config_vlan) > 0 && (
              <div className="rounded-md border border-teal-100 bg-white px-3 py-2">
                <div className="text-[11px] text-slate-500">شناسه VLAN</div>
                <div className="mt-1 font-mono font-semibold text-slate-900 tabular-nums">
                  {toPersianDigits(config_vlan)} ({config_vlan})
                </div>
              </div>
            )}
          </div>

          {Boolean(has_voip) && (
            <div className="mt-3 rounded-md border border-teal-100 bg-white px-3 py-2 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <PhoneCall className="h-3.5 w-3.5 text-teal-700" />
                <span>سرویس تلفن ثابت (VoIP / SIP) فعال است</span>
              </div>
              {config_voip_data && (
                <div dir="ltr" className="mt-1 text-left font-mono text-[11px] text-slate-700">
                  {config_voip_data}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {operator_notes && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-950">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-amber-900">
            <StickyNote className="h-3.5 w-3.5 text-amber-700" />
            <span>یادداشت اپراتور</span>
          </div>
          <p className="leading-relaxed">{operator_notes}</p>
        </div>
      )}
    </div>
  );
}
