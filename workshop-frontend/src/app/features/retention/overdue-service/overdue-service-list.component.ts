import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ApiService } from '../../../core/services/api.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService } from '../../../core/auth/auth.service';
import { CatalogItem, CatalogItemAnalytics, OverdueServiceItem } from '../../../core/models';

@Component({
  selector: 'app-overdue-service-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule, DatePipe,
    MatCardModule, MatTableModule, MatFormFieldModule, MatInputModule,
    MatAutocompleteModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatTooltipModule,
  ],
  template: `
    <main class="content">
      <div class="page-head">
        <h1 class="page-title">Retención</h1>
        <p class="page-sub">Registros que superan el umbral de días desde el último ítem del catálogo</p>
      </div>

      <mat-card class="filter-card">
        <mat-card-content>
          <div class="filter-row">
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="field-service">
              <mat-label>Ítem del catálogo</mat-label>
              <input
                matInput
                [(ngModel)]="catalogQuery"
                (ngModelChange)="onCatalogInput($event)"
                [matAutocomplete]="autocat"
                [disabled]="loadingCatalog"
              >
              <mat-icon matPrefix>manage_search</mat-icon>
              <mat-autocomplete
                #autocat="matAutocomplete"
                [displayWith]="displayCatalogItem"
                (optionSelected)="onCatalogSelected($event)"
              >
                @for (item of catalogSuggestions; track item.id) {
                  <mat-option [value]="item">
                    <span>{{ item.description }}</span>
                    <small class="item-type-tag">{{ item.item_type }}</small>
                  </mat-option>
                }
              </mat-autocomplete>
            </mat-form-field>

            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="field-threshold">
              <mat-label>Umbral</mat-label>
              <input matInput type="number" [(ngModel)]="thresholdDays" min="1" step="1" placeholder="180">
              <span matTextSuffix>días</span>
            </mat-form-field>

            <button
              mat-raised-button color="primary"
              (click)="search()"
              [disabled]="!selectedItem || !thresholdDays || thresholdDays < 1 || loading"
            >
              <mat-icon>search</mat-icon> Buscar
            </button>
          </div>

          @if (selectedItem && analyticsForSelected?.avg_client_interval_days) {
            <p class="threshold-hint">
              <mat-icon class="hint-icon">insights</mat-icon>
              Intervalo promedio global:
              <strong>{{ analyticsForSelected!.avg_client_interval_days | number:'1.0-0' }} días</strong>
              <span
                class="conf-badge"
                [class]="'conf-' + (analyticsForSelected!.interval_confidence ?? 'none')"
                [matTooltip]="confidenceTooltip(analyticsForSelected!.interval_confidence)"
              >{{ confidenceLabel(analyticsForSelected!.interval_confidence) }}</span>
              @if (analyticsForSelected!.interval_confidence === 'low') {
                <span class="blend-note">· umbral ajustado por baja confianza</span>
              }
            </p>
          } @else if (selectedItem) {
            <p class="threshold-hint">
              <mat-icon class="hint-icon">info_outline</mat-icon>
              Sin historial de intervalos — usando umbral por defecto
            </p>
          }
          <p class="coverage-hint">
            <mat-icon class="hint-icon">warning_amber</mat-icon>
            Solo incluye registros vinculados a ítems del catálogo. Los ítems ingresados manualmente no se detectan.
          </p>
        </mat-card-content>
      </mat-card>

      @if (loading) {
        <div class="loading-block">
          <mat-spinner diameter="40"></mat-spinner>
          <span>Buscando…</span>
        </div>
      } @else if (searched && results.length === 0) {
        <div class="empty-state">
          <mat-icon>check_circle_outline</mat-icon>
          <p>No hay registros vencidos para este criterio</p>
        </div>
      } @else if (results.length > 0) {
        <mat-card class="table-card">
          <mat-card-content>
            <p class="result-count">{{ results.length }} resultado(s)</p>
            <div class="table-wrap">
              <table mat-table [dataSource]="results">

                <ng-container matColumnDef="client_name">
                  <th mat-header-cell *matHeaderCellDef>Cliente</th>
                  <td mat-cell *matCellDef="let r">
                    <a [routerLink]="['/clientes', r.client_id]" class="link">{{ r.client_name }}</a>
                  </td>
                </ng-container>

                <ng-container matColumnDef="client_phone">
                  <th mat-header-cell *matHeaderCellDef>Teléfono</th>
                  <td mat-cell *matCellDef="let r">{{ r.client_phone || '—' }}</td>
                </ng-container>

                <ng-container matColumnDef="client_email">
                  <th mat-header-cell *matHeaderCellDef>Email</th>
                  <td mat-cell *matCellDef="let r">{{ r.client_email || '—' }}</td>
                </ng-container>

                <ng-container matColumnDef="plate_number">
                  <th mat-header-cell *matHeaderCellDef>Patente</th>
                  <td mat-cell *matCellDef="let r">
                    <a [routerLink]="['/vehiculos', r.vehicle_id]" class="link t-mono">{{ r.plate_number }}</a>
                  </td>
                </ng-container>

                <ng-container matColumnDef="make_model">
                  <th mat-header-cell *matHeaderCellDef>Vehículo</th>
                  <td mat-cell *matCellDef="let r">
                    {{ r.make }} {{ r.model }}{{ r.year ? ' (' + r.year + ')' : '' }}
                  </td>
                </ng-container>

                <ng-container matColumnDef="vehicle_interval">
                  <th mat-header-cell *matHeaderCellDef class="col-right">
                    Intervalo propio
                    <mat-icon
                      class="col-help"
                      matTooltip="Días promedio entre servicios para este vehículo específico"
                    >help_outline</mat-icon>
                  </th>
                  <td mat-cell *matCellDef="let r" class="col-right">
                    @if (r.vehicle_avg_interval_days !== null) {
                      {{ r.vehicle_avg_interval_days }}
                      <span
                        class="conf-badge conf-{{ r.vehicle_interval_confidence ?? 'none' }}"
                        [matTooltip]="confidenceTooltip(r.vehicle_interval_confidence)"
                      >{{ confidenceLabel(r.vehicle_interval_confidence) }}</span>
                    } @else {
                      <span class="muted">—</span>
                    }
                  </td>
                </ng-container>

                <ng-container matColumnDef="last_service_date">
                  <th mat-header-cell *matHeaderCellDef>Último registro</th>
                  <td mat-cell *matCellDef="let r">
                    @if (r.last_service_date) {
                      {{ r.last_service_date | date:'dd/MM/yyyy':'UTC' }}
                    } @else {
                      <span class="badge b-never">Nunca</span>
                    }
                  </td>
                </ng-container>

                <ng-container matColumnDef="days_since_service">
                  <th mat-header-cell *matHeaderCellDef class="col-right">Días transcurridos</th>
                  <td mat-cell *matCellDef="let r" class="col-right">
                    @if (r.days_since_service !== null) {
                      <span [class]="urgencyClass(r)" [matTooltip]="urgencyTooltip(r)">
                        {{ r.days_since_service }}
                      </span>
                    } @else {
                      <span class="badge b-never">—</span>
                    }
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
              </table>
            </div>
          </mat-card-content>
        </mat-card>
      }
    </main>
  `,
  styles: [`
    .content { padding: 24px; max-width: 1200px; }
    .page-head { margin-bottom: 20px; }
    .page-title { font-size: 20px; font-weight: 700; color: var(--text-1); margin: 0 0 4px; }
    .page-sub { font-size: 13px; color: var(--text-3); margin: 0; }

    .filter-card { margin-bottom: 20px; }
    .filter-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      flex-wrap: wrap;
    }
    .field-service { flex: 1; min-width: 280px; }
    .field-threshold { width: 160px; }
    .filter-row button { margin-top: 4px; height: 40px; }

    .item-type-tag {
      margin-left: 8px;
      color: var(--text-3);
      font-size: 11px;
    }

    .threshold-hint, .coverage-hint {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 10px 0 0;
      font-size: 12px;
      color: var(--text-2);
    }
    .coverage-hint { color: var(--text-3); }
    .hint-icon { font-size: 16px; width: 16px; height: 16px; }
    .blend-note { color: var(--text-3); font-style: italic; }

    .conf-badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      cursor: default;
    }
    .conf-high { background: #dcfce7; color: #16a34a; }
    .conf-low  { background: #fef9c3; color: #ca8a04; }
    .conf-none { background: #f3f4f6; color: var(--text-3); }

    .loading-block {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 40px 0;
      color: var(--text-2);
      font-size: 14px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 60px 0;
      color: var(--text-3);
    }
    .empty-state mat-icon { font-size: 48px; width: 48px; height: 48px; }
    .empty-state p { font-size: 14px; margin: 0; }

    .table-card { overflow: hidden; }
    .result-count { font-size: 13px; color: var(--text-2); margin: 0 0 12px; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; }

    .link { color: var(--navy); text-decoration: none; font-weight: 500; }
    .link:hover { text-decoration: underline; }
    .t-mono { font-family: 'JetBrains Mono', monospace; }

    .col-right { text-align: right !important; }
    .col-help { font-size: 14px; width: 14px; height: 14px; vertical-align: middle; color: var(--text-3); cursor: help; }
    .muted { color: var(--text-3); }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .b-never   { background: #f3f4f6; color: var(--text-3); }
    .b-overdue { background: #fee2e2; color: #dc2626; }
    .b-warning { background: #fef3c7; color: #d97706; }
  `]
})
export class OverdueServiceListComponent implements OnInit, OnDestroy {
  catalogQuery = '';
  selectedItem: CatalogItem | null = null;
  thresholdDays: number | null = null;
  catalogSuggestions: CatalogItem[] = [];
  analyticsForSelected: CatalogItemAnalytics | null = null;

  results: OverdueServiceItem[] = [];
  loading = false;
  private analyticsSub: Subscription | null = null;
  loadingCatalog = false;
  searched = false;

  displayedColumns = [
    'client_name', 'client_phone', 'client_email',
    'plate_number', 'make_model',
    'vehicle_interval', 'last_service_date', 'days_since_service',
  ];

  private analyticsMap = new Map<string, CatalogItemAnalytics>();
  private searchTimeout: any;

  // Fallback thresholds by item_type when no historical data is available
  private readonly FALLBACK_DAYS: Record<string, number> = {
    repuesto: 365,
  };
  private readonly FALLBACK_DEFAULT = 180;

  constructor(
    private api: ApiService,
    private notify: NotificationService,
    private auth: AuthService,
  ) {}

  ngOnInit() {
    // Analytics endpoint is admin-only; non-admin users fall through to item_type fallbacks
    if (!this.auth.isAdmin()) return;
    this.loadingCatalog = true;
    this.analyticsSub = this.api.getCatalogAnalytics().subscribe({
      next: (items) => {
        items.forEach(i => this.analyticsMap.set(i.id, i));
        this.loadingCatalog = false;
        this.analyticsSub = null;
      },
      error: () => { this.loadingCatalog = false; this.analyticsSub = null; }
    });
  }

  ngOnDestroy() {
    this.analyticsSub?.unsubscribe();
  }

  onCatalogInput(value: string) {
    if (typeof value !== 'string') return;
    this.selectedItem = null;
    this.analyticsForSelected = null;
    clearTimeout(this.searchTimeout);
    if (!value.trim()) { this.catalogSuggestions = []; return; }
    this.searchTimeout = setTimeout(() => {
      this.api.searchCatalogItems(value.trim()).subscribe(items => {
        this.catalogSuggestions = items;
      });
    }, 200);
  }

  onCatalogSelected(event: any) {
    const item: CatalogItem = event.option.value;
    this.selectedItem = item;
    this.catalogSuggestions = [];

    const analytics = this.analyticsMap.get(item.id) ?? null;
    this.analyticsForSelected = analytics;

    const fallback = this.FALLBACK_DAYS[item.item_type] ?? this.FALLBACK_DEFAULT;
    const avg = analytics?.avg_client_interval_days ?? null;
    const confidence = analytics?.interval_confidence ?? null;

    if (!avg) {
      this.thresholdDays = fallback;
    } else if (confidence === 'low') {
      // Blend with fallback when we only have 2 data points
      this.thresholdDays = Math.round((avg + fallback) / 2);
    } else {
      this.thresholdDays = Math.round(avg);
    }
  }

  displayCatalogItem(item: CatalogItem | string): string {
    if (!item) return '';
    return typeof item === 'string' ? item : item.description;
  }

  search() {
    if (!this.selectedItem || !this.thresholdDays || this.thresholdDays < 1) return;
    this.loading = true;
    this.searched = false;
    this.api.getOverdueService(this.selectedItem.id, this.thresholdDays).subscribe({
      next: (data) => {
        this.results = data;
        this.loading = false;
        this.searched = true;
      },
      error: (err) => {
        this.notify.handleError(err);
        this.loading = false;
        this.searched = true;
      }
    });
  }

  // Uses the vehicle's own historical interval as threshold when available,
  // falling back to the user-selected global threshold
  urgencyClass(row: OverdueServiceItem): string {
    if (row.days_since_service === null) return '';
    const threshold = row.vehicle_avg_interval_days ?? this.thresholdDays;
    if (!threshold) return '';
    if (row.days_since_service > threshold * 1.5) return 'badge b-overdue';
    if (row.days_since_service > threshold * 1.2) return 'badge b-warning';
    return '';
  }

  urgencyTooltip(row: OverdueServiceItem): string {
    if (row.vehicle_avg_interval_days) {
      return `Intervalo propio del vehículo: ${row.vehicle_avg_interval_days} días`;
    }
    return `Umbral global: ${this.thresholdDays} días`;
  }

  confidenceLabel(confidence: 'high' | 'low' | null | undefined): string {
    if (confidence === 'high') return '★★★';
    if (confidence === 'low')  return '★★';
    return '★';
  }

  confidenceTooltip(confidence: 'high' | 'low' | null | undefined): string {
    if (confidence === 'high') return 'Alta confianza (3+ registros)';
    if (confidence === 'low')  return 'Baja confianza (2 registros)';
    return 'Sin historial suficiente';
  }
}
