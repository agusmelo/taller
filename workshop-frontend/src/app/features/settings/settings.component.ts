import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { AppSettings } from '../../core/models';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule
  ],
  template: `
    <main class="content">
      <div class="page-head">
        <h1>Ajustes</h1>
      </div>

      @if (loading) {
        <div class="loading-overlay"><mat-spinner diameter="40"></mat-spinner></div>
      } @else if (settings) {
        <mat-card class="settings-card">
          <mat-card-content>
            <h3 class="card-title-lg">Alertas</h3>
            <p class="section-hint">Umbrales que disparan alertas en el dashboard y la pagina de pagos.</p>

            <div class="setting-row">
              <div class="setting-meta">
                <div class="setting-label">Umbral de alerta de deuda</div>
                <div class="setting-desc">Deudores con saldo mayor a este monto se marcan en rojo.</div>
              </div>
              <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:160px;">
                <input matInput type="number" [(ngModel)]="settings.debt_alert_threshold" min="0">
                <span matTextPrefix>$&nbsp;</span>
              </mat-form-field>
            </div>

            <div class="setting-row">
              <div class="setting-meta">
                <div class="setting-label">Dias maximo para trabajos sin cobrar</div>
                <div class="setting-desc">Trabajos terminados sin pagar tras estos dias generan alerta.</div>
              </div>
              <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:140px;">
                <input matInput type="number" [(ngModel)]="settings.unpaid_days_threshold" min="1">
                <span matTextSuffix>&nbsp;dias</span>
              </mat-form-field>
            </div>

            <div class="actions">
              <button mat-raised-button color="primary" (click)="save()" [disabled]="saving">
                @if (saving) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  <ng-container><mat-icon>save</mat-icon> Guardar</ng-container>
                }
              </button>
            </div>
          </mat-card-content>
        </mat-card>
      }
    </main>
  `,
  styles: [`
    .full-width { width: 100%; }
    .settings-card { max-width: 720px; }
    .card-title-lg {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-1);
      margin: 0 0 4px;
    }
    .section-hint {
      font-size: 12px;
      color: var(--text-3);
      margin: 0 0 16px;
    }
    .setting-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 14px 0;
      border-top: 1px solid var(--border2);
    }
    .setting-row:last-of-type { border-bottom: 1px solid var(--border2); }
    .setting-meta { flex: 1; min-width: 0; }
    .setting-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-1);
    }
    .setting-desc {
      font-size: 12px;
      color: var(--text-3);
      margin-top: 2px;
    }
    .actions {
      margin-top: 20px;
      display: flex;
      gap: 8px;
    }
  `]
})
export class SettingsComponent implements OnInit {
  settings: AppSettings | null = null;
  loading = true;
  saving = false;

  constructor(private api: ApiService, private notify: NotificationService) {}

  ngOnInit() {
    this.api.getSettings().subscribe({
      next: s => { this.settings = s; this.loading = false; },
      error: () => { this.loading = false; }
    });
  }

  save() {
    if (!this.settings) return;
    this.saving = true;
    this.api.updateSettings(this.settings).subscribe({
      next: s => { this.settings = s; this.saving = false; this.notify.success('Ajustes guardados'); },
      error: err => { this.saving = false; this.notify.handleError(err); }
    });
  }
}
