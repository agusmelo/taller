import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  Client, Vehicle, Job, JobItem, Payment,
  SearchResults, OwnershipHistory,
  DashboardSummary, ClientFinancials, User,
  VehicleSearchResult, DuplicateCheckResult
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
    return this.http.get<Client[]>(`${this.url}/clients`, { params });
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

  // Vehicles
  getVehicles(params?: Record<string, string>) {
    return this.http.get<Vehicle[]>(`${this.url}/vehicles`, { params });
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
    return this.http.get<Job[]>(`${this.url}/jobs`, { params });
  }
  getJob(id: string) { return this.http.get<Job>(`${this.url}/jobs/${id}`); }
  createJob(data: any) { return this.http.post<Job>(`${this.url}/jobs`, data); }
  updateJob(id: string, data: Partial<Job>) { return this.http.put<Job>(`${this.url}/jobs/${id}`, data); }
  deleteJob(id: string) { return this.http.delete(`${this.url}/jobs/${id}`); }
  lockJob(id: string) { return this.http.put<Job>(`${this.url}/jobs/${id}/lock`, {}); }
  unlockJob(id: string) { return this.http.put<Job>(`${this.url}/jobs/${id}/unlock`, {}); }
  getJobPdfUrl(id: string) { return `${this.url}/jobs/${id}/pdf`; }

  // Job Items
  getJobItems(jobId: string) { return this.http.get<JobItem[]>(`${this.url}/jobs/${jobId}/items`); }
  addJobItem(jobId: string, data: Partial<JobItem>) { return this.http.post<JobItem>(`${this.url}/jobs/${jobId}/items`, data); }
  updateJobItem(jobId: string, itemId: string, data: Partial<JobItem>) {
    return this.http.put<JobItem>(`${this.url}/jobs/${jobId}/items/${itemId}`, data);
  }
  deleteJobItem(jobId: string, itemId: string) { return this.http.delete(`${this.url}/jobs/${jobId}/items/${itemId}`); }

  // Payments
  getJobPayments(jobId: string) { return this.http.get<Payment[]>(`${this.url}/jobs/${jobId}/payments`); }
  addPayment(jobId: string, data: Partial<Payment>) { return this.http.post<Payment>(`${this.url}/jobs/${jobId}/payments`, data); }
  deletePayment(jobId: string, paymentId: string) { return this.http.delete(`${this.url}/jobs/${jobId}/payments/${paymentId}`); }

  // Dashboard
  getDashboardSummary() { return this.http.get<DashboardSummary>(`${this.url}/dashboard/summary`); }
  getRevenueTrend(params?: Record<string, string>) {
    return this.http.get<{period: string; total: number}[]>(`${this.url}/dashboard/revenue-trend`, { params });
  }
  getJobStatus() { return this.http.get<{abierto: number; terminado: number; pagado: number}>(`${this.url}/dashboard/job-status`); }
  getClientFinancials(filter?: string) {
    const params: Record<string, string> = {};
    if (filter) params['filter'] = filter;
    return this.http.get<ClientFinancials>(`${this.url}/dashboard/client-financials`, { params });
  }
  getRecentJobs() { return this.http.get<Job[]>(`${this.url}/dashboard/recent-jobs`); }

  // Users
  getUsers() { return this.http.get<User[]>(`${this.url}/users`); }
  createUser(data: any) { return this.http.post<User>(`${this.url}/users`, data); }
  updateUser(id: string, data: any) { return this.http.put<User>(`${this.url}/users/${id}`, data); }
  deleteUser(id: string) { return this.http.delete(`${this.url}/users/${id}`); }
}
