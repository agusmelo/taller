import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA
} from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { AlertDefinition, AlertType, CatalogItem } from '../../core/models';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { extractApiError } from '../../shared/utils/api-error';

@Component({
  selector: 'app-alert-definitions',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    MatCardModule, MatTableModule, MatButtonModule, MatIconModule,
    MatSlideToggleModule, MatTooltipModule, MatProgressSpinnerModule,
  ],
  template: `
    <main class="content">
      <div class="page-head">
        <div>
          <a routerLink="/alertas" class="back-link">
            <mat-icon>arrow_back</mat-icon>
            Volver al feed
          </a>
          <h1>Definiciones de alertas</h1>
          <p class="page-sub">Las definiciones son del taller — todos los usuarios ven el mismo feed</p>
        </div>
        <div class="page-head-actions">
          <button class="btn btn-primary" (click)="openCreate()">
            <mat-icon class="btn-ico">add</mat-icon>
            Nueva definición
          </button>
        </div>
      </div>

      @if (loading && definitions.length === 0) {
        <div class="empty-state"><mat-spinner diameter="32"></mat-spinner></div>
      }

      @if (!loading && definitions.length === 0) {
        <div class="empty-state">
          <mat-icon>notifications_off</mat-icon>
          <p>Aún no hay definiciones</p>
          <p class="empty-hint">Creá la primera para empezar a recibir alertas en el feed.</p>
          <button class="btn btn-primary mt-16" (click)="openCreate()">
            <mat-icon class="btn-ico">add</mat-icon>
            Crear definición
          </button>
        </div>
      }

      @if (definitions.length > 0) {
        <mat-card class="table-card">
          <table mat-table [dataSource]="definitions">

            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>Nombre</th>
              <td mat-cell *matCellDef="let d">
                <div class="d-name">{{ d.name }}</div>
                <span class="badge type-{{ d.alert_type }}">{{ typeLabel(d.alert_type) }}</span>
              </td>
            </ng-container>

            <ng-container matColumnDef="params">
              <th mat-header-cell *matHeaderCellDef>Parámetros</th>
              <td mat-cell *matCellDef="let d" class="params">{{ paramsLabel(d) }}</td>
            </ng-container>

            <ng-container matColumnDef="interval">
              <th mat-header-cell *matHeaderCellDef>Intervalo</th>
              <td mat-cell *matCellDef="let d">cada {{ d.eval_interval_hours }}h</td>
            </ng-container>

            <ng-container matColumnDef="last_eval">
              <th mat-header-cell *matHeaderCellDef>Última eval.</th>
              <td mat-cell *matCellDef="let d">
                @if (d.last_evaluated_at) {
                  {{ relativeTime(d.last_evaluated_at) }}
                } @else {
                  <span class="muted">—</span>
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="count">
              <th mat-header-cell *matHeaderCellDef class="col-right">Críticas+Altas</th>
              <td mat-cell *matCellDef="let d" class="col-right">
                @if (d.last_result_count > 0) {
                  <span class="count-pill">{{ d.last_result_count }}</span>
                } @else {
                  <span class="muted">0</span>
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="enabled">
              <th mat-header-cell *matHeaderCellDef>Activa</th>
              <td mat-cell *matCellDef="let d">
                <mat-slide-toggle [checked]="d.enabled"
                  (change)="toggleEnabled(d, $event.checked)"
                  color="primary"></mat-slide-toggle>
              </td>
            </ng-container>

            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef class="col-right"></th>
              <td mat-cell *matCellDef="let d" class="col-right">
                <button mat-icon-button (click)="openEdit(d)" matTooltip="Editar">
                  <mat-icon>edit</mat-icon>
                </button>
                <button mat-icon-button (click)="remove(d)" matTooltip="Eliminar">
                  <mat-icon>delete_outline</mat-icon>
                </button>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols;"></tr>
          </table>
        </mat-card>
      }
    </main>
  `,
  styles: [`
    .content { max-width: 1140px; }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: var(--text-3);
      text-decoration: none;
      margin-bottom: 8px;
      transition: color .14s;
    }
    .back-link:hover { color: var(--text-1); }
    .back-link mat-icon { font-size: 14px; width: 14px; height: 14px; }

    .page-sub {
      font-size: 12px;
      color: var(--text-3);
      margin: 4px 0 0;
    }

    .btn-ico { font-size: 16px; width: 16px; height: 16px; }

    table { width: 100%; }

    .d-name {
      font-weight: 600;
      font-size: 13px;
      letter-spacing: -.005em;
      margin-bottom: 4px;
    }
    .params {
      font-size: 12px;
      color: var(--text-2);
      font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .muted { color: var(--text-3); }
    .col-right { text-align: right !important; }

    /* Color the global .badge with type tokens */
    .badge.type-overdue_service { background: var(--purple-lt); color: var(--purple); }
    .badge.type-payment_overdue { background: var(--red-lt);    color: var(--red); }
    .badge.type-lost_customer   { background: var(--blue-lt);   color: var(--blue); }
    .badge.type-broken_pattern  { background: var(--amber-lt);  color: var(--amber); }

    .count-pill {
      display: inline-flex;
      align-items: center;
      background: var(--red-lt);
      color: var(--red);
      border: 1px solid var(--red-bd);
      padding: 2px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
  `]
})
export class AlertDefinitionsComponent implements OnInit {
  definitions: AlertDefinition[] = [];
  loading = false;
  cols = ['name', 'params', 'interval', 'last_eval', 'count', 'enabled', 'actions'];

  constructor(
    private api:    ApiService,
    private notify: NotificationService,
    private dialog: MatDialog,
  ) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.api.listAlertDefinitions().subscribe({
      next: list => { this.definitions = list; this.loading = false; },
      error: err  => { this.loading = false; this.notify.handleError(err); }
    });
  }

  openCreate() {
    const ref = this.dialog.open(AlertDefFormDialog, {
      width: '520px',
      data: { def: null },
    });
    ref.afterClosed().subscribe(created => { if (created) this.load(); });
  }

  openEdit(def: AlertDefinition) {
    const ref = this.dialog.open(AlertDefFormDialog, {
      width: '520px',
      data: { def },
    });
    ref.afterClosed().subscribe(updated => { if (updated) this.load(); });
  }

  toggleEnabled(def: AlertDefinition, enabled: boolean) {
    this.api.updateAlertDefinition(def.id, { enabled }).subscribe({
      next: () => { def.enabled = enabled; },
      error: err => this.notify.handleError(err)
    });
  }

  remove(def: AlertDefinition) {
    if (!confirm(`¿Eliminar la definición "${def.name}"?`)) return;
    this.api.deleteAlertDefinition(def.id).subscribe({
      next: () => { this.definitions = this.definitions.filter(d => d.id !== def.id); },
      error: err => this.notify.handleError(err)
    });
  }

  typeLabel(type: string): string {
    return ({
      overdue_service: 'Servicio vencido',
      payment_overdue: 'Pago pendiente',
      lost_customer:   'Cliente inactivo',
      broken_pattern:  'Patrón roto',
    } as Record<string, string>)[type] ?? type;
  }

  paramsLabel(d: AlertDefinition): string {
    switch (d.alert_type) {
      case 'overdue_service':
        return `${d.catalog_item_description || '—'} · ${d.threshold_days}d`;
      case 'payment_overdue':
      case 'lost_customer':
        return `${d.threshold_days}d`;
      case 'broken_pattern':
        return `×${d.bp_multiplier} (mín ${d.bp_min_days}d)`;
      default: return '';
    }
  }

  relativeTime(iso: string): string {
    const diff = Math.max(0, Date.now() - new Date(iso).getTime());
    const min  = Math.floor(diff / 60000);
    if (min < 1)  return 'recién';
    if (min < 60) return `hace ${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24)   return `hace ${h}h`;
    return `hace ${Math.floor(h / 24)}d`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Form dialog (create / edit)

interface DialogData { def: AlertDefinition | null; }

@Component({
  selector: 'app-alert-def-form',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatAutocompleteModule,
    MatSlideToggleModule, FormDialogComponent,
  ],
  template: `
    <app-form-dialog
      [title]="data.def ? 'Editar definición' : 'Nueva definición'"
      [subtitle]="subtitleFor(form.alert_type)"
      [error]="errorMsg"
      [saving]="saving"
      [canSave]="isValid()"
      [saveLabel]="data.def ? 'Guardar' : 'Crear'"
      (save)="save()"
      (cancel)="cancel()">

      <div class="def-form-body">
        <mat-form-field appearance="outline" class="full">
          <mat-label>Nombre <span class="req">*</span></mat-label>
          <input matInput [(ngModel)]="form.name" maxlength="120" required autofocus>
          <mat-hint>Hasta 120 caracteres</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full" [class.disabled-look]="!!data.def">
          <mat-label>Tipo de alerta <span class="req">*</span></mat-label>
          <mat-select [(ngModel)]="form.alert_type" [disabled]="!!data.def"
            (selectionChange)="onTypeChange()">
            <mat-option value="overdue_service">Servicio vencido (por ítem del catálogo)</mat-option>
            <mat-option value="payment_overdue">Pago pendiente</mat-option>
            <mat-option value="lost_customer">Cliente inactivo</mat-option>
            <mat-option value="broken_pattern">Patrón roto</mat-option>
          </mat-select>
          @if (!!data.def) {
            <mat-hint>El tipo no se puede cambiar después de creada</mat-hint>
          }
        </mat-form-field>

        @if (form.alert_type === 'overdue_service') {
          <mat-form-field appearance="outline" class="full" [class.disabled-look]="!!data.def">
            <mat-label>Ítem del catálogo <span class="req">*</span></mat-label>
            <input matInput
              [(ngModel)]="catalogQuery"
              (ngModelChange)="onCatalogInput($event)"
              [matAutocomplete]="autocat"
              [disabled]="!!data.def">
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
            @if (data.def?.catalog_item_description) {
              <mat-hint>Vinculado a: {{ data.def?.catalog_item_description }}</mat-hint>
            }
          </mat-form-field>
        }

        @if (form.alert_type === 'overdue_service'
          || form.alert_type === 'payment_overdue'
          || form.alert_type === 'lost_customer') {
          <mat-form-field appearance="outline">
            <mat-label>Umbral <span class="req">*</span></mat-label>
            <input matInput type="number" min="1" max="3650"
              [(ngModel)]="form.threshold_days" required inputmode="numeric">
            <span matTextSuffix>días</span>
            <mat-hint>{{ thresholdHint() }}</mat-hint>
          </mat-form-field>
        }

        @if (form.alert_type === 'broken_pattern') {
          <div class="bp-row">
            <mat-form-field appearance="outline">
              <mat-label>Multiplicador</mat-label>
              <input matInput type="number" min="1.0" max="5.0" step="0.1"
                [(ngModel)]="form.bp_multiplier" inputmode="decimal">
              <span matTextSuffix>×</span>
              <mat-hint>vs intervalo personal</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Mínimo</mat-label>
              <input matInput type="number" min="0" max="3650"
                [(ngModel)]="form.bp_min_days" inputmode="numeric">
              <span matTextSuffix>días</span>
              <mat-hint>piso absoluto</mat-hint>
            </mat-form-field>
          </div>
        }

        <mat-form-field appearance="outline">
          <mat-label>Re-evaluar cada</mat-label>
          <mat-select [(ngModel)]="form.eval_interval_hours">
            <mat-option [value]="1">1 hora</mat-option>
            <mat-option [value]="4">4 horas</mat-option>
            <mat-option [value]="12">12 horas</mat-option>
            <mat-option [value]="24">1 día</mat-option>
            <mat-option [value]="168">1 semana</mat-option>
          </mat-select>
        </mat-form-field>

        <div class="toggle-row">
          <mat-slide-toggle [(ngModel)]="form.enabled" color="primary">
            <span class="toggle-label">
              <strong>Activa</strong>
              <small>Si está pausada, la definición no aparece en el feed</small>
            </span>
          </mat-slide-toggle>
        </div>
      </div>
    </app-form-dialog>
  `,
  styles: [`
    .def-form-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .full { width: 100%; }
    .bp-row { display: flex; gap: 12px; }
    .bp-row mat-form-field { flex: 1; }
    .type-tag { color: var(--text-3); font-size: 11px; margin-left: 8px; }
    .disabled-look { opacity: 0.85; }
    .toggle-row {
      margin-top: 4px;
      padding: 10px 12px;
      background: var(--bg);
      border: 1px solid var(--border2);
      border-radius: var(--r-sm);
    }
    .toggle-label {
      display: inline-flex;
      flex-direction: column;
      margin-left: 8px;
    }
    .toggle-label strong { font-size: 13px; color: var(--text-1); }
    .toggle-label small  { font-size: 11px; color: var(--text-3); }
  `]
})
export class AlertDefFormDialog {
  form: any = {
    name: '',
    alert_type: 'overdue_service' as AlertType,
    enabled: true,
    catalog_item_id: null as string | null,
    threshold_days: 180,
    bp_multiplier: 1.5,
    bp_min_days: 0,
    eval_interval_hours: 4,
  };
  catalogQuery = '';
  catalogSuggestions: CatalogItem[] = [];
  errorMsg: string | null = null;
  saving   = false;
  private searchTimeout: any;

  subtitleFor(type: AlertType): string {
    return ({
      overdue_service: 'Detecta vehículos con servicios pendientes',
      payment_overdue: 'Detecta trabajos con saldo pendiente',
      lost_customer:   'Detecta clientes que no vuelven',
      broken_pattern:  'Detecta clientes que rompen su frecuencia habitual',
    } as Record<string, string>)[type] ?? '';
  }

  thresholdHint(): string {
    return ({
      overdue_service: 'Días desde el último servicio para alertar',
      payment_overdue: 'Días desde el cierre del trabajo sin cobro',
      lost_customer:   'Días sin ningún trabajo para considerar inactivo',
    } as Record<string, string>)[this.form.alert_type] ?? '';
  }

  constructor(
    public dialogRef: MatDialogRef<AlertDefFormDialog>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private api: ApiService,
  ) {
    if (data.def) {
      this.form = {
        name:                data.def.name,
        alert_type:          data.def.alert_type,
        enabled:             data.def.enabled,
        catalog_item_id:     data.def.catalog_item_id,
        threshold_days:      data.def.threshold_days,
        bp_multiplier:       data.def.bp_multiplier ?? 1.5,
        bp_min_days:         data.def.bp_min_days ?? 0,
        eval_interval_hours: data.def.eval_interval_hours,
      };
      if (data.def.catalog_item_description) {
        this.catalogQuery = data.def.catalog_item_description;
      }
    }
  }

  onTypeChange() {
    if (this.form.alert_type !== 'overdue_service') {
      this.form.catalog_item_id = null;
      this.catalogQuery         = '';
    }
    if (this.form.alert_type === 'broken_pattern') {
      this.form.threshold_days = null;
    } else if (this.form.threshold_days == null) {
      this.form.threshold_days = 180;
    }
  }

  onCatalogInput(value: string) {
    if (typeof value !== 'string') return;
    this.form.catalog_item_id = null;
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
    this.form.catalog_item_id = item.id;
    this.catalogQuery         = item.description;
    this.catalogSuggestions   = [];
  }

  displayItem(item: CatalogItem | string): string {
    if (!item) return '';
    return typeof item === 'string' ? item : item.description;
  }

  isValid(): boolean {
    if (!this.form.name?.trim()) return false;
    if (this.form.alert_type === 'overdue_service') {
      // For new: need catalog_item_id; for edit: it's locked
      if (!this.data.def && !this.form.catalog_item_id) return false;
      if (!this.form.threshold_days || this.form.threshold_days < 1) return false;
    } else if (this.form.alert_type === 'broken_pattern') {
      if (!this.form.bp_multiplier || this.form.bp_multiplier < 1) return false;
    } else {
      if (!this.form.threshold_days || this.form.threshold_days < 1) return false;
    }
    return true;
  }

  save() {
    this.errorMsg = null;
    this.saving   = true;

    const payload: any = {
      name:                this.form.name.trim(),
      enabled:             this.form.enabled,
      eval_interval_hours: this.form.eval_interval_hours,
    };

    if (this.data.def) {
      // Update: only the editable fields
      if (this.form.alert_type !== 'broken_pattern') payload.threshold_days = this.form.threshold_days;
      if (this.form.alert_type === 'broken_pattern') {
        payload.bp_multiplier = this.form.bp_multiplier;
        payload.bp_min_days   = this.form.bp_min_days;
      }
      this.api.updateAlertDefinition(this.data.def.id, payload).subscribe({
        next: () => { this.saving = false; this.dialogRef.close(true); },
        error: err => { this.saving = false; this.errorMsg = extractApiError(err); }
      });
    } else {
      payload.alert_type = this.form.alert_type;
      if (this.form.alert_type === 'overdue_service') {
        payload.catalog_item_id = this.form.catalog_item_id;
        payload.threshold_days  = this.form.threshold_days;
      } else if (this.form.alert_type === 'broken_pattern') {
        payload.bp_multiplier = this.form.bp_multiplier;
        payload.bp_min_days   = this.form.bp_min_days;
      } else {
        payload.threshold_days = this.form.threshold_days;
      }
      this.api.createAlertDefinition(payload).subscribe({
        next: () => { this.saving = false; this.dialogRef.close(true); },
        error: err => { this.saving = false; this.errorMsg = extractApiError(err, 'Error al crear'); }
      });
    }
  }

  cancel() { this.dialogRef.close(false); }
}
