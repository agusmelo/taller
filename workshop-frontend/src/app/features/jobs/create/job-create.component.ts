import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ApiService } from '../../../core/services/api.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Vehicle, Client } from '../../../core/models';
import { ClientFormComponent } from '../../clients/form/client-form.component';
import { VehicleFormComponent } from '../../vehicles/form/vehicle-form.component';
@Component({
  selector: 'app-job-create',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, MatCardModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatIconModule, MatSelectModule,
    MatCheckboxModule, MatDividerModule, MatDialogModule
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Nuevo Trabajo</h1>
        <button mat-button routerLink="/trabajos"><mat-icon>arrow_back</mat-icon> Volver</button>
      </div>

      @if (error) { <div class="error-msg mb-16">{{ error }}</div> }

      <!-- Step 1: Search by plate -->
      <mat-card class="mb-16">
        <mat-card-content>
          <h3>1. Buscar vehiculo por patente</h3>
          <div style="display:flex;gap:16px;align-items:center;">
            <mat-form-field appearance="outline" style="flex:1;">
              <mat-label>Patente</mat-label>
              <input matInput [(ngModel)]="plateSearch" (keyup.enter)="searchPlate()"
                     style="text-transform:uppercase;" placeholder="Ej: ABC1234">
            </mat-form-field>
            <button mat-raised-button color="primary" (click)="searchPlate()">
              <mat-icon>search</mat-icon> Buscar
            </button>
          </div>

          @if (plateNotFound) {
            <p style="color:#e65100;">Vehiculo no encontrado.</p>
            <button mat-stroked-button color="primary" (click)="createNewVehicle()">
              <mat-icon>add</mat-icon> Crear vehiculo nuevo
            </button>
          }

          @if (vehicle) {
            <mat-divider class="mb-16 mt-16"></mat-divider>
            <h3>Vehiculo encontrado</h3>
            <p><strong>{{ vehicle.plate_number }}</strong> - {{ vehicle.make }} {{ vehicle.model }} {{ vehicle.year || '' }}</p>
            <p>Dueno: <strong>{{ vehicle.client_name }}</strong> {{ vehicle.client_rut ? '(' + vehicle.client_rut + ')' : '' }}</p>
          }
        </mat-card-content>
      </mat-card>

      @if (vehicle) {
        <!-- Step 2: Job details -->
        <mat-card class="mb-16">
          <mat-card-content>
            <h3>2. Detalles del trabajo</h3>
            <mat-form-field appearance="outline">
              <mat-label>Kilometraje actual</mat-label>
              <input matInput [(ngModel)]="mileage" type="number">
            </mat-form-field>
            <mat-form-field appearance="outline" style="width:100%;">
              <mat-label>Notas (aparecen en PDF)</mat-label>
              <textarea matInput [(ngModel)]="notes" rows="2"></textarea>
            </mat-form-field>
            <div style="display:flex;gap:16px;">
              <mat-checkbox [(ngModel)]="taxEnabled">IVA (22%)</mat-checkbox>
              <mat-form-field appearance="outline" style="width:120px;">
                <mat-label>Descuento</mat-label>
                <input matInput [(ngModel)]="discountAmount" type="number">
              </mat-form-field>
              <mat-form-field appearance="outline" style="width:140px;">
                <mat-select [(ngModel)]="discountType">
                  <mat-option value="fixed">Fijo ($)</mat-option>
                  <mat-option value="percentage">Porcentaje (%)</mat-option>
                </mat-select>
              </mat-form-field>
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Step 3: Items -->
        <mat-card class="mb-16">
          <mat-card-content>
            <h3>3. Items</h3>
            @for (item of items; track $index) {
              <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
                <mat-form-field appearance="outline" style="flex:2;" subscriptSizing="dynamic">
                  <mat-label>Descripcion</mat-label>
                  <input matInput [(ngModel)]="item.description">
                </mat-form-field>
                <mat-form-field appearance="outline" style="width:100px;" subscriptSizing="dynamic">
                  <mat-label>Cant.</mat-label>
                  <input matInput [(ngModel)]="item.quantity" type="number">
                </mat-form-field>
                <mat-form-field appearance="outline" style="width:120px;" subscriptSizing="dynamic">
                  <mat-label>Precio</mat-label>
                  <input matInput [(ngModel)]="item.unit_price" type="number">
                </mat-form-field>
                <mat-form-field appearance="outline" style="width:150px;" subscriptSizing="dynamic">
                  <mat-select [(ngModel)]="item.item_type">
                    <mat-option value="mano_de_obra">Mano de obra</mat-option>
                    <mat-option value="repuesto">Repuesto</mat-option>
                    <mat-option value="otro">Otro</mat-option>
                  </mat-select>
                </mat-form-field>
                <mat-form-field appearance="outline" style="width:150px;" subscriptSizing="dynamic">
                  <mat-label>Proveedor</mat-label>
                  <input matInput [(ngModel)]="item.supplier">
                </mat-form-field>
                <button mat-icon-button color="warn" (click)="items.splice($index, 1)">
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            }
            <button mat-stroked-button (click)="addItem()">
              <mat-icon>add</mat-icon> Agregar item
            </button>
          </mat-card-content>
        </mat-card>

        <div style="display:flex;justify-content:flex-end;gap:16px;">
          <button mat-button routerLink="/trabajos">Cancelar</button>
          <button mat-raised-button color="primary" (click)="save()" [disabled]="saving" style="height:48px;font-size:16px;">
            {{ saving ? 'Guardando...' : 'Crear Trabajo' }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [`.error-msg { background: #ffebee; color: #c62828; padding: 12px; border-radius: 4px; }`]
})
export class JobCreateComponent {
  plateSearch = '';
  vehicle: Vehicle | null = null;
  plateNotFound = false;
  mileage: number | null = null;
  notes = '';
  taxEnabled = true;
  discountAmount = 0;
  discountType: 'fixed' | 'percentage' = 'fixed';
  items: any[] = [];
  saving = false;
  error = '';

  constructor(private api: ApiService, private router: Router, private dialog: MatDialog, private notify: NotificationService) {}

  searchPlate() {
    if (!this.plateSearch) return;
    this.plateNotFound = false;
    this.vehicle = null;
    this.api.getVehicleByPlate(this.plateSearch).subscribe({
      next: (v) => {
        this.vehicle = v;
        if (v.mileage) this.mileage = v.mileage;
      },
      error: () => this.plateNotFound = true
    });
  }

  createNewVehicle() {
    const ref = this.dialog.open(VehicleFormComponent, { width: '500px', data: null });
    ref.afterClosed().subscribe(r => {
      if (r) this.searchPlate();
    });
  }

  addItem() {
    this.items.push({ description: '', quantity: 1, unit_price: 0, item_type: 'mano_de_obra', supplier: '' });
  }

  save() {
    if (!this.vehicle) return;
    this.saving = true;
    this.error = '';
    this.api.createJob({
      client_id: this.vehicle.client_id,
      vehicle_id: this.vehicle.id,
      mileage_at_service: this.mileage,
      tax_enabled: this.taxEnabled,
      tax_rate: 0.22,
      discount_amount: this.discountAmount,
      discount_type: this.discountType,
      notes: this.notes || null,
      items: this.items.filter(i => i.description)
    }).subscribe({
      next: (job) => { this.notify.success('Trabajo creado'); this.router.navigate(['/trabajos', job.id]); },
      error: (err) => { this.saving = false; this.error = this.notify.handleError(err); }
    });
  }
}
