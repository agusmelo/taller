import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { AlertType, AlertWaTemplate } from '../../core/models';

// HU-11: pantalla de edición de plantillas de WhatsApp por tipo de alerta.
// Variables soportadas: {client_name}, {entity_label}, {days}, {service_name}

interface TypeMeta {
  type: AlertType;
  label: string;
  fallback: string;
  hint: string;
}

const TYPES: TypeMeta[] = [
  {
    type: 'overdue_service',
    label: 'Servicio vencido',
    fallback: 'Hola {client_name}, te recordamos que el vehículo {entity_label} tiene un servicio pendiente.',
    hint: 'Variables: {client_name}, {entity_label} (matrícula), {days}, {service_name}',
  },
  {
    type: 'payment_overdue',
    label: 'Pago vencido',
    fallback: 'Hola {client_name}, te recordamos que el trabajo {entity_label} tiene saldo pendiente hace {days} días.',
    hint: 'Variables: {client_name}, {entity_label} (n° trabajo), {days}',
  },
  {
    type: 'lost_customer',
    label: 'Cliente perdido',
    fallback: 'Hola {client_name}, hace {days} días que no te visitamos. ¿Podemos ayudarte con algo?',
    hint: 'Variables: {client_name}, {days}',
  },
  {
    type: 'broken_pattern',
    label: 'Patrón roto',
    fallback: 'Hola {client_name}, te contactamos del taller. Hace {days} días que no te vemos — ¿todo bien con el auto?',
    hint: 'Variables: {client_name}, {days}',
  },
];

@Component({
  selector: 'app-wa-templates',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    MatCardModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatTooltipModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <main class="content">
      <div class="page-head">
        <div>
          <a routerLink="/alertas" class="back-link">
            <mat-icon>arrow_back</mat-icon>
            Volver al feed
          </a>
          <h1>Plantillas de WhatsApp</h1>
          <p class="page-sub">
            Personalizá el mensaje que se envía por tipo de alerta. Si dejás
            una plantilla vacía, se usa el texto por defecto.
          </p>
        </div>
      </div>

      @if (loading) {
        <div class="empty-state"><mat-spinner diameter="32"></mat-spinner></div>
      }

      @if (!loading) {
        @for (meta of types; track meta.type) {
          <mat-card class="card tpl-card">
            <div class="tpl-head">
              <span class="badge type-{{ meta.type }}">{{ meta.label }}</span>
              @if (hasOverride(meta.type)) {
                <span class="status-pill personalizada">Personalizada</span>
              } @else {
                <span class="status-pill default">Por defecto</span>
              }
            </div>

            <mat-form-field appearance="outline" class="tpl-input">
              <mat-label>Mensaje</mat-label>
              <textarea matInput rows="3"
                [(ngModel)]="drafts[meta.type]"
                [placeholder]="meta.fallback"></textarea>
              <mat-hint>{{ meta.hint }}</mat-hint>
            </mat-form-field>

            <div class="tpl-actions">
              <button class="btn" (click)="reset(meta.type)"
                [disabled]="!hasOverride(meta.type)">
                <mat-icon class="btn-ico">restore</mat-icon>
                Restaurar por defecto
              </button>
              <button class="btn btn-primary" (click)="save(meta)"
                [disabled]="!isDirty(meta.type) || saving[meta.type]">
                @if (saving[meta.type]) {
                  <mat-spinner diameter="14"></mat-spinner>
                } @else {
                  <mat-icon class="btn-ico">save</mat-icon>
                }
                Guardar
              </button>
            </div>
          </mat-card>
        }
      }
    </main>
  `,
  styles: [`
    .content { max-width: 720px; }
    .back-link {
      display: inline-flex; align-items: center; gap: 4px;
      color: var(--text-3);
      text-decoration: none;
      font-size: 12px;
      margin-bottom: 6px;
    }
    .back-link mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .back-link:hover { color: var(--text-1); }
    .page-sub { margin: 4px 0 0; font-size: 12px; color: var(--text-3); }

    .tpl-card { padding: 16px; margin-bottom: 12px; }
    .tpl-head {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 10px;
    }
    .status-pill {
      font-size: 11px; font-weight: 600;
      padding: 2px 8px;
      border-radius: 999px;
    }
    .status-pill.personalizada { color: var(--blue, #2563eb); background: var(--blue-lt, #dbeafe); }
    .status-pill.default       { color: var(--text-3); background: var(--bg); }

    .tpl-input { width: 100%; }
    .tpl-actions {
      display: flex; gap: 8px; justify-content: flex-end;
      margin-top: 8px;
    }
    .btn-ico { font-size: 14px; width: 14px; height: 14px; }
  `]
})
export class WaTemplatesComponent implements OnInit {
  readonly types = TYPES;

  loading  = true;
  saving:    Record<string, boolean> = {};
  drafts:    Record<string, string>  = {};
  saved:     Record<string, string>  = {};

  constructor(
    private api:    ApiService,
    private notify: NotificationService,
  ) {}

  ngOnInit() {
    this.load();
  }

  private load() {
    this.loading = true;
    this.api.listAlertWaTemplates().subscribe({
      next: tpls => {
        this.saved = {};
        for (const t of tpls) this.saved[t.alert_type] = t.template;
        // Inicializa drafts con lo guardado (o vacío si no hay override).
        for (const meta of this.types) {
          this.drafts[meta.type] = this.saved[meta.type] ?? '';
        }
        this.loading = false;
      },
      error: err => {
        this.loading = false;
        this.notify.handleError(err);
      }
    });
  }

  hasOverride(type: string): boolean {
    return Boolean(this.saved[type]);
  }
  isDirty(type: string): boolean {
    return (this.drafts[type] ?? '') !== (this.saved[type] ?? '');
  }

  save(meta: TypeMeta) {
    const draft = (this.drafts[meta.type] ?? '').trim();
    if (!draft) {
      // Guardar vacío equivale a borrar override.
      this.reset(meta.type);
      return;
    }
    this.saving[meta.type] = true;
    this.api.upsertAlertWaTemplate(meta.type, draft).subscribe({
      next: tpl => {
        this.saved[meta.type] = tpl.template;
        this.drafts[meta.type] = tpl.template;
        this.saving[meta.type] = false;
        this.notify.success('Plantilla guardada');
      },
      error: err => {
        this.saving[meta.type] = false;
        this.notify.handleError(err);
      }
    });
  }

  reset(type: string) {
    if (!this.hasOverride(type)) {
      this.drafts[type] = '';
      return;
    }
    this.saving[type] = true;
    this.api.deleteAlertWaTemplate(type).subscribe({
      next: () => {
        delete this.saved[type];
        this.drafts[type] = '';
        this.saving[type] = false;
        this.notify.success('Plantilla restaurada al texto por defecto');
      },
      error: err => {
        this.saving[type] = false;
        this.notify.handleError(err);
      }
    });
  }
}
