import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatExpansionModule } from '@angular/material/expansion';

import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/auth/auth.service';
import { AlertItem, CatalogItem, CatalogItemAnalytics } from '../../core/models';

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

@Component({
  selector: 'app-alerts-feed',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    MatCardModule, MatTableModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatAutocompleteModule,
    MatProgressSpinnerModule, MatTooltipModule,
    MatSlideToggleModule, MatExpansionModule,
  ],
  template: `
    <main class="content">
      <div class="page-head">
        <h1 class="page-title">Alertas</h1>
        <p class="page-sub">Configurá las condiciones y evaluá el estado de los registros</p>
      </div>

      <!-- CONFIG PANEL -->
      <mat-card class="config-card">
        <mat-card-content>
          <mat-accordion multi>

            <!-- Servicio vencido -->
            <mat-expansion-panel [expanded]="cfg.overdue_service.enabled">
              <mat-expansion-panel-header>
                <div class="panel-header">
                  <mat-slide-toggle
                    [(ngModel)]="cfg.overdue_service.enabled"
                    (click)="$event.stopPropagation()"
                    color="primary">
                  </mat-slide-toggle>
                  <span class="panel-title">Servicio vencido</span>
                  <span class="panel-desc">Ítems del catálogo no realizados en el umbral configurado</span>
                </div>
              </mat-expansion-panel-header>
              <div class="panel-body">
                <mat-form-field appearance="outline" subscriptSizing="dynamic" class="field-wide">
                  <mat-label>Ítem del catálogo</mat-label>
                  <input matInput
                    [(ngModel)]="cfg.overdue_service.query"
                    (ngModelChange)="onCatalogInput($event)"
                    [matAutocomplete]="autocat"
                    [disabled]="!cfg.overdue_service.enabled">
                  <mat-icon matPrefix>manage_search</mat-icon>
                  <mat-autocomplete #autocat="matAutocomplete"
                    [displayWith]="displayItem"
                    (optionSelected)="onCatalogSelected($event)">
                    @for (item of catalogSuggestions; track item.id) {
                      <mat-option [value]="item">
                        {{ item.description }}
                        <small class="type-tag">{{ item.item_type }}</small>
                      </mat-option>
                    }
                  </mat-autocomplete>
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic" class="field-days">
                  <mat-label>Umbral (días)</mat-label>
                  <input matInput type="number" min="1" step="1"
                    [(ngModel)]="cfg.overdue_service.threshold_days"
                    [disabled]="!cfg.overdue_service.enabled">
                  <span matTextSuffix>días</span>
                </mat-form-field>
                @if (cfg.overdue_service.analytics?.avg_client_interval_days) {
                  <p class="field-hint">
                    <mat-icon>insights</mat-icon>
                    Intervalo global: {{ cfg.overdue_service.analytics!.avg_client_interval_days | number:'1.0-0' }} días
                    <span class="conf conf-{{ cfg.overdue_service.analytics!.interval_confidence ?? 'none' }}">
                      {{ confLabel(cfg.overdue_service.analytics!.interval_confidence) }}
                    </span>
                  </p>
                }
              </div>
            </mat-expansion-panel>

            <!-- Pago pendiente (admin only) -->
            @if (auth.isAdmin()) {
              <mat-expansion-panel [expanded]="cfg.payment_overdue.enabled">
                <mat-expansion-panel-header>
                  <div class="panel-header">
                    <mat-slide-toggle
                      [(ngModel)]="cfg.payment_overdue.enabled"
                      (click)="$event.stopPropagation()"
                      color="primary">
                    </mat-slide-toggle>
                    <span class="panel-title">Pago pendiente</span>
                    <span class="panel-desc">Trabajos terminados con deuda sin cobrar</span>
                  </div>
                </mat-expansion-panel-header>
                <div class="panel-body">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="field-days">
                    <mat-label>Días sin pagar</mat-label>
                    <input matInput type="number" min="1" step="1"
                      [(ngModel)]="cfg.payment_overdue.threshold_days"
                      [disabled]="!cfg.payment_overdue.enabled">
                    <span matTextSuffix>días</span>
                  </mat-form-field>
                </div>
              </mat-expansion-panel>
            }

            <!-- Cliente inactivo -->
            <mat-expansion-panel [expanded]="cfg.lost_customer.enabled">
              <mat-expansion-panel-header>
                <div class="panel-header">
                  <mat-slide-toggle
                    [(ngModel)]="cfg.lost_customer.enabled"
                    (click)="$event.stopPropagation()"
                    color="primary">
                  </mat-slide-toggle>
                  <span class="panel-title">Cliente inactivo</span>
                  <span class="panel-desc">Sin ningún trabajo completado en el período</span>
                </div>
              </mat-expansion-panel-header>
              <div class="panel-body">
                <mat-form-field appearance="outline" subscriptSizing="dynamic" class="field-days">
                  <mat-label>Días sin visitar</mat-label>
                  <input matInput type="number" min="1" step="1"
                    [(ngModel)]="cfg.lost_customer.threshold_days"
                    [disabled]="!cfg.lost_customer.enabled">
                  <span matTextSuffix>días</span>
                </mat-form-field>
              </div>
            </mat-expansion-panel>

          </mat-accordion>

          <div class="run-row">
            <button mat-raised-button color="primary"
              (click)="evaluate()"
              [disabled]="!canEvaluate() || loading">
              <mat-icon>bolt</mat-icon>
              Evaluar alertas
            </button>
            @if (loading) { <mat-spinner diameter="24"></mat-spinner> }
          </div>
        </mat-card-content>
      </mat-card>

      <!-- RESULTS -->
      @if (searched) {
        @if (results.length === 0) {
          <div class="empty-state">
            <mat-icon>check_circle_outline</mat-icon>
            <p>Sin alertas activas para la configuración actual</p>
          </div>
        } @else {
          <mat-card class="table-card">
            <mat-card-content>
              <p class="result-count">{{ results.length }} alerta(s) · ordenadas por severidad</p>
              <div class="table-wrap">
                <table mat-table [dataSource]="results">

                  <ng-container matColumnDef="severity">
                    <th mat-header-cell *matHeaderCellDef></th>
                    <td mat-cell *matCellDef="let r">
                      <span class="sev sev-{{ r.severity }}"
                        [matTooltip]="sevLabel(r.severity)">
                        {{ sevIcon(r.severity) }}
                      </span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="alert_type">
                    <th mat-header-cell *matHeaderCellDef>Tipo</th>
                    <td mat-cell *matCellDef="let r">
                      <span class="type-badge type-{{ r.alert_type }}">{{ typeLabel(r.alert_type) }}</span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="client">
                    <th mat-header-cell *matHeaderCellDef>Cliente</th>
                    <td mat-cell *matCellDef="let r">
                      <span class="client-name">{{ r.client_name }}</span>
                      @if (r.client_phone) {
                        <span class="client-phone">{{ r.client_phone }}</span>
                      }
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="entity">
                    <th mat-header-cell *matHeaderCellDef>Entidad</th>
                    <td mat-cell *matCellDef="let r">
                      <a [routerLink]="r.action_route" class="link t-mono">{{ r.entity_label }}</a>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="value">
                    <th mat-header-cell *matHeaderCellDef class="col-right">Valor / Umbral</th>
                    <td mat-cell *matCellDef="let r" class="col-right">
                      @if (r.current_value !== null) {
                        <span [class]="valueClass(r)">{{ r.current_value }}</span>
                        <span class="threshold-label"> / {{ r.threshold }} {{ r.unit === 'days' ? 'd' : '' }}</span>
                      } @else {
                        <span class="sev sev-critical">nunca</span>
                      }
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="context">
                    <th mat-header-cell *matHeaderCellDef>Detalle</th>
                    <td mat-cell *matCellDef="let r" class="col-context">{{ r.context }}</td>
                  </ng-container>

                  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                  <tr mat-row *matRowDef="let row; columns: displayedColumns;"
                    class="row-{{ row.severity }}"></tr>
                </table>
              </div>
            </mat-card-content>
          </mat-card>
        }
      }
    </main>
  `,
  styles: [`
    .content { padding: 24px; max-width: 1100px; }
    .page-head { margin-bottom: 20px; }
    .page-title { font-size: 20px; font-weight: 700; color: var(--text-1); margin: 0 0 4px; }
    .page-sub { font-size: 13px; color: var(--text-3); margin: 0; }

    .config-card { margin-bottom: 20px; }

    .panel-header {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
    }
    .panel-title { font-weight: 600; font-size: 14px; color: var(--text-1); }
    .panel-desc  { font-size: 12px; color: var(--text-3); margin-left: 4px; }

    .panel-body {
      display: flex;
      align-items: flex-end;
      gap: 12px;
      flex-wrap: wrap;
      padding: 4px 0 8px;
    }
    .field-wide { flex: 1; min-width: 240px; }
    .field-days { width: 160px; }
    .field-hint {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--text-2);
      margin: 0;
      align-self: center;
    }
    .field-hint mat-icon { font-size: 15px; width: 15px; height: 15px; }

    .type-tag { margin-left: 8px; color: var(--text-3); font-size: 11px; }

    .conf { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 10px; font-weight: 600; }
    .conf-high { background: #dcfce7; color: #16a34a; }
    .conf-low  { background: #fef9c3; color: #ca8a04; }
    .conf-none { background: #f3f4f6; color: var(--text-3); }

    .run-row {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
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

    /* Severity badge */
    .sev {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
    }
    .sev-critical { background: #fee2e2; color: #dc2626; }
    .sev-high     { background: #ffedd5; color: #ea580c; }
    .sev-medium   { background: #fef9c3; color: #ca8a04; }
    .sev-low      { background: #f0fdf4; color: #16a34a; }

    /* Type badge */
    .type-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .type-overdue_service  { background: #ede9fe; color: #7c3aed; }
    .type-payment_overdue  { background: #fee2e2; color: #dc2626; }
    .type-lost_customer    { background: #e0f2fe; color: #0369a1; }

    /* Row tints */
    .row-critical { background: #fff5f5; }
    .row-high     { background: #fffaf5; }

    .link { color: var(--navy); text-decoration: none; font-weight: 600; font-size: 12px; }
    .link:hover { text-decoration: underline; }
    .t-mono { font-family: 'JetBrains Mono', monospace; }

    .client-name  { display: block; font-size: 13px; font-weight: 500; }
    .client-phone { display: block; font-size: 11px; color: var(--text-3); }

    .col-right { text-align: right !important; }
    .col-context { font-size: 12px; color: var(--text-2); max-width: 200px; }

    .threshold-label { font-size: 11px; color: var(--text-3); }
  `]
})
export class AlertsFeedComponent implements OnInit {
  cfg = {
    overdue_service: {
      enabled:       true,
      catalog_item_id: null as string | null,
      query:         '',
      threshold_days: 180,
      analytics:     null as CatalogItemAnalytics | null,
    },
    payment_overdue: {
      enabled:       true,
      threshold_days: 30,
    },
    lost_customer: {
      enabled:       true,
      threshold_days: 180,
    },
  };

  results: AlertItem[] = [];
  loading  = false;
  searched = false;

  displayedColumns = ['severity', 'alert_type', 'client', 'entity', 'value', 'context'];

  catalogSuggestions: CatalogItem[] = [];
  private analyticsMap = new Map<string, CatalogItemAnalytics>();
  private searchTimeout: any;
  private readonly FALLBACK_DAYS: Record<string, number> = { repuesto: 365 };
  private readonly FALLBACK_DEFAULT = 180;

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private notify: NotificationService,
  ) {}

  ngOnInit() {
    if (!this.auth.isAdmin()) return;
    this.api.getCatalogAnalytics().subscribe({
      next: items => items.forEach(i => this.analyticsMap.set(i.id, i)),
      error: () => {},
    });
  }

  onCatalogInput(value: string) {
    if (typeof value !== 'string') return;
    this.cfg.overdue_service.catalog_item_id = null;
    this.cfg.overdue_service.analytics       = null;
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
    this.cfg.overdue_service.catalog_item_id = item.id;
    this.cfg.overdue_service.query           = item.description;
    this.catalogSuggestions = [];

    const analytics = this.analyticsMap.get(item.id) ?? null;
    this.cfg.overdue_service.analytics = analytics;

    const fallback    = this.FALLBACK_DAYS[item.item_type] ?? this.FALLBACK_DEFAULT;
    const avg         = analytics?.avg_client_interval_days ?? null;
    const confidence  = analytics?.interval_confidence ?? null;

    if (!avg) {
      this.cfg.overdue_service.threshold_days = fallback;
    } else if (confidence === 'low') {
      this.cfg.overdue_service.threshold_days = Math.round((avg + fallback) / 2);
    } else {
      this.cfg.overdue_service.threshold_days = Math.round(avg);
    }
  }

  displayItem(item: CatalogItem | string): string {
    if (!item) return '';
    return typeof item === 'string' ? item : item.description;
  }

  canEvaluate(): boolean {
    if (this.cfg.overdue_service.enabled) {
      if (!this.cfg.overdue_service.catalog_item_id) return false;
      if (!this.cfg.overdue_service.threshold_days || this.cfg.overdue_service.threshold_days < 1) return false;
    }
    if (this.cfg.payment_overdue.enabled) {
      if (!this.cfg.payment_overdue.threshold_days || this.cfg.payment_overdue.threshold_days < 1) return false;
    }
    if (this.cfg.lost_customer.enabled) {
      if (!this.cfg.lost_customer.threshold_days || this.cfg.lost_customer.threshold_days < 1) return false;
    }
    return this.cfg.overdue_service.enabled
        || this.cfg.payment_overdue.enabled
        || this.cfg.lost_customer.enabled;
  }

  evaluate() {
    if (!this.canEvaluate()) return;
    this.loading  = true;
    this.searched = false;

    const calls: Record<string, any> = {};

    if (this.cfg.overdue_service.enabled && this.cfg.overdue_service.catalog_item_id) {
      calls['overdue_service'] = this.api.getOverdueServiceAlerts(
        this.cfg.overdue_service.catalog_item_id,
        this.cfg.overdue_service.threshold_days,
      ).pipe(catchError(() => of([])));
    }

    if (this.cfg.payment_overdue.enabled && this.auth.isAdmin()) {
      calls['payment_overdue'] = this.api.getPaymentOverdueAlerts(
        this.cfg.payment_overdue.threshold_days,
      ).pipe(catchError(() => of([])));
    }

    if (this.cfg.lost_customer.enabled) {
      calls['lost_customer'] = this.api.getLostCustomerAlerts(
        this.cfg.lost_customer.threshold_days,
      ).pipe(catchError(() => of([])));
    }

    if (Object.keys(calls).length === 0) {
      this.loading = false;
      return;
    }

    forkJoin(calls).subscribe({
      next: (results: any) => {
        const merged: AlertItem[] = ([] as AlertItem[]).concat(
          ...Object.values(results) as AlertItem[][]
        );
        // Sort: critical → high → medium → low, then by current_value desc (worst first)
        merged.sort((a, b) => {
          const sd = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
          if (sd !== 0) return sd;
          const av = a.current_value ?? 999999;
          const bv = b.current_value ?? 999999;
          return bv - av;
        });
        this.results  = merged;
        this.loading  = false;
        this.searched = true;
      },
      error: (err) => {
        this.notify.handleError(err);
        this.loading  = false;
        this.searched = true;
      }
    });
  }

  typeLabel(type: string): string {
    const map: Record<string, string> = {
      overdue_service: 'Servicio',
      payment_overdue: 'Pago',
      lost_customer:   'Inactivo',
    };
    return map[type] ?? type;
  }

  sevLabel(sev: string): string {
    const map: Record<string, string> = {
      critical: 'Crítico',
      high:     'Alto',
      medium:   'Medio',
      low:      'Bajo',
    };
    return map[sev] ?? sev;
  }

  sevIcon(sev: string): string {
    const map: Record<string, string> = { critical: '●●●', high: '●●○', medium: '●○○', low: '○○○' };
    return map[sev] ?? sev;
  }

  valueClass(row: AlertItem): string {
    if (row.current_value === null) return 'sev sev-critical';
    const ratio = row.current_value / row.threshold;
    if (ratio >= 2.0) return 'sev sev-critical';
    if (ratio >= 1.5) return 'sev sev-high';
    if (ratio >= 1.2) return 'sev sev-medium';
    return '';
  }

  confLabel(c: 'high' | 'low' | null | undefined): string {
    if (c === 'high') return '★★★';
    if (c === 'low')  return '★★';
    return '★';
  }
}
