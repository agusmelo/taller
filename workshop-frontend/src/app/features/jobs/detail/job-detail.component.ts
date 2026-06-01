import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Job, JobItem, JobItemNode, CatalogItem } from '../../../core/models';
import { buildItemsTree, computeLineTotal } from '../../../core/utils/items-tree';
import { StatusLabelPipe, PaymentMethodPipe, ItemTypePipe } from '../../../shared/pipes/status.pipe';
import { AppCurrencyPipe } from '../../../shared/pipes/currency.pipe';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { InfoCardComponent } from '../../../shared/components/info-card/info-card.component';
import { ContactCardComponent } from '../../../shared/components/contact-card/contact-card.component';

@Component({
  selector: 'app-job-detail',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, MatCardModule, MatButtonModule, MatIconModule,
    MatTableModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTooltipModule,
    MatDialogModule, MatProgressSpinnerModule, MatDatepickerModule, MatNativeDateModule,
    MatSlideToggleModule, MatAutocompleteModule,
    InfoCardComponent, ContactCardComponent,
    StatusLabelPipe, PaymentMethodPipe, ItemTypePipe, AppCurrencyPipe
  ],
  template: `
    @if (loading) {
      <div class="loading-overlay"><mat-spinner diameter="40"></mat-spinner></div>
    } @else if (job) {
    <main class="content">
      <div class="page-head">
        <div class="page-head-title">
          <h1>Trabajo <span class="t-mono">{{ job.job_number }}</span></h1>
          <span [class]="'badge b-' + job.status">{{ job.status | statusLabel }}</span>
          @if (job.is_locked) {
            <mat-icon class="lock-ico" aria-label="Bloqueado">lock</mat-icon>
          }
        </div>
        <div class="page-head-actions">
          @if (auth.isAdminOrRecep() && job.status === 'abierto') {
            <button mat-raised-button color="primary" (click)="confirmMarkDone()">
              <mat-icon>check</mat-icon> Marcar terminado
            </button>
          }
          <mat-slide-toggle [(ngModel)]="job.show_item_details_pricing"
                            (change)="saveVisibility($event.checked)"
                            matTooltip="Si esta apagado, el PDF muestra el desglose sin precios"
                            class="visibility-toggle">
            Desglose con precios
          </mat-slide-toggle>
          <button mat-stroked-button (click)="printPdf()" [disabled]="pdfLoading">
            <mat-icon>print</mat-icon> {{ pdfLoading ? 'Generando...' : 'Imprimir PDF' }}
          </button>
          @if (auth.isAdmin()) {
            <button mat-raised-button color="warn" (click)="confirmDeleteJob()">
              <mat-icon>delete</mat-icon> Eliminar
            </button>
          }
          <button mat-button routerLink="/trabajos"><mat-icon>arrow_back</mat-icon> Volver</button>
        </div>
      </div>

      <!-- Lock banner -->
      @if (job.is_locked) {
        <div class="banner banner-warn">
          <mat-icon>lock</mat-icon>
          <span>Este trabajo esta bloqueado para edicion.
            @if (job.status === 'terminado') { Se pueden registrar pagos. }
          </span>
          @if (auth.isAdmin()) {
            <button mat-stroked-button (click)="toggleLock(false)" style="margin-left:auto;">
              <mat-icon>lock_open</mat-icon> Desbloquear
            </button>
          }
        </div>
      } @else if ((job.status === 'terminado' || job.status === 'pagado') && auth.isAdminOrRecep()) {
        <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
          <button mat-stroked-button color="warn" (click)="toggleLock(true)">
            <mat-icon>lock</mat-icon> Bloquear edicion
          </button>
        </div>
      }

      <!-- Info cards -->
      <div class="info-cards">
        <app-contact-card
          title="Cliente"
          icon="person"
          accent="blue"
          [name]="job.client_name || null"
          [nameLink]="['/clientes', job.client_id]"
          [rut]="job.client_rut || null"
          [phone]="job.client_phone || null"
          [email]="job.client_email || null"
          [address]="job.client_address || null">
        </app-contact-card>

        <app-info-card title="Vehículo" icon="directions_car" accent="teal">
          <p class="v-plate"><a [routerLink]="['/vehiculos', job.vehicle_id]" matTooltip="Ver ficha del vehículo"><span class="t-mono">{{ job.plate_number }}</span><mat-icon class="link-ico">open_in_new</mat-icon></a></p>
          <p class="v-make">{{ job.make }} {{ job.model }} {{ job.year || '' }}</p>
          @if (job.mileage_at_service) {
            <div class="info-row"><span>Kilometraje</span><span class="t-mono">{{ job.mileage_at_service.toLocaleString() }} km</span></div>
          }
          @if (job.job_date) {
            <div class="info-row"><span>Fecha</span><span>{{ job.job_date | date:'dd/MM/yyyy' }}</span></div>
          }
        </app-info-card>

        <app-info-card title="Financiero" icon="payments" accent="green">
          @if (job.financials; as f) {
            <div class="totals">
              <div class="totals-row"><span>Subtotal</span><span class="t-mono">{{ f.subtotal | appCurrency }}</span></div>
              @if (f.discount > 0) {
                <div class="totals-row" style="color:var(--amber);"><span>Descuento</span><span class="t-mono">-{{ f.discount | appCurrency }}</span></div>
              }
              @if (job.tax_enabled) {
                <div class="totals-row"><span>IVA (22%)</span><span class="t-mono">+{{ f.tax | appCurrency }}</span></div>
              }
              <div class="totals-row totals-total"><span>Total</span><span class="t-mono">{{ f.total | appCurrency }}</span></div>
              <div class="totals-row"><span>Pagado</span><span class="t-mono" style="color:var(--green);">{{ f.total_paid | appCurrency }}</span></div>
              @if (f.balance > 0) {
                <div class="totals-row totals-balance" style="color:var(--red);"><span>Saldo</span><span class="t-mono">{{ f.balance | appCurrency }}</span></div>
              } @else if (f.balance < 0) {
                <div class="totals-row totals-balance" style="color:var(--purple);"><span>Excedente</span><span class="t-mono">{{ (f.balance * -1) | appCurrency }}</span></div>
              } @else {
                <div class="totals-row totals-balance" style="color:var(--green);"><span>Saldo</span><span class="t-mono">{{ f.balance | appCurrency }}</span></div>
              }
            </div>
          }
        </app-info-card>
      </div>

      <!-- Items -->
      <mat-card class="mb-16">
        <mat-card-content>
          <div class="card-head">
            <h3 class="card-title-lg">Items</h3>
            @if (canEditItems()) {
              <button mat-stroked-button (click)="showAddItem = !showAddItem">
                <mat-icon>add</mat-icon> Agregar item
              </button>
            }
          </div>

          <mat-autocomplete #descAuto="matAutocomplete" (optionSelected)="onDescriptionSelected($event)">
            @for (s of descriptionSuggestions; track s.id) {
              <mat-option [value]="s.description">
                <span>{{ s.description }}</span>
                <small style="color:var(--text-3); margin-left:8px;">{{ typeLabel(s.item_type) }}</small>
              </mat-option>
            }
          </mat-autocomplete>

          @if (showAddItem && canEditItems()) {
            <div class="add-row">
              <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:130px;">
                <mat-select [(ngModel)]="newItem.item_type">
                  <mat-option value="mano_de_obra">Mano de obra</mat-option>
                  <mat-option value="repuesto">Repuesto</mat-option>
                  <mat-option value="otro">Otro</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic" style="flex:1;min-width:160px;">
                <input matInput [(ngModel)]="newItem.description"
                       placeholder="Descripcion"
                       [matAutocomplete]="descAuto"
                       (focus)="autocompleteTarget = 'new'"
                       (input)="onDescriptionInput(newItem.description)">
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:70px;">
                <input matInput [(ngModel)]="newItem.quantity" type="number" placeholder="Cant.">
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:110px;">
                <input matInput [(ngModel)]="newItem.unit_price" type="number" placeholder="Precio">
              </mat-form-field>
              <button mat-raised-button color="primary" (click)="addItem()" [disabled]="!newItem.description || savingItem">
                {{ savingItem ? '...' : 'Agregar' }}
              </button>
            </div>
          }

          @if (!itemsTree.length) {
            <div class="empty-items">Sin items todavia.</div>
          }

          @for (node of itemsTree; track node.id; let pIdx = $index) {
            <div class="item-block">
              <div class="parent-row" [class.has-children]="node.children.length > 0">
                @if (editingItemId === node.id) {
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="cell-type">
                    <mat-select [(ngModel)]="editItem.item_type">
                      <mat-option value="mano_de_obra">Mano de obra</mat-option>
                      <mat-option value="repuesto">Repuesto</mat-option>
                      <mat-option value="otro">Otro</mat-option>
                    </mat-select>
                  </mat-form-field>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="cell-desc">
                    <input matInput [(ngModel)]="editItem.description"
                           [matAutocomplete]="descAuto"
                           (focus)="autocompleteTarget = node.id"
                           (input)="onDescriptionInput(editItem.description)">
                  </mat-form-field>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="cell-qty">
                    <input matInput [(ngModel)]="editItem.quantity" type="number" min="1"
                           [disabled]="node.children.length > 0">
                  </mat-form-field>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="cell-price">
                    @if (node.children.length > 0) {
                      <input matInput [value]="lineTotal(node).toFixed(2)" disabled class="input-computed">
                    } @else {
                      <input matInput [(ngModel)]="editItem.unit_price" type="number" min="0">
                    }
                  </mat-form-field>
                  <span class="cell-total t-mono">{{ (editItem.quantity * editItem.unit_price) | appCurrency }}</span>
                  <div class="cell-actions">
                    <button mat-icon-button color="primary" (click)="saveEditItem()" [disabled]="savingItem">
                      <mat-icon>check</mat-icon>
                    </button>
                    <button mat-icon-button (click)="cancelEditItem()">
                      <mat-icon>close</mat-icon>
                    </button>
                  </div>
                } @else {
                  <span class="cell-type">
                    <span [class]="'badge b-' + typeBadge(node.item_type)">{{ node.item_type | itemType }}</span>
                  </span>
                  <span class="cell-desc">
                    {{ node.description }}
                    @if (node.supplier) { <small style="color:var(--text-3);"> ({{ node.supplier }})</small> }
                  </span>
                  <span class="cell-qty t-mono">{{ node.children.length > 0 ? '1' : node.quantity }}</span>
                  <span class="cell-price t-mono">{{ node.children.length > 0 ? '—' : (node.unit_price | appCurrency) }}</span>
                  <span class="cell-total t-mono">{{ lineTotal(node) | appCurrency }}</span>
                  <div class="cell-actions">
                    @if (canEditItems()) {
                      <button mat-icon-button (click)="startEditItem(node)" matTooltip="Editar">
                        <mat-icon>edit</mat-icon>
                      </button>
                      <button mat-icon-button (click)="confirmDeleteItem(node.id, node.description)" matTooltip="Eliminar">
                        <mat-icon>delete_outline</mat-icon>
                      </button>
                    }
                  </div>
                }
              </div>

              @if (node.children.length > 0) {
                <div class="children-block">
                  @for (child of node.children; track child.id; let cIdx = $index) {
                    <div class="child-row">
                      @if (editingItemId === child.id) {
                        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="child-desc">
                          <input matInput [(ngModel)]="editItem.description">
                        </mat-form-field>
                        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="child-price">
                          <input matInput [(ngModel)]="editItem.unit_price" type="number" min="0">
                        </mat-form-field>
                        <div class="cell-actions">
                          <button mat-icon-button color="primary" (click)="saveEditItem()" [disabled]="savingItem">
                            <mat-icon>check</mat-icon>
                          </button>
                          <button mat-icon-button (click)="cancelEditItem()">
                            <mat-icon>close</mat-icon>
                          </button>
                        </div>
                      } @else {
                        <span class="child-desc">↳ {{ child.description }}</span>
                        <span class="child-price t-mono">{{ child.unit_price | appCurrency }}</span>
                        <div class="cell-actions">
                          @if (canEditItems()) {
                            <button mat-icon-button (click)="startEditItem(child)" matTooltip="Editar">
                              <mat-icon>edit</mat-icon>
                            </button>
                            <button mat-icon-button (click)="confirmDeleteItem(child.id, child.description)" matTooltip="Eliminar">
                              <mat-icon>close</mat-icon>
                            </button>
                          }
                        </div>
                      }
                    </div>
                  }
                </div>
              }

              @if (showAddChildFor === node.id && canEditItems()) {
                <div class="add-child-row children-block">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="child-desc">
                    <input matInput [(ngModel)]="newChild.description" placeholder="Detalle"
                           (keydown.enter)="addChildInline(node.id)">
                  </mat-form-field>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="child-price">
                    <input matInput [(ngModel)]="newChild.unit_price" type="number" placeholder="P. unit."
                           (keydown.enter)="addChildInline(node.id)">
                  </mat-form-field>
                  <button mat-icon-button color="primary" (click)="addChildInline(node.id)" [disabled]="!newChild.description">
                    <mat-icon>check</mat-icon>
                  </button>
                  <button mat-icon-button (click)="showAddChildFor = null">
                    <mat-icon>close</mat-icon>
                  </button>
                </div>
              }

              @if (canEditItems() && showAddChildFor !== node.id) {
                <button class="add-child-btn" type="button" (click)="openAddChild(node.id)">
                  <mat-icon>subdirectory_arrow_right</mat-icon> Agregar detalle
                </button>
              }
            </div>
          }
        </mat-card-content>
      </mat-card>

      <!-- Payments -->
      <mat-card class="mb-16">
        <mat-card-content>
          <div class="card-head">
            <h3 class="card-title-lg">Pagos</h3>
            @if (auth.isAdminOrRecep() && canAddPayments()) {
              <button mat-stroked-button (click)="showAddPayment = !showAddPayment">
                <mat-icon>payment</mat-icon> Registrar pago
              </button>
            }
          </div>

          @if (showAddPayment && canAddPayments()) {
            <div style="display:flex;gap:8px;align-items:center;margin:8px 0;flex-wrap:wrap;">
              <mat-form-field appearance="outline" style="width:150px;" subscriptSizing="dynamic">
                <mat-label>Fecha de pago</mat-label>
                <input matInput [matDatepicker]="payDatePicker" [(ngModel)]="newPayment.payment_date">
                <mat-datepicker-toggle matIconSuffix [for]="payDatePicker"></mat-datepicker-toggle>
                <mat-datepicker #payDatePicker></mat-datepicker>
              </mat-form-field>
              <mat-form-field appearance="outline" style="width:160px;" subscriptSizing="dynamic">
                <mat-select [(ngModel)]="newPayment.method" (selectionChange)="onPaymentMethodChange()">
                  <mat-option value="efectivo">Efectivo</mat-option>
                  <mat-option value="transferencia">Transferencia</mat-option>
                  <mat-option value="cheque">Cheque</mat-option>
                  <mat-option value="credito">Credito</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" style="width:120px;" subscriptSizing="dynamic">
                <input matInput [(ngModel)]="newPayment.amount" type="number" placeholder="Monto" min="0.01">
                @if (newPayment.method === 'credito' && clientCredit > 0) {
                  <mat-hint>Credito disponible: {{ clientCredit | appCurrency }}</mat-hint>
                }
              </mat-form-field>
              @if (job.financials && job.financials.balance > 0) {
                <button mat-stroked-button (click)="fillRemainingBalance()" matTooltip="Completar saldo pendiente">
                  <mat-icon>payment</mat-icon> Completar
                </button>
              }
              <mat-form-field appearance="outline" style="width:150px;" subscriptSizing="dynamic">
                <input matInput [(ngModel)]="newPayment.reference" placeholder="Referencia">
              </mat-form-field>
              <button mat-raised-button color="primary" (click)="addPayment()"
                      [disabled]="!newPayment.amount || newPayment.amount <= 0 || savingPayment || (newPayment.method === 'credito' && newPayment.amount > clientCredit)">
                {{ savingPayment ? '...' : 'Registrar' }}
              </button>
            </div>
            @if (newPayment.method === 'credito' && clientCredit <= 0) {
              <div class="banner banner-error">
                Este cliente no tiene credito disponible.
              </div>
            }
            @if (newPayment.method === 'credito' && newPayment.amount > clientCredit && clientCredit > 0) {
              <div class="banner banner-error">
                El monto excede el credito disponible ({{ clientCredit | appCurrency }}).
              </div>
            }
          }

          <table mat-table [dataSource]="job.payments || []" style="width:100%;">
            <ng-container matColumnDef="payment_date">
              <th mat-header-cell *matHeaderCellDef>Fecha</th>
              <td mat-cell *matCellDef="let p">{{ p.payment_date | date:'dd/MM/yyyy' }}</td>
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
                @if (auth.isAdmin() && !job.is_locked) {
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
          <h3 class="card-title-lg">Notas</h3>
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
    </main>
    }
  `,
  styles: [`
    .page-head-title { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .page-head-title h1 { margin: 0; }
    .lock-ico { color: var(--amber); font-size: 20px; width: 20px; height: 20px; }
    .v-plate { margin: 0 0 2px; font-size: 15px; font-weight: 700; }
    .v-plate a { color: var(--text-1); text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }
    .v-plate a:hover { color: var(--blue); }
    .v-plate a:hover .t-mono { text-decoration: underline; }
    .v-plate .link-ico { font-size: 14px; width: 14px; height: 14px; color: var(--text-3); transition: color .14s; }
    .v-plate a:hover .link-ico { color: var(--blue); }
    .v-make { margin: 0 0 8px; color: var(--text-2); font-size: 13px; }
    .card-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 12px;
    }
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
    }
    .totals-balance {
      font-weight: 700;
      border-top: 1px dashed var(--border);
      padding-top: 6px;
      margin-top: 2px;
    }
    .visibility-toggle {
      margin-right: 6px;
      font-size: 12px;
    }
    .empty-items {
      padding: 24px 0;
      text-align: center;
      color: var(--text-3);
      font-size: 13px;
    }
    .add-row {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .item-block {
      border-bottom: 1px solid var(--border2);
      padding: 8px 0 6px;
    }
    .item-block:last-of-type { border-bottom: none; }
    .parent-row {
      display: grid;
      grid-template-columns: 130px 1fr 70px 110px 100px auto;
      gap: 8px;
      align-items: center;
    }
    .parent-row.has-children .cell-price,
    .parent-row.has-children .cell-qty {
      color: var(--text-3);
      font-style: italic;
    }
    .cell-desc { min-width: 0; }
    .cell-qty, .cell-price { text-align: right; }
    .cell-total { text-align: right; font-weight: 600; white-space: nowrap; }
    .cell-actions { display: flex; gap: 2px; justify-content: flex-end; }
    .cell-actions mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .input-computed { font-style: italic; color: var(--text-3) !important; }
    .children-block {
      padding: 4px 0 4px 12px;
      margin: 4px 0 4px 18px;
      border-left: 2px solid var(--navy);
    }
    .child-row {
      display: grid;
      grid-template-columns: 1fr 130px auto;
      gap: 8px;
      align-items: center;
      padding: 3px 0;
      font-size: 12px;
      color: var(--text-2);
    }
    .child-desc, .child-price { min-width: 0; }
    .add-child-row {
      display: grid;
      grid-template-columns: 1fr 130px 36px 36px;
      gap: 8px;
      align-items: center;
      padding: 4px 0 4px 12px;
      margin: 4px 0 4px 18px;
    }
    .add-child-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin: 4px 0 4px 18px;
      font-size: 11px;
      color: var(--navy);
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px 6px;
      border-radius: var(--r-sm);
    }
    .add-child-btn:hover { background: var(--bg); }
    .add-child-btn mat-icon { font-size: 14px; width: 14px; height: 14px; }
    @media (max-width: 720px) {
      .parent-row { grid-template-columns: 1fr 1fr; }
    }
  `]
})
export class JobDetailComponent implements OnInit {
  job: Job | null = null;
  itemsTree: JobItemNode[] = [];
  paymentColumns = ['payment_date', 'method', 'amount', 'reference', 'actions'];
  showAddItem = false;
  showAddChildFor: string | null = null;
  showAddPayment = false;
  internalNotes = '';
  loading = true;
  pdfLoading = false;
  savingItem = false;
  savingPayment = false;
  newItem: any = { description: '', quantity: 1, unit_price: 0, item_type: 'mano_de_obra', supplier: '', children: [], catalog_item_id: null };
  newChild: { description: string; unit_price: number } = { description: '', unit_price: 0 };
  newPayment: any = { amount: 0, method: 'efectivo', reference: '', notes: '', payment_date: new Date() };
  clientCredit = 0;
  editingItemId: string | null = null;
  editItem: any = {};

  descriptionSuggestions: CatalogItem[] = [];
  autocompleteTarget: string | 'new' | null = null;
  private descTimeout: any;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
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
      next: j => {
        this.job = j;
        this.itemsTree = buildItemsTree(j.items || []);
        this.internalNotes = j.internal_notes || '';
        this.loading = false;
      },
      error: err => { this.notify.handleError(err); this.loading = false; }
    });
  }

  lineTotal(node: JobItemNode): number { return computeLineTotal(node); }

  typeBadge(t: string): string {
    return t === 'mano_de_obra' ? 'teal' : 'reg';
  }

  saveVisibility(checked: boolean) {
    if (!this.job) return;
    this.api.updateJob(this.job.id, { show_item_details_pricing: checked } as any).subscribe({
      next: () => this.notify.success(checked ? 'Desglose visible en PDF' : 'Desglose oculto en PDF'),
      error: err => this.notify.handleError(err)
    });
  }

  openAddChild(parentId: string) {
    this.showAddChildFor = parentId;
    this.newChild = { description: '', unit_price: 0 };
    setTimeout(() => {
      const inputs = document.querySelectorAll('.add-child-row input');
      const first = inputs[0] as HTMLInputElement | undefined;
      if (first) first.focus();
    }, 0);
  }

  addChildInline(parentId: string) {
    if (!this.newChild.description) return;
    this.api.addJobItem(this.job!.id, {
      description: this.newChild.description,
      unit_price: Number(this.newChild.unit_price) || 0,
      parent_id: parentId,
    }).subscribe({
      next: () => {
        this.newChild = { description: '', unit_price: 0 };
        this.notify.success('Detalle agregado');
        const keepOpenFor = parentId;
        this.load();
        // Keep the inline-add form open on the same parent so the user can
        // add several details in a row without re-clicking.
        setTimeout(() => { this.showAddChildFor = keepOpenFor; }, 0);
      },
      error: err => this.notify.handleError(err)
    });
  }

  onDescriptionInput(value: string) {
    clearTimeout(this.descTimeout);
    const q = (value || '').trim();
    if (q.length < 2) {
      this.descriptionSuggestions = [];
      return;
    }
    this.descTimeout = setTimeout(() => {
      this.api.searchCatalogItems(q).subscribe(results => {
        this.descriptionSuggestions = results;
      });
    }, 200);
  }

  typeLabel(t: CatalogItem['item_type']): string {
    return t === 'mano_de_obra' ? 'Mano de obra' : t === 'repuesto' ? 'Repuesto' : 'Otro';
  }

  onDescriptionSelected(event: any) {
    const value = event.option.value as string;
    const match = this.descriptionSuggestions.find(s => s.description === value);
    if (this.autocompleteTarget === 'new') {
      this.newItem.description = value;
      this.newItem.catalog_item_id = match?.id ?? null;
      if (match) {
        this.newItem.item_type = match.item_type;
        const incomingChildren = (match.children || []).map(c => ({
          description: c.description,
          unit_price: 0,
        }));
        if (incomingChildren.length > 0) {
          this.newItem.children = incomingChildren;
        }
      }
    } else if (this.autocompleteTarget) {
      this.editItem.description = value;
      if (match) this.editItem.item_type = match.item_type;
    }
    this.descriptionSuggestions = [];
  }

  canAddPayments(): boolean {
    if (!this.job) return false;
    return !this.job.is_locked || (this.job.is_locked && this.job.status === 'terminado');
  }

  fillRemainingBalance() {
    if (this.job?.financials && this.job.financials.balance > 0) {
      if (this.newPayment.method === 'credito' && this.clientCredit > 0) {
        this.newPayment.amount = Math.min(this.job.financials.balance, this.clientCredit);
      } else {
        this.newPayment.amount = this.job.financials.balance;
      }
    }
  }

  onPaymentMethodChange() {
    if (this.newPayment.method === 'credito' && this.job) {
      this.loadClientCredit();
    }
  }

  loadClientCredit() {
    if (!this.job) return;
    this.api.getClientCredit(this.job.client_id).subscribe({
      next: res => this.clientCredit = res.credit_available,
      error: () => this.clientCredit = 0
    });
  }

  toggleLock(lock: boolean) {
    const obs = lock ? this.api.lockJob(this.job!.id) : this.api.unlockJob(this.job!.id);
    obs.subscribe({
      next: () => { this.notify.success(lock ? 'Trabajo bloqueado' : 'Trabajo desbloqueado'); this.load(); },
      error: err => this.notify.handleError(err)
    });
  }

  confirmMarkDone() {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '380px',
      data: {
        title: 'Marcar como terminado',
        message: '¿Esta seguro de marcar este trabajo como terminado? Se bloqueara automaticamente para edicion.',
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

  confirmDeleteJob() {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Eliminar trabajo',
        message: `¿Esta seguro de eliminar el trabajo "${this.job!.job_number}"? Esta accion no se puede deshacer.`,
        confirmText: 'Eliminar'
      }
    });
    ref.afterClosed().subscribe(confirmed => { if (confirmed) this.deleteJob(); });
  }

  deleteJob() {
    this.api.deleteJob(this.job!.id).subscribe({
      next: () => {
        this.notify.success('Trabajo eliminado');
        this.router.navigate(['/trabajos']);
      },
      error: err => this.notify.handleError(err)
    });
  }

  addItem() {
    if (!this.newItem.description) return;
    this.savingItem = true;
    this.api.addJobItem(this.job!.id, this.newItem).subscribe({
      next: () => {
        this.newItem = { description: '', quantity: 1, unit_price: 0, item_type: 'mano_de_obra', supplier: '', children: [], catalog_item_id: null };
        this.showAddItem = false;
        this.savingItem = false;
        this.notify.success('Item agregado');
        this.load();
      },
      error: err => { this.notify.handleError(err); this.savingItem = false; }
    });
  }

  canEditItems(): boolean {
    if (!this.job) return false;
    if (this.job.is_locked || this.job.status === 'pagado') return false;
    return this.auth.isAdmin() || this.auth.isAdminOrRecep();
  }

  startEditItem(item: JobItem) {
    if (!this.canEditItems()) return;
    this.editingItemId = item.id;
    this.editItem = {
      item_type: item.item_type,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      supplier: item.supplier || ''
    };
  }

  cancelEditItem() {
    this.editingItemId = null;
    this.editItem = {};
  }

  saveEditItem() {
    if (!this.editingItemId || !this.editItem.description) return;
    this.savingItem = true;
    this.api.updateJobItem(this.job!.id, this.editingItemId, this.editItem).subscribe({
      next: () => {
        this.editingItemId = null;
        this.editItem = {};
        this.savingItem = false;
        this.notify.success('Item actualizado');
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
    const paymentDate = this.newPayment.payment_date instanceof Date
      ? this.newPayment.payment_date.toISOString().split('T')[0]
      : this.newPayment.payment_date;
    this.api.addPayment(this.job!.id, { ...this.newPayment, payment_date: paymentDate }).subscribe({
      next: () => {
        this.newPayment = { amount: 0, method: 'efectivo', reference: '', notes: '', payment_date: new Date() };
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
