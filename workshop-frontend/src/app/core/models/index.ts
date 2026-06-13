export interface User {
  id: string;
  username: string;
  full_name: string;
  role: 'admin' | 'recepcionista' | 'mecanico';
  is_active?: boolean;
  created_at?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface Client {
  id: string;
  type: 'individual' | 'empresa';
  full_name: string;
  rut: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  vehicle_count?: number;
  job_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  plate_number: string;
  client_id: string;
  make: string;
  model: string;
  year: number | null;
  color: string | null;
  mileage: number | null;
  notes: string | null;
  client_name?: string;
  client_phone?: string;
  client_rut?: string;
  client_email?: string;
  client_address?: string;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  job_number: string;
  client_id: string;
  vehicle_id: string;
  mileage_at_service: number | null;
  status: 'abierto' | 'terminado' | 'pagado';
  tax_enabled: boolean;
  tax_rate: number;
  discount_amount: number;
  discount_type: 'fixed' | 'percentage';
  notes: string | null;
  internal_notes: string | null;
  created_by: string | null;
  job_date: string;
  is_locked: boolean;
  show_item_details_pricing: boolean;
  client_name?: string;
  client_rut?: string;
  client_phone?: string;
  client_email?: string;
  client_address?: string;
  plate_number?: string;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  subtotal?: number;
  total_paid?: number;
  total?: number;
  items?: JobItem[];
  payments?: Payment[];
  financials?: JobFinancials;
  created_at: string;
  updated_at: string;
}

export interface JobItem {
  id: string;
  job_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  item_type: 'mano_de_obra' | 'repuesto' | 'otro';
  supplier: string | null;
  parent_id: string | null;
  sort_order: number;
  catalog_item_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobItemNode extends JobItem {
  children: JobItem[];
}

export interface CatalogChild {
  id?: string;
  description: string;
  sort_order: number;
}

export interface CatalogItem {
  id: string;
  description: string;
  item_type: 'mano_de_obra' | 'repuesto' | 'otro';
  children?: CatalogChild[];
  created_at?: string;
  updated_at?: string;
}

export interface CatalogSuggestion {
  description: string;
  item_type: 'mano_de_obra' | 'repuesto' | 'otro';
  uses: number;
  children: CatalogChild[];
}

export interface CatalogItemAnalytics {
  id: string;
  description: string;
  item_type: 'mano_de_obra' | 'repuesto' | 'otro';
  jobs_count: number;
  last_used_at: string | null;
  // Average of per-client-vehicle intervals. When filtered by client_id + vehicle_id
  // this is that specific client's interval; without filters it's the shop-wide average.
  avg_client_interval_days: number | null;
  // Confidence of avg_client_interval_days: 'high' if jobs_count >= 3, 'low' if == 2, null if < 2.
  interval_confidence: 'high' | 'low' | null;
  avg_price: number | null;
  min_price: number | null;
  max_price: number | null;
  total_revenue: number | null;
}

export interface CatalogAnalyticsParams {
  client_id?: string;
  vehicle_id?: string;
  from?: string;
  to?: string;
  item_type?: 'mano_de_obra' | 'repuesto' | 'otro';
  sort?: 'jobs_count' | 'avg_price' | 'total_revenue' | 'last_used_at' | 'description';
  order?: 'asc' | 'desc';
  min_jobs?: number;
}

export interface CatalogBulkResult {
  inserted: CatalogItem[];
  skipped: { description: string; reason: 'duplicate' | 'empty' }[];
}

export interface Payment {
  id: string;
  job_id: string;
  amount: number;
  method: 'efectivo' | 'transferencia' | 'credito' | 'cheque';
  reference: string | null;
  notes: string | null;
  paid_at: string;
  payment_date: string;
  created_by: string | null;
  created_at: string;
}

export interface VehicleSearchResult {
  id: string;
  plate_number: string;
  make: string;
  model: string;
  year: number | null;
  client_id: string;
  client_name: string;
  client_rut: string | null;
}

export interface DuplicateCheckResult {
  rut_match: { id: string; full_name: string; rut: string; phone: string } | null;
  name_matches: { id: string; full_name: string; rut: string | null; phone: string | null }[];
}

export interface JobFinancials {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  total_paid: number;
  balance: number;
}

export interface SearchResults {
  clients: any[];
  vehicles: any[];
  jobs: any[];
}

export interface OwnershipHistory {
  id: string;
  vehicle_id: string;
  client_id: string;
  client_name: string;
  client_rut: string | null;
  client_phone: string | null;
  started_at: string;
  ended_at: string | null;
  transfer_notes: string | null;
}

export interface DashboardSummary {
  facturado_month: number;
  cobrado_month: number;
  pendiente_total: number;
  jobs_month: number;
  active_jobs: number;
  collection_rate_month: number;
}

export interface ClientFinancials {
  clients: ClientFinancialRow[];
  totals: { total_facturado: number; total_pagado: number; total_pendiente: number };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ClientFinancialRow {
  id: string;
  full_name: string;
  rut: string | null;
  job_count: number;
  total_facturado: number;
  total_pagado: number;
  saldo: number;
}

export interface WorkshopConfig {
  name: string;
  address: string;
  phone: string;
  email: string;
  logo_url: string;
  services_tagline: string;
}

export interface OverdueDebt {
  id: string;
  full_name: string;
  rut: string | null;
  phone: string | null;
  saldo: number;
  job_count: number;
  oldest_unpaid_date: string;
  days_overdue: number;
}

export interface UnpaidJob {
  id: string;
  job_number: string;
  job_date: string;
  total: number;
  paid: number;
  balance: number;
  days_pending: number;
  client_name: string;
  client_id: string;
  plate_number: string;
}

export interface TopClient {
  id: string;
  full_name: string;
  rut: string | null;
  total_paid: number;
  job_count: number;
}

export interface PaymentMethodBreakdown {
  method: string;
  total: number;
  count: number;
}

export interface NewClientsData {
  current_month: number;
  previous_month: number;
}

export interface RevenueTrendItem {
  period: string;
  total: number;
  jobs_count: number;
}

export interface JobWithBalance {
  id: string;
  job_number: string;
  job_date: string;
  status: string;
  client_name: string;
  client_id: string;
  client_rut: string | null;
  plate_number: string;
  total: number;
  total_paid: number;
  balance: number;
  last_payment_date: string | null;
  last_payment_method: string | null;
}

export interface RecentPayment {
  id: string;
  amount: number;
  method: string;
  paid_at: string;
  payment_date: string;
  reference: string | null;
  job_id: string;
  job_number: string;
  client_id: string;
  client_name: string;
}

export interface AgingBucket {
  job_count: number;
  total_balance: number;
  client_count: number;
}

export interface AgingReport {
  '0-30': AgingBucket;
  '31-60': AgingBucket;
  '61-90': AgingBucket;
  '90+': AgingBucket;
}

export interface Debtor {
  id: string;
  full_name: string;
  rut: string | null;
  phone: string | null;
  total_debt: number;
  unpaid_jobs: number;
  oldest_unpaid_date: string;
  days_overdue: number;
}

export interface PaymentsSummary {
  cobrado_month: number;
  pendiente_total: number;
  deudores_count: number;
  by_method: PaymentMethodBreakdown[];
}

export interface AppSettings {
  debt_alert_threshold: string;
  unpaid_days_threshold: string;
  [key: string]: string;
}

export interface MonthlyClosingTotals {
  count: number;
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
}

export interface MonthlyClosingJob {
  id: string;
  job_number: string;
  client_name: string;
  job_date: string;
  status: string;
  tax_enabled: boolean;
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
}

export interface MonthlyClosing {
  month: string;
  all: MonthlyClosingTotals;
  iva: MonthlyClosingTotals;
  no_iva: MonthlyClosingTotals;
  jobs: MonthlyClosingJob[];
}

export type AlertType =
  | 'overdue_service'
  | 'payment_overdue'
  | 'lost_customer'
  | 'broken_pattern'
  | 'quote_pending'
  | 'upcoming_service'
  | 'high_value_lost';
export type AlertEntityType = 'vehicle' | 'client' | 'job';

export type AlertDismissalStatus = 'snoozed' | 'contacted' | 'resolved';

export interface AlertItem {
  alert_type:    AlertType;
  severity:      'critical' | 'high' | 'medium' | 'low';
  client_id:     string;
  client_name:   string;
  client_phone:  string | null;
  client_email:  string | null;
  entity_type:   AlertEntityType;
  entity_id:     string;
  entity_label:  string;
  current_value: number | null;
  threshold:     number;
  unit:          'days' | 'currency';
  context:       string;
  action_route:  string;
  definition_id?: string;
  // Sprint 2 / HU-13: anotación cuando la alerta tiene una dismissal activa
  // con status='contacted' — el ítem se muestra con pill "Contactado".
  dismissal_status?: AlertDismissalStatus;
  dismissal_until?:  string;
  contacted_at?:     string | null;
}

export interface AlertWaTemplate {
  alert_type:  string;
  template:    string;
  updated_at:  string;
}

export interface AlertDefinition {
  id:                          string;
  alert_type:                  AlertType;
  name:                        string;
  enabled:                     boolean;
  catalog_item_id:             string | null;
  catalog_item_description?:   string | null;
  threshold_days:              number | null;
  bp_multiplier:               number | null;
  bp_min_days:                 number | null;
  // Sprint 3 params
  due_after_days?:             number | null;
  min_lifetime_value?:         number | null;
  eval_interval_hours:         number;
  last_evaluated_at:           string | null;
  last_result_count:           number;
  last_run_error:              string | null;
  created_by:                  string | null;
  created_at:                  string;
  updated_at:                  string;
}

export interface AlertFeedBlock {
  definition: AlertDefinition;
  items:      AlertItem[];
  error:      string | null;
}

export interface AlertBadge {
  critical_high_count: number;
  last_runner_tick:    string | null;
}

export interface OverdueServiceItem {
  client_id:                   string;
  client_name:                 string;
  client_phone:                string | null;
  client_email:                string | null;
  vehicle_id:                  string;
  plate_number:                string;
  make:                        string;
  model:                       string;
  year:                        number | null;
  last_service_date:           string | null;
  days_since_service:          number | null;
  vehicle_avg_interval_days:   number | null;
  vehicle_interval_confidence: 'high' | 'low' | null;
}
