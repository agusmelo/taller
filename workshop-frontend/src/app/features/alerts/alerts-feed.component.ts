import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';

import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/auth/auth.service';
import { AlertItem, AlertFeedBlock, AlertType } from '../../core/models';

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const SNOOZE_DEFAULTS: Record<AlertType, number> = {
  overdue_service: 30,
  payment_overdue: 7,
  lost_customer:   90,
  broken_pattern:  30,
};

type TypeFilter = 'all' | AlertType;

@Component({
  selector: 'app-alerts-feed',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    MatCardModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatTooltipModule, MatMenuModule,
  ],
  template: `
    <main class="content">

      <!-- Header: global .page-head primitive -->
      <div class="page-head">
        <div>
          <h1>Alertas</h1>
          <p class="page-sub">
            @if (totalCount > 0) {
              {{ totalCount }} alerta{{ totalCount === 1 ? '' : 's' }} activa{{ totalCount === 1 ? '' : 's' }} en {{ blocks.length }} definici{{ blocks.length === 1 ? 'ón' : 'ones' }}
            } @else {
              Todo al día
            }
          </p>
        </div>
        <div class="page-head-actions">
          @if (auth.isAdmin()) {
            <a routerLink="/alertas/definiciones" class="btn">
              <mat-icon class="btn-ico">tune</mat-icon>
              Definiciones
            </a>
          }
          <button class="btn" (click)="evaluateAll()" [disabled]="loading">
            <mat-icon class="btn-ico">refresh</mat-icon>
            Evaluar todas
          </button>
        </div>
      </div>

      <!-- KPI severity row -->
      @if (totalCount > 0) {
        <div class="kpi-row kpi-row-4 sev-kpis">
          <button class="kpi sev-kpi"
            [class.on]="severityFilter === 'critical'"
            [class.dim]="countBySeverity('critical') === 0"
            (click)="toggleSeverity('critical')">
            <span class="kpi-label">
              <span class="sev-dot sev-critical"></span>
              Críticas
            </span>
            <span class="kpi-val">{{ countBySeverity('critical') }}</span>
          </button>
          <button class="kpi sev-kpi"
            [class.on]="severityFilter === 'high'"
            [class.dim]="countBySeverity('high') === 0"
            (click)="toggleSeverity('high')">
            <span class="kpi-label">
              <span class="sev-dot sev-high"></span>
              Altas
            </span>
            <span class="kpi-val">{{ countBySeverity('high') }}</span>
          </button>
          <button class="kpi sev-kpi"
            [class.on]="severityFilter === 'medium'"
            [class.dim]="countBySeverity('medium') === 0"
            (click)="toggleSeverity('medium')">
            <span class="kpi-label">
              <span class="sev-dot sev-medium"></span>
              Medias
            </span>
            <span class="kpi-val">{{ countBySeverity('medium') }}</span>
          </button>
          <button class="kpi sev-kpi"
            [class.on]="severityFilter === 'low'"
            [class.dim]="countBySeverity('low') === 0"
            (click)="toggleSeverity('low')">
            <span class="kpi-label">
              <span class="sev-dot sev-low"></span>
              Bajas
            </span>
            <span class="kpi-val">{{ countBySeverity('low') }}</span>
          </button>
        </div>
      }

      <!-- Type filter chips -->
      @if (availableTypes.length > 1) {
        <div class="filt type-filter">
          <button class="chip" [class.on]="typeFilter === 'all'" (click)="typeFilter = 'all'">
            Todas
          </button>
          @for (t of availableTypes; track t) {
            <button class="chip" [class.on]="typeFilter === t" (click)="typeFilter = t">
              {{ typeLabel(t) }}
              <span class="chip-count">{{ countByType(t) }}</span>
            </button>
          }
        </div>
      }

      <!-- Initial loading -->
      @if (loading && blocks.length === 0) {
        <div class="empty-state">
          <mat-spinner diameter="32"></mat-spinner>
        </div>
      }

      <!-- No definitions at all -->
      @if (!loading && blocks.length === 0) {
        <div class="empty-state">
          <mat-icon>notifications_off</mat-icon>
          <p>Sin definiciones de alertas configuradas</p>
          @if (auth.isAdmin()) {
            <p class="empty-hint">Creá la primera para empezar a recibir alertas.</p>
            <a routerLink="/alertas/definiciones" class="btn btn-primary mt-16">
              <mat-icon class="btn-ico">add</mat-icon>
              Crear definición
            </a>
          }
        </div>
      }

      <!-- All filtered out -->
      @if (!loading && blocks.length > 0 && visibleBlocks.length === 0) {
        <div class="empty-state">
          <mat-icon>filter_alt_off</mat-icon>
          <p>Ningún resultado con los filtros activos</p>
          <button class="btn mt-16" (click)="clearFilters()">Limpiar filtros</button>
        </div>
      }

      <!-- Feed grouped by definition -->
      @for (block of visibleBlocks; track block.definition.id) {
        <mat-card class="card block-card" [class.has-items]="block.items.length > 0">
          <div class="block-head">
            <div class="block-head-left">
              <span class="badge type-{{ block.definition.alert_type }}">
                {{ typeLabel(block.definition.alert_type) }}
              </span>
              <span class="def-name">{{ block.definition.name }}</span>
              @if (block.items.length > 0) {
                <span class="def-count">{{ filteredItems(block).length }}</span>
              }
            </div>
            <div class="block-head-right">
              <span class="def-meta">
                @if (block.definition.last_evaluated_at) {
                  Evaluada {{ relativeTime(block.definition.last_evaluated_at) }}
                } @else {
                  Sin evaluar aún
                }
                · cada {{ block.definition.eval_interval_hours }}h
              </span>
              <button mat-icon-button (click)="refreshBlock(block.definition.id)"
                [disabled]="refreshingId === block.definition.id"
                matTooltip="Re-evaluar ahora">
                @if (refreshingId === block.definition.id) {
                  <mat-spinner diameter="16"></mat-spinner>
                } @else {
                  <mat-icon>refresh</mat-icon>
                }
              </button>
            </div>
          </div>

          @if (block.error) {
            <div class="banner banner-error block-banner">
              <mat-icon>error_outline</mat-icon>
              {{ block.error }}
            </div>
          }

          @if (!block.error && filteredItems(block).length === 0) {
            <div class="block-empty">
              <mat-icon>check_circle_outline</mat-icon>
              @if (block.items.length === 0) {
                Sin alertas en esta definición
              } @else {
                Sin coincidencias con el filtro
              }
            </div>
          }

          @for (alert of filteredItems(block); track alert.entity_id) {
            <div class="alert-row border-{{ alert.severity }}">
              <span class="sev-dot sev-{{ alert.severity }}"
                [matTooltip]="sevLabel(alert.severity)"></span>
              <div class="alert-main">
                <span class="client-name">{{ alert.client_name }}</span>
                <span class="alert-ctx">{{ alert.context }}</span>
              </div>
              <div class="alert-value mono">
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
                <button class="action-btn dismiss-btn" [matMenuTriggerFor]="snoozeMenu"
                  matTooltip="Posponer">
                  <mat-icon>schedule</mat-icon>
                </button>
                <mat-menu #snoozeMenu="matMenu">
                  <button mat-menu-item (click)="dismiss(alert, 7)">Posponer 7 días</button>
                  <button mat-menu-item (click)="dismiss(alert, 30)">Posponer 30 días</button>
                  <button mat-menu-item (click)="dismiss(alert, 90)">Posponer 90 días</button>
                </mat-menu>
              </div>
            </div>
          }
        </mat-card>
      }

    </main>
  `,
  styles: [`
    /* Layout — defer to global .content */
    .content { max-width: 1080px; }

    .page-sub {
      margin: 4px 0 0;
      font-size: 12px;
      color: var(--text-3);
    }

    /* Buttons: keep anchor-as-button consistent with .btn */
    .btn { text-decoration: none; }
    .btn-ico { font-size: 16px; width: 16px; height: 16px; }

    /* Severity KPIs — clickable mini-cards */
    .sev-kpis { margin-bottom: 14px; }
    .sev-kpi {
      cursor: pointer;
      text-align: left;
      font: inherit;
      min-height: 72px;
      transition: border-color .15s, box-shadow .15s, background .15s;
    }
    .sev-kpi:hover { background: var(--bg); }
    .sev-kpi.on   { border-color: var(--navy); box-shadow: 0 0 0 1px var(--navy) inset; }
    .sev-kpi.dim  { opacity: .55; }
    .sev-kpi .kpi-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .sev-kpi .sev-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      display: inline-block;
    }

    /* Type filter chips */
    .type-filter { margin-bottom: 16px; }
    .chip-count {
      margin-left: 4px;
      padding: 1px 6px;
      border-radius: 999px;
      background: var(--border2);
      font-size: 10px;
      color: var(--text-2);
      font-variant-numeric: tabular-nums;
    }
    .chip.on .chip-count {
      background: rgba(255,255,255,.18);
      color: rgba(255,255,255,.92);
    }

    /* Block card */
    .block-card {
      margin-bottom: 14px;
      overflow: hidden;
      padding: 0 !important;
    }
    ::ng-deep .block-card .mat-mdc-card-content { padding: 0 !important; }

    .block-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      background: var(--bg);
      border-bottom: 1px solid var(--border2);
      flex-wrap: wrap;
    }
    .block-head-left  { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .block-head-right { display: flex; align-items: center; gap: 8px; }
    .def-name {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-1);
    }
    .def-count {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 1px 9px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-2);
      font-variant-numeric: tabular-nums;
    }
    .def-meta {
      font-size: 11px;
      color: var(--text-3);
    }

    /* Type tag uses .badge as base; only colors here */
    .badge.type-overdue_service { background: var(--purple-lt); color: var(--purple); }
    .badge.type-payment_overdue { background: var(--red-lt);    color: var(--red); }
    .badge.type-lost_customer   { background: var(--blue-lt);   color: var(--blue); }
    .badge.type-broken_pattern  { background: var(--amber-lt);  color: var(--amber); }

    .block-banner {
      margin: 0;
      border-radius: 0;
      border-left: none;
      border-right: none;
      border-top: none;
    }

    .block-empty {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 14px 16px;
      font-size: 12px;
      color: var(--text-3);
    }
    .block-empty mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: var(--green);
    }

    /* Alert rows */
    .alert-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      border-left: 3px solid transparent;
      border-bottom: 1px solid var(--border2);
      transition: background .12s;
    }
    .alert-row:last-child { border-bottom: none; }
    .alert-row:hover { background: var(--bg); }

    .border-critical { border-left-color: var(--red); }
    .border-high     { border-left-color: var(--amber); }
    .border-medium   { border-left-color: var(--amber); opacity: .92; }
    .border-low      { border-left-color: var(--green); }

    .sev-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .sev-critical { background: var(--red); }
    .sev-high     { background: var(--amber); }
    .sev-medium   { background: var(--amber); opacity: .7; }
    .sev-low      { background: var(--green); }

    .alert-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .client-name {
      font-size: 13px; font-weight: 600;
      color: var(--text-1);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      letter-spacing: -.005em;
    }
    .alert-ctx {
      font-size: 11px; color: var(--text-3);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    .alert-value {
      display: flex; align-items: baseline; gap: 3px;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
      min-width: 88px;
      justify-content: flex-end;
    }
    .val-current { font-weight: 700; }
    .val-current.val-critical { color: var(--red); }
    .val-current.val-high     { color: var(--amber); }
    .val-current.val-medium   { color: var(--amber); }
    .val-current.val-low      { color: var(--text-2); }
    .val-sep       { color: var(--text-3); }
    .val-threshold { color: var(--text-3); }
    .val-never     { font-weight: 700; color: var(--red); }

    .alert-actions { display: flex; gap: 2px; flex-shrink: 0; }
    .action-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 30px; height: 30px;
      border-radius: var(--r-sm);
      border: none; background: none;
      text-decoration: none; cursor: pointer;
      color: var(--text-3);
      transition: background .14s, color .14s;
    }
    .action-btn mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .action-btn:hover    { background: var(--bg); color: var(--text-1); }
    .wa-btn:hover        { background: var(--green-lt);  color: var(--green); }
    .view-btn:hover      { background: var(--purple-lt); color: var(--purple); }
    .dismiss-btn:hover   { background: var(--amber-lt);  color: var(--amber); }
  `]
})
export class AlertsFeedComponent implements OnInit, OnDestroy {
  blocks: AlertFeedBlock[] = [];
  loading      = false;
  refreshingId: string | null = null;

  typeFilter:     TypeFilter = 'all';
  severityFilter: string | null = null;

  private destroyed = false;

  constructor(
    public  auth:   AuthService,
    private api:    ApiService,
    private notify: NotificationService,
  ) {}

  ngOnInit() {
    this.loadFeed();
  }

  ngOnDestroy() {
    this.destroyed = true;
  }

  private loadFeed() {
    this.loading = true;
    this.api.getAlertsFeed().subscribe({
      next: blocks => {
        if (this.destroyed) return;
        this.blocks  = blocks;
        this.loading = false;
      },
      error: err => {
        this.loading = false;
        this.notify.handleError(err);
      }
    });
  }

  evaluateAll() {
    this.loading = true;
    this.api.evaluateAllAlerts().subscribe({
      next: () => this.loadFeed(),
      error: err => {
        this.loading = false;
        this.notify.handleError(err);
      }
    });
  }

  refreshBlock(definitionId: string) {
    this.refreshingId = definitionId;
    this.api.evaluateAlertDefinition(definitionId).subscribe({
      next: block => {
        this.refreshingId = null;
        const i = this.blocks.findIndex(b => b.definition.id === definitionId);
        if (i >= 0) this.blocks[i] = block;
      },
      error: err => {
        this.refreshingId = null;
        this.notify.handleError(err);
      }
    });
  }

  dismiss(alert: AlertItem, snoozeDays: number) {
    if (!alert.definition_id) return;
    this.api.dismissAlert(alert.definition_id, alert.entity_id, snoozeDays).subscribe({
      next: () => {
        const block = this.blocks.find(b => b.definition.id === alert.definition_id);
        if (block) {
          block.items = block.items.filter(i => i.entity_id !== alert.entity_id);
        }
        this.notify.success(`Pospuesto ${snoozeDays} día${snoozeDays === 1 ? '' : 's'}`);
      },
      error: err => this.notify.handleError(err)
    });
  }

  // ── Filters ──
  toggleSeverity(sev: string) {
    this.severityFilter = this.severityFilter === sev ? null : sev;
  }

  clearFilters() {
    this.typeFilter     = 'all';
    this.severityFilter = null;
  }

  filteredItems(block: AlertFeedBlock): AlertItem[] {
    if (!this.severityFilter) return block.items;
    return block.items.filter(i => i.severity === this.severityFilter);
  }

  get visibleBlocks(): AlertFeedBlock[] {
    return this.blocks.filter(b => {
      if (this.typeFilter !== 'all' && b.definition.alert_type !== this.typeFilter) return false;
      if (this.severityFilter && this.filteredItems(b).length === 0 && b.items.length > 0) return false;
      return true;
    });
  }

  get availableTypes(): AlertType[] {
    const seen = new Set<AlertType>();
    for (const b of this.blocks) seen.add(b.definition.alert_type);
    const order: AlertType[] = ['overdue_service', 'payment_overdue', 'lost_customer', 'broken_pattern'];
    return order.filter(t => seen.has(t));
  }

  countByType(t: AlertType): number {
    return this.blocks
      .filter(b => b.definition.alert_type === t)
      .reduce((sum, b) => sum + b.items.length, 0);
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
        return `Hola ${name}, te contactamos del taller. Hace ${days} días que no te vemos — ¿todo bien con el auto?`;
      case 'lost_customer':
        return `Hola ${name}, hace ${days} días que no te visitamos. ¿Podemos ayudarte con algo?`;
      case 'payment_overdue':
        return `Hola ${name}, te recordamos que el trabajo ${alert.entity_label} tiene saldo pendiente hace ${days} días.`;
      case 'overdue_service':
        return `Hola ${name}, te recordamos que el vehículo ${alert.entity_label} tiene un servicio pendiente.`;
      default:
        return `Hola ${name}, te contactamos del taller.`;
    }
  }

  // ── Display helpers ──
  get totalCount(): number {
    return this.blocks.reduce((sum, b) => sum + b.items.length, 0);
  }
  countBySeverity(sev: string): number {
    return this.blocks.reduce(
      (sum, b) => sum + b.items.filter(a => a.severity === sev).length, 0
    );
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
  relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    const diff = Math.max(0, Date.now() - then);
    const min  = Math.floor(diff / 60000);
    if (min < 1)    return 'recién';
    if (min < 60)   return `hace ${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24)     return `hace ${h}h`;
    const d = Math.floor(h / 24);
    return `hace ${d}d`;
  }
}
