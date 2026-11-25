import type {
  AnyTicketTypeKey,
  CustomerInvoiceSnapshot,
  CustomerPackageRules,
  CustomerRegistrationDetails,
  DynamicMaterialUsageItem,
  ServicePriceSnapshot,
  ServiceSourceType,
  SplitterChangesData,
  TariffTemplateRulesJson,
  TicketStatus,
  TicketTypeKey,
} from '../lib/fiberLogic';

export interface SystemSettings {
  system_name: string;
  primary_color: string;
}

export interface RegionItem {
  id: number;
  name: string;
  is_active: boolean;
  created_at?: string;
}

export interface CustomerPackageItem {
  id: number;
  name: string;
  rules_json: CustomerPackageRules;
  is_active: boolean;
  created_at?: string;
}

export interface TicketIdentityImage {
  id: number;
  image_type: string;
  file_path: string;
  caption?: string | null;
  created_at?: string;
}

export interface AuthUser {
  id: number;
  uid: string | null;
  username: string;
  email: string | null;
  full_name: string;
  first_name?: string;
  last_name?: string;
  phone_1?: string;
  role_id: number;
  role_name: string;
  is_active: boolean;
  isSuperAdmin: boolean;
  permissions: string[];
}

export interface TicketItem {
  id: number;
  type: AnyTicketTypeKey;
  requested_service?: 'new_service' | 'fault_report' | null;
  entity_type?: 'real' | 'legal' | null;
  customer_name: string;
  address: string;
  customer_details?: CustomerRegistrationDetails | null;
  location_gps?: string | null;
  region_id?: number | null;
  region_name?: string | null;
  customer_package_id?: number | null;
  customer_package_name?: string | null;
  required_modem_id?: number | null;
  required_modem_name?: string | null;
  identity_images?: TicketIdentityImage[];
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
  is_deleted: boolean;
  edited_at: string | null;
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
  unit_price: number;
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

export type LedgerEntryCategory = 'installer_work' | 'installer_payout' | 'customer_payment';

export interface LedgerEntryItem {
  id: number;
  user_id: number | null;
  user_full_name: string | null;
  ledger_type: LedgerEntryCategory;
  customer_name?: string | null;
  ticket_id: number | null;
  amount: number;
  type: 'credit' | 'debit';
  description: string;
  bank_name?: string | null;
  tracking_code?: string | null;
  target_account?: string | null;
  source_account?: string | null;
  paid_at?: string | null;
  receipt_image?: string | null;
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

export interface ServiceRecordHistoryItem {
  id: number;
  record_id: number;
  changed_by: number | null;
  changed_by_name: string | null;
  changed_at: string;
  old_data: Record<string, unknown>;
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
  port_number: number | null;
  fusion_count: number;
  source_label: string;
  kaf_name: string;
  olt_name: string;
  out_spool_id: number | null;
  out_spool_code: string | null;
  out_total_meter: number;
  in_spool_id: number | null;
  in_spool_code: string | null;
  in_total_meter: number;
  modem_brand_id: number | null;
  modem_brand_name: string | null;
  modem_serial: string | null;
  modem_source: 'company' | 'customer';
  van_stock_id: number | null;
  dynamic_materials: DynamicMaterialUsageItem[];
  splitter_changes: SplitterChangesData | null;
  price_snapshot: ServicePriceSnapshot;
  customer_invoice_snapshot?: CustomerInvoiceSnapshot | null;
  customer_payments_total?: number;
  service_date_jalali: string | null;
  notes: string | null;
  created_at: string;
  images: Array<{ id: number; image_type: string; file_path: string; caption?: string | null }>;
  history?: ServiceRecordHistoryItem[];
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
  first_name: string;
  last_name: string;
  father_name: string;
  birth_date: string;
  national_code: string;
  id_number: string;
  phone_1: string;
  phone_2: string | null;
  address: string;
  referrer: string | null;
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

export interface SpoolConsumptionHistoryItem {
  installer_id: number;
  installer_name: string | null;
  out_spool_id: number | null;
  out_total_meter: number;
  in_spool_id: number | null;
  in_total_meter: number;
  created_at: string;
}


