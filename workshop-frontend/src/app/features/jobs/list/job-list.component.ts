import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Job } from '../../../core/models';
import { StatusLabelPipe } from '../../../shared/pipes/status.pipe';
import { AppCurrencyPipe } from '../../../shared/pipes/currency.pipe';

@Component({
  selector: 'app-job-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, MatTableModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatChipsModule,
    MatPaginatorModule, MatProgressSpinnerModule, MatDatepickerModule, MatNativeDateModule,
    StatusLabelPipe, AppCurrencyPipe
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Trabajos</h1>
        @if (auth.isAdminOrRecep()) {
          <button mat-raised-button color="primary" routerLink="/trabajos/nuevo">
            <mat-icon>add</mat-icon> Nuevo Trabajo
          </button>
        }
      </div>

      <div style="display:flex;gap:16px;margin-bottom:16px;align-items:center;flex-wrap:wrap;">
        <mat-form-field appearance="outline" class="search-field" subscriptSizing="dynamic">
          <mat-label>Buscar...</mat-label>
          <input matInput [(ngModel)]="searchQuery" (input)="onSearch()">
          <mat-icon matPrefix>search</mat-icon>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Estado</mat-label>
          <mat-select [(ngModel)]="statusFilter" (selectionChange)="load()">
            <mat-option value="">Todos</mat-option>
            <mat-option value="abierto">Abierto</mat-option>
            <mat-option value="terminado">Terminado</mat-option>
            <mat-option value="pagado">Pagado</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:140px;">
          <mat-label>Desde</mat-label>
          <input matInput [matDatepicker]="dateFrom" [(ngModel)]="dateFromFilter" (dateChange)="load()">
          <mat-datepicker-toggle matIconSuffix [for]="dateFrom"></mat-datepicker-toggle>
          <mat-datepicker #dateFrom></mat-datepicker>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:140px;">
          <mat-label>Hasta</mat-label>
          <input matInput [matDatepicker]="dateTo" [(ngModel)]="dateToFilter" (dateChange)="load()">
          <mat-datepicker-toggle matIconSuffix [for]="dateTo"></mat-datepicker-toggle>
          <mat-datepicker #dateTo></mat-datepicker>
        </mat-form-field>
        @if (dateFromFilter || dateToFilter) {
          <button mat-icon-button (click)="clearDates()">
            <mat-icon>clear</mat-icon>
          </button>
        }
      </div>

      @if (loading) {
        <div class="loading-overlay"><mat-spinner diameter="40"></mat-spinner></div>
      } @else {
        <table mat-table [dataSource]="jobs" class="mat-elevation-z1">
          <ng-container matColumnDef="job_number">
            <th mat-header-cell *matHeaderCellDef>Numero</th>
            <td mat-cell *matCellDef="let j"><strong>{{ j.job_number }}</strong></td>
          </ng-container>
          <ng-container matColumnDef="client_name">
            <th mat-header-cell *matHeaderCellDef>Cliente</th>
            <td mat-cell *matCellDef="let j">{{ j.client_name }}</td>
          </ng-container>
          <ng-container matColumnDef="plate_number">
            <th mat-header-cell *matHeaderCellDef>Patente</th>
            <td mat-cell *matCellDef="let j">{{ j.plate_number }}</td>
          </ng-container>
          <ng-container matColumnDef="vehicle">
            <th mat-header-cell *matHeaderCellDef>Vehiculo</th>
            <td mat-cell *matCellDef="let j">{{ j.make }} {{ j.model }}</td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Estado</th>
            <td mat-cell *matCellDef="let j">
              <span [class]="'status-badge status-' + j.status">{{ j.status | statusLabel }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="subtotal">
            <th mat-header-cell *matHeaderCellDef class="text-right">Subtotal</th>
            <td mat-cell *matCellDef="let j" class="text-right">{{ j.subtotal | appCurrency }}</td>
          </ng-container>
          <ng-container matColumnDef="job_date">
            <th mat-header-cell *matHeaderCellDef>Fecha</th>
            <td mat-cell *matCellDef="let j">{{ (j.job_date || j.created_at) | date:'dd/MM/yyyy' }}</td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"
              class="clickable-row" (click)="goToDetail(row.id)"></tr>
        </table>
        <mat-paginator [length]="jobs.length"
                       [pageSize]="pageSize"
                       [pageSizeOptions]="[10, 20, 50]"
                       (page)="onPage($event)"
                       showFirstLastButtons>
        </mat-paginator>
      }
    </div>
  `
})
export class JobListComponent implements OnInit {
  jobs: Job[] = [];
  displayedColumns = ['job_number', 'client_name', 'plate_number', 'vehicle', 'status', 'subtotal', 'job_date'];
  searchQuery = '';
  statusFilter = '';
  dateFromFilter: Date | null = null;
  dateToFilter: Date | null = null;
  loading = false;
  pageSize = 20;
  private searchTimeout: any;

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private router: Router,
    private notify: NotificationService
  ) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    const params: Record<string, string> = { limit: String(this.pageSize) };
    if (this.searchQuery) params['q'] = this.searchQuery;
    if (this.statusFilter) params['status'] = this.statusFilter;
    if (this.dateFromFilter) params['date_from'] = this.formatDate(this.dateFromFilter);
    if (this.dateToFilter) params['date_to'] = this.formatDate(this.dateToFilter);
    this.api.getJobs(params).subscribe({
      next: j => { this.jobs = j; this.loading = false; },
      error: err => { this.notify.handleError(err); this.loading = false; }
    });
  }

  onSearch() {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.load(), 300);
  }

  onPage(event: PageEvent) {
    this.pageSize = event.pageSize;
    this.load();
  }

  clearDates() {
    this.dateFromFilter = null;
    this.dateToFilter = null;
    this.load();
  }

  private formatDate(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  goToDetail(id: string) { this.router.navigate(['/trabajos', id]); }
}
