import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { AppSettings } from '../../core/models';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatIconModule, MatDividerModule,
    MatProgressSpinnerModule
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Ajustes</h1>
      </div>

      @if (loading) {
        <div class="loading-overlay"><mat-spinner diameter="40"></mat-spinner></div>
      } @else if (settings) {
        <mat-card style="max-width:600px;">
          <mat-card-content>
            <h3 style="margin-bottom:16px;">
              <mat-icon style="vertical-align:middle;margin-right:8px;">notifications_active</mat-icon>
              Alertas
            </h3>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Umbral de alerta de deuda (monto minimo)</mat-label>
              <input matInput type="number" [(ngModel)]="settings.debt_alert_threshold" min="0">
              <span matTextPrefix>$&nbsp;</span>
              <mat-hint>Deudores con saldo mayor a este monto se marcan en rojo</mat-hint>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width" style="margin-top:16px;">
              <mat-label>Dias maximo para trabajos terminados sin cobrar</mat-label>
              <input matInput type="number" [(ngModel)]="settings.unpaid_days_threshold" min="1">
              <span matTextSuffix>&nbsp;dias</span>
              <mat-hint>Trabajos terminados sin pagar despues de estos dias generan alerta</mat-hint>
            </mat-form-field>

            <div style="margin-top:24px;display:flex;gap:8px;">
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
    </div>
  `,
  styles: [`
    .full-width { width: 100%; }
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
