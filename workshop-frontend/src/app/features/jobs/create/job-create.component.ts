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
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { ApiService } from '../../../core/services/api.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Vehicle, VehicleSearchResult } from '../../../core/models';
import { VehicleFormComponent } from '../../vehicles/form/vehicle-form.component';
import { AppCurrencyPipe } from '../../../shared/pipes/currency.pipe';

@Component({
  selector: 'app-job-create',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, MatCardModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatIconModule, MatSelectModule,
    MatCheckboxModule, MatDividerModule, MatDialogModule, MatAutocompleteModule,
    MatDatepickerModule, MatNativeDateModule, AppCurrencyPipe
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Nuevo Trabajo</h1>
        <button mat-button routerLink="/trabajos"><mat-icon>arrow_back</mat-icon> Volver</button>
      </div>

      @if (error) { <div class="error-msg">{{ error }}</div> }

      <div class="job-create-layout">
        <!-- LEFT: Form -->
        <div class="job-create-form">

          <!-- Vehicle search -->
          <mat-card class="mb-16">
            <mat-card-content>
              <div class="form-section-title">Vehiculo</div>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Buscar por patente</mat-label>
                <input matInput [(ngModel)]="plateSearch" (input)="onPlateSearch()"
                       [matAutocomplete]="plateAuto"
                       style="text-transform:uppercase;" placeholder="Ej: ABC1234">
                <mat-icon matSuffix>search</mat-icon>
                <mat-autocomplete #plateAuto="matAutocomplete"
                                  (optionSelected)="selectVehicle($event)"
                                  [displayWith]="displayPlate">
                  @for (v of vehicleResults; track v.id) {
                    <mat-option [value]="v">
                      <strong>{{ v.plate_number }}</strong> — {{ v.make }} {{ v.model }}
                      <small style="color:#666;"> ({{ v.client_name }})</small>
                    </mat-option>
                  }
                  @if (plateSearch.length >= 2 && vehicleResults.length === 0 && !searchingPlate) {
                    <mat-option disabled>
                      <em>Sin resultados</em>
                    </mat-option>
                  }
                </mat-autocomplete>
              </mat-form-field>

              @if (!vehicle && plateSearch.length >= 3 && vehicleResults.length === 0 && !searchingPlate) {
                <button mat-stroked-button color="primary" (click)="createNewVehicle()">
                  <mat-icon>add</mat-icon> Crear vehiculo nuevo
                </button>
              }

              @if (vehicle) {
                <div class="info-msg">
                  <strong>{{ vehicle.plate_number }}</strong> — {{ vehicle.make }} {{ vehicle.model }} {{ vehicle.year || '' }}<br>
                  Dueno: <strong>{{ vehicle.client_name }}</strong>
                  {{ vehicle.client_rut ? '(' + vehicle.client_rut + ')' : '' }}
                </div>
              }
            </mat-card-content>
          </mat-card>

          @if (vehicle) {
            <!-- Job details -->
            <mat-card class="mb-16">
              <mat-card-content>
                <div class="form-section-title">Detalles del trabajo</div>
                <div class="form-grid">
                  <mat-form-field appearance="outline">
                    <mat-label>Fecha del trabajo</mat-label>
                    <input matInput [matDatepicker]="jobDatePicker" [(ngModel)]="jobDate">
                    <mat-datepicker-toggle matIconSuffix [for]="jobDatePicker"></mat-datepicker-toggle>
                    <mat-datepicker #jobDatePicker></mat-datepicker>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Kilometraje actual</mat-label>
                    <input matInput [(ngModel)]="mileage" type="number">
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>Notas (aparecen en PDF)</mat-label>
                    <textarea matInput [(ngModel)]="notes" rows="2"></textarea>
                  </mat-form-field>
                </div>
                <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
                  <mat-checkbox [(ngModel)]="taxEnabled" (change)="calcTotals()">IVA (22%)</mat-checkbox>
                  <mat-form-field appearance="outline" style="width:120px;" subscriptSizing="dynamic">
                    <mat-label>Descuento</mat-label>
                    <input matInput [(ngModel)]="discountAmount" type="number" (ngModelChange)="calcTotals()">
                  </mat-form-field>
                  <mat-form-field appearance="outline" style="width:140px;" subscriptSizing="dynamic">
                    <mat-select [(ngModel)]="discountType" (selectionChange)="calcTotals()">
                      <mat-option value="fixed">Fijo ($)</mat-option>
                      <mat-option value="percentage">Porcentaje (%)</mat-option>
                    </mat-select>
                  </mat-form-field>
                </div>
              </mat-card-content>
            </mat-card>

            <!-- Items -->
            <mat-card class="mb-16">
              <mat-card-content>
                <div class="form-section-title">Items</div>
                @for (item of items; track $index) {
                  <div class="item-row">
                    <mat-form-field appearance="outline" class="item-desc" subscriptSizing="dynamic">
                      <mat-label>Descripcion</mat-label>
                      <input matInput [(ngModel)]="item.description">
                    </mat-form-field>
                    <mat-form-field appearance="outline" class="item-qty" subscriptSizing="dynamic">
                      <mat-label>Cant.</mat-label>
                      <input matInput [(ngModel)]="item.quantity" type="number" (ngModelChange)="calcTotals()">
                    </mat-form-field>
                    <mat-form-field appearance="outline" class="item-price" subscriptSizing="dynamic">
                      <mat-label>Precio</mat-label>
                      <input matInput [(ngModel)]="item.unit_price" type="number" (ngModelChange)="calcTotals()">
                    </mat-form-field>
                    <mat-form-field appearance="outline" class="item-type" subscriptSizing="dynamic">
                      <mat-select [(ngModel)]="item.item_type">
                        <mat-option value="mano_de_obra">Mano de obra</mat-option>
                        <mat-option value="repuesto">Repuesto</mat-option>
                        <mat-option value="otro">Otro</mat-option>
                      </mat-select>
                    </mat-form-field>
                    <mat-form-field appearance="outline" class="item-supplier" subscriptSizing="dynamic">
                      <mat-label>Proveedor</mat-label>
                      <input matInput [(ngModel)]="item.supplier">
                    </mat-form-field>
                    <span class="item-total text-right">{{ (item.quantity * item.unit_price) | appCurrency }}</span>
                    <button mat-icon-button color="warn" (click)="removeItem($index)">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </div>
                }
                <button mat-stroked-button (click)="addItem()">
                  <mat-icon>add</mat-icon> Agregar item
                </button>
              </mat-card-content>
            </mat-card>
          }
        </div>

        <!-- RIGHT: Totals panel (sticky) -->
        @if (vehicle) {
          <div class="job-create-sidebar">
            <div class="totals-panel" style="position:sticky;top:80px;">
              <div class="form-section-title" style="border:none;margin-bottom:8px;">Resumen</div>
              <div class="total-row">
                <span>Subtotal</span>
                <span>{{ totals.subtotal | appCurrency }}</span>
              </div>
              @if (totals.discount > 0) {
                <div class="total-row" style="color:var(--color-warning);">
                  <span>Descuento</span>
                  <span>-{{ totals.discount | appCurrency }}</span>
                </div>
              }
              @if (taxEnabled) {
                <div class="total-row">
                  <span>IVA (22%)</span>
                  <span>+{{ totals.tax | appCurrency }}</span>
                </div>
              }
              <div class="total-row grand-total">
                <span>Total</span>
                <span>{{ totals.total | appCurrency }}</span>
              </div>

              <div style="margin-top:24px;">
                <button mat-raised-button color="primary" (click)="save()"
                        [disabled]="saving || !vehicle" style="width:100%;height:48px;font-size:16px;">
                  {{ saving ? 'Guardando...' : 'Crear Trabajo' }}
                </button>
                <button mat-button routerLink="/trabajos" style="width:100%;margin-top:8px;">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .job-create-layout {
      display: grid;
      grid-template-columns: 1fr 300px;
      gap: 24px;
      align-items: start;
    }
    @media (max-width: 900px) {
      .job-create-layout {
        grid-template-columns: 1fr;
      }
    }
    .job-create-form { min-width: 0; }
    .job-create-sidebar { min-width: 0; }
    .full-width { width: 100%; }
    .item-row {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }
    .item-desc { flex: 2; min-width: 160px; }
    .item-qty { width: 80px; }
    .item-price { width: 100px; }
    .item-type { width: 140px; }
    .item-supplier { width: 130px; }
    .item-total { width: 100px; font-weight: 500; font-size: 13px; white-space: nowrap; }
  `]
})
export class JobCreateComponent {
  plateSearch = '';
  vehicleResults: VehicleSearchResult[] = [];
  searchingPlate = false;
  vehicle: (VehicleSearchResult & { make: string; model: string; year?: number | null; client_name: string; client_rut?: string | null }) | null = null;
  jobDate = new Date();
  mileage: number | null = null;
  notes = '';
  taxEnabled = true;
  discountAmount = 0;
  discountType: 'fixed' | 'percentage' = 'fixed';
  items: any[] = [];
  saving = false;
  error = '';
  totals = { subtotal: 0, discount: 0, tax: 0, total: 0 };

  private searchTimeout: any;

  constructor(
    private api: ApiService,
    private router: Router,
    private dialog: MatDialog,
    private notify: NotificationService
  ) {}

  displayPlate = (v: VehicleSearchResult | string): string => {
    if (!v) return '';
    if (typeof v === 'string') return v;
    return v.plate_number;
  };

  onPlateSearch() {
    clearTimeout(this.searchTimeout);
    this.vehicle = null;
    const q = this.plateSearch?.trim();
    if (!q || q.length < 2) {
      this.vehicleResults = [];
      return;
    }
    this.searchingPlate = true;
    this.searchTimeout = setTimeout(() => {
      this.api.searchVehicles(q).subscribe({
        next: results => { this.vehicleResults = results; this.searchingPlate = false; },
        error: () => { this.vehicleResults = []; this.searchingPlate = false; }
      });
    }, 300);
  }

  selectVehicle(event: any) {
    const v = event.option.value as VehicleSearchResult;
    this.vehicle = v as any;
    this.plateSearch = v.plate_number;
    this.vehicleResults = [];
    // Fetch full vehicle data for mileage
    this.api.getVehicleByPlate(v.plate_number).subscribe({
      next: full => {
        if (full.mileage) this.mileage = full.mileage;
        this.vehicle = { ...v, make: full.make, model: full.model, year: full.year, client_name: full.client_name || v.client_name, client_rut: full.client_rut || v.client_rut };
      }
    });
  }

  createNewVehicle() {
    const ref = this.dialog.open(VehicleFormComponent, { width: '500px', data: null });
    ref.afterClosed().subscribe(r => {
      if (r) {
        this.notify.success('Vehiculo creado');
        // Re-search with current plate
        if (this.plateSearch) {
          this.api.searchVehicles(this.plateSearch).subscribe(results => {
            this.vehicleResults = results;
            if (results.length === 1) {
              this.vehicle = results[0] as any;
              this.plateSearch = results[0].plate_number;
            }
          });
        }
      }
    });
  }

  addItem() {
    this.items.push({ description: '', quantity: 1, unit_price: 0, item_type: 'mano_de_obra', supplier: '' });
  }

  removeItem(index: number) {
    this.items.splice(index, 1);
    this.calcTotals();
  }

  calcTotals() {
    const subtotal = this.items.reduce((s: number, i: any) => s + (i.quantity || 0) * (i.unit_price || 0), 0);
    const discount = this.discountType === 'percentage'
      ? subtotal * (this.discountAmount / 100)
      : this.discountAmount;
    const taxBase = subtotal - discount;
    const tax = this.taxEnabled ? taxBase * 0.22 : 0;
    const total = taxBase + tax;
    this.totals = {
      subtotal: Math.round(subtotal * 100) / 100,
      discount: Math.round(Math.max(0, discount) * 100) / 100,
      tax: Math.round(Math.max(0, tax) * 100) / 100,
      total: Math.round(Math.max(0, total) * 100) / 100
    };
  }

  save() {
    if (!this.vehicle) return;
    this.saving = true;
    this.error = '';
    const jobDate = this.jobDate instanceof Date
      ? this.jobDate.toISOString().split('T')[0]
      : this.jobDate;
    this.api.createJob({
      client_id: this.vehicle.client_id,
      vehicle_id: this.vehicle.id,
      mileage_at_service: this.mileage,
      tax_enabled: this.taxEnabled,
      tax_rate: 0.22,
      discount_amount: this.discountAmount,
      discount_type: this.discountType,
      notes: this.notes || null,
      job_date: jobDate,
      items: this.items.filter(i => i.description)
    }).subscribe({
      next: (job) => { this.notify.success('Trabajo creado'); this.router.navigate(['/trabajos', job.id]); },
      error: (err) => { this.saving = false; this.error = this.notify.handleError(err); }
    });
  }
}
