import type { ModemSource, PriceSnapshot, ServiceType, TariffCalcType } from '../lib/fiberLogic';

export interface AuthUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  role_id: number;
  role_name: string;
  is_active: number;
  permissions: string[];
  isSuperAdmin: boolean;
}

export interface TicketItem {
  id: number;
  customer_name: string;
  address: string;
  type: ServiceType;
  status: 'pending' | 'assigned' | 'completed';
  assigned_installer: number | null;
  installer_name: string | null;
  config_pppoe_user?: string | null;
  config_pppoe_pass?: string | null;
  config_vlan?: number | null;
  has_voip?: number;
  config_voip_data?: string | null;
  operator_notes?: string | null;
  service_record_id?: number | null;
  ffat_code?: string | null;
  fat_number?: number | null;
  olt_name?: string | null;
  kaf_name?: string | null;
  modem_serial?: string | null;
  modem_source?: ModemSource | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  created_at: string;
}

export interface KafItem {
  id: number;
  name: string;
}

export interface OltItem {
  id: number;
  kaf_id: number;
  name: string;
  kaf_name?: string;
}

export interface FatItem {
  id: number;
  olt_id: number;
  fat_number: number;
  olt_name?: string;
  kaf_id?: number;
}

export interface FFatItem {
  id: number;
  fat_id: number;
  ffat_code: string;
  fat_number?: number;
  olt_id?: number;
}

export interface ModemBrandItem {
  id: number;
  name: string;
  serial_pattern: string;
  serial_prefix: string;
}

export interface InventoryItemRecord {
  id: number;
  name: string;
  type: 'unit' | 'spool' | 'modem';
  modem_brand_id: number | null;
  brand_name?: string | null;
  total_quantity: number;
  van_allocated_quantity?: number;
}

export interface VanStockItem {
  id: number;
  user_id: number;
  installer_name?: string;
  item_id: number;
  item_name: string;
  item_type: 'unit' | 'spool' | 'modem';
  modem_brand_id?: number | null;
  brand_name?: string | null;
  serial_number: string | null;
  quantity: number;
  created_at?: string;
}

export interface SpoolItem {
  id: number;
  item_id?: number | null;
  spool_code: string;
  cable_type: 'indoor' | 'outdoor';
  initial_length: number;
  current_length: number;
  assigned_installer_id: number | null;
  installer_name?: string | null;
}

export interface TariffItem {
  id: number;
  installer_id: number;
  installer_name: string;
  username: string;
  calc_type: TariffCalcType;
  base_price: number;
  meter_limit: number;
  extra_meter_price: number;
  bonus_target_count: number;
  bonus_amount: number;
}

export interface LedgerItem {
  id: number;
  user_id: number;
  user_name: string;
  record_id: number | null;
  ticket_id?: number | null;
  amount: number;
  type: 'credit' | 'debit';
  description: string | null;
  created_at: string;
}

export interface BalanceSummary {
  user_id: number;
  full_name: string;
  role_name: string;
  totalCredit: number;
  totalDebit: number;
  balance: number;
}

export interface MonthlyContractorEarning {
  monthKey: string;
  monthLabel: string;
  totalEarnings: number;
  entryCount: number;
}

export interface PermissionItem {
  id: number;
  key_name: string;
  descr: string;
}

export interface RoleItem {
  id: number;
  role_name: string;
  perm_ids: number[];
}

export interface UserAdminItem {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  role_id: number;
  role_name: string;
  is_active: number;
  last_login: string | null;
  has_password: number;
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

export interface ServiceRecordDetail {
  id: number;
  ticket_id: number;
  customer_name: string;
  address: string;
  ticket_type: ServiceType;
  installer_name: string;
  kaf_name: string;
  olt_name: string;
  fat_number: number;
  ffat_code: string;
  out_spool_code: string | null;
  out_total_meter: number;
  in_spool_code: string | null;
  in_total_meter: number;
  modem_source: ModemSource;
  modem_brand_name?: string | null;
  modem_serial: string;
  config_pppoe_user?: string | null;
  config_pppoe_pass?: string | null;
  config_vlan?: number | null;
  has_voip?: number;
  config_voip_data?: string | null;
  operator_notes?: string | null;
  price_snapshot: PriceSnapshot;
  service_date_jalali: string | null;
  notes: string | null;
  created_at: string;
  images: Array<{ id: number; image_type: string; file_path: string }>;
}

export type PageKey =
  | 'dashboard'
  | 'tickets'
  | 'service-form'
  | 'hardware'
  | 'inventory'
  | 'financial'
  | 'users';
