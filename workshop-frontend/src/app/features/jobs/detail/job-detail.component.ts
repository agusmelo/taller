import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Job } from '../../../core/models';
import { StatusLabelPipe, PaymentMethodPipe, ItemTypePipe } from '../../../shared/pipes/status.pipe';
import { AppCurrencyPipe } from '../../../shared/pipes/currency.pipe';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-job-detail',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, MatCardModule, MatButtonModule, MatIconModule,
    MatTableModule, MatDividerModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatDialogModule, MatProgressSpinnerModule,
    StatusLabelPipe, PaymentMethodPipe, ItemTypePipe, AppCurrencyPipe
  ],
  template: `
    @if (loading) {
      <div class="loading-overlay"><mat-spinner diameter="40"></mat-spinner></div>
    } @else if (job) {
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1>Trabajo {{ job.job_number }}</h1>
          <span [class]="'status-badge status-' + job.status" style="font-size:14px;">{{ job.status | statusLabel }}</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          @if (auth.isAdminOrRecep() && job.status === 'abierto') {
            <button mat-raised-button color="accent" (click)="confirmMarkDone()">
              <mat-icon>check</mat-icon> Marcar terminado
            </button>
          }
          <button mat-raised-button (click)="printPdf()" [disabled]="pdfLoading">
            <mat-icon>print</mat-icon> {{ pdfLoading ? 'Generando...' : 'Imprimir PDF' }}
          </button>
          <button mat-button routerLink="/trabajos"><mat-icon>arrow_back</mat-icon> Volver</button>
        </div>
      </div>

      <!-- Info cards -->
      <div class="card-grid">
        <mat-card>
          <mat-card-content>
            <h3>Cliente</h3>
            <p><strong><a [routerLink]="['/clientes', job.client_id]">{{ job.client_name }}</a></strong></p>
            @if (job.client_rut) { <p>RUT: {{ job.client_rut }}</p> }
            @if (job.client_phone) { <p>Tel: {{ job.client_phone }}</p> }
          </mat-card-content>
        </mat-card>
        <mat-card>
          <mat-card-content>
            <h3>Vehiculo</h3>
            <p><strong><a [routerLink]="['/vehiculos', job.vehicle_id]">{{ job.plate_number }}</a></strong></p>
            <p>{{ job.make }} {{ job.model }} {{ job.year || '' }}</p>
            @if (job.mileage_at_service) { <p>Km: {{ job.mileage_at_service.toLocaleString() }}</p> }
          </mat-card-content>
        </mat-card>
        <mat-card>
          <mat-card-content>
            <h3>Financiero</h3>
            @if (job.financials; as f) {
              <p>Subtotal: {{ f.subtotal | appCurrency }}</p>
              @if (f.discount > 0) { <p style="color:#e65100;">Descuento: -{{ f.discount | appCurrency }}</p> }
              @if (job.tax_enabled) { <p>IVA (22%): +{{ f.tax | appCurrency }}</p> }
              <p><strong>Total: {{ f.total | appCurrency }}</strong></p>
              <p>Pagado: {{ f.total_paid | appCurrency }}</p>
              <p [class]="f.balance > 0 ? 'balance-positive' : 'balance-zero'">
                <strong>Saldo: {{ f.balance | appCurrency }}</strong>
              </p>
            }
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Items -->
      <mat-card class="mb-16">
        <mat-card-content>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <h3>Items</h3>
            @if (job.status !== 'pagado') {
              <button mat-stroked-button (click)="showAddItem = !showAddItem">
                <mat-icon>add</mat-icon> Agregar
              </button>
            }
          </div>

          @if (showAddItem) {
            <div style="display:flex;gap:8px;align-items:center;margin:8px 0;flex-wrap:wrap;">
              <mat-form-field appearance="outline" style="flex:2;min-width:160px;" subscriptSizing="dynamic">
                <input matInput [(ngModel)]="newItem.description" placeholder="Descripcion">
              </mat-form-field>
              <mat-form-field appearance="outline" style="width:80px;" subscriptSizing="dynamic">
                <input matInput [(ngModel)]="newItem.quantity" type="number" placeholder="Cant.">
              </mat-form-field>
              <mat-form-field appearance="outline" style="width:100px;" subscriptSizing="dynamic">
                <input matInput [(ngModel)]="newItem.unit_price" type="number" placeholder="Precio">
              </mat-form-field>
              <mat-form-field appearance="outline" style="width:140px;" subscriptSizing="dynamic">
                <mat-select [(ngModel)]="newItem.item_type">
                  <mat-option value="mano_de_obra">Mano de obra</mat-option>
                  <mat-option value="repuesto">Repuesto</mat-option>
                  <mat-option value="otro">Otro</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" style="width:140px;" subscriptSizing="dynamic">
                <input matInput [(ngModel)]="newItem.supplier" placeholder="Proveedor">
              </mat-form-field>
              <button mat-raised-button color="primary" (click)="addItem()" [disabled]="!newItem.description || savingItem">
                {{ savingItem ? '...' : 'Agregar' }}
              </button>
            </div>
          }

          <table mat-table [dataSource]="job.items || []" style="width:100%;">
            <ng-container matColumnDef="item_type">
              <th mat-header-cell *matHeaderCellDef>Tipo</th>
              <td mat-cell *matCellDef="let i">{{ i.item_type | itemType }}</td>
            </ng-container>
            <ng-container matColumnDef="description">
              <th mat-header-cell *matHeaderCellDef>Descripcion</th>
              <td mat-cell *matCellDef="let i">
                {{ i.description }}
                @if (i.supplier) { <small style="color:#888;"> ({{ i.supplier }})</small> }
              </td>
            </ng-container>
            <ng-container matColumnDef="quantity">
              <th mat-header-cell *matHeaderCellDef class="text-right">Cant.</th>
              <td mat-cell *matCellDef="let i" class="text-right">{{ i.quantity }}</td>
            </ng-container>
            <ng-container matColumnDef="unit_price">
              <th mat-header-cell *matHeaderCellDef class="text-right">Precio</th>
              <td mat-cell *matCellDef="let i" class="text-right">{{ i.unit_price | appCurrency }}</td>
            </ng-container>
            <ng-container matColumnDef="total">
              <th mat-header-cell *matHeaderCellDef class="text-right">Total</th>
              <td mat-cell *matCellDef="let i" class="text-right">{{ i.quantity * i.unit_price | appCurrency }}</td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let i">
                @if (auth.isAdminOrRecep() && job.status !== 'pagado') {
                  <button mat-icon-button color="warn" (click)="confirmDeleteItem(i.id, i.description)">
                    <mat-icon>delete</mat-icon>
                  </button>
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="itemColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: itemColumns;"></tr>
          </table>
        </mat-card-content>
      </mat-card>

      <!-- Payments -->
      <mat-card class="mb-16">
        <mat-card-content>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <h3>Pagos</h3>
            @if (auth.isAdminOrRecep() && job.status !== 'pagado') {
              <button mat-stroked-button (click)="showAddPayment = !showAddPayment">
                <mat-icon>payment</mat-icon> Registrar pago
              </button>
            }
          </div>

          @if (showAddPayment) {
            <div style="display:flex;gap:8px;align-items:center;margin:8px 0;flex-wrap:wrap;">
              <mat-form-field appearance="outline" style="width:120px;" subscriptSizing="dynamic">
                <input matInput [(ngModel)]="newPayment.amount" type="number" placeholder="Monto">
              </mat-form-field>
              <mat-form-field appearance="outline" style="width:160px;" subscriptSizing="dynamic">
                <mat-select [(ngModel)]="newPayment.method">
                  <mat-option value="efectivo">Efectivo</mat-option>
                  <mat-option value="transferencia">Transferencia</mat-option>
                  <mat-option value="credito">Credito</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" style="width:180px;" subscriptSizing="dynamic">
                <input matInput [(ngModel)]="newPayment.reference" placeholder="Referencia">
              </mat-form-field>
              <mat-form-field appearance="outline" style="width:180px;" subscriptSizing="dynamic">
                <input matInput [(ngModel)]="newPayment.notes" placeholder="Notas">
              </mat-form-field>
              <button mat-raised-button color="primary" (click)="addPayment()"
                      [disabled]="!newPayment.amount || newPayment.amount <= 0 || savingPayment">
                {{ savingPayment ? '...' : 'Registrar' }}
              </button>
            </div>
          }

          <table mat-table [dataSource]="job.payments || []" style="width:100%;">
            <ng-container matColumnDef="paid_at">
              <th mat-header-cell *matHeaderCellDef>Fecha</th>
              <td mat-cell *matCellDef="let p">{{ p.paid_at | date:'dd/MM/yyyy HH:mm' }}</td>
            </ng-container>
            <ng-container matColumnDef="method">
              <th mat-header-cell *matHeaderCellDef>Metodo</th>
              <td mat-cell *matCellDef="let p">{{ p.method | paymentMethod }}</td>
            </ng-container>
            <ng-container matColumnDef="amount">
              <th mat-header-cell *matHeaderCellDef class="text-right">Monto</th>
              <td mat-cell *matCellDef="let p" class="text-right">{{ p.amount | appCurrency }}</td>
            </ng-container>
            <ng-container matColumnDef="reference">
              <th mat-header-cell *matHeaderCellDef>Referencia</th>
              <td mat-cell *matCellDef="let p">{{ p.reference || '-' }}</td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let p">
                @if (auth.isAdmin()) {
                  <button mat-icon-button color="warn" (click)="confirmDeletePayment(p.id, p.amount)">
                    <mat-icon>delete</mat-icon>
                  </button>
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="paymentColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: paymentColumns;"></tr>
          </table>
        </mat-card-content>
      </mat-card>

      <!-- Notes -->
      <mat-card class="mb-16">
        <mat-card-content>
          <h3>Notas</h3>
          @if (job.notes) { <p><strong>Notas (visibles en PDF):</strong> {{ job.notes }}</p> }
          @if (auth.currentUser()?.role !== 'mecanico') {
            <mat-form-field appearance="outline" style="width:100%;">
              <mat-label>Notas internas (no aparecen en PDF)</mat-label>
              <textarea matInput [(ngModel)]="internalNotes" rows="3"
                        (blur)="saveInternalNotes()"></textarea>
            </mat-form-field>
          }
        </mat-card-content>
      </mat-card>
    </div>
    }
  `
})
export class JobDetailComponent implements OnInit {
  job: Job | null = null;
  itemColumns = ['item_type', 'description', 'quantity', 'unit_price', 'total', 'actions'];
  paymentColumns = ['paid_at', 'method', 'amount', 'reference', 'actions'];
  showAddItem = false;
  showAddPayment = false;
  internalNotes = '';
  loading = true;
  pdfLoading = false;
  savingItem = false;
  savingPayment = false;
  newItem: any = { description: '', quantity: 1, unit_price: 0, item_type: 'mano_de_obra', supplier: '' };
  newPayment: any = { amount: 0, method: 'efectivo', reference: '', notes: '' };

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    public auth: AuthService,
    private dialog: MatDialog,
    private notify: NotificationService
  ) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    const id = this.route.snapshot.paramMap.get('id')!;
    this.api.getJob(id).subscribe({
      next: j => { this.job = j; this.internalNotes = j.internal_notes || ''; this.loading = false; },
      error: err => { this.notify.handleError(err); this.loading = false; }
    });
  }

  confirmMarkDone() {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '380px',
      data: {
        title: 'Marcar como terminado',
        message: '¿Esta seguro de marcar este trabajo como terminado?',
        confirmText: 'Marcar terminado'
      }
    });
    ref.afterClosed().subscribe(confirmed => { if (confirmed) this.markDone(); });
  }

  markDone() {
    this.api.updateJob(this.job!.id, { status: 'terminado' } as any).subscribe({
      next: () => { this.notify.success('Trabajo marcado como terminado'); this.load(); },
      error: err => this.notify.handleError(err)
    });
  }

  addItem() {
    if (!this.newItem.description) return;
    this.savingItem = true;
    this.api.addJobItem(this.job!.id, this.newItem).subscribe({
      next: () => {
        this.newItem = { description: '', quantity: 1, unit_price: 0, item_type: 'mano_de_obra', supplier: '' };
        this.showAddItem = false;
        this.savingItem = false;
        this.notify.success('Item agregado');
        this.load();
      },
      error: err => { this.notify.handleError(err); this.savingItem = false; }
    });
  }

  confirmDeleteItem(itemId: string, description: string) {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '380px',
      data: {
        title: 'Eliminar item',
        message: `¿Esta seguro de eliminar "${description}"?`,
        confirmText: 'Eliminar'
      }
    });
    ref.afterClosed().subscribe(confirmed => { if (confirmed) this.deleteItem(itemId); });
  }

  deleteItem(itemId: string) {
    this.api.deleteJobItem(this.job!.id, itemId).subscribe({
      next: () => { this.notify.success('Item eliminado'); this.load(); },
      error: err => this.notify.handleError(err)
    });
  }

  addPayment() {
    if (!this.newPayment.amount || this.newPayment.amount <= 0) return;
    this.savingPayment = true;
    this.api.addPayment(this.job!.id, this.newPayment).subscribe({
      next: () => {
        this.newPayment = { amount: 0, method: 'efectivo', reference: '', notes: '' };
        this.showAddPayment = false;
        this.savingPayment = false;
        this.notify.success('Pago registrado');
        this.load();
      },
      error: err => { this.notify.handleError(err); this.savingPayment = false; }
    });
  }

  confirmDeletePayment(paymentId: string, amount: number) {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '380px',
      data: {
        title: 'Eliminar pago',
        message: `¿Esta seguro de eliminar el pago de $${amount}?`,
        confirmText: 'Eliminar'
      }
    });
    ref.afterClosed().subscribe(confirmed => { if (confirmed) this.deletePayment(paymentId); });
  }

  deletePayment(paymentId: string) {
    this.api.deletePayment(this.job!.id, paymentId).subscribe({
      next: () => { this.notify.success('Pago eliminado'); this.load(); },
      error: err => this.notify.handleError(err)
    });
  }

  saveInternalNotes() {
    if (this.job && this.internalNotes !== (this.job.internal_notes || '')) {
      this.api.updateJob(this.job.id, { internal_notes: this.internalNotes } as any).subscribe({
        next: () => this.notify.info('Notas guardadas'),
        error: err => this.notify.handleError(err)
      });
    }
  }

  printPdf() {
    const token = localStorage.getItem('workshop_token');
    const url = this.api.getJobPdfUrl(this.job!.id);
    this.pdfLoading = true;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        this.pdfLoading = false;
      })
      .catch(() => { this.notify.error('Error al generar PDF'); this.pdfLoading = false; });
  }
}
