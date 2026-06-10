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

      <!-- Header -->
      <div class="page-head">
        <div class="head-left">
          <h1 class="page-title">Alertas</h1>
          @if (totalCount > 0) {
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
          @if (auth.isAdmin()) {
            <a routerLink="/alertas/definiciones" mat-stroked-button class="btn-defs">
              <mat-icon>tune</mat-icon>
              Definiciones
            </a>
          }
          <button mat-stroked-button (click)="evaluateAll()" [disabled]="loading">
            <mat-icon>refresh</mat-icon>
            Evaluar todas
          </button>
        </div>
      </div>

      <!-- Initial loading -->
      @if (loading && blocks.length === 0) {
        <div class="state-center">
          <mat-spinner diameter="32"></mat-spinner>
        </div>
      }

      <!-- No definitions at all -->
      @if (!loading && blocks.length === 0) {
        <div class="state-center">
          <mat-icon>notifications_off</mat-icon>
          <p>Sin definiciones de alertas configuradas</p>
          @if (auth.isAdmin()) {
            <a routerLink="/alertas/definiciones" mat-flat-button color="primary">
              Crear definición
            </a>
          }
        </div>
      }

      <!-- Feed grouped by definition -->
      @for (block of blocks; track block.definition.id) {
        <mat-card class="block-card">
          <div class="block-head">
            <div class="block-head-left">
              <span class="type-badge type-{{ block.definition.alert_type }}">
                {{ typeLabel(block.definition.alert_type) }}
              </span>
              <span class="def-name">{{ block.definition.name }}</span>
              <span class="def-count">{{ block.items.length }}</span>
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
            <div class="block-error">
              <mat-icon>error_outline</mat-icon>
              Error: {{ block.error }}
            </div>
          }

          @if (!block.error && block.items.length === 0) {
            <div class="block-empty">
              <mat-icon>check_circle_outline</mat-icon>
              Sin alertas en esta definición
            </div>
          }

          @for (alert of block.items; track alert.entity_id) {
            <div class="alert-row border-{{ alert.severity }}">
              <span class="sev-dot sev-{{ alert.severity }}"
                [matTooltip]="sevLabel(alert.severity)"></span>
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
    .content { padding: 24px; max-width: 1000px; }

    /* Header */
    .page-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
      gap: 12px;
      flex-wrap: wrap;
    }
    .head-left  { display: flex; align-items: center; gap: 12px; }
    .head-right { display: flex; align-items: center; gap: 8px; }
    .page-title { font-size: 20px; font-weight: 700; color: var(--text-1); margin: 0; }
    .sev-summary { display: flex; gap: 6px; flex-wrap: wrap; }
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
    .btn-defs { text-decoration: none; }

    /* States */
    .state-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 60px 0;
      color: var(--text-3);
    }
    .state-center mat-icon { font-size: 48px; width: 48px; height: 48px; }
    .state-center p { font-size: 14px; margin: 0; }

    /* Block card */
    .block-card { margin-bottom: 14px; overflow: hidden; padding: 0 !important; }
    ::ng-deep .block-card .mat-mdc-card-content { padding: 0 !important; }
    .block-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 14px;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
    }
    .block-head-left  { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .block-head-right { display: flex; align-items: center; gap: 6px; }
    .def-name  { font-size: 13px; font-weight: 600; color: var(--text-1); }
    .def-count {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1px 8px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-2);
    }
    .def-meta  { font-size: 11px; color: var(--text-3); }

    .block-error {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 14px; font-size: 12px;
      background: #fef2f2; color: #b91c1c;
    }
    .block-error mat-icon { font-size: 16px; width: 16px; height: 16px; }

    .block-empty {
      display: flex; align-items: center; gap: 8px;
      padding: 14px; font-size: 12px;
      color: var(--text-3);
    }
    .block-empty mat-icon { font-size: 18px; width: 18px; height: 18px; color: #16a34a; }

    /* Type badges */
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

    /* Alert rows */
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

    .sev-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .sev-critical { background: #dc2626; }
    .sev-high     { background: #ea580c; }
    .sev-medium   { background: #ca8a04; }
    .sev-low      { background: #16a34a; }

    .alert-main { flex: 1; min-width: 0; }
    .client-name {
      display: block; font-size: 13px; font-weight: 600;
      color: var(--text-1);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .alert-ctx {
      display: block; font-size: 11px; color: var(--text-3);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    .alert-value {
      display: flex; align-items: center; gap: 2px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px; flex-shrink: 0;
      min-width: 80px; justify-content: flex-end;
    }
    .val-current { font-weight: 700; }
    .val-current.val-critical { color: #dc2626; }
    .val-current.val-high     { color: #ea580c; }
    .val-current.val-medium   { color: #ca8a04; }
    .val-current.val-low      { color: var(--text-2); }
    .val-sep       { color: var(--text-3); }
    .val-threshold { color: var(--text-3); }
    .val-never     { font-weight: 700; color: #dc2626; }

    .alert-actions { display: flex; gap: 2px; flex-shrink: 0; }
    .action-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px;
      border-radius: 6px;
      border: none; background: none;
      text-decoration: none; cursor: pointer;
      color: var(--text-3);
      transition: background .12s, color .12s;
    }
    .action-btn mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .action-btn:hover     { background: var(--bg); color: var(--text-1); }
    .wa-btn:hover         { background: #dcfce7; color: #16a34a; }
    .view-btn:hover       { background: #ede9fe; color: #7c3aed; }
    .dismiss-btn:hover    { background: #fef9c3; color: #ca8a04; }
  `]
})
export class AlertsFeedComponent implements OnInit, OnDestroy {
  blocks: AlertFeedBlock[] = [];
  loading      = false;
  refreshingId: string | null = null;

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
    const entityType = alert.entity_type ?? 'vehicle';
    this.api.dismissAlert(alert.definition_id, alert.entity_id, snoozeDays, entityType).subscribe({
      next: () => {
        // Optimistic: remove from local state
        const block = this.blocks.find(b => b.definition.id === alert.definition_id);
        if (block) {
          block.items = block.items.filter(
            i => !(i.entity_id === alert.entity_id && (i.entity_type ?? 'vehicle') === entityType)
          );
        }
        this.notify.success(`Pospuesto ${snoozeDays} día${snoozeDays === 1 ? '' : 's'}`);
      },
      error: err => this.notify.handleError(err)
    });
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
