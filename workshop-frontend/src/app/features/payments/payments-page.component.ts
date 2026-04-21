import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  JobWithBalance, RecentPayment, AgingReport, AgingBucket,
  Debtor, PaymentsSummary, AppSettings
} from '../../core/models';
import { StatusLabelPipe, PaymentMethodPipe } from '../../shared/pipes/status.pipe';
import { AppCurrencyPipe } from '../../shared/pipes/currency.pipe';
import { QuickPaymentDialogComponent } from './quick-payment-dialog.component';
import Chart from 'chart.js/auto';

@Component({
  selector: 'app-payments-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule,
    MatTableModule, MatSelectModule, MatFormFieldModule, MatInputModule,
    MatPaginatorModule, MatProgressSpinnerModule, MatTabsModule, MatTooltipModule,
    MatDividerModule, MatDialogModule,
    StatusLabelPipe, PaymentMethodPipe, AppCurrencyPipe
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Pagos</h1>
      </div>

      <!-- KPI Cards -->
      @if (summary) {
        <div class="kpi-row kpi-row-4">
          <div class="kpi kpi-accent">
            <div class="kpi-label">Cobrado (mes)</div>
            <div class="kpi-val" style="color:var(--green);">{{ summary.cobrado_month | appCurrency }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Pendiente total</div>
            <div class="kpi-val" style="color:var(--red);">{{ summary.pendiente_total | appCurrency }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Deudores</div>
            <div class="kpi-val">{{ summary.deudores_count }}</div>
          </div>
          <div class="kpi chart-kpi">
            <canvas #methodChart height="80"></canvas>
          </div>
        </div>
      }

      <!-- Paid vs Pending visualization -->
      @if (summary && summary.cobrado_month + summary.pendiente_total > 0) {
        <mat-card class="mb-16">
          <mat-card-content>
            <div class="ds-card-hd"><span class="ds-card-title">Cobrado vs Pendiente</span></div>
            <div class="bar-comparison">
              <div class="bar-row">
                <span class="bar-label">Cobrado</span>
                <div class="bar-track">
                  <div class="bar-fill bar-paid" [style.width.%]="paidPercent">
                    {{ summary.cobrado_month | appCurrency }}
                  </div>
                </div>
              </div>
              <div class="bar-row">
                <span class="bar-label">Pendiente</span>
                <div class="bar-track">
                  <div class="bar-fill bar-pending" [style.width.%]="pendingPercent">
                    {{ summary.pendiente_total | appCurrency }}
                  </div>
                </div>
              </div>
            </div>
          </mat-card-content>
        </mat-card>
      }

      <!-- Aging Report -->
      @if (aging) {
        <mat-card class="mb-16">
          <mat-card-content>
            <div class="ds-card-hd"><span class="ds-card-title">Antiguedad de deuda</span></div>
            <div class="aging-grid">
              @for (bucket of agingBuckets; track bucket.label) {
                <div class="aging-item" [class.aging-danger]="bucket.label === '90+'">
                  <div class="aging-label">{{ bucket.label }} dias</div>
                  <div class="aging-amount">{{ bucket.data.total_balance | appCurrency }}</div>
                  <div class="aging-meta">{{ bucket.data.job_count }} trabajos · {{ bucket.data.client_count }} clientes</div>
                </div>
              }
            </div>
          </mat-card-content>
        </mat-card>
      }

      <mat-tab-group>
        <!-- Tab 1: Jobs with balances -->
        <mat-tab label="Trabajos">
          <div style="padding:16px 0;">
            <div style="display:flex;gap:12px;margin-bottom:16px;align-items:center;flex-wrap:wrap;">
              <mat-form-field appearance="outline" class="search-field" subscriptSizing="dynamic">
                <mat-label>Buscar...</mat-label>
                <input matInput [(ngModel)]="jobSearch" (input)="onJobSearch()">
                <mat-icon matPrefix>search</mat-icon>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:160px;">
                <mat-label>Estado</mat-label>
                <mat-select [(ngModel)]="jobStatusFilter" (selectionChange)="loadJobs()">
                  <mat-option value="">Todos</mat-option>
                  <mat-option value="abierto">Abierto</mat-option>
                  <mat-option value="terminado">Terminado</mat-option>
                  <mat-option value="pagado">Pagado</mat-option>
                </mat-select>
              </mat-form-field>
            </div>

            @if (jobsLoading) {
              <div class="loading-overlay"><mat-spinner diameter="40"></mat-spinner></div>
            } @else if (jobs.length === 0) {
              <div class="empty-state"><mat-icon>receipt_long</mat-icon><p>Sin trabajos</p></div>
            } @else {
              <table mat-table [dataSource]="jobs" class="mat-elevation-z1" style="width:100%;">
                <ng-container matColumnDef="job_number">
                  <th mat-header-cell *matHeaderCellDef>N.o</th>
                  <td mat-cell *matCellDef="let j"><strong>{{ j.job_number }}</strong></td>
                </ng-container>
                <ng-container matColumnDef="job_date">
                  <th mat-header-cell *matHeaderCellDef>Fecha</th>
                  <td mat-cell *matCellDef="let j">{{ j.job_date | date:'dd/MM/yy' }}</td>
                </ng-container>
                <ng-container matColumnDef="client_name">
                  <th mat-header-cell *matHeaderCellDef>Cliente</th>
                  <td mat-cell *matCellDef="let j">{{ j.client_name }}</td>
                </ng-container>
                <ng-container matColumnDef="plate_number">
                  <th mat-header-cell *matHeaderCellDef>Patente</th>
                  <td mat-cell *matCellDef="let j">{{ j.plate_number }}</td>
                </ng-container>
                <ng-container matColumnDef="total">
                  <th mat-header-cell *matHeaderCellDef class="text-right">Total</th>
                  <td mat-cell *matCellDef="let j" class="text-right">{{ j.total | appCurrency }}</td>
                </ng-container>
                <ng-container matColumnDef="total_paid">
                  <th mat-header-cell *matHeaderCellDef class="text-right">Pagado</th>
                  <td mat-cell *matCellDef="let j" class="text-right" style="color:var(--green);">{{ j.total_paid | appCurrency }}</td>
                </ng-container>
                <ng-container matColumnDef="balance">
                  <th mat-header-cell *matHeaderCellDef class="text-right">Saldo</th>
                  <td mat-cell *matCellDef="let j" class="text-right"
                      [style.color]="j.balance > 0 ? 'var(--red)' : 'var(--green)'"
                      [style.fontWeight]="j.balance > 0 ? '600' : '400'">
                    {{ j.balance | appCurrency }}
                  </td>
                </ng-container>
                <ng-container matColumnDef="status">
                  <th mat-header-cell *matHeaderCellDef>Estado</th>
                  <td mat-cell *matCellDef="let j">
                    <span [class]="'status-badge status-' + j.status">{{ j.status | statusLabel }}</span>
                  </td>
                </ng-container>
                <ng-container matColumnDef="last_payment">
                  <th mat-header-cell *matHeaderCellDef>Ultimo pago</th>
                  <td mat-cell *matCellDef="let j">
                    @if (j.last_payment_date) {
                      {{ j.last_payment_date | date:'dd/MM/yy' }}
                      <small style="color:var(--text-2);"> ({{ j.last_payment_method | paymentMethod }})</small>
                    } @else { - }
                  </td>
                </ng-container>
                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef></th>
                  <td mat-cell *matCellDef="let j">
                    @if (j.balance > 0) {
                      <button mat-icon-button color="primary" (click)="openQuickPayment(j, $event)"
                              matTooltip="Registrar pago">
                        <mat-icon>add_card</mat-icon>
                      </button>
                    }
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="jobColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: jobColumns;"
                    class="clickable-row" (click)="goToJob(row.id)"></tr>
              </table>
              <mat-paginator [length]="jobsTotal" [pageIndex]="jobPage" [pageSize]="jobPageSize"
                             [pageSizeOptions]="[10, 20, 50]" (page)="onJobPage($event)" showFirstLastButtons>
              </mat-paginator>
            }
          </div>
        </mat-tab>

        <!-- Tab 2: Debtors -->
        <mat-tab>
          <ng-template mat-tab-label>
            Deudores
            @if (debtAlerts.length > 0) {
              <span class="tab-badge">{{ debtAlerts.length }}</span>
            }
          </ng-template>
          <div style="padding:16px 0;">
            @if (debtors.length === 0) {
              <div class="empty-state"><mat-icon>celebration</mat-icon><p>No hay deudores</p></div>
            } @else {
              <table mat-table [dataSource]="debtors" class="mat-elevation-z1" style="width:100%;">
                <ng-container matColumnDef="full_name">
                  <th mat-header-cell *matHeaderCellDef>Cliente</th>
                  <td mat-cell *matCellDef="let d">
                    {{ d.full_name }}
                    @if (isDebtAlert(d)) {
                      <mat-icon style="color:var(--red);font-size:16px;vertical-align:middle;margin-left:4px;"
                                matTooltip="Deuda supera umbral de alerta">warning</mat-icon>
                    }
                  </td>
                </ng-container>
                <ng-container matColumnDef="rut">
                  <th mat-header-cell *matHeaderCellDef>RUT</th>
                  <td mat-cell *matCellDef="let d">{{ d.rut || '-' }}</td>
                </ng-container>
                <ng-container matColumnDef="phone">
                  <th mat-header-cell *matHeaderCellDef>Telefono</th>
                  <td mat-cell *matCellDef="let d">{{ d.phone || '-' }}</td>
                </ng-container>
                <ng-container matColumnDef="total_debt">
                  <th mat-header-cell *matHeaderCellDef class="text-right">Deuda total</th>
                  <td mat-cell *matCellDef="let d" class="text-right"
                      [style.color]="isDebtAlert(d) ? 'var(--red)' : 'var(--amber)'"
                      style="font-weight:600;">
                    {{ d.total_debt | appCurrency }}
                  </td>
                </ng-container>
                <ng-container matColumnDef="unpaid_jobs">
                  <th mat-header-cell *matHeaderCellDef class="text-right">Trabajos</th>
                  <td mat-cell *matCellDef="let d" class="text-right">{{ d.unpaid_jobs }}</td>
                </ng-container>
                <ng-container matColumnDef="days_overdue">
                  <th mat-header-cell *matHeaderCellDef class="text-right">Dias</th>
                  <td mat-cell *matCellDef="let d" class="text-right"
                      [style.color]="d.days_overdue > unpaidDaysThreshold ? 'var(--red)' : ''">
                    {{ d.days_overdue }}d
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="['full_name','rut','phone','total_debt','unpaid_jobs','days_overdue']"></tr>
                <tr mat-row *matRowDef="let row; columns: ['full_name','rut','phone','total_debt','unpaid_jobs','days_overdue'];"
                    class="clickable-row" (click)="goToClient(row.id)"
                    [style.background]="isDebtAlert(row) ? 'var(--red-lt)' : ''"></tr>
              </table>
            }
          </div>
        </mat-tab>

        <!-- Tab 3: Recent payments -->
        <mat-tab label="Historial de pagos">
          <div style="padding:16px 0;">
            @if (recentPayments.length === 0) {
              <div class="empty-state"><mat-icon>receipt</mat-icon><p>Sin pagos registrados</p></div>
            } @else {
              <table mat-table [dataSource]="recentPayments" class="mat-elevation-z1" style="width:100%;">
                <ng-container matColumnDef="paid_at">
                  <th mat-header-cell *matHeaderCellDef>Fecha</th>
                  <td mat-cell *matCellDef="let p">{{ p.paid_at | date:'dd/MM/yy HH:mm' }}</td>
                </ng-container>
                <ng-container matColumnDef="client_name">
                  <th mat-header-cell *matHeaderCellDef>Cliente</th>
                  <td mat-cell *matCellDef="let p">{{ p.client_name }}</td>
                </ng-container>
                <ng-container matColumnDef="job_number">
                  <th mat-header-cell *matHeaderCellDef>Trabajo</th>
                  <td mat-cell *matCellDef="let p">{{ p.job_number }}</td>
                </ng-container>
                <ng-container matColumnDef="method">
                  <th mat-header-cell *matHeaderCellDef>Metodo</th>
                  <td mat-cell *matCellDef="let p">{{ p.method | paymentMethod }}</td>
                </ng-container>
                <ng-container matColumnDef="reference">
                  <th mat-header-cell *matHeaderCellDef>Referencia</th>
                  <td mat-cell *matCellDef="let p">{{ p.reference || '-' }}</td>
                </ng-container>
                <ng-container matColumnDef="amount">
                  <th mat-header-cell *matHeaderCellDef class="text-right">Monto</th>
                  <td mat-cell *matCellDef="let p" class="text-right" style="color:var(--green);font-weight:600;">
                    {{ p.amount | appCurrency }}
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="['paid_at','client_name','job_number','method','reference','amount']"></tr>
                <tr mat-row *matRowDef="let row; columns: ['paid_at','client_name','job_number','method','reference','amount'];"
                    class="clickable-row" (click)="goToJob(row.job_id)"></tr>
              </table>
            }
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .chart-kpi { display: flex; align-items: center; justify-content: center; padding: 4px; }
    .bar-comparison { display: flex; flex-direction: column; gap: 12px; }
    .bar-row { display: flex; align-items: center; gap: 12px; }
    .bar-label { width: 80px; font-size: 11px; color: var(--text-2); text-align: right; font-weight: 500; }
    .bar-track { flex: 1; background: var(--border2); border-radius: var(--r-sm); height: 28px; overflow: hidden; }
    .bar-fill { height: 100%; display: flex; align-items: center; padding: 0 12px;
                font-size: 11px; font-weight: 600; color: white; min-width: fit-content;
                transition: width 0.5s ease; border-radius: var(--r-sm); }
    .bar-paid    { background: var(--green); }
    .bar-pending { background: var(--red); }
    .aging-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    @media (max-width: 768px) { .aging-grid { grid-template-columns: repeat(2, 1fr); } }
    .aging-item { text-align: center; padding: 16px; border-radius: var(--r); background: var(--bg); border: 1px solid var(--border2); }
    .aging-item.aging-danger { background: var(--red-lt); border-color: #fecaca; }
    .aging-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--text-3); }
    .aging-amount { font-size: 18px; font-weight: 700; letter-spacing: -.03em; margin: 6px 0; color: var(--text-1); }
    .aging-danger .aging-amount { color: var(--red); }
    .aging-meta { font-size: 10px; color: var(--text-3); }
    .tab-badge {
      background: var(--red); color: white; border-radius: 10px;
      padding: 1px 6px; font-size: 10px; font-weight: 700; margin-left: 6px;
    }
  `]
})
export class PaymentsPageComponent implements OnInit {
  @ViewChild('methodChart') methodChartRef!: ElementRef<HTMLCanvasElement>;

  summary: PaymentsSummary | null = null;
  aging: AgingReport | null = null;
  agingBuckets: { label: string; data: AgingBucket }[] = [];
  debtors: Debtor[] = [];
  recentPayments: RecentPayment[] = [];
  jobs: JobWithBalance[] = [];
  settings: AppSettings | null = null;

  jobSearch = '';
  jobStatusFilter = '';
  jobPage = 0;
  jobPageSize = 20;
  jobsTotal = 0;
  jobsLoading = false;
  jobColumns = ['job_number', 'job_date', 'client_name', 'plate_number', 'total', 'total_paid', 'balance', 'status', 'last_payment', 'actions'];

  paidPercent = 0;
  pendingPercent = 0;
  debtAlertThreshold = 5000;
  unpaidDaysThreshold = 30;
  debtAlerts: Debtor[] = [];

  private methodChart: Chart | null = null;
  private searchTimeout: any;

  constructor(
    private api: ApiService,
    private router: Router,
    private notify: NotificationService,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.api.getSettings().subscribe(s => {
      this.settings = s;
      this.debtAlertThreshold = parseInt(s.debt_alert_threshold) || 5000;
      this.unpaidDaysThreshold = parseInt(s.unpaid_days_threshold) || 30;
      this.loadDebtors();
    });
    this.api.getPaymentsSummary().subscribe(s => {
      this.summary = s;
      const total = s.cobrado_month + s.pendiente_total;
      this.paidPercent = total > 0 ? Math.round(s.cobrado_month / total * 100) : 0;
      this.pendingPercent = total > 0 ? Math.round(s.pendiente_total / total * 100) : 0;
      setTimeout(() => this.renderMethodChart(), 100);
    });
    this.api.getAgingReport().subscribe(a => {
      this.aging = a;
      this.agingBuckets = [
        { label: '0-30', data: a['0-30'] },
        { label: '31-60', data: a['31-60'] },
        { label: '61-90', data: a['61-90'] },
        { label: '90+', data: a['90+'] },
      ];
    });
    this.api.getRecentPaymentsList(30).subscribe(p => this.recentPayments = p);
    this.loadJobs();
  }

  loadJobs() {
    this.jobsLoading = true;
    const params: Record<string, string> = {
      limit: String(this.jobPageSize),
      page: String(this.jobPage + 1)
    };
    if (this.jobSearch) params['q'] = this.jobSearch;
    if (this.jobStatusFilter) params['status'] = this.jobStatusFilter;
    this.api.getJobsWithBalances(params).subscribe({
      next: res => { this.jobs = res.data; this.jobsTotal = res.total; this.jobsLoading = false; },
      error: err => { this.notify.handleError(err); this.jobsLoading = false; }
    });
  }

  loadDebtors() {
    this.api.getDebtors().subscribe(d => {
      this.debtors = d;
      this.debtAlerts = d.filter(dd => dd.total_debt >= this.debtAlertThreshold);
    });
  }

  onJobSearch() {
    clearTimeout(this.searchTimeout);
    this.jobPage = 0;
    this.searchTimeout = setTimeout(() => this.loadJobs(), 300);
  }

  onJobPage(event: PageEvent) {
    this.jobPage = event.pageIndex;
    this.jobPageSize = event.pageSize;
    this.loadJobs();
  }

  isDebtAlert(d: Debtor): boolean {
    return d.total_debt >= this.debtAlertThreshold;
  }

  openQuickPayment(job: JobWithBalance, event: Event) {
    event.stopPropagation();
    const ref = this.dialog.open(QuickPaymentDialogComponent, {
      width: '400px',
      data: { job }
    });
    ref.afterClosed().subscribe(result => {
      if (result) {
        this.loadJobs();
        this.api.getPaymentsSummary().subscribe(s => {
          this.summary = s;
          const total = s.cobrado_month + s.pendiente_total;
          this.paidPercent = total > 0 ? Math.round(s.cobrado_month / total * 100) : 0;
          this.pendingPercent = total > 0 ? Math.round(s.pendiente_total / total * 100) : 0;
        });
        this.loadDebtors();
        this.api.getRecentPaymentsList(30).subscribe(p => this.recentPayments = p);
        this.api.getAgingReport().subscribe(a => {
          this.aging = a;
          this.agingBuckets = [
            { label: '0-30', data: a['0-30'] },
            { label: '31-60', data: a['31-60'] },
            { label: '61-90', data: a['61-90'] },
            { label: '90+', data: a['90+'] },
          ];
        });
      }
    });
  }

  renderMethodChart() {
    if (!this.methodChartRef?.nativeElement || !this.summary?.by_method?.length) return;
    if (this.methodChart) this.methodChart.destroy();
    const labels: Record<string, string> = {
      efectivo: 'Efectivo', transferencia: 'Transferencia',
      credito: 'Credito', cheque: 'Cheque'
    };
    const colors = ['#111827', '#374151', '#6b7280', '#9ca3af'];
    this.methodChart = new Chart(this.methodChartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: this.summary.by_method.map(m => labels[m.method] || m.method),
        datasets: [{
          data: this.summary.by_method.map(m => m.total),
          backgroundColor: colors.slice(0, this.summary.by_method.length),
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: ctx => ctx.label + ': $ ' + Number(ctx.raw).toLocaleString('es-UY', { minimumFractionDigits: 2 })
            }
          }
        }
      }
    });
  }

  goToJob(id: string) { this.router.navigate(['/trabajos', id]); }
  goToClient(id: string) { this.router.navigate(['/clientes', id]); }
}
