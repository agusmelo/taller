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
import { FormDialogComponent } from '../../../shared/components/form-dialog/form-dialog.component';
import { extractApiError } from '../../../shared/utils/api-error';

@Component({
  selector: 'app-vehicle-form',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatAutocompleteModule, MatIconModule,
    FormDialogComponent,
  ],
  template: `
    <app-form-dialog
      [title]="isEdit ? 'Editar vehículo' : 'Nuevo vehículo'"
      [subtitle]="isEdit ? (form.plate_number + ' · ' + form.make + ' ' + form.model) : 'Patente, dueño y datos del vehículo'"
      [error]="error"
      [saving]="saving"
      [canSave]="canSave()"
      (save)="save()"
      (cancel)="dialogRef.close(false)">

      @if (!isEdit) {
        <div class="form-grid">
          <mat-form-field appearance="outline">
            <mat-label>Patente</mat-label>
            <input matInput [(ngModel)]="form.plate_number" required
              class="plate-input" autofocus>
            <mat-hint>Ej: ABC1234</mat-hint>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Dueño</mat-label>
            <input matInput [(ngModel)]="clientSearch" (input)="onClientSearch()"
                   [matAutocomplete]="clientAuto" placeholder="Buscar por nombre, RUT o teléfono">
            <mat-icon matSuffix>search</mat-icon>
            <mat-autocomplete #clientAuto="matAutocomplete"
                              (optionSelected)="selectClient($event)"
                              [displayWith]="displayClient">
              @for (c of clientResults; track c.id) {
                <mat-option [value]="c">
                  <strong>{{ c.full_name }}</strong>
                  {{ c.rut ? '(' + c.rut + ')' : '' }}
                  @if (c.phone) { <small class="ac-meta"> — {{ c.phone }}</small> }
                </mat-option>
              }
              @if (clientSearch.length >= 2 && clientResults.length === 0 && !searching) {
                <mat-option disabled><em>Sin resultados</em></mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
        </div>
        @if (selectedClient) {
          <div class="banner banner-info">
            <mat-icon>person</mat-icon>
            <span>
              <strong>{{ selectedClient.full_name }}</strong>
              {{ selectedClient.rut ? '· RUT: ' + selectedClient.rut : '' }}
              {{ selectedClient.phone ? '· Tel: ' + selectedClient.phone : '' }}
            </span>
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
      <div class="form-grid grid-3">
        <mat-form-field appearance="outline">
          <mat-label>Año</mat-label>
          <input matInput [(ngModel)]="form.year" type="number" inputmode="numeric">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Color</mat-label>
          <input matInput [(ngModel)]="form.color">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Kilometraje</mat-label>
          <input matInput [(ngModel)]="form.mileage" type="number" inputmode="numeric">
          <span matTextSuffix>km</span>
        </mat-form-field>
      </div>
    </app-form-dialog>
  `,
  styles: [`
    .full-width { width: 100%; }
    .plate-input { text-transform: uppercase; letter-spacing: .02em; font-weight: 600; }
    .grid-3 { grid-template-columns: 1fr 1fr 1fr; }
    .ac-meta { color: var(--text-3); }
    @media (max-width: 600px) {
      .grid-3 { grid-template-columns: 1fr; }
    }
  `]
})
export class VehicleFormComponent {
  isEdit: boolean;
  saving = false;
  searching = false;
  error: string | null = null;
  clientSearch = '';
  clientResults: Client[] = [];
  selectedClient: Client | null = null;
  form: any = { plate_number: '', client_id: '', make: '', model: '', year: null, color: '', mileage: null };

  private searchTimeout: any;

  constructor(
    private api: ApiService,
    public  dialogRef: MatDialogRef<VehicleFormComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { vehicle?: Vehicle } | null
  ) {
    this.isEdit = !!data?.vehicle;
    if (data?.vehicle) {
      this.form = { ...data.vehicle };
    }
  }

  canSave(): boolean {
    if (this.saving) return false;
    if (!this.form.plate_number || !this.form.make || !this.form.model) return false;
    if (!this.isEdit && !this.form.client_id) return false;
    return true;
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
        next: res => { this.clientResults = res.data; this.searching = false; },
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
    this.error = null;
    const obs = this.isEdit
      ? this.api.updateVehicle(this.data!.vehicle!.id, this.form)
      : this.api.createVehicle(this.form);
    obs.subscribe({
      next: () => this.dialogRef.close(true),
      error: (err) => {
        this.saving = false;
        this.error = extractApiError(err);
      }
    });
  }
}
