import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { ApiService } from '../../../core/services/api.service';
import { Client, Vehicle } from '../../../core/models';

@Component({
  selector: 'app-vehicle-form',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatAutocompleteModule
  ],
  template: `
    <h2 mat-dialog-title>{{ isEdit ? 'Editar' : 'Nuevo' }} Vehiculo</h2>
    <mat-dialog-content>
      @if (error) { <div class="error-msg">{{ error }}</div> }
      @if (!isEdit) {
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Patente</mat-label>
          <input matInput [(ngModel)]="form.plate_number" required style="text-transform:uppercase;">
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Dueno (buscar cliente)</mat-label>
          <input matInput [(ngModel)]="clientSearch" (input)="searchClients()"
                 [matAutocomplete]="clientAuto">
          <mat-autocomplete #clientAuto="matAutocomplete" (optionSelected)="selectClient($event)">
            @for (c of clientResults; track c.id) {
              <mat-option [value]="c.id">{{ c.full_name }} {{ c.rut ? '(' + c.rut + ')' : '' }}</mat-option>
            }
          </mat-autocomplete>
        </mat-form-field>
      }
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Marca</mat-label>
        <input matInput [(ngModel)]="form.make" required>
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Modelo</mat-label>
        <input matInput [(ngModel)]="form.model" required>
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Ano</mat-label>
        <input matInput [(ngModel)]="form.year" type="number">
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Color</mat-label>
        <input matInput [(ngModel)]="form.color">
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Kilometraje</mat-label>
        <input matInput [(ngModel)]="form.mileage" type="number">
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="saving">
        {{ saving ? 'Guardando...' : 'Guardar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`.full-width { width: 100%; } .error-msg { background: #ffebee; color: #c62828; padding: 12px; border-radius: 4px; margin-bottom: 16px; }`]
})
export class VehicleFormComponent {
  isEdit: boolean;
  saving = false;
  error = '';
  clientSearch = '';
  clientResults: Client[] = [];
  form: any = { plate_number: '', client_id: '', make: '', model: '', year: null, color: '', mileage: null };

  constructor(
    private api: ApiService,
    private dialogRef: MatDialogRef<VehicleFormComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { vehicle?: Vehicle } | null
  ) {
    this.isEdit = !!data?.vehicle;
    if (data?.vehicle) {
      this.form = { ...data.vehicle };
    }
  }

  searchClients() {
    if (this.clientSearch.length < 2) return;
    this.api.getClients({ q: this.clientSearch }).subscribe(c => this.clientResults = c);
  }

  selectClient(event: any) {
    this.form.client_id = event.option.value;
  }

  save() {
    this.saving = true;
    this.error = '';
    const obs = this.isEdit
      ? this.api.updateVehicle(this.data!.vehicle!.id, this.form)
      : this.api.createVehicle(this.form);
    obs.subscribe({
      next: () => this.dialogRef.close(true),
      error: (err) => { this.saving = false; this.error = err.error?.error || 'Error al guardar'; }
    });
  }
}
