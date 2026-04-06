import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDividerModule } from '@angular/material/divider';
import { ApiService } from '../../core/services/api.service';
import { DashboardSummary, ClientFinancialRow, Job } from '../../core/models';
import { StatusLabelPipe } from '../../shared/pipes/status.pipe';
import { AppCurrencyPipe } from '../../shared/pipes/currency.pipe';
import Chart from 'chart.js/auto';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule,
    MatTableModule, MatSelectModule, MatFormFieldModule, MatDividerModule,
    StatusLabelPipe, AppCurrencyPipe
  ],
  template: `
    <div class="page-container">
      <h1 style="margin-bottom:24px;">Dashboard</h1>

      <!-- Summary Cards -->
      <div class="card-grid" *ngIf="summary">
        <mat-card>
          <mat-card-content class="stat-card">
            <mat-icon class="stat-icon" style="color:#1565c0;">today</mat-icon>
            <div>
              <div class="stat-label">Ingresos hoy</div>
              <div class="stat-value">{{ summary.revenue_today | appCurrency }}</div>
            </div>
          </mat-card-content>
        </mat-card>
        <mat-card>
          <mat-card-content class="stat-card">
            <mat-icon class="stat-icon" style="color:#2e7d32;">calendar_month</mat-icon>
            <div>
              <div class="stat-label">Ingresos este mes</div>
              <div class="stat-value">{{ summary.revenue_month | appCurrency }}</div>
            </div>
          </mat-card-content>
        </mat-card>
        <mat-card>
          <mat-card-content class="stat-card">
            <mat-icon class="stat-icon" style="color:#6a1b9a;">date_range</mat-icon>
            <div>
              <div class="stat-label">Ingresos este ano</div>
              <div class="stat-value">{{ summary.revenue_year | appCurrency }}</div>
            </div>
          </mat-card-content>
        </mat-card>
        <mat-card>
          <mat-card-content class="stat-card">
            <mat-icon class="stat-icon" style="color:#e65100;">work</mat-icon>
            <div>
              <div class="stat-label">Trabajos hoy / mes</div>
              <div class="stat-value">{{ summary.jobs_today }} / {{ summary.jobs_month }}</div>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Job status counters -->
      <div class="card-grid" *ngIf="jobStatus">
        <mat-card>
          <mat-card-content class="stat-card">
            <span class="status-badge status-abierto" style="font-size:14px;padding:8px 16px;">Abiertos: {{ jobStatus.abierto }}</span>
          </mat-card-content>
        </mat-card>
        <mat-card>
          <mat-card-content class="stat-card">
            <span class="status-badge status-terminado" style="font-size:14px;padding:8px 16px;">Terminados: {{ jobStatus.terminado }}</span>
          </mat-card-content>
        </mat-card>
        <mat-card>
          <mat-card-content class="stat-card">
            <span class="status-badge status-pagado" style="font-size:14px;padding:8px 16px;">Pagados: {{ jobStatus.pagado }}</span>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Revenue Chart -->
      <mat-card class="mb-16">
        <mat-card-content>
          <h3>Tendencia de ingresos (ultimos 12 meses)</h3>
          <canvas #revenueChart height="80"></canvas>
        </mat-card-content>
      </mat-card>

      <!-- Recent Jobs -->
      <mat-card class="mb-16">
        <mat-card-content>
          <h3>Ultimos 10 trabajos</h3>
          <table mat-table [dataSource]="recentJobs" style="width:100%;">
            <ng-container matColumnDef="job_number">
              <th mat-header-cell *matHeaderCellDef>Numero</th>
              <td mat-cell *matCellDef="let j">{{ j.job_number }}</td>
            </ng-container>
            <ng-container matColumnDef="client_name">
              <th mat-header-cell *matHeaderCellDef>Cliente</th>
              <td mat-cell *matCellDef="let j">{{ j.client_name }}</td>
            </ng-container>
            <ng-container matColumnDef="plate_number">
              <th mat-header-cell *matHeaderCellDef>Patente</th>
              <td mat-cell *matCellDef="let j">{{ j.plate_number }}</td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Estado</th>
              <td mat-cell *matCellDef="let j">
                <span [class]="'status-badge status-' + j.status">{{ j.status | statusLabel }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="created_at">
              <th mat-header-cell *matHeaderCellDef>Fecha</th>
              <td mat-cell *matCellDef="let j">{{ j.created_at | date:'dd/MM/yyyy' }}</td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="['job_number','client_name','plate_number','status','created_at']"></tr>
            <tr mat-row *matRowDef="let row; columns: ['job_number','client_name','plate_number','status','created_at'];"
                class="clickable-row" (click)="goToJob(row.id)"></tr>
          </table>
        </mat-card-content>
      </mat-card>

      <!-- Client Financials / Deudas -->
      <mat-card>
        <mat-card-content>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3>Deudas de clientes</h3>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:200px;">
              <mat-select [(ngModel)]="debtFilter" (selectionChange)="loadClientFinancials()">
                <mat-option value="">Todos</mat-option>
                <mat-option value="deuda">Solo con deuda</mat-option>
              </mat-select>
            </mat-form-field>
          </div>

          @if (financialTotals) {
            <div class="card-grid" style="margin-bottom:16px;">
              <mat-card style="background:#e3f2fd;">
                <mat-card-content class="stat-card">
                  <div><div class="stat-label">Total facturado</div><div class="stat-value">{{ financialTotals.total_facturado | appCurrency }}</div></div>
                </mat-card-content>
              </mat-card>
              <mat-card style="background:#e8f5e9;">
                <mat-card-content class="stat-card">
                  <div><div class="stat-label">Total cobrado</div><div class="stat-value">{{ financialTotals.total_pagado | appCurrency }}</div></div>
                </mat-card-content>
              </mat-card>
              <mat-card style="background:#fff3e0;">
                <mat-card-content class="stat-card">
                  <div><div class="stat-label">Total pendiente</div><div class="stat-value balance-positive">{{ financialTotals.total_pendiente | appCurrency }}</div></div>
                </mat-card-content>
              </mat-card>
            </div>
          }

          <table mat-table [dataSource]="clientFinancials" style="width:100%;">
            <ng-container matColumnDef="full_name">
              <th mat-header-cell *matHeaderCellDef>Cliente</th>
              <td mat-cell *matCellDef="let c">{{ c.full_name }}</td>
            </ng-container>
            <ng-container matColumnDef="rut">
              <th mat-header-cell *matHeaderCellDef>RUT</th>
              <td mat-cell *matCellDef="let c">{{ c.rut || '-' }}</td>
            </ng-container>
            <ng-container matColumnDef="job_count">
              <th mat-header-cell *matHeaderCellDef class="text-right">Trabajos</th>
              <td mat-cell *matCellDef="let c" class="text-right">{{ c.job_count }}</td>
            </ng-container>
            <ng-container matColumnDef="total_facturado">
              <th mat-header-cell *matHeaderCellDef class="text-right">Facturado</th>
              <td mat-cell *matCellDef="let c" class="text-right">{{ c.total_facturado | appCurrency }}</td>
            </ng-container>
            <ng-container matColumnDef="total_pagado">
              <th mat-header-cell *matHeaderCellDef class="text-right">Pagado</th>
              <td mat-cell *matCellDef="let c" class="text-right">{{ c.total_pagado | appCurrency }}</td>
            </ng-container>
            <ng-container matColumnDef="saldo">
              <th mat-header-cell *matHeaderCellDef class="text-right">Saldo</th>
              <td mat-cell *matCellDef="let c" class="text-right"
                  [style.background]="c.saldo > 0 ? '#fff8e1' : '#e8f5e9'"
                  [class]="c.saldo > 0 ? 'balance-positive' : 'balance-zero'">
                {{ c.saldo | appCurrency }}
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="['full_name','rut','job_count','total_facturado','total_pagado','saldo']"></tr>
            <tr mat-row *matRowDef="let row; columns: ['full_name','rut','job_count','total_facturado','total_pagado','saldo'];"
                class="clickable-row" (click)="goToClient(row.id)"></tr>
          </table>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .stat-card { display: flex; align-items: center; gap: 16px; padding: 8px 0; }
    .stat-icon { font-size: 40px; width: 40px; height: 40px; }
    .stat-label { font-size: 13px; color: #666; }
    .stat-value { font-size: 22px; font-weight: 500; }
  `]
})
export class DashboardComponent implements OnInit, AfterViewInit {
  @ViewChild('revenueChart') chartRef!: ElementRef<HTMLCanvasElement>;
  summary: DashboardSummary | null = null;
  jobStatus: { abierto: number; terminado: number; pagado: number } | null = null;
  recentJobs: Job[] = [];
  clientFinancials: ClientFinancialRow[] = [];
  financialTotals: { total_facturado: number; total_pagado: number; total_pendiente: number } | null = null;
  debtFilter = '';
  private chart: Chart | null = null;
  private revenueTrendData: { month: string; total: number }[] = [];

  constructor(private api: ApiService, private router: Router) {}

  ngOnInit() {
    this.api.getDashboardSummary().subscribe(s => this.summary = s);
    this.api.getJobStatus().subscribe(s => this.jobStatus = s);
    this.api.getRecentJobs().subscribe(j => this.recentJobs = j);
    this.api.getRevenueTrend().subscribe(d => {
      this.revenueTrendData = d;
      this.renderChart();
    });
    this.loadClientFinancials();
  }

  ngAfterViewInit() {
    if (this.revenueTrendData.length) this.renderChart();
  }

  loadClientFinancials() {
    this.api.getClientFinancials(this.debtFilter || undefined).subscribe(r => {
      this.clientFinancials = r.clients;
      this.financialTotals = r.totals;
    });
  }

  renderChart() {
    if (!this.chartRef?.nativeElement || !this.revenueTrendData.length) return;
    if (this.chart) this.chart.destroy();
    this.chart = new Chart(this.chartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: this.revenueTrendData.map(d => d.month),
        datasets: [{
          label: 'Ingresos',
          data: this.revenueTrendData.map(d => parseFloat(d.total as any)),
          backgroundColor: '#1565c0',
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => '$ ' + Number(v).toLocaleString('es-UY') } }
        }
      }
    });
  }

  goToJob(id: string) { this.router.navigate(['/trabajos', id]); }
  goToClient(id: string) { this.router.navigate(['/clientes', id]); }
}
