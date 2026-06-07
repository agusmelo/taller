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
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';

@Component({
  selector: 'app-quick-payment-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, AppCurrencyPipe, FormDialogComponent,
  ],
  template: `
    <app-form-dialog
      title="Registrar pago"
      [subtitle]="'Trabajo #' + data.job.job_number + ' · ' + data.job.client_name"
      [saving]="saving"
      [canSave]="amount > 0 && amount <= data.job.balance"
      saveLabel="Pagar"
      (save)="save()"
      (cancel)="dialogRef.close(false)">

      <div class="job-summary">
        <div class="balance-row">
          <span class="balance-label">Saldo pendiente</span>
          <strong class="t-mono balance-amount">{{ data.job.balance | appCurrency }}</strong>
        </div>
      </div>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Monto <span class="req">*</span></mat-label>
        <input matInput type="number" [(ngModel)]="amount" min="0.01" [max]="data.job.balance"
          inputmode="decimal" autofocus>
        <span matTextPrefix>$&nbsp;</span>
        @if (amount > data.job.balance) {
          <mat-hint class="hint-error">Excede el saldo pendiente</mat-hint>
        }
      </mat-form-field>

      <div class="quick-amount-row">
        <button class="btn btn-ghost btn-quick" type="button"
          (click)="amount = data.job.balance">
          <mat-icon class="btn-ico">done_all</mat-icon>
          Completar ({{ data.job.balance | appCurrency }})
        </button>
      </div>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Método de pago</mat-label>
        <mat-select [(ngModel)]="method">
          <mat-option value="efectivo">Efectivo</mat-option>
          <mat-option value="transferencia">Transferencia</mat-option>
          <mat-option value="cheque">Cheque</mat-option>
          <mat-option value="credito">Crédito</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Referencia</mat-label>
        <input matInput [(ngModel)]="reference">
        <mat-hint>Opcional · ej. número de comprobante</mat-hint>
      </mat-form-field>
    </app-form-dialog>
  `,
  styles: [`
    .full-width { width: 100%; }
    .job-summary {
      margin-bottom: 16px;
      background: var(--bg);
      border: 1px solid var(--border2);
      padding: 12px 14px;
      border-radius: var(--r-sm);
    }
    .balance-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
    }
    .balance-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: var(--text-3);
    }
    .balance-amount {
      font-size: 18px;
      color: var(--red);
      font-weight: 700;
      letter-spacing: -.02em;
    }
    .quick-amount-row {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    .btn-quick { flex: 1; justify-content: center; }
    .btn-ico { font-size: 16px; width: 16px; height: 16px; }
    .hint-error ::ng-deep { color: var(--red) !important; }
  `]
})
export class QuickPaymentDialogComponent {
  amount = 0;
  method = 'efectivo';
  reference = '';
  saving = false;

  constructor(
    public  dialogRef: MatDialogRef<QuickPaymentDialogComponent>,
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
