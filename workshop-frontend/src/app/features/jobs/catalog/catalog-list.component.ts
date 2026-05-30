import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { ApiService } from '../../../core/services/api.service';
import { NotificationService } from '../../../core/services/notification.service';
import { CatalogItem, CatalogSuggestion } from '../../../core/models';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

type ItemType = CatalogItem['item_type'];

const TYPE_LABEL: Record<ItemType, string> = {
  mano_de_obra: 'Mano de obra',
  repuesto: 'Repuesto',
  otro: 'Otro',
};

const TYPE_BADGE: Record<ItemType, string> = {
  mano_de_obra: 'b-teal',
  repuesto: 'b-pro',
  otro: 'b-reg',
};

@Component({
  selector: 'app-catalog-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ isEdit ? 'Editar' : 'Nuevo' }} item del catalogo</h2>
    <mat-dialog-content>
      @if (error) { <div class="banner banner-error">{{ error }}</div> }
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Descripcion</mat-label>
        <input matInput [(ngModel)]="form.description" required cdkFocusInitial>
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Tipo</mat-label>
        <mat-select [(ngModel)]="form.item_type" required>
          <mat-option value="mano_de_obra">Mano de obra</mat-option>
          <mat-option value="repuesto">Repuesto</mat-option>
          <mat-option value="otro">Otro</mat-option>
        </mat-select>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()"
              [disabled]="saving || !form.description.trim()">
        {{ saving ? 'Guardando...' : 'Guardar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`.full-width { width: 100%; margin-bottom: 4px; }`],
})
export class CatalogFormDialogComponent {
  isEdit: boolean;
  saving = false;
  error = '';
  form: { description: string; item_type: ItemType } = {
    description: '',
    item_type: 'mano_de_obra',
  };

  constructor(
    private api: ApiService,
    private dialogRef: MatDialogRef<CatalogFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { item?: CatalogItem } | null,
  ) {
    this.isEdit = !!data?.item;
    if (data?.item) {
      this.form = { description: data.item.description, item_type: data.item.item_type };
    }
  }

  save() {
    this.saving = true;
    this.error = '';
    const payload = {
      description: this.form.description.trim(),
      item_type: this.form.item_type,
    };
    const obs = this.isEdit
      ? this.api.updateCatalogItem(this.data!.item!.id, payload)
      : this.api.createCatalogItem(payload);
    obs.subscribe({
      next: () => this.dialogRef.close(true),
      error: (err) => {
        this.saving = false;
        this.error = err.error?.error || 'Error al guardar';
      },
    });
  }
}

@Component({
  selector: 'app-catalog-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatTableModule, MatButtonModule, MatIconModule,
    MatDialogModule, MatProgressSpinnerModule, MatCardModule, MatTooltipModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule,
    MatButtonToggleModule, MatChipsModule,
  ],
  template: `
    <main class="content">
      <div class="page-head">
        <div>
          <h1>Catalogo de items</h1>
          <p class="page-sub">Items disponibles para autocompletar al cargar trabajos.</p>
        </div>
        <button mat-raised-button color="primary" (click)="openForm()">
          <mat-icon>add</mat-icon> Nuevo item
        </button>
      </div>

      <div class="layout">
        <!-- Left: catalog -->
        <mat-card class="table-card">
          <mat-card-content>
            <div class="toolbar">
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search">
                <mat-icon matPrefix>search</mat-icon>
                <mat-label>Buscar</mat-label>
                <input matInput [(ngModel)]="filterQ" (ngModelChange)="onFilterChange()">
              </mat-form-field>
              <mat-button-toggle-group [(ngModel)]="filterType" (change)="onFilterChange()">
                <mat-button-toggle [value]="''">Todos</mat-button-toggle>
                <mat-button-toggle value="mano_de_obra">Mano obra</mat-button-toggle>
                <mat-button-toggle value="repuesto">Repuesto</mat-button-toggle>
                <mat-button-toggle value="otro">Otro</mat-button-toggle>
              </mat-button-toggle-group>
            </div>

            @if (loading) {
              <div class="loading-overlay"><mat-spinner diameter="36"></mat-spinner></div>
            } @else if (items.length === 0) {
              <div class="empty">
                <mat-icon>inventory_2</mat-icon>
                <h3>El catalogo esta vacio</h3>
                <p>Agrega items manualmente o revisa el panel de sugerencias para sumar los mas usados.</p>
              </div>
            } @else {
              <table mat-table [dataSource]="items" class="catalog-table">
                <ng-container matColumnDef="description">
                  <th mat-header-cell *matHeaderCellDef>Descripcion</th>
                  <td mat-cell *matCellDef="let i">{{ i.description }}</td>
                </ng-container>
                <ng-container matColumnDef="item_type">
                  <th mat-header-cell *matHeaderCellDef>Tipo</th>
                  <td mat-cell *matCellDef="let i">
                    <span [class]="'badge ' + typeBadge(i.item_type)">{{ typeLabel(i.item_type) }}</span>
                  </td>
                </ng-container>
                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef class="text-right">Acciones</th>
                  <td mat-cell *matCellDef="let i" class="text-right">
                    <button mat-icon-button (click)="openForm(i)" matTooltip="Editar">
                      <mat-icon>edit</mat-icon>
                    </button>
                    <button mat-icon-button color="warn" (click)="confirmDelete(i)" matTooltip="Eliminar">
                      <mat-icon>delete_outline</mat-icon>
                    </button>
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="cols"></tr>
                <tr mat-row *matRowDef="let row; columns: cols;"></tr>
              </table>
            }
          </mat-card-content>
        </mat-card>

        <!-- Right: suggestions panel -->
        <mat-card class="suggestions-card">
          <mat-card-content>
            <div class="suggestions-head">
              <div>
                <h3>Sugerencias del historico</h3>
                <p class="muted">Items mas usados en trabajos que aun no estan en el catalogo.</p>
              </div>
              <button mat-icon-button (click)="loadSuggestions()" matTooltip="Refrescar">
                <mat-icon>refresh</mat-icon>
              </button>
            </div>

            @if (loadingSuggestions) {
              <div class="loading-overlay"><mat-spinner diameter="28"></mat-spinner></div>
            } @else if (visibleSuggestions().length === 0) {
              <div class="empty small">
                <mat-icon>check_circle</mat-icon>
                <p>No hay sugerencias pendientes.</p>
              </div>
            } @else {
              <div class="sugg-list">
                @for (s of visibleSuggestions(); track s.description) {
                  <div class="sugg-row">
                    <mat-checkbox [(ngModel)]="s._selected" (change)="recomputeSelection()"></mat-checkbox>
                    <div class="sugg-main">
                      <div class="sugg-desc">{{ s.description }}</div>
                      <div class="sugg-meta">Usado {{ s.uses }} {{ s.uses === 1 ? 'vez' : 'veces' }}</div>
                    </div>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="sugg-type">
                      <mat-select [(ngModel)]="s.item_type">
                        <mat-option value="mano_de_obra">Mano de obra</mat-option>
                        <mat-option value="repuesto">Repuesto</mat-option>
                        <mat-option value="otro">Otro</mat-option>
                      </mat-select>
                    </mat-form-field>
                    <button mat-icon-button (click)="dismissSuggestion(s)" matTooltip="Descartar">
                      <mat-icon>close</mat-icon>
                    </button>
                  </div>
                }
              </div>
              <div class="sugg-actions">
                <span class="muted">{{ selectedCount }} seleccionado{{ selectedCount === 1 ? '' : 's' }}</span>
                <button mat-stroked-button (click)="toggleSelectAll()">
                  {{ allSelected ? 'Deseleccionar todo' : 'Seleccionar todo' }}
                </button>
                <button mat-raised-button color="primary"
                        [disabled]="selectedCount === 0 || addingBulk"
                        (click)="addSelectedToCatalog()">
                  <mat-icon>add</mat-icon>
                  {{ addingBulk ? 'Agregando...' : 'Agregar al catalogo' }}
                </button>
              </div>
            }
          </mat-card-content>
        </mat-card>
      </div>
    </main>
  `,
  styles: [`
    .content { padding: 20px; }
    .page-head {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px; gap: 16px;
    }
    .page-head h1 { margin: 0; font-size: 22px; }
    .page-sub { margin: 4px 0 0; color: var(--text-2); font-size: 13px; }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 380px;
      gap: 16px;
      align-items: start;
    }
    @media (max-width: 1100px) {
      .layout { grid-template-columns: 1fr; }
    }

    .toolbar {
      display: flex; gap: 12px; align-items: center; margin-bottom: 12px; flex-wrap: wrap;
    }
    .toolbar .search { flex: 1; min-width: 200px; }

    .catalog-table { width: 100%; }
    .text-right { text-align: right; }

    .empty {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 40px 16px; color: var(--text-2); text-align: center; gap: 8px;
    }
    .empty mat-icon { font-size: 36px; width: 36px; height: 36px; color: var(--text-3); }
    .empty.small { padding: 24px 12px; }
    .empty.small mat-icon { font-size: 28px; width: 28px; height: 28px; }
    .empty h3 { margin: 4px 0; font-size: 15px; }
    .empty p { margin: 0; font-size: 13px; }

    .suggestions-card { position: sticky; top: 16px; }
    .suggestions-head {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
      margin-bottom: 8px;
    }
    .suggestions-head h3 { margin: 0; font-size: 15px; }
    .muted { color: var(--text-2); font-size: 12px; margin: 4px 0 0; }

    .sugg-list { display: flex; flex-direction: column; gap: 8px; max-height: 540px; overflow-y: auto; }
    .sugg-row {
      display: grid;
      grid-template-columns: auto 1fr 130px auto;
      gap: 8px; align-items: center;
      padding: 8px;
      border: 1px solid var(--border);
      border-radius: var(--r-sm);
      background: var(--surface);
    }
    .sugg-desc { font-size: 13px; font-weight: 500; }
    .sugg-meta { color: var(--text-3); font-size: 11px; }
    .sugg-type { width: 130px; }

    .sugg-actions {
      display: flex; align-items: center; justify-content: flex-end; gap: 8px;
      margin-top: 12px; flex-wrap: wrap;
    }
    .sugg-actions .muted { margin-right: auto; }

    .loading-overlay {
      display: flex; justify-content: center; align-items: center; padding: 24px;
    }
  `],
})
export class CatalogListComponent implements OnInit {
  items: CatalogItem[] = [];
  suggestions: (CatalogSuggestion & { _selected?: boolean })[] = [];
  dismissed = new Set<string>();
  cols = ['description', 'item_type', 'actions'];

  filterQ = '';
  filterType: ItemType | '' = '';
  loading = false;
  loadingSuggestions = false;
  addingBulk = false;
  selectedCount = 0;
  allSelected = false;

  private filterTimer: any;

  constructor(
    private api: ApiService,
    private dialog: MatDialog,
    private notify: NotificationService,
  ) {}

  ngOnInit() {
    this.load();
    this.loadSuggestions();
  }

  load() {
    this.loading = true;
    const params: Record<string, string> = {};
    if (this.filterQ.trim()) params['q'] = this.filterQ.trim();
    if (this.filterType) params['item_type'] = this.filterType;
    this.api.listCatalog(params).subscribe({
      next: (rows) => { this.items = rows; this.loading = false; },
      error: (err) => { this.notify.handleError(err); this.loading = false; },
    });
  }

  loadSuggestions() {
    this.loadingSuggestions = true;
    this.api.getCatalogSuggestions().subscribe({
      next: (rows) => {
        this.suggestions = rows.map(r => ({ ...r, _selected: false }));
        this.loadingSuggestions = false;
        this.recomputeSelection();
      },
      error: (err) => { this.notify.handleError(err); this.loadingSuggestions = false; },
    });
  }

  visibleSuggestions() {
    return this.suggestions.filter(s => !this.dismissed.has(s.description));
  }

  onFilterChange() {
    clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => this.load(), 200);
  }

  typeLabel(t: ItemType) { return TYPE_LABEL[t]; }
  typeBadge(t: ItemType) { return TYPE_BADGE[t]; }

  openForm(item?: CatalogItem) {
    const ref = this.dialog.open(CatalogFormDialogComponent, {
      width: '450px',
      data: item ? { item } : null,
    });
    ref.afterClosed().subscribe(r => {
      if (r) {
        this.notify.success(item ? 'Item actualizado' : 'Item agregado al catalogo');
        this.load();
        if (!item) this.loadSuggestions();
      }
    });
  }

  confirmDelete(item: CatalogItem) {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Eliminar item del catalogo',
        message: `Eliminar "${item.description}" del catalogo. Los trabajos existentes que usan esta descripcion no se modifican.`,
        confirmText: 'Eliminar',
      },
    });
    ref.afterClosed().subscribe(confirmed => {
      if (confirmed) this.delete(item);
    });
  }

  delete(item: CatalogItem) {
    this.api.deleteCatalogItem(item.id).subscribe({
      next: () => {
        this.notify.success('Item eliminado');
        this.load();
        this.loadSuggestions();
      },
      error: (err) => this.notify.handleError(err),
    });
  }

  dismissSuggestion(s: CatalogSuggestion) {
    this.dismissed.add(s.description);
    this.recomputeSelection();
  }

  recomputeSelection() {
    const visible = this.visibleSuggestions();
    this.selectedCount = visible.filter(s => s._selected).length;
    this.allSelected = visible.length > 0 && this.selectedCount === visible.length;
  }

  toggleSelectAll() {
    const visible = this.visibleSuggestions();
    const next = !this.allSelected;
    for (const s of visible) (s as any)._selected = next;
    this.recomputeSelection();
  }

  addSelectedToCatalog() {
    const selected = this.visibleSuggestions().filter(s => s._selected);
    if (selected.length === 0) return;
    this.addingBulk = true;
    const payload = selected.map(s => ({ description: s.description, item_type: s.item_type }));
    this.api.bulkCreateCatalogItems(payload).subscribe({
      next: (res) => {
        this.addingBulk = false;
        const ins = res.inserted.length;
        const dup = res.skipped.filter(x => x.reason === 'duplicate').length;
        let msg = `${ins} ${ins === 1 ? 'item agregado' : 'items agregados'} al catalogo`;
        if (dup > 0) msg += ` (${dup} duplicado${dup === 1 ? '' : 's'} ignorado${dup === 1 ? '' : 's'})`;
        this.notify.success(msg);
        this.load();
        this.loadSuggestions();
      },
      error: (err) => {
        this.addingBulk = false;
        this.notify.handleError(err);
      },
    });
  }
}
