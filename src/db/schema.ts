import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// ==========================================
// 1. RBAC & USERS
// ==========================================

export const tblPermissions = pgTable('tbl_permissions', {
  id: serial('id').primaryKey(),
  key_name: text('key_name').notNull().unique(),
  descr: text('descr').notNull().default(''),
});

export const tblRoles = pgTable('tbl_roles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
});

export const tblRolePermissions = pgTable(
  'tbl_role_permissions',
  {
    role_id: integer('role_id')
      .notNull()
      .references(() => tblRoles.id, { onDelete: 'cascade' }),
    permission_id: integer('permission_id')
      .notNull()
      .references(() => tblPermissions.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.role_id, table.permission_id] })],
);

export const tblUsers = pgTable('tbl_users', {
  id: serial('id').primaryKey(),
  uid: text('uid').unique(),
  username: text('username').notNull().unique(),
  email: text('email').unique(),
  password_hash: text('password_hash').notNull().default(''),
  full_name: text('full_name').notNull(),
  role_id: integer('role_id')
    .notNull()
    .references(() => tblRoles.id),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// ==========================================
// 2. TARIFF TEMPLATES, PROMOTIONS & LEDGER
// ==========================================

export type TicketTypeKey =
  | 'internet_install'
  | 'internet_fault'
  | 'ffat_install'
  | 'ffat_fault'
  | 'voip_install';

export type TariffCalcMode = 'fixed' | 'per_meter' | 'hybrid';

export interface TariffTypeRule {
  calc_type: TariffCalcMode;
  base_price: number;
  meter_limit: number;
  extra_meter_price: number;
}

export type TariffTemplateRulesJson = Record<TicketTypeKey, TariffTypeRule>;

export const tblTariffTemplates = pgTable('tbl_tariff_templates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  rules_json: jsonb('rules_json').$type<TariffTemplateRulesJson>().notNull(),
});

export const tblPromotions = pgTable('tbl_promotions', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  target_type: text('target_type').notNull(), // e.g., 'all', 'installs', 'internet_install', etc.
  target_value: integer('target_value').notNull(),
  reward_amount: numeric('reward_amount', { precision: 15, scale: 2 }).notNull(),
  reset_cycle: text('reset_cycle').notNull().default('monthly'), // 'weekly' | 'monthly' | 'campaign'
  start_date: date('start_date').notNull(),
  end_date: date('end_date').notNull(),
  carry_over: boolean('carry_over').notNull().default(false),
});

export const tblUserTariffs = pgTable('tbl_user_tariffs', {
  user_id: integer('user_id')
    .primaryKey()
    .references(() => tblUsers.id, { onDelete: 'cascade' }),
  template_id: integer('template_id')
    .notNull()
    .references(() => tblTariffTemplates.id),
  promotion_id: integer('promotion_id').references(() => tblPromotions.id, {
    onDelete: 'set null',
  }),
});

export const tblLedger = pgTable('tbl_ledger', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id')
    .notNull()
    .references(() => tblUsers.id),
  ticket_id: integer('ticket_id'),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  type: text('type').notNull(), // 'credit' | 'debit'
  description: text('description').notNull().default(''),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// ==========================================
// 3. HARDWARE TOPOLOGY & MODEM BRANDS
// ==========================================

export const tblKafos = pgTable('tbl_kafos', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
});

export const tblOlts = pgTable('tbl_olts', {
  id: serial('id').primaryKey(),
  kaf_id: integer('kaf_id')
    .notNull()
    .references(() => tblKafos.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
});

export const tblFats = pgTable('tbl_fats', {
  id: serial('id').primaryKey(),
  olt_id: integer('olt_id')
    .notNull()
    .references(() => tblOlts.id, { onDelete: 'cascade' }),
  fat_number: integer('fat_number').notNull(),
});

export const tblFfats = pgTable('tbl_ffats', {
  id: serial('id').primaryKey(),
  fat_id: integer('fat_id')
    .notNull()
    .references(() => tblFats.id, { onDelete: 'cascade' }),
  ffat_code: text('ffat_code').notNull(),
});

export const tblModemBrands = pgTable('tbl_modem_brands', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  serial_prefix: text('serial_prefix').notNull(),
  serial_pattern: text('serial_pattern').notNull(),
});

// ==========================================
// 4. INVENTORY, SPOOLS & VAN STOCK
// ==========================================

export const tblInventoryItems = pgTable('tbl_inventory_items', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'unit' | 'spool' | 'modem'
  modem_brand_id: integer('modem_brand_id').references(() => tblModemBrands.id, {
    onDelete: 'set null',
  }),
  total_quantity: integer('total_quantity').notNull().default(0),
});

export const tblSpools = pgTable('tbl_spools', {
  id: serial('id').primaryKey(),
  item_id: integer('item_id').references(() => tblInventoryItems.id, {
    onDelete: 'set null',
  }),
  spool_code: text('spool_code').notNull().unique(),
  cable_type: text('cable_type').notNull().default('outdoor'), // 'indoor' | 'outdoor'
  initial_length: integer('initial_length').notNull().default(1000),
  current_length: integer('current_length').notNull(),
  assigned_installer_id: integer('assigned_installer_id').references(() => tblUsers.id, {
    onDelete: 'set null',
  }),
});

export const tblVanStock = pgTable('tbl_van_stock', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id')
    .notNull()
    .references(() => tblUsers.id, { onDelete: 'cascade' }),
  item_id: integer('item_id')
    .notNull()
    .references(() => tblInventoryItems.id, { onDelete: 'cascade' }),
  serial_number: text('serial_number'),
  quantity: integer('quantity').notNull().default(1),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// ==========================================
// 5. 5-TYPE TICKETS, TIMELINE COMMENTS & SERVICE RECORDS
// ==========================================

export const tblTickets = pgTable('tbl_tickets', {
  id: serial('id').primaryKey(),
  type: text('type').notNull(), // 'internet_install' | 'internet_fault' | 'ffat_install' | 'ffat_fault' | 'voip_install'
  customer_name: text('customer_name').notNull(),
  address: text('address').notNull(),
  pppoe_user: text('pppoe_user'),
  pppoe_pass: text('pppoe_pass'),
  vlan_id: text('vlan_id'),
  voip_config: text('voip_config'),
  operator_notes: text('operator_notes'),
  status: text('status').notNull().default('pending'), // 'pending' | 'in_progress' | 'completed' | 'failed'
  assigned_installer: integer('assigned_installer').references(() => tblUsers.id, {
    onDelete: 'set null',
  }),
  scheduled_date: text('scheduled_date'),
  scheduled_time: text('scheduled_time'),
  assigned_at: timestamp('assigned_at'),
  started_at: timestamp('started_at'),
  completed_at: timestamp('completed_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const tblTicketComments = pgTable('tbl_ticket_comments', {
  id: serial('id').primaryKey(),
  ticket_id: integer('ticket_id')
    .notNull()
    .references(() => tblTickets.id, { onDelete: 'cascade' }),
  user_id: integer('user_id')
    .notNull()
    .references(() => tblUsers.id),
  comment: text('comment').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(), // Immutable server-side timestamp
});

export interface ServicePriceSnapshot {
  template_name: string;
  calc_type: TariffCalcMode;
  ticket_type: TicketTypeKey;
  base_price: number;
  meter_limit: number;
  extra_meter_price: number;
  out_meter: number;
  in_meter: number;
  total_meter: number;
  billable_extra_meter: number;
  extra_meter_fee: number;
  promotion_name: string | null;
  promotion_bonus: number;
  total_earned: number;
  computed_at: string;
}

export const tblServiceRecords = pgTable('tbl_service_records', {
  id: serial('id').primaryKey(),
  ticket_id: integer('ticket_id')
    .notNull()
    .unique()
    .references(() => tblTickets.id, { onDelete: 'cascade' }),
  installer_id: integer('installer_id')
    .notNull()
    .references(() => tblUsers.id),
  source_type: text('source_type').notNull(), // 'FAT' | 'FFAT'
  source_id: integer('source_id').notNull(),
  out_spool_id: integer('out_spool_id').references(() => tblSpools.id),
  out_total_meter: integer('out_total_meter').notNull().default(0),
  in_spool_id: integer('in_spool_id').references(() => tblSpools.id),
  in_total_meter: integer('in_total_meter').notNull().default(0),
  modem_brand_id: integer('modem_brand_id').references(() => tblModemBrands.id),
  modem_serial: text('modem_serial'),
  modem_source: text('modem_source').notNull().default('company'), // 'company' | 'customer'
  van_stock_id: integer('van_stock_id'),
  price_snapshot: jsonb('price_snapshot').$type<ServicePriceSnapshot>().notNull(),
  service_date_jalali: text('service_date_jalali'),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const tblServiceImages = pgTable('tbl_service_images', {
  id: serial('id').primaryKey(),
  record_id: integer('record_id')
    .notNull()
    .references(() => tblServiceRecords.id, { onDelete: 'cascade' }),
  ticket_id: integer('ticket_id')
    .notNull()
    .references(() => tblTickets.id, { onDelete: 'cascade' }),
  image_type: text('image_type').notNull(),
  file_path: text('file_path').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const tblActivityLogs = pgTable('tbl_activity_logs', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').references(() => tblUsers.id, { onDelete: 'set null' }),
  username: text('username').notNull(),
  user_full_name: text('user_full_name').notNull(),
  action_type: text('action_type').notNull(),
  entity_type: text('entity_type').notNull(),
  entity_id: integer('entity_id'),
  summary: text('summary').notNull(),
  details: text('details'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});
