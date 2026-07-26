import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  Client, Vehicle, Job, JobItem, Payment,
  SearchResults, OwnershipHistory,
  DashboardSummary, ClientFinancials, User,
  VehicleSearchResult, DuplicateCheckResult,
  PaginatedResponse, OverdueDebt, UnpaidJob,
  TopClient, PaymentMethodBreakdown, NewClientsData,
  RevenueTrendItem, JobWithBalance, RecentPayment,
  AgingReport, Debtor, PaymentsSummary, AppSettings,
  MonthlyClosing,
  CatalogItem, CatalogSuggestion, CatalogBulkResult,
  CatalogItemAnalytics, CatalogAnalyticsParams,
  OverdueServiceItem, AlertItem,
  AlertDefinition, AlertFeedBlock, AlertBadge, AlertWaTemplate
} from '../models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private url = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // Search
  search(q: string) {
    return this.http.get<SearchResults>(`${this.url}/search`, { params: { q } });
  }

  // Clients
  getClients(params?: Record<string, string>) {
    return this.http.get<PaginatedResponse<Client>>(`${this.url}/clients`, { params });
  }
  getClient(id: string) { return this.http.get<Client>(`${this.url}/clients/${id}`); }
  getClientByRut(rut: string) { return this.http.get<Client>(`${this.url}/clients/by-rut/${rut}`); }
  checkDuplicateClient(name?: string, rut?: string) {
    const params: Record<string, string> = {};
    if (name) params['name'] = name;
    if (rut) params['rut'] = rut;
    return this.http.get<DuplicateCheckResult>(`${this.url}/clients/check-duplicate`, { params });
  }
  createClient(data: Partial<Client>) { return this.http.post<Client>(`${this.url}/clients`, data); }
  updateClient(id: string, data: Partial<Client>) { return this.http.put<Client>(`${this.url}/clients/${id}`, data); }
  deleteClient(id: string) { return this.http.delete(`${this.url}/clients/${id}`); }
  getClientVehicles(id: string) { return this.http.get<Vehicle[]>(`${this.url}/clients/${id}/vehicles`); }
  getClientJobs(id: string) { return this.http.get<Job[]>(`${this.url}/clients/${id}/jobs`); }
  getClientCredit(id: string) { return this.http.get<{ credit_available: number }>(`${this.url}/clients/${id}/credit`); }

  // Vehicles
  getVehicles(params?: Record<string, string>) {
    return this.http.get<PaginatedResponse<Vehicle>>(`${this.url}/vehicles`, { params });
  }
  searchVehicles(q: string) {
    return this.http.get<VehicleSearchResult[]>(`${this.url}/vehicles/search`, { params: { q } });
  }
  getVehicle(id: string) { return this.http.get<Vehicle>(`${this.url}/vehicles/${id}`); }
  getVehicleByPlate(plate: string) { return this.http.get<Vehicle>(`${this.url}/vehicles/by-plate/${plate}`); }
  createVehicle(data: Partial<Vehicle>) { return this.http.post<Vehicle>(`${this.url}/vehicles`, data); }
  updateVehicle(id: string, data: Partial<Vehicle>) { return this.http.put<Vehicle>(`${this.url}/vehicles/${id}`, data); }
  deleteVehicle(id: string) { return this.http.delete(`${this.url}/vehicles/${id}`); }
  getOwnershipHistory(id: string) { return this.http.get<OwnershipHistory[]>(`${this.url}/vehicles/${id}/ownership-history`); }
  transferOwnership(id: string, data: { new_client_id: string; transfer_notes?: string }) {
    return this.http.post(`${this.url}/vehicles/${id}/transfer-ownership`, data);
  }

  // Jobs
  getJobs(params?: Record<string, string>) {
    return this.http.get<PaginatedResponse<Job>>(`${this.url}/jobs`, { params });
  }
  getJob(id: string) { return this.http.get<Job>(`${this.url}/jobs/${id}`); }
  createJob(data: any) { return this.http.post<Job>(`${this.url}/jobs`, data); }
  updateJob(id: string, data: Partial<Job>) { return this.http.put<Job>(`${this.url}/jobs/${id}`, data); }
  deleteJob(id: string) { return this.http.delete(`${this.url}/jobs/${id}`); }
  lockJob(id: string) { return this.http.put<Job>(`${this.url}/jobs/${id}/lock`, {}); }
  unlockJob(id: string) { return this.http.put<Job>(`${this.url}/jobs/${id}/unlock`, {}); }
  getJobPdfUrl(id: string) { return `${this.url}/jobs/${id}/pdf`; }
  getJobReceiptPdfUrl(id: string) { return `${this.url}/jobs/${id}/receipt-pdf`; }

  // Job Items
  getJobItems(jobId: string) { return this.http.get<JobItem[]>(`${this.url}/jobs/${jobId}/items`); }
  addJobItem(jobId: string, data: Partial<JobItem> & {
    parent_id?: string | null;
    sort_order?: number;
    children?: { description: string; unit_price: number; item_type?: string }[];
  }) {
    return this.http.post<JobItem>(`${this.url}/jobs/${jobId}/items`, data);
  }
  updateJobItem(jobId: string, itemId: string, data: Partial<JobItem>) {
    return this.http.put<JobItem>(`${this.url}/jobs/${jobId}/items/${itemId}`, data);
  }
  deleteJobItem(jobId: string, itemId: string) { return this.http.delete(`${this.url}/jobs/${jobId}/items/${itemId}`); }
  searchCatalogItems(q: string, limit = 20) {
    return this.http.get<CatalogItem[]>(
      `${this.url}/item-catalog/search`,
      { params: { q, limit: limit.toString() } }
    );
  }

  // Item catalog
  listCatalog(params?: Record<string, string>) {
    return this.http.get<CatalogItem[]>(`${this.url}/item-catalog`, { params });
  }
  getCatalogSuggestions() {
    return this.http.get<CatalogSuggestion[]>(`${this.url}/item-catalog/suggestions`);
  }
  getCatalogItem(id: string) {
    return this.http.get<CatalogItem>(`${this.url}/item-catalog/${id}`);
  }
  createCatalogItem(data: {
    description: string;
    item_type: CatalogItem['item_type'];
    children?: { description: string; sort_order?: number }[];
  }) {
    return this.http.post<CatalogItem>(`${this.url}/item-catalog`, data);
  }
  bulkCreateCatalogItems(items: {
    description: string;
    item_type: CatalogItem['item_type'];
    children?: { description: string; sort_order?: number }[];
  }[]) {
    return this.http.post<CatalogBulkResult>(`${this.url}/item-catalog/bulk`, { items });
  }
  updateCatalogItem(id: string, data: Partial<{
    description: string;
    item_type: CatalogItem['item_type'];
    children: { description: string; sort_order?: number }[];
  }>) {
    return this.http.patch<CatalogItem>(`${this.url}/item-catalog/${id}`, data);
  }
  replaceCatalogChildren(id: string, children: { description: string; sort_order?: number }[]) {
    return this.http.put<{ children: { id: string; description: string; sort_order: number }[] }>(
      `${this.url}/item-catalog/${id}/children`,
      { children }
    );
  }
  deleteCatalogItem(id: string) {
    return this.http.delete(`${this.url}/item-catalog/${id}`);
  }
  getCatalogAnalytics(params?: CatalogAnalyticsParams) {
    return this.http.get<CatalogItemAnalytics[]>(
      `${this.url}/item-catalog/analytics`,
      { params: params as Record<string, string> }
    );
  }

  // Alert definitions (CRUD, admin)
  listAlertDefinitions() {
    return this.http.get<AlertDefinition[]>(`${this.url}/alert-definitions`);
  }
  createAlertDefinition(data: Partial<AlertDefinition>) {
    return this.http.post<AlertDefinition>(`${this.url}/alert-definitions`, data);
  }
  updateAlertDefinition(id: string, data: Partial<AlertDefinition>) {
    return this.http.patch<AlertDefinition>(`${this.url}/alert-definitions/${id}`, data);
  }
  deleteAlertDefinition(id: string) {
    return this.http.delete(`${this.url}/alert-definitions/${id}`);
  }
  evaluateAlertDefinition(id: string) {
    return this.http.post<AlertFeedBlock>(`${this.url}/alert-definitions/${id}/evaluate`, {});
  }

  // Alerts feed (live + dismiss + badge)
  getAlertsFeed() {
    return this.http.get<AlertFeedBlock[]>(`${this.url}/alerts/feed`);
  }
  dismissAlert(
    definitionId: string,
    entityId: string,
    snoozeDays: number,
    entityType: string = 'vehicle',
    status: 'snoozed' | 'contacted' | 'resolved' = 'snoozed',
  ) {
    return this.http.post<{ ok: boolean; status: string }>(`${this.url}/alerts/dismiss`, {
      definition_id: definitionId,
      entity_id:     entityId,
      entity_type:   entityType,
      snooze_days:   snoozeDays,
      status,
    });
  }
  getAlertsBadge() {
    return this.http.get<AlertBadge>(`${this.url}/alerts/badge`);
  }
  evaluateAllAlerts() {
    return this.http.post<{ ok: boolean; evaluated: number }>(`${this.url}/alerts/evaluate-all`, {});
  }

  // Alerts WA templates (HU-11)
  listAlertWaTemplates() {
    return this.http.get<AlertWaTemplate[]>(`${this.url}/alerts/wa-templates`);
  }
  upsertAlertWaTemplate(alertType: string, template: string) {
    return this.http.put<AlertWaTemplate>(
      `${this.url}/alerts/wa-templates/${alertType}`,
      { template }
    );
  }
  deleteAlertWaTemplate(alertType: string) {
    return this.http.delete<{ ok: boolean }>(`${this.url}/alerts/wa-templates/${alertType}`);
  }

  // Retention (detailed per-vehicle view)
  getOverdueService(catalogItemId: string, thresholdDays: number) {
    return this.http.get<OverdueServiceItem[]>(`${this.url}/retention/overdue-service`, {
      params: { catalog_item_id: catalogItemId, threshold_days: thresholdDays.toString() }
    });
  }

  // Payments
  getJobPayments(jobId: string) { return this.http.get<Payment[]>(`${this.url}/jobs/${jobId}/payments`); }
  addPayment(jobId: string, data: Partial<Payment>) { return this.http.post<Payment>(`${this.url}/jobs/${jobId}/payments`, data); }
  deletePayment(jobId: string, paymentId: string) { return this.http.delete(`${this.url}/jobs/${jobId}/payments/${paymentId}`); }

  // Dashboard
  getDashboardSummary() { return this.http.get<DashboardSummary>(`${this.url}/dashboard/summary`); }
  getRevenueTrend(params?: Record<string, string>) {
    return this.http.get<RevenueTrendItem[]>(`${this.url}/dashboard/revenue-trend`, { params });
  }
  getJobStatus() { return this.http.get<{abierto: number; terminado: number; pagado: number}>(`${this.url}/dashboard/job-status`); }
  getClientFinancials(filter?: string) {
    const params: Record<string, string> = {};
    if (filter) params['filter'] = filter;
    return this.http.get<ClientFinancials>(`${this.url}/dashboard/client-financials`, { params });
  }
  getRecentJobs() { return this.http.get<Job[]>(`${this.url}/dashboard/recent-jobs`); }
  getOverdueDebts(days: number) { return this.http.get<OverdueDebt[]>(`${this.url}/dashboard/overdue-debts`, { params: { days: days.toString() } }); }
  getUnpaidJobs(days: number) { return this.http.get<UnpaidJob[]>(`${this.url}/dashboard/unpaid-jobs`, { params: { days: days.toString() } }); }
  getTopClients(limit = 5) { return this.http.get<TopClient[]>(`${this.url}/dashboard/top-clients`, { params: { limit: limit.toString() } }); }
  getPaymentMethods() { return this.http.get<PaymentMethodBreakdown[]>(`${this.url}/dashboard/payment-methods`); }
  getNewClients() { return this.http.get<NewClientsData>(`${this.url}/dashboard/new-clients`); }
  getMonthlyClosing(month?: string) {
    const params: Record<string, string> = {};
    if (month) params['month'] = month;
    return this.http.get<MonthlyClosing>(`${this.url}/dashboard/monthly-closing`, { params });
  }

  // Payments page
  getPaymentsSummary() { return this.http.get<PaymentsSummary>(`${this.url}/payments-page/summary`); }
  getJobsWithBalances(params?: Record<string, string>) {
    return this.http.get<PaginatedResponse<JobWithBalance>>(`${this.url}/payments-page/jobs`, { params });
  }
  getRecentPaymentsList(limit = 20) {
    return this.http.get<RecentPayment[]>(`${this.url}/payments-page/recent`, { params: { limit: limit.toString() } });
  }
  getAgingReport() { return this.http.get<AgingReport>(`${this.url}/payments-page/aging`); }
  getDebtors() { return this.http.get<Debtor[]>(`${this.url}/payments-page/debtors`); }

  // Settings
  getSettings() { return this.http.get<AppSettings>(`${this.url}/settings`); }
  updateSettings(data: Partial<AppSettings>) { return this.http.put<AppSettings>(`${this.url}/settings`, data); }

  // Exports
  exportJobsCsv(params?: Record<string, string>) {
    return this.http.get(`${this.url}/export/jobs`, { params, responseType: 'blob' });
  }
  exportClientsCsv() {
    return this.http.get(`${this.url}/export/clients`, { responseType: 'blob' });
  }

  // Import
  importPreview(content: string) { return this.http.post<any>(`${this.url}/import/preview`, { content }); }
  importExecute(content: string) { return this.http.post<any>(`${this.url}/import/execute`, { content }); }

  // Users
  getUsers() { return this.http.get<User[]>(`${this.url}/users`); }
  createUser(data: any) { return this.http.post<User>(`${this.url}/users`, data); }
  updateUser(id: string, data: any) { return this.http.put<User>(`${this.url}/users/${id}`, data); }
  deleteUser(id: string) { return this.http.delete(`${this.url}/users/${id}`); }
}
