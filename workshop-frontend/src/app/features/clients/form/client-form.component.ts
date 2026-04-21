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

@Component({
  selector: 'app-client-form',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatSelectModule, MatIconModule
  ],
  template: `
    <h2 mat-dialog-title>{{ isEdit ? 'Editar' : 'Nuevo' }} Cliente</h2>
    <mat-dialog-content>
      @if (error) { <div class="error-msg">{{ error }}</div> }

      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Nombre completo</mat-label>
          <input matInput [(ngModel)]="form.full_name" required (ngModelChange)="onNameChange()">
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
        <div class="warning-msg">
          <mat-icon style="vertical-align:middle;margin-right:4px;font-size:18px;">warning</mat-icon>
          Ya existe un cliente con nombre similar:
          @for (m of nameMatches; track m.id) {
            <div style="margin-top:4px;">
              <strong>{{ m.full_name }}</strong>
              {{ m.rut ? '(RUT: ' + m.rut + ')' : '' }}
              {{ m.phone ? '- Tel: ' + m.phone : '' }}
            </div>
          }
        </div>
      }

      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>RUT (opcional)</mat-label>
          <input matInput [(ngModel)]="form.rut" placeholder="XX.XXX.XXX-X" (ngModelChange)="onRutChange()">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Telefono</mat-label>
          <input matInput [(ngModel)]="form.phone">
        </mat-form-field>
      </div>

      @if (rutMatch && !isEdit) {
        <div class="error-msg">
          <mat-icon style="vertical-align:middle;margin-right:4px;font-size:18px;">error</mat-icon>
          Ya existe un cliente con este RUT:
          <strong>{{ rutMatch.full_name }}</strong>
          {{ rutMatch.phone ? '- Tel: ' + rutMatch.phone : '' }}
        </div>
      }

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
      <button mat-raised-button color="primary" (click)="save()" [disabled]="!form.full_name || saving || !!rutMatch">
        {{ saving ? 'Guardando...' : 'Guardar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`.full-width { width: 100%; }`]
})
export class ClientFormComponent {
  isEdit: boolean;
  saving = false;
  error = '';
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
    private dialogRef: MatDialogRef<ClientFormComponent>,
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
