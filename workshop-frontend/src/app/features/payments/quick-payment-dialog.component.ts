import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { JobWithBalance } from '../../core/models';
import { AppCurrencyPipe } from '../../shared/pipes/currency.pipe';

@Component({
  selector: 'app-quick-payment-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, AppCurrencyPipe
  ],
  template: `
    <h2 mat-dialog-title>Registrar pago</h2>
    <mat-dialog-content>
      <div style="margin-bottom:16px;background:#f5f5f5;padding:12px;border-radius:4px;">
        <div><strong>Trabajo #{{ data.job.job_number }}</strong> — {{ data.job.client_name }}</div>
        <div style="margin-top:4px;font-size:13px;color:#666;">
          Saldo pendiente: <strong style="color:#c62828;">{{ data.job.balance | appCurrency }}</strong>
        </div>
      </div>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Monto</mat-label>
        <input matInput type="number" [(ngModel)]="amount" min="0.01" [max]="data.job.balance">
        <span matTextPrefix>$&nbsp;</span>
      </mat-form-field>

      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <button mat-stroked-button type="button" (click)="amount = data.job.balance" style="flex:1;">
          Completar ({{ data.job.balance | appCurrency }})
        </button>
      </div>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Metodo de pago</mat-label>
        <mat-select [(ngModel)]="method">
          <mat-option value="efectivo">Efectivo</mat-option>
          <mat-option value="transferencia">Transferencia</mat-option>
          <mat-option value="cheque">Cheque</mat-option>
          <mat-option value="credito">Credito</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Referencia (opcional)</mat-label>
        <input matInput [(ngModel)]="reference">
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="saving || !amount || amount <= 0">
        @if (saving) { <mat-spinner diameter="20"></mat-spinner> }
        @else { <ng-container><mat-icon>payment</mat-icon> Pagar</ng-container> }
      </button>
    </mat-dialog-actions>
  `,
  styles: [`.full-width { width: 100%; }`]
})
export class QuickPaymentDialogComponent {
  amount = 0;
  method = 'efectivo';
  reference = '';
  saving = false;

  constructor(
    private dialogRef: MatDialogRef<QuickPaymentDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { job: JobWithBalance },
    private api: ApiService,
    private notify: NotificationService
  ) {
    this.amount = data.job.balance;
  }

  save() {
    if (!this.amount || this.amount <= 0) return;
    this.saving = true;
    this.api.addPayment(this.data.job.id, {
      amount: this.amount,
      method: this.method as any,
      reference: this.reference || null,
    }).subscribe({
      next: () => {
        this.notify.success('Pago registrado');
        this.dialogRef.close(true);
      },
      error: err => {
        this.saving = false;
        this.notify.handleError(err);
      }
    });
  }
}
