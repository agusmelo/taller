import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { Client, Vehicle } from '../../../core/models';

@Component({
  selector: 'app-vehicle-form',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatAutocompleteModule, MatIconModule
  ],
  template: `
    <h2 mat-dialog-title>{{ isEdit ? 'Editar' : 'Nuevo' }} Vehiculo</h2>
    <mat-dialog-content>
      @if (error) { <div class="error-msg">{{ error }}</div> }

      @if (!isEdit) {
        <div class="form-grid">
          <mat-form-field appearance="outline">
            <mat-label>Patente</mat-label>
            <input matInput [(ngModel)]="form.plate_number" required style="text-transform:uppercase;">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Dueno (buscar por nombre, RUT o telefono)</mat-label>
            <input matInput [(ngModel)]="clientSearch" (input)="onClientSearch()"
                   [matAutocomplete]="clientAuto" placeholder="Ej: Juan, 12345678, 099...">
            <mat-icon matSuffix>search</mat-icon>
            <mat-autocomplete #clientAuto="matAutocomplete"
                              (optionSelected)="selectClient($event)"
                              [displayWith]="displayClient">
              @for (c of clientResults; track c.id) {
                <mat-option [value]="c">
                  <strong>{{ c.full_name }}</strong>
                  {{ c.rut ? '(' + c.rut + ')' : '' }}
                  @if (c.phone) { <small style="color:#666;"> - {{ c.phone }}</small> }
                </mat-option>
              }
              @if (clientSearch.length >= 2 && clientResults.length === 0 && !searching) {
                <mat-option disabled><em>Sin resultados</em></mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
        </div>
        @if (selectedClient) {
          <div class="info-msg" style="margin-bottom:16px;">
            <mat-icon style="vertical-align:middle;margin-right:4px;font-size:18px;">person</mat-icon>
            <strong>{{ selectedClient.full_name }}</strong>
            {{ selectedClient.rut ? '- RUT: ' + selectedClient.rut : '' }}
            {{ selectedClient.phone ? '- Tel: ' + selectedClient.phone : '' }}
          </div>
        }
      }

      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Marca</mat-label>
          <input matInput [(ngModel)]="form.make" required>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Modelo</mat-label>
          <input matInput [(ngModel)]="form.model" required>
        </mat-form-field>
      </div>
      <div class="form-grid" style="grid-template-columns:1fr 1fr 1fr;">
        <mat-form-field appearance="outline">
          <mat-label>Ano</mat-label>
          <input matInput [(ngModel)]="form.year" type="number">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Color</mat-label>
          <input matInput [(ngModel)]="form.color">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Kilometraje</mat-label>
          <input matInput [(ngModel)]="form.mileage" type="number">
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()"
              [disabled]="saving || (!isEdit && !form.client_id)">
        {{ saving ? 'Guardando...' : 'Guardar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full-width { width: 100%; }
    .error-msg { background: #ffebee; color: #c62828; padding: 12px; border-radius: 4px; margin-bottom: 16px; }
  `]
})
export class VehicleFormComponent {
  isEdit: boolean;
  saving = false;
  searching = false;
  error = '';
  clientSearch = '';
  clientResults: Client[] = [];
  selectedClient: Client | null = null;
  form: any = { plate_number: '', client_id: '', make: '', model: '', year: null, color: '', mileage: null };

  private searchTimeout: any;

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

  displayClient = (c: Client | string): string => {
    if (!c) return '';
    if (typeof c === 'string') return c;
    return c.full_name;
  };

  onClientSearch() {
    clearTimeout(this.searchTimeout);
    this.selectedClient = null;
    this.form.client_id = '';
    if (this.clientSearch.length < 2) {
      this.clientResults = [];
      return;
    }
    this.searching = true;
    this.searchTimeout = setTimeout(() => {
      this.api.getClients({ q: this.clientSearch }).subscribe({
        next: c => { this.clientResults = c; this.searching = false; },
        error: () => { this.clientResults = []; this.searching = false; }
      });
    }, 300);
  }

  selectClient(event: any) {
    const client = event.option.value as Client;
    this.form.client_id = client.id;
    this.selectedClient = client;
    this.clientSearch = client.full_name;
  }

  save() {
    this.saving = true;
    this.error = '';
    const obs = this.isEdit
      ? this.api.updateVehicle(this.data!.vehicle!.id, this.form)
      : this.api.createVehicle(this.form);
    obs.subscribe({
      next: () => this.dialogRef.close(true),
      error: (err) => { this.saving = false; this.error = err.error?.detalles?.map((d: any) => d.mensaje).join(', ') || err.error?.error || 'Error al guardar'; }
    });
  }
}
