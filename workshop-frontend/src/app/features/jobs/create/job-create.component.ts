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
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { ApiService } from '../../../core/services/api.service';
import { NotificationService } from '../../../core/services/notification.service';
import { VehicleSearchResult, ItemDescriptionSuggestion } from '../../../core/models';
import { VehicleFormComponent } from '../../vehicles/form/vehicle-form.component';
import { AppCurrencyPipe } from '../../../shared/pipes/currency.pipe';

interface ChildDraft {
  description: string;
  unit_price: number;
}
interface ParentDraft {
  description: string;
  quantity: number;
  unit_price: number;
  item_type: 'mano_de_obra' | 'repuesto' | 'otro';
  supplier: string;
  children: ChildDraft[];
}

@Component({
  selector: 'app-job-create',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, MatCardModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatIconModule, MatSelectModule,
    MatCheckboxModule, MatDialogModule, MatAutocompleteModule,
    MatDatepickerModule, MatNativeDateModule, AppCurrencyPipe
  ],
  template: `
    <main class="content">
      <div class="page-head">
        <h1>Nuevo Trabajo</h1>
        <button mat-button routerLink="/trabajos"><mat-icon>arrow_back</mat-icon> Volver</button>
      </div>

      @if (error) { <div class="banner banner-error">{{ error }}</div> }

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
                      <strong class="t-mono">{{ v.plate_number }}</strong> — {{ v.make }} {{ v.model }}
                      <small style="color:var(--text-3);"> ({{ v.client_name }})</small>
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
                <div class="banner banner-info">
                  <span><strong class="t-mono">{{ vehicle.plate_number }}</strong> — {{ vehicle.make }} {{ vehicle.model }} {{ vehicle.year || '' }} · Dueno: <strong>{{ vehicle.client_name }}</strong>
                  {{ vehicle.client_rut ? '(' + vehicle.client_rut + ')' : '' }}</span>
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
                    <input matInput [(ngModel)]="mileage" type="number" [min]="vehicleMileage || 0">
                    @if (vehicleMileage) {
                      <mat-hint>Ultimo registrado: {{ vehicleMileage.toLocaleString() }} km</mat-hint>
                    }
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
                <mat-autocomplete #descAuto="matAutocomplete" (optionSelected)="onDescriptionSelected($event)">
                  @for (s of descriptionSuggestions; track s.description) {
                    <mat-option [value]="s.description">
                      {{ s.description }}
                      <small style="color:var(--text-3);"> ({{ s.uses }})</small>
                    </mat-option>
                  }
                </mat-autocomplete>

                @for (item of items; track $index; let pIdx = $index) {
                  <div class="item-block">
                    <div class="parent-row">
                      <mat-form-field appearance="outline" class="item-type" subscriptSizing="dynamic">
                        <mat-select [(ngModel)]="item.item_type">
                          <mat-option value="mano_de_obra">Mano de obra</mat-option>
                          <mat-option value="repuesto">Repuesto</mat-option>
                          <mat-option value="otro">Otro</mat-option>
                        </mat-select>
                      </mat-form-field>
                      <mat-form-field appearance="outline" class="item-desc" subscriptSizing="dynamic">
                        <mat-label>Descripcion</mat-label>
                        <input matInput [(ngModel)]="item.description"
                               [matAutocomplete]="descAuto"
                               (focus)="activeDescriptionTarget = pIdx"
                               (input)="onDescriptionInput(pIdx, item.description)">
                      </mat-form-field>
                      <mat-form-field appearance="outline" class="item-qty" subscriptSizing="dynamic">
                        <mat-label>Cant.</mat-label>
                        <input matInput [(ngModel)]="item.quantity" type="number"
                               [disabled]="item.children.length > 0"
                               (ngModelChange)="calcTotals()">
                      </mat-form-field>
                      <mat-form-field appearance="outline" class="item-price" subscriptSizing="dynamic">
                        <mat-label>P. unit.</mat-label>
                        @if (item.children.length > 0) {
                          <input matInput [value]="parentSum(item)" disabled
                                 class="input-computed" title="Suma de detalles">
                        } @else {
                          <input matInput [(ngModel)]="item.unit_price" type="number"
                                 (ngModelChange)="calcTotals()">
                        }
                      </mat-form-field>
                      <span class="item-total text-right t-mono">{{ lineTotal(item) | appCurrency }}</span>
                      <button mat-icon-button (click)="removeItem(pIdx)" aria-label="Eliminar item">
                        <mat-icon>delete_outline</mat-icon>
                      </button>
                    </div>

                    @if (item.children.length > 0) {
                      <div class="children-block">
                        @for (child of item.children; track $index; let cIdx = $index) {
                          <div class="child-row">
                            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="child-desc">
                              <mat-label>Detalle</mat-label>
                              <input matInput [(ngModel)]="child.description"
                                     [attr.data-row]="'p' + pIdx + 'c' + cIdx + 'd'"
                                     (keydown.enter)="onChildEnter($event, pIdx, cIdx)"
                                     (keydown.backspace)="onChildBackspace($event, pIdx, cIdx, child.description)">
                            </mat-form-field>
                            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="child-price">
                              <mat-label>P. unit.</mat-label>
                              <input matInput [(ngModel)]="child.unit_price" type="number"
                                     [attr.data-row]="'p' + pIdx + 'c' + cIdx + 'p'"
                                     (ngModelChange)="calcTotals()"
                                     (keydown.enter)="onChildEnter($event, pIdx, cIdx)">
                            </mat-form-field>
                            <button mat-icon-button class="child-delete"
                                    (click)="removeChild(pIdx, cIdx)" aria-label="Eliminar detalle">
                              <mat-icon>close</mat-icon>
                            </button>
                          </div>
                        }
                      </div>
                    }

                    <button class="add-child-btn" type="button" (click)="addChild(pIdx)">
                      <mat-icon>subdirectory_arrow_right</mat-icon> Agregar detalle
                    </button>
                  </div>
                }

                <button mat-stroked-button (click)="addItem()" style="margin-top:8px;">
                  <mat-icon>add</mat-icon> Agregar item
                </button>
              </mat-card-content>
            </mat-card>
          }
        </div>

        <!-- RIGHT: Totals panel (sticky) -->
        @if (vehicle) {
          <div class="job-create-sidebar">
            <mat-card class="summary-card">
              <mat-card-content>
                <h3 class="card-title-lg">Resumen</h3>
                <div class="totals">
                  <div class="totals-row">
                    <span>Subtotal</span>
                    <span class="t-mono">{{ totals.subtotal | appCurrency }}</span>
                  </div>
                  @if (totals.discount > 0) {
                    <div class="totals-row" style="color:var(--amber);">
                      <span>Descuento</span>
                      <span class="t-mono">-{{ totals.discount | appCurrency }}</span>
                    </div>
                  }
                  @if (taxEnabled) {
                    <div class="totals-row">
                      <span>IVA (22%)</span>
                      <span class="t-mono">+{{ totals.tax | appCurrency }}</span>
                    </div>
                  }
                  <div class="totals-row totals-total">
                    <span>Total</span>
                    <span class="t-mono">{{ totals.total | appCurrency }}</span>
                  </div>
                </div>

                <div class="summary-actions">
                  <button mat-raised-button color="primary" (click)="save()"
                          [disabled]="saving || !vehicle" style="width:100%;height:44px;">
                    {{ saving ? 'Guardando...' : 'Crear Trabajo' }}
                  </button>
                  <button mat-button routerLink="/trabajos" style="width:100%;margin-top:8px;">
                    Cancelar
                  </button>
                </div>
              </mat-card-content>
            </mat-card>
          </div>
        }
      </div>
    </main>
  `,
  styles: [`
    .job-create-layout {
      display: grid;
      grid-template-columns: 1fr 320px;
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
    .item-block {
      border-bottom: 1px solid var(--border2);
      padding: 8px 0 4px;
    }
    .item-block:last-of-type { border-bottom: none; }
    .parent-row {
      display: grid;
      grid-template-columns: 130px 1fr 70px 110px 100px 36px;
      gap: 8px;
      align-items: center;
    }
    .item-desc { min-width: 0; }
    .item-qty { width: 70px; }
    .item-price { width: 110px; }
    .item-type { width: 130px; }
    .item-total {
      font-weight: 600;
      font-size: 13px;
      white-space: nowrap;
      text-align: right;
    }
    .input-computed {
      font-style: italic;
      color: var(--text-3) !important;
    }
    .children-block {
      padding: 4px 0 4px 12px;
      margin: 4px 0 4px 16px;
      border-left: 2px solid var(--navy);
    }
    .child-row {
      display: grid;
      grid-template-columns: 1fr 130px 32px;
      gap: 8px;
      align-items: center;
      padding: 2px 0;
    }
    .child-desc, .child-price { min-width: 0; }
    .child-delete mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: var(--text-3);
    }
    .add-child-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin: 4px 0 4px 16px;
      font-size: 11px;
      color: var(--navy);
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px 6px;
      border-radius: var(--r-sm);
    }
    .add-child-btn:hover { background: var(--bg); }
    .add-child-btn mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }
    @media (max-width: 720px) {
      .parent-row { grid-template-columns: 1fr 1fr; }
      .item-type, .item-qty, .item-price { width: auto; }
    }
    .summary-card {
      position: sticky;
      top: 72px;
    }
    .summary-card h3 { margin-bottom: 12px; }
    .summary-actions { margin-top: 20px; }
    .card-title-lg { margin: 0; }
    .totals { display: flex; flex-direction: column; gap: 4px; }
    .totals-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 4px 0;
      font-size: 13px;
    }
    .totals-total {
      border-top: 1px solid var(--border);
      padding-top: 8px;
      margin-top: 4px;
      font-weight: 700;
      font-size: 15px;
    }
    .form-section-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-3);
      text-transform: uppercase;
      letter-spacing: .08em;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border2);
    }
  `]
})
export class JobCreateComponent {
  plateSearch = '';
  vehicleResults: VehicleSearchResult[] = [];
  searchingPlate = false;
  vehicle: (VehicleSearchResult & { make: string; model: string; year?: number | null; client_name: string; client_rut?: string | null }) | null = null;
  vehicleMileage: number | null = null;
  jobDate = new Date();
  mileage: number | null = null;
  notes = '';
  taxEnabled = true;
  discountAmount = 0;
  discountType: 'fixed' | 'percentage' = 'fixed';
  items: ParentDraft[] = [];
  saving = false;
  error = '';
  totals = { subtotal: 0, discount: 0, tax: 0, total: 0 };

  descriptionSuggestions: ItemDescriptionSuggestion[] = [];
  activeDescriptionTarget: number | null = null;

  private searchTimeout: any;
  private descTimeout: any;

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
        this.vehicleMileage = full.mileage;
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
    this.items.push({
      description: '', quantity: 1, unit_price: 0,
      item_type: 'mano_de_obra', supplier: '', children: []
    });
  }

  removeItem(index: number) {
    this.items.splice(index, 1);
    this.calcTotals();
  }

  addChild(parentIdx: number) {
    const parent = this.items[parentIdx];
    parent.children.push({ description: '', unit_price: 0 });
    this.calcTotals();
    const newIdx = parent.children.length - 1;
    this.focusChildField(parentIdx, newIdx, 'd');
  }

  removeChild(parentIdx: number, childIdx: number) {
    this.items[parentIdx].children.splice(childIdx, 1);
    this.calcTotals();
  }

  onChildEnter(event: Event, parentIdx: number, childIdx: number) {
    event.preventDefault();
    const parent = this.items[parentIdx];
    if (childIdx === parent.children.length - 1) {
      this.addChild(parentIdx);
    } else {
      this.focusChildField(parentIdx, childIdx + 1, 'd');
    }
  }

  onChildBackspace(event: Event, parentIdx: number, childIdx: number, currentDescription: string) {
    if (currentDescription && currentDescription.length > 0) return;
    event.preventDefault();
    this.removeChild(parentIdx, childIdx);
    if (childIdx > 0) {
      this.focusChildField(parentIdx, childIdx - 1, 'd');
    }
  }

  private focusChildField(parentIdx: number, childIdx: number, field: 'd' | 'p') {
    setTimeout(() => {
      const el = document.querySelector(
        `[data-row="p${parentIdx}c${childIdx}${field}"]`
      ) as HTMLInputElement | null;
      if (el) el.focus();
    }, 0);
  }

  parentSum(item: ParentDraft): string {
    const sum = item.children.reduce((s, c) => s + (Number(c.unit_price) || 0), 0);
    return sum.toFixed(2);
  }

  lineTotal(item: ParentDraft): number {
    if (item.children.length > 0) {
      return item.children.reduce((s, c) => s + (Number(c.unit_price) || 0), 0);
    }
    return (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
  }

  onDescriptionInput(parentIdx: number, value: string) {
    this.activeDescriptionTarget = parentIdx;
    clearTimeout(this.descTimeout);
    const q = (value || '').trim();
    if (q.length < 2) {
      this.descriptionSuggestions = [];
      return;
    }
    this.descTimeout = setTimeout(() => {
      this.api.searchItemDescriptions(q).subscribe(results => {
        this.descriptionSuggestions = results;
      });
    }, 200);
  }

  onDescriptionSelected(event: any) {
    if (this.activeDescriptionTarget == null) return;
    const value = event.option.value as string;
    this.items[this.activeDescriptionTarget].description = value;
    this.descriptionSuggestions = [];
  }

  calcTotals() {
    const subtotal = this.items.reduce((s, i) => s + this.lineTotal(i), 0);
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
    if (this.mileage && this.vehicleMileage && this.mileage < this.vehicleMileage) {
      this.error = `El kilometraje (${this.mileage}) no puede ser menor al registrado anteriormente (${this.vehicleMileage.toLocaleString()} km)`;
      return;
    }
    this.saving = true;
    this.error = '';
    const jobDate = this.jobDate instanceof Date
      ? this.jobDate.toISOString().split('T')[0]
      : this.jobDate;
    const payloadItems = this.items
      .filter(i => i.description)
      .map(i => {
        const cleanChildren = i.children
          .filter(c => c.description)
          .map(c => ({ description: c.description, unit_price: Number(c.unit_price) || 0 }));
        return {
          description: i.description,
          quantity: cleanChildren.length > 0 ? 1 : i.quantity,
          unit_price: cleanChildren.length > 0 ? 0 : i.unit_price,
          item_type: i.item_type,
          supplier: i.supplier || null,
          children: cleanChildren
        };
      });
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
      items: payloadItems
    }).subscribe({
      next: (job) => { this.notify.success('Trabajo creado'); this.router.navigate(['/trabajos', job.id]); },
      error: (err) => { this.saving = false; this.error = this.notify.handleError(err); }
    });
  }
}
