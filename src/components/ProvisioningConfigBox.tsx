import { useState } from 'react';
import { Check, Copy, Lock } from 'lucide-react';
import { getTicketTypeFieldVisibility } from '../lib/fiberLogic';
import type { TicketItem } from '../types/erp';

interface ProvisioningConfigBoxProps {
  ticket: TicketItem;
}

export function ProvisioningConfigBox({ ticket }: ProvisioningConfigBoxProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  if (ticket.type === 'public_preregistration') return null;
  const vis = getTicketTypeFieldVisibility(ticket.type);

  const hasPppoe = vis.showPppoeVlan && (ticket.pppoe_user || ticket.pppoe_pass || ticket.vlan_id);
  const hasVoip = vis.showVoip && ticket.voip_config;

  if (!hasPppoe && !hasVoip && !ticket.operator_notes) {
    return null;
  }

  const copyText = async (key: string, val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // Clipboard blocked in restricted context
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Lock className="h-4 w-4 text-teal-700" />
          <span>تنظیمات شبکه و کانفیگ سرویس (فقط‌خواندنی برای نصاب)</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {vis.showPppoeVlan && ticket.pppoe_user && (
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="text-[11px] font-medium text-slate-500">نام کاربری PPPoE</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <code dir="ltr" className="truncate text-xs font-semibold text-slate-900">
                {ticket.pppoe_user}
              </code>
              <button
                type="button"
                onClick={() => copyText('pppoe_user', ticket.pppoe_user!)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-teal-700"
                title="کپی"
              >
                {copiedKey === 'pppoe_user' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        )}

        {vis.showPppoeVlan && ticket.pppoe_pass && (
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="text-[11px] font-medium text-slate-500">رمز عبور PPPoE</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <code dir="ltr" className="truncate text-xs font-semibold text-slate-900">
                {ticket.pppoe_pass}
              </code>
              <button
                type="button"
                onClick={() => copyText('pppoe_pass', ticket.pppoe_pass!)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-teal-700"
                title="کپی"
              >
                {copiedKey === 'pppoe_pass' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        )}

        {vis.showPppoeVlan && ticket.vlan_id && (
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="text-[11px] font-medium text-slate-500">شناسه VLAN</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <code dir="ltr" className="text-xs font-semibold tabular-nums text-slate-900">
                {ticket.vlan_id}
              </code>
              <button
                type="button"
                onClick={() => copyText('vlan', ticket.vlan_id!)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-teal-700"
                title="کپی"
              >
                {copiedKey === 'vlan' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        )}

        {vis.showVoip && ticket.voip_config && (
          <div className="rounded-lg border border-slate-200 bg-white p-2.5 sm:col-span-2 lg:col-span-3">
            <div className="text-[11px] font-medium text-slate-500">پیکربندی تلفن VoIP</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <code dir="ltr" className="break-all text-xs font-semibold text-slate-900">
                {ticket.voip_config}
              </code>
              <button
                type="button"
                onClick={() => copyText('voip', ticket.voip_config!)}
                className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-teal-700"
                title="کپی"
              >
                {copiedKey === 'voip' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {ticket.operator_notes && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-700">
          <span className="font-semibold text-slate-900">توضیحات اپراتور: </span>
          {ticket.operator_notes}
        </div>
      )}
    </div>
  );
}
