import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { Client } from '../../../core/models';
import { FormDialogComponent } from '../../../shared/components/form-dialog/form-dialog.component';
import { extractApiError } from '../../../shared/utils/api-error';

@Component({
  selector: 'app-client-form',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatSelectModule, MatIconModule,
    FormDialogComponent,
  ],
  template: `
    <app-form-dialog
      [title]="isEdit ? 'Editar cliente' : 'Nuevo cliente'"
      [subtitle]="isEdit ? form.full_name : 'Cargá los datos del cliente'"
      [error]="error"
      [saving]="saving"
      [canSave]="!!form.full_name && !rutMatch"
      (save)="save()"
      (cancel)="dialogRef.close(false)">

      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Nombre completo <span class="req">*</span></mat-label>
          <input matInput [(ngModel)]="form.full_name" required
            (ngModelChange)="onNameChange()" autofocus>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Tipo</mat-label>
          <mat-select [(ngModel)]="form.type">
            <mat-option value="individual">Individual</mat-option>
            <mat-option value="empresa">Empresa</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      @if (nameMatches.length > 0 && !isEdit) {
        <div class="banner banner-warn warn-stack">
          <mat-icon>warning</mat-icon>
          <div>
            <div>Ya existe un cliente con nombre similar:</div>
            @for (m of nameMatches; track m.id) {
              <div class="match-line">
                <strong>{{ m.full_name }}</strong>
                {{ m.rut ? '(RUT: ' + m.rut + ')' : '' }}
                {{ m.phone ? '- Tel: ' + m.phone : '' }}
              </div>
            }
          </div>
        </div>
      }

      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>RUT</mat-label>
          <input matInput [(ngModel)]="form.rut" placeholder="XX.XXX.XXX-X"
            (ngModelChange)="onRutChange()">
          <mat-hint>Opcional</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Teléfono</mat-label>
          <input matInput [(ngModel)]="form.phone" inputmode="tel">
        </mat-form-field>
      </div>

      @if (rutMatch && !isEdit) {
        <div class="banner banner-error">
          <mat-icon>error_outline</mat-icon>
          <span>Ya existe un cliente con este RUT:
            <strong>{{ rutMatch.full_name }}</strong>
            {{ rutMatch.phone ? '— Tel: ' + rutMatch.phone : '' }}
          </span>
        </div>
      }

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Email</mat-label>
        <input matInput [(ngModel)]="form.email" type="email" inputmode="email">
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Dirección</mat-label>
        <input matInput [(ngModel)]="form.address">
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Notas</mat-label>
        <textarea matInput [(ngModel)]="form.notes" rows="3"></textarea>
      </mat-form-field>
    </app-form-dialog>
  `,
  styles: [`
    .full-width { width: 100%; }
    .warn-stack { align-items: flex-start; }
    .warn-stack mat-icon { font-size: 18px; width: 18px; height: 18px; margin-top: 2px; }
    .match-line { margin-top: 4px; font-size: 12px; font-weight: 500; }
  `]
})
export class ClientFormComponent {
  isEdit: boolean;
  saving = false;
  error: string | null = null;
  nameMatches: any[] = [];
  rutMatch: any = null;
  form: Partial<Client> = {
    type: 'individual',
    full_name: '',
    rut: '',
    phone: '',
    email: '',
    address: '',
    notes: ''
  };

  private nameTimeout: any;
  private rutTimeout: any;

  constructor(
    private api: ApiService,
    public  dialogRef: MatDialogRef<ClientFormComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { client?: Client }
  ) {
    this.isEdit = !!data?.client;
    if (data?.client) {
      this.form = { ...data.client };
    }
  }

  onNameChange() {
    if (this.isEdit) return;
    clearTimeout(this.nameTimeout);
    const name = this.form.full_name?.trim();
    if (!name || name.length < 3) { this.nameMatches = []; return; }
    this.nameTimeout = setTimeout(() => {
      this.api.checkDuplicateClient(name).subscribe({
        next: r => this.nameMatches = r.name_matches,
        error: () => this.nameMatches = []
      });
    }, 500);
  }

  onRutChange() {
    if (this.isEdit) return;
    clearTimeout(this.rutTimeout);
    const rut = this.form.rut?.trim();
    if (!rut || rut.length < 7) { this.rutMatch = null; return; }
    this.rutTimeout = setTimeout(() => {
      this.api.checkDuplicateClient(undefined, rut).subscribe({
        next: r => this.rutMatch = r.rut_match,
        error: () => this.rutMatch = null
      });
    }, 500);
  }

  save() {
    this.saving = true;
    this.error = null;
    const obs = this.isEdit
      ? this.api.updateClient(this.data.client!.id, this.form)
      : this.api.createClient(this.form);
    obs.subscribe({
      next: () => this.dialogRef.close(true),
      error: (err) => {
        this.saving = false;
        this.error = extractApiError(err);
      }
    });
  }
}
