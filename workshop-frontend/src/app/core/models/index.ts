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
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  job_id: string;
  amount: number;
  method: 'efectivo' | 'transferencia' | 'credito';
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
  revenue_today: number;
  revenue_month: number;
  revenue_year: number;
  jobs_today: number;
  jobs_month: number;
}

export interface ClientFinancials {
  clients: ClientFinancialRow[];
  totals: { total_facturado: number; total_pagado: number; total_pendiente: number };
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
