import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { ApiService } from '../../../core/services/api.service';
import { Client } from '../../../core/models';

@Component({
  selector: 'app-client-form',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatSelectModule
  ],
  template: `
    <h2 mat-dialog-title>{{ isEdit ? 'Editar' : 'Nuevo' }} Cliente</h2>
    <mat-dialog-content>
      @if (error) { <div class="error-msg">{{ error }}</div> }
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Nombre completo</mat-label>
        <input matInput [(ngModel)]="form.full_name" required>
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Tipo</mat-label>
        <mat-select [(ngModel)]="form.type">
          <mat-option value="individual">Individual</mat-option>
          <mat-option value="empresa">Empresa</mat-option>
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>RUT (opcional)</mat-label>
        <input matInput [(ngModel)]="form.rut" placeholder="XX.XXX.XXX-X">
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Telefono</mat-label>
        <input matInput [(ngModel)]="form.phone">
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Email</mat-label>
        <input matInput [(ngModel)]="form.email" type="email">
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Direccion</mat-label>
        <input matInput [(ngModel)]="form.address">
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Notas</mat-label>
        <textarea matInput [(ngModel)]="form.notes" rows="3"></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="!form.full_name || saving">
        {{ saving ? 'Guardando...' : 'Guardar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`.full-width { width: 100%; } .error-msg { background: #ffebee; color: #c62828; padding: 12px; border-radius: 4px; margin-bottom: 16px; }`]
})
export class ClientFormComponent {
  isEdit: boolean;
  saving = false;
  error = '';
  form: Partial<Client> = {
    type: 'individual',
    full_name: '',
    rut: '',
    phone: '',
    email: '',
    address: '',
    notes: ''
  };

  constructor(
    private api: ApiService,
    private dialogRef: MatDialogRef<ClientFormComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { client?: Client }
  ) {
    this.isEdit = !!data?.client;
    if (data?.client) {
      this.form = { ...data.client };
    }
  }

  save() {
    this.saving = true;
    this.error = '';
    const obs = this.isEdit
      ? this.api.updateClient(this.data.client!.id, this.form)
      : this.api.createClient(this.form);
    obs.subscribe({
      next: () => this.dialogRef.close(true),
      error: (err) => { this.saving = false; this.error = err.error?.detalles?.map((d: any) => d.mensaje).join(', ') || err.error?.error || 'Error al guardar'; }
    });
  }
}
