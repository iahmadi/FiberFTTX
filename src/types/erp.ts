import type {
  ServicePriceSnapshot,
  ServiceSourceType,
  TariffTemplateRulesJson,
  TicketStatus,
  TicketTypeKey,
} from '../lib/fiberLogic';

export interface AuthUser {
  id: number;
  uid: string | null;
  username: string;
  email: string | null;
  full_name: string;
  role_id: number;
  role_name: string;
  is_active: boolean;
  isSuperAdmin: boolean;
  permissions: string[];
}

export interface TicketItem {
  id: number;
  type: TicketTypeKey;
  customer_name: string;
  address: string;
  pppoe_user: string | null;
  pppoe_pass: string | null;
  vlan_id: string | null;
  voip_config: string | null;
  operator_notes: string | null;
  status: TicketStatus;
  assigned_installer: number | null;
  installer_name: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  assigned_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface TicketCommentItem {
  id: number;
  ticket_id: number;
  user_id: number;
  user_full_name: string;
  user_role_name: string;
  comment: string;
  created_at: string;
}

export interface KafItem {
  id: number;
  name: string;
}

export interface OltItem {
  id: number;
  kaf_id: number;
  kaf_name?: string;
  name: string;
}

export interface FatItem {
  id: number;
  olt_id: number;
  olt_name?: string;
  kaf_id?: number;
  fat_number: number;
}

export interface FFatItem {
  id: number;
  fat_id: number;
  fat_number?: number;
  olt_id?: number;
  ffat_code: string;
}

export interface ModemBrandItem {
  id: number;
  name: string;
  serial_prefix: string;
  serial_pattern: string;
}

export interface SpoolItem {
  id: number;
  item_id: number | null;
  spool_code: string;
  cable_type: 'indoor' | 'outdoor';
  initial_length: number;
  current_length: number;
  assigned_installer_id: number | null;
  installer_name: string | null;
}

export interface InventoryItemRecord {
  id: number;
  name: string;
  type: 'unit' | 'spool' | 'modem';
  modem_brand_id: number | null;
  brand_name: string | null;
  total_quantity: number;
  van_allocated_quantity: number;
}

export interface VanStockItem {
  id: number;
  user_id: number;
  item_id: number;
  item_name: string;
  item_type: 'unit' | 'spool' | 'modem';
  modem_brand_id: number | null;
  brand_name: string | null;
  serial_prefix: string | null;
  serial_pattern: string | null;
  serial_number: string | null;
  quantity: number;
  installer_name: string;
  created_at: string;
}

export interface TariffTemplateItem {
  id: number;
  name: string;
  rules_json: TariffTemplateRulesJson;
}

export interface PromotionItem {
  id: number;
  name: string;
  target_type: string;
  target_value: number;
  reward_amount: number;
  reset_cycle: 'weekly' | 'monthly' | 'campaign';
  start_date: string;
  end_date: string;
  carry_over: boolean;
}

export interface UserTariffAssignment {
  user_id: number;
  username: string;
  full_name: string;
  template_id: number;
  template_name: string;
  promotion_id: number | null;
  promotion_name: string | null;
}

export interface LedgerEntryItem {
  id: number;
  user_id: number;
  user_full_name: string;
  ticket_id: number | null;
  amount: number;
  type: 'credit' | 'debit';
  description: string;
  created_at: string;
}

export interface ContractorBalanceSummary {
  user_id: number;
  username: string;
  full_name: string;
  totalCredit: number;
  totalDebit: number;
  balance: number;
  promotionProgress?: {
    promotion_name: string;
    cycle_count: number;
    target_value: number;
    progress_percent: number;
    reward_amount: number;
    carried_over: number;
  } | null;
}

export interface ServiceRecordDetail {
  id: number;
  ticket_id: number;
  installer_id: number;
  installer_name: string;
  customer_name: string;
  address: string;
  ticket_type: TicketTypeKey;
  source_type: ServiceSourceType;
  source_id: number;
  source_label: string;
  kaf_name: string;
  olt_name: string;
  out_spool_code: string | null;
  out_total_meter: number;
  in_spool_code: string | null;
  in_total_meter: number;
  modem_brand_name: string | null;
  modem_serial: string | null;
  modem_source: 'company' | 'customer';
  price_snapshot: ServicePriceSnapshot;
  service_date_jalali: string | null;
  notes: string | null;
  created_at: string;
  images: Array<{ id: number; image_type: string; file_path: string }>;
}

export interface ActivityLogItem {
  id: number;
  user_id: number | null;
  username: string;
  user_full_name: string;
  action_type: string;
  entity_type: string;
  entity_id: number | null;
  summary: string;
  details: string | null;
  created_at: string;
}

export interface UserAccountRow {
  id: number;
  uid: string | null;
  username: string;
  email: string | null;
  full_name: string;
  role_id: number;
  role_name: string;
  is_active: boolean;
}

export interface RoleWithPerms {
  id: number;
  name: string;
  permissionIds: number[];
}

export interface PermissionDef {
  id: number;
  key_name: string;
  descr: string;
}
