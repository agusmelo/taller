import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/auth/auth.service';
import { AlertItem, CatalogItem, CatalogItemAnalytics } from '../../core/models';

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

interface MonitoredService {
  item: CatalogItem;
  threshold: number;
  analytics: CatalogItemAnalytics | null;
}

@Component({
  selector: 'app-alerts-feed',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    MatCardModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatAutocompleteModule,
    MatProgressSpinnerModule, MatTooltipModule,
  ],
  template: `
    <main class="content">

      <!-- Header -->
      <div class="page-head">
        <div class="head-left">
          <h1 class="page-title">Alertas</h1>
          @if (alerts.length > 0) {
            <div class="sev-summary">
              @if (countBySeverity('critical') > 0) {
                <span class="sum-chip chip-critical">{{ countBySeverity('critical') }} crítica(s)</span>
              }
              @if (countBySeverity('high') > 0) {
                <span class="sum-chip chip-high">{{ countBySeverity('high') }} alta(s)</span>
              }
              @if (countBySeverity('medium') > 0) {
                <span class="sum-chip chip-medium">{{ countBySeverity('medium') }} media(s)</span>
              }
              @if (countBySeverity('low') > 0) {
                <span class="sum-chip chip-low">{{ countBySeverity('low') }} baja(s)</span>
              }
            </div>
          }
        </div>
        <div class="head-right">
          @if (loadingCount > 0) { <mat-spinner diameter="18"></mat-spinner> }
          @if (lastUpdated) {
            <span class="last-updated">Actualizado {{ lastUpdated | date:'HH:mm' }}</span>
          }
          <button mat-icon-button (click)="refresh()" [disabled]="loadingCount > 0" matTooltip="Actualizar">
            <mat-icon>refresh</mat-icon>
          </button>
        </div>
      </div>

      <!-- Config strip -->
      <div class="config-strip">
        <div class="monitors">
          <span class="strip-label">Servicios:</span>
          @for (svc of monitoredServices; track svc.item.id) {
            <span class="monitor-chip">
              <mat-icon class="chip-icon">manage_search</mat-icon>
              {{ svc.item.description }}
              <span class="chip-days">{{ svc.threshold }}d</span>
              <button class="chip-remove" (click)="removeService(svc)" matTooltip="Quitar">×</button>
            </span>
          }
          @if (!addingService) {
            <button class="add-chip" (click)="startAddService()">
              <mat-icon>add</mat-icon>Monitorear servicio
            </button>
          } @else {
            <div class="add-service-wrap">
              <input #svcInput
                type="text"
                class="add-service-input"
                placeholder="Buscar en catálogo…"
                [(ngModel)]="serviceQuery"
                (ngModelChange)="onServiceInput($event)"
                [matAutocomplete]="autoSvc"
                (blur)="onServiceInputBlur()">
              <mat-autocomplete #autoSvc="matAutocomplete"
                [displayWith]="displayItem"
                (optionSelected)="onServiceSelected($event)">
                @for (item of catalogSuggestions; track item.id) {
                  <mat-option [value]="item">
                    {{ item.description }}
                    <small class="type-tag">{{ item.item_type }}</small>
                  </mat-option>
                }
              </mat-autocomplete>
            </div>
          }
        </div>

        <div class="threshold-controls">
          <label class="threshold-ctrl">
            <span>Inactivos &gt;</span>
            <input type="number" min="1" step="1"
              [(ngModel)]="thresholds.lost_customer"
              (ngModelChange)="onThresholdInput('lost_customer')">
            <span>d</span>
          </label>
          @if (auth.isAdmin()) {
            <label class="threshold-ctrl">
              <span>Pagos &gt;</span>
              <input type="number" min="1" step="1"
                [(ngModel)]="thresholds.payment_overdue"
                (ngModelChange)="onThresholdInput('payment_overdue')">
              <span>d</span>
            </label>
          }
        </div>
      </div>

      <!-- Loading (initial) -->
      @if (loadingCount > 0 && alerts.length === 0) {
        <div class="state-center">
          <mat-spinner diameter="32"></mat-spinner>
        </div>
      }

      <!-- Empty -->
      @if (loadingCount === 0 && didLoad && alerts.length === 0) {
        <div class="state-center">
          <mat-icon>check_circle_outline</mat-icon>
          <p>Sin alertas activas</p>
        </div>
      }

      <!-- Feed -->
      @if (alerts.length > 0) {
        <mat-card class="feed-card">
          <mat-card-content class="feed">
            @for (alert of alerts; track alert.alert_type + '_' + alert.entity_id) {
              <div class="alert-row border-{{ alert.severity }}">
                <span class="sev-dot sev-{{ alert.severity }}"
                  [matTooltip]="sevLabel(alert.severity)">
                </span>
                <span class="type-badge type-{{ alert.alert_type }}">
                  {{ typeLabel(alert.alert_type) }}
                </span>
                <div class="alert-main">
                  <span class="client-name">{{ alert.client_name }}</span>
                  <span class="alert-ctx">{{ alert.context }}</span>
                </div>
                <div class="alert-value">
                  @if (alert.current_value !== null) {
                    <span class="val-current val-{{ alert.severity }}">{{ alert.current_value }}d</span>
                    <span class="val-sep">/</span>
                    <span class="val-threshold">{{ alert.threshold }}d</span>
                  } @else {
                    <span class="val-never">nunca</span>
                  }
                </div>
                <div class="alert-actions">
                  @if (alert.client_phone) {
                    <a [href]="waLink(alert)" target="_blank" rel="noopener"
                      class="action-btn wa-btn" matTooltip="WhatsApp">
                      <mat-icon>chat</mat-icon>
                    </a>
                  }
                  <a [routerLink]="alert.action_route" class="action-btn view-btn" matTooltip="Ver detalle">
                    <mat-icon>open_in_new</mat-icon>
                  </a>
                </div>
              </div>
            }
          </mat-card-content>
        </mat-card>
      }

    </main>
  `,
  styles: [`
    .content { padding: 24px; max-width: 1000px; }

    /* ── Header ── */
    .page-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }
    .head-left  { display: flex; align-items: center; gap: 12px; }
    .page-title { font-size: 20px; font-weight: 700; color: var(--text-1); margin: 0; }
    .sev-summary { display: flex; gap: 6px; }
    .sum-chip {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .chip-critical { background: #fee2e2; color: #dc2626; }
    .chip-high     { background: #ffedd5; color: #ea580c; }
    .chip-medium   { background: #fef9c3; color: #ca8a04; }
    .chip-low      { background: #f0fdf4; color: #16a34a; }
    .head-right     { display: flex; align-items: center; gap: 8px; }
    .last-updated   { font-size: 12px; color: var(--text-3); }

    /* ── Config strip ── */
    .config-strip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r-sm);
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .monitors {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      flex: 1;
    }
    .strip-label { font-size: 12px; color: var(--text-3); font-weight: 500; }
    .monitor-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      background: #ede9fe;
      color: #7c3aed;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
    }
    .chip-icon { font-size: 13px; width: 13px; height: 13px; }
    .chip-days {
      background: rgba(124,58,237,.15);
      padding: 0 4px;
      border-radius: 3px;
      font-size: 11px;
    }
    .chip-remove {
      background: none; border: none; cursor: pointer;
      color: #7c3aed; font-size: 14px; padding: 0 1px; line-height: 1;
    }
    .add-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 10px;
      background: none;
      border: 1.5px dashed var(--border);
      border-radius: 20px;
      color: var(--text-3);
      font-size: 12px;
      cursor: pointer;
      transition: border-color .14s, color .14s;
    }
    .add-chip:hover { border-color: #7c3aed; color: #7c3aed; }
    .add-chip mat-icon { font-size: 13px; width: 13px; height: 13px; }
    .add-service-wrap { position: relative; }
    .add-service-input {
      height: 26px;
      padding: 0 10px;
      border: 1.5px solid var(--navy);
      border-radius: 20px;
      font-size: 12px;
      font-family: inherit;
      color: var(--text-1);
      outline: none;
      width: 210px;
      background: var(--surface);
    }

    /* Threshold controls */
    .threshold-controls { display: flex; gap: 14px; align-items: center; }
    .threshold-ctrl {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: var(--text-2);
    }
    .threshold-ctrl input {
      width: 46px; height: 24px; padding: 0 6px;
      border: 1px solid var(--border); border-radius: 4px;
      font-size: 12px; text-align: center;
      font-family: inherit; color: var(--text-1); outline: none;
    }
    .threshold-ctrl input:focus { border-color: var(--navy); }
    .type-tag { margin-left: 8px; color: var(--text-3); font-size: 11px; }

    /* ── States ── */
    .state-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 60px 0;
      color: var(--text-3);
    }
    .state-center mat-icon { font-size: 48px; width: 48px; height: 48px; }
    .state-center p { font-size: 14px; margin: 0; }

    /* ── Feed ── */
    .feed-card { overflow: hidden; }
    ::ng-deep .feed-card .mat-mdc-card-content { padding: 0 !important; }

    .alert-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 14px;
      border-left: 3px solid transparent;
      border-bottom: 1px solid var(--border);
      transition: background .1s;
    }
    .alert-row:last-child { border-bottom: none; }
    .alert-row:hover { background: var(--bg); }

    .border-critical { border-left-color: #dc2626; }
    .border-high     { border-left-color: #ea580c; }
    .border-medium   { border-left-color: #ca8a04; }
    .border-low      { border-left-color: #16a34a; }

    .sev-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .sev-critical { background: #dc2626; }
    .sev-high     { background: #ea580c; }
    .sev-medium   { background: #ca8a04; }
    .sev-low      { background: #16a34a; }

    .type-badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .type-overdue_service { background: #ede9fe; color: #7c3aed; }
    .type-payment_overdue { background: #fee2e2; color: #dc2626; }
    .type-lost_customer   { background: #e0f2fe; color: #0369a1; }
    .type-broken_pattern  { background: #fff7ed; color: #c2410c; }

    .alert-main {
      flex: 1;
      min-width: 0;
    }
    .client-name {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-1);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .alert-ctx {
      display: block;
      font-size: 11px;
      color: var(--text-3);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .alert-value {
      display: flex;
      align-items: center;
      gap: 2px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      flex-shrink: 0;
      min-width: 80px;
      justify-content: flex-end;
    }
    .val-current { font-weight: 700; }
    .val-current.val-critical { color: #dc2626; }
    .val-current.val-high     { color: #ea580c; }
    .val-current.val-medium   { color: #ca8a04; }
    .val-current.val-low      { color: var(--text-2); }
    .val-sep       { color: var(--text-3); }
    .val-threshold { color: var(--text-3); }
    .val-never     { font-weight: 700; color: #dc2626; font-size: 12px; }

    .alert-actions { display: flex; gap: 2px; flex-shrink: 0; }
    .action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px; height: 28px;
      border-radius: 6px;
      border: none;
      text-decoration: none;
      cursor: pointer;
      transition: background .12s, color .12s;
      color: var(--text-3);
      background: none;
    }
    .action-btn mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .action-btn:hover  { background: var(--bg); color: var(--text-1); }
    .wa-btn:hover      { background: #dcfce7; color: #16a34a; }
    .view-btn:hover    { background: #ede9fe; color: #7c3aed; }
  `]
})
export class AlertsFeedComponent implements OnInit, OnDestroy {
  monitoredServices: MonitoredService[] = [];
  addingService    = false;
  serviceQuery     = '';
  catalogSuggestions: CatalogItem[] = [];

  thresholds = { payment_overdue: 30, lost_customer: 180 };

  alerts: AlertItem[]       = [];
  loadingCount              = 0;
  lastUpdated: Date | null  = null;
  didLoad                   = false;

  private alertsByKey  = new Map<string, AlertItem[]>();
  private analyticsMap = new Map<string, CatalogItemAnalytics>();
  private searchTimeout: any;
  private thresholdTimers: Record<string, any> = {};
  private readonly FALLBACK_DAYS: Record<string, number> = { repuesto: 365 };
  private readonly FALLBACK_DEFAULT = 180;

  constructor(
    public  auth:   AuthService,
    private api:    ApiService,
    private notify: NotificationService,
  ) {}

  ngOnInit() {
    if (this.auth.isAdmin()) {
      this.api.getCatalogAnalytics().subscribe({
        next: items => items.forEach(i => this.analyticsMap.set(i.id, i)),
        error: () => {},
      });
    }
    this.loadAll();
  }

  ngOnDestroy() {
    clearTimeout(this.searchTimeout);
    Object.values(this.thresholdTimers).forEach(t => clearTimeout(t));
  }

  private loadAll() {
    this.fireRequest('broken_pattern', this.api.getBrokenPatternAlerts());
    this.fireRequest('lost_customer',  this.api.getLostCustomerAlerts(this.thresholds.lost_customer));
    if (this.auth.isAdmin()) {
      this.fireRequest('payment_overdue', this.api.getPaymentOverdueAlerts(this.thresholds.payment_overdue));
    }
    for (const svc of this.monitoredServices) {
      this.fireRequest('svc_' + svc.item.id,
        this.api.getOverdueServiceAlerts(svc.item.id, svc.threshold));
    }
  }

  refresh() {
    this.alerts = [];
    this.alertsByKey.clear();
    this.lastUpdated = null;
    this.didLoad     = false;
    this.loadAll();
  }

  private fireRequest(key: string, obs: Observable<AlertItem[]>) {
    this.loadingCount++;
    obs.pipe(catchError(() => of([]))).subscribe(items => {
      this.alertsByKey.set(key, items);
      this.mergeAndSort();
      this.loadingCount--;
      if (this.loadingCount === 0) {
        this.lastUpdated = new Date();
        this.didLoad     = true;
      }
    });
  }

  private mergeAndSort() {
    const all: AlertItem[] = [];
    for (const items of this.alertsByKey.values()) all.push(...items);
    all.sort((a, b) => {
      const sd = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
      if (sd !== 0) return sd;
      return (b.current_value ?? 999999) - (a.current_value ?? 999999);
    });
    this.alerts = all;
  }

  onThresholdInput(type: 'payment_overdue' | 'lost_customer') {
    clearTimeout(this.thresholdTimers[type]);
    this.thresholdTimers[type] = setTimeout(() => {
      const val = this.thresholds[type];
      if (!val || val < 1) return;
      this.alertsByKey.delete(type);
      if (type === 'payment_overdue') {
        this.fireRequest('payment_overdue', this.api.getPaymentOverdueAlerts(val));
      } else {
        this.fireRequest('lost_customer', this.api.getLostCustomerAlerts(val));
      }
    }, 600);
  }

  // ── Service monitor management ──

  startAddService() {
    this.addingService    = true;
    this.serviceQuery     = '';
    this.catalogSuggestions = [];
  }

  onServiceInput(value: string) {
    if (typeof value !== 'string') return;
    clearTimeout(this.searchTimeout);
    if (!value.trim()) { this.catalogSuggestions = []; return; }
    this.searchTimeout = setTimeout(() => {
      const existing = new Set(this.monitoredServices.map(s => s.item.id));
      this.api.searchCatalogItems(value.trim()).subscribe(items => {
        this.catalogSuggestions = items.filter(i => !existing.has(i.id));
      });
    }, 200);
  }

  onServiceInputBlur() {
    setTimeout(() => {
      if (!this.serviceQuery) {
        this.addingService      = false;
        this.catalogSuggestions = [];
      }
    }, 200);
  }

  onServiceSelected(event: any) {
    const item: CatalogItem        = event.option.value;
    const analytics                = this.analyticsMap.get(item.id) ?? null;
    const fallback                 = this.FALLBACK_DAYS[item.item_type] ?? this.FALLBACK_DEFAULT;
    const avg                      = analytics?.avg_client_interval_days ?? null;
    const confidence               = analytics?.interval_confidence ?? null;
    const threshold                = !avg ? fallback
                                   : confidence === 'low' ? Math.round((avg + fallback) / 2)
                                   : Math.round(avg);

    this.monitoredServices.push({ item, threshold, analytics });
    this.fireRequest('svc_' + item.id, this.api.getOverdueServiceAlerts(item.id, threshold));
    this.addingService      = false;
    this.serviceQuery       = '';
    this.catalogSuggestions = [];
  }

  displayItem(item: CatalogItem | string): string {
    if (!item) return '';
    return typeof item === 'string' ? item : item.description;
  }

  removeService(svc: MonitoredService) {
    this.monitoredServices = this.monitoredServices.filter(s => s.item.id !== svc.item.id);
    this.alertsByKey.delete('svc_' + svc.item.id);
    this.mergeAndSort();
  }

  // ── WhatsApp ──

  waLink(alert: AlertItem): string {
    const phone = (alert.client_phone ?? '').replace(/\D/g, '');
    return `https://wa.me/${phone}?text=${encodeURIComponent(this.waMessage(alert))}`;
  }

  private waMessage(alert: AlertItem): string {
    const name = alert.client_name.split(' ')[0];
    const days = alert.current_value ?? 0;
    switch (alert.alert_type) {
      case 'broken_pattern':
        return `Hola ${name}, te contactamos del taller. Hace ${days} días que no te vemos — ¿todo bien con el auto? Quedamos a disposición cuando lo necesites.`;
      case 'lost_customer':
        return `Hola ${name}, hace ${days} días que no te visitamos. ¿Podemos ayudarte con algo? Quedamos a disposición.`;
      case 'payment_overdue':
        return `Hola ${name}, te recordamos que el trabajo ${alert.entity_label} tiene un saldo pendiente hace ${days} días. ¿Cuándo podemos coordinar el pago?`;
      case 'overdue_service':
        return `Hola ${name}, te recordamos que el vehículo ${alert.entity_label} tiene un servicio pendiente hace ${days} días. ¿Lo agendamos?`;
      default:
        return `Hola ${name}, te contactamos del taller.`;
    }
  }

  // ── Display helpers ──

  countBySeverity(sev: string): number {
    return this.alerts.filter(a => a.severity === sev).length;
  }

  typeLabel(type: string): string {
    const map: Record<string, string> = {
      overdue_service: 'Servicio',
      payment_overdue: 'Pago',
      lost_customer:   'Inactivo',
      broken_pattern:  'Patrón roto',
    };
    return map[type] ?? type;
  }

  sevLabel(sev: string): string {
    return ({ critical: 'Crítico', high: 'Alto', medium: 'Medio', low: 'Bajo' } as Record<string, string>)[sev] ?? sev;
  }
}
