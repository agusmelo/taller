import {
  Component, OnInit, OnDestroy, Inject, HostListener,
  ViewChild, ElementRef, AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
  MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatTabsModule } from '@angular/material/tabs';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { MatSidenavModule, MatDrawer } from '@angular/material/sidenav';
import { ApiService } from '../../../core/services/api.service';
import { NotificationService } from '../../../core/services/notification.service';
import { CatalogItem, CatalogChild, CatalogSuggestion } from '../../../core/models';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

type ItemType = CatalogItem['item_type'];

const TYPE_LABEL: Record<ItemType, string> = {
  mano_de_obra: 'Mano de obra',
  repuesto: 'Repuesto',
  otro: 'Otro',
};

const TYPE_CLASS: Record<ItemType, string> = {
  mano_de_obra: 'chip-mo',
  repuesto: 'chip-rp',
  otro: 'chip-ot',
};

interface CatalogRow extends CatalogItem {
  _expanded?: boolean;
}

interface SuggestionRow extends CatalogSuggestion {
  _selected?: boolean;
  _expanded?: boolean;
}

/* =========================================================================
 *  DIALOG: nuevo item (descripcion + tipo + lista opcional de detalles)
 * ========================================================================= */
@Component({
  selector: 'app-catalog-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatSelectModule, MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>Nuevo item del catalogo</h2>
    <mat-dialog-content class="dialog-body">
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

      <div class="details-head">
        <span>Detalles (opcional)</span>
        <button mat-stroked-button type="button" (click)="addChild()">
          <mat-icon>add</mat-icon> Agregar detalle
        </button>
      </div>

      @if (children.length === 0) {
        <p class="muted">Sin detalles. El item se va a sugerir como linea simple.</p>
      } @else {
        <div class="children-list">
          @for (c of children; track $index; let i = $index) {
            <div class="child-row">
              <mat-icon class="drag-h">drag_indicator</mat-icon>
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="grow">
                <input matInput [(ngModel)]="c.description"
                       placeholder="Detalle"
                       (keydown.enter)="onChildEnter($event, i)">
              </mat-form-field>
              <button mat-icon-button (click)="removeChild(i)" aria-label="Eliminar detalle">
                <mat-icon>close</mat-icon>
              </button>
            </div>
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()"
              [disabled]="saving || !form.description.trim()">
        {{ saving ? 'Guardando...' : 'Guardar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full-width { width: 100%; margin-bottom: 4px; }
    .dialog-body { display: flex; flex-direction: column; min-width: 480px; max-width: 100%; }
    .details-head { display: flex; justify-content: space-between; align-items: center; margin: 8px 0 6px; }
    .details-head span { font-size: 13px; font-weight: 600; color: var(--text-1); }
    .muted { color: var(--text-3); font-size: 12px; margin: 4px 0 0; }
    .children-list { display: flex; flex-direction: column; gap: 6px; }
    .child-row { display: grid; grid-template-columns: 18px 1fr auto; gap: 6px; align-items: center; }
    .child-row .grow { width: 100%; }
    .drag-h { color: var(--text-3); font-size: 18px; width: 18px; height: 18px; }
  `],
})
export class CatalogFormDialogComponent {
  saving = false;
  error = '';
  form: { description: string; item_type: ItemType } = {
    description: '',
    item_type: 'mano_de_obra',
  };
  children: { description: string }[] = [];

  constructor(
    private api: ApiService,
    private dialogRef: MatDialogRef<CatalogFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: {
      seed?: { description: string; item_type: ItemType; children?: CatalogChild[] };
    } | null,
  ) {
    if (data?.seed) {
      this.form.description = data.seed.description;
      this.form.item_type = data.seed.item_type;
      this.children = (data.seed.children || []).map(c => ({ description: c.description }));
    }
  }

  addChild() { this.children.push({ description: '' }); }
  removeChild(i: number) { this.children.splice(i, 1); }
  onChildEnter(e: Event, i: number) {
    e.preventDefault();
    if (i === this.children.length - 1) this.addChild();
  }

  save() {
    this.saving = true;
    this.error = '';
    const payload = {
      description: this.form.description.trim(),
      item_type: this.form.item_type,
      children: this.children
        .map((c, i) => ({ description: c.description.trim(), sort_order: i }))
        .filter(c => c.description),
    };
    this.api.createCatalogItem(payload).subscribe({
      next: (item) => this.dialogRef.close(item),
      error: (err) => {
        this.saving = false;
        this.error = err.error?.error || 'Error al guardar';
      },
    });
  }
}

/* =========================================================================
 *  MAIN: tabs + tree + drawer
 * ========================================================================= */
@Component({
  selector: 'app-catalog-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatTableModule, MatButtonModule, MatIconModule,
    MatDialogModule, MatProgressSpinnerModule, MatCardModule, MatTooltipModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule,
    MatButtonToggleModule, MatChipsModule, MatTabsModule, MatMenuModule,
    MatBadgeModule, MatSidenavModule,
  ],
  template: `
    <mat-drawer-container class="catalog-shell" [hasBackdrop]="true">
      <mat-drawer #drawer mode="over" position="end" [opened]="!!editingId">
        @if (editingId && drawerItem) {
          <div class="drawer-head">
            <div>
              <div class="drawer-title">{{ drawerItem.description }}</div>
              <div class="drawer-sub">
                <span class="type-chip" [class]="typeClass(drawerItem.item_type)">
                  {{ typeLabel(drawerItem.item_type) }}
                </span>
                <span class="muted">{{ drawerChildren.length }} detalle{{ drawerChildren.length === 1 ? '' : 's' }}</span>
              </div>
            </div>
            <button mat-icon-button (click)="closeDrawer()" matTooltip="Cerrar">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <div class="drawer-body">
            <section class="drawer-section">
              <h4>Item</h4>
              <mat-form-field appearance="outline" class="full-width" subscriptSizing="dynamic">
                <mat-label>Descripcion</mat-label>
                <input matInput [(ngModel)]="drawerItem.description">
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width" subscriptSizing="dynamic">
                <mat-label>Tipo</mat-label>
                <mat-select [(ngModel)]="drawerItem.item_type">
                  <mat-option value="mano_de_obra">Mano de obra</mat-option>
                  <mat-option value="repuesto">Repuesto</mat-option>
                  <mat-option value="otro">Otro</mat-option>
                </mat-select>
              </mat-form-field>
            </section>

            <section class="drawer-section">
              <div class="section-head">
                <h4>Detalles</h4>
                <button mat-stroked-button (click)="addDrawerChild()">
                  <mat-icon>add</mat-icon> Agregar detalle
                </button>
              </div>
              @if (drawerChildren.length === 0) {
                <p class="muted center">Sin detalles. Este item se sugiere como linea simple.</p>
              } @else {
                <div class="drawer-children">
                  @for (c of drawerChildren; track $index; let i = $index) {
                    <div class="dc-row">
                      <mat-icon class="drag-h">drag_indicator</mat-icon>
                      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="grow">
                        <input matInput [(ngModel)]="c.description"
                               (keydown.enter)="onDrawerChildEnter($event, i)"
                               placeholder="Detalle">
                      </mat-form-field>
                      <button mat-icon-button (click)="moveDrawerChild(i, -1)"
                              [disabled]="i === 0" matTooltip="Subir">
                        <mat-icon>arrow_upward</mat-icon>
                      </button>
                      <button mat-icon-button (click)="moveDrawerChild(i, 1)"
                              [disabled]="i === drawerChildren.length - 1" matTooltip="Bajar">
                        <mat-icon>arrow_downward</mat-icon>
                      </button>
                      <button mat-icon-button (click)="removeDrawerChild(i)"
                              matTooltip="Eliminar">
                        <mat-icon>delete_outline</mat-icon>
                      </button>
                    </div>
                  }
                </div>
              }
            </section>
          </div>

          <div class="drawer-foot">
            <button mat-button (click)="closeDrawer()">Cancelar</button>
            <button mat-raised-button color="primary"
                    [disabled]="drawerSaving || !drawerItem.description.trim()"
                    (click)="saveDrawer()">
              {{ drawerSaving ? 'Guardando...' : 'Guardar cambios' }}
            </button>
          </div>
        }
      </mat-drawer>

      <mat-drawer-content>
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

          <mat-tab-group dynamicHeight animationDuration="180ms" [(selectedIndex)]="activeTab">
            <!-- ============ TAB 1: CATALOGO ============ -->
            <mat-tab>
              <ng-template mat-tab-label>
                <mat-icon class="tab-icon">inventory_2</mat-icon>
                <span>Catalogo</span>
                <span class="tab-count">{{ items.length }}</span>
              </ng-template>

              <div class="tab-panel">
                <div class="toolbar">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search">
                    <mat-icon matPrefix>search</mat-icon>
                    <mat-label>Buscar (atajo: /)</mat-label>
                    <input matInput #searchInput
                           [(ngModel)]="filterQ"
                           (ngModelChange)="onFilterChange()">
                    @if (filterQ) {
                      <button matSuffix mat-icon-button (click)="clearFilter()" aria-label="Limpiar">
                        <mat-icon>close</mat-icon>
                      </button>
                    }
                  </mat-form-field>
                  <mat-button-toggle-group [(ngModel)]="filterType" (change)="onFilterChange()">
                    <mat-button-toggle [value]="''">Todos</mat-button-toggle>
                    <mat-button-toggle value="mano_de_obra">Mano obra</mat-button-toggle>
                    <mat-button-toggle value="repuesto">Repuesto</mat-button-toggle>
                    <mat-button-toggle value="otro">Otro</mat-button-toggle>
                  </mat-button-toggle-group>
                </div>

                @if (loading) {
                  <div class="loading"><mat-spinner diameter="32"></mat-spinner></div>
                } @else if (items.length === 0) {
                  <div class="empty">
                    <mat-icon>inventory_2</mat-icon>
                    <h3>El catalogo esta vacio</h3>
                    @if (suggestionRows.length > 0) {
                      <p>Tenes {{ suggestionRows.length }} sugerencia{{ suggestionRows.length === 1 ? '' : 's' }} basadas en el historico.</p>
                      <button mat-raised-button color="primary" (click)="activeTab = 1">
                        Ver sugerencias
                      </button>
                    } @else {
                      <p>Agrega items con el boton "Nuevo item" para empezar.</p>
                    }
                  </div>
                } @else {
                  <div class="catalog-tree">
                    @for (item of items; track item.id) {
                      <div class="tree-row" [class.has-children]="(item.children?.length || 0) > 0">
                        <button mat-icon-button class="caret"
                                [disabled]="(item.children?.length || 0) === 0"
                                (click)="toggleRow(item)"
                                [matTooltip]="item._expanded ? 'Colapsar' : 'Expandir'">
                          @if ((item.children?.length || 0) > 0) {
                            <mat-icon>{{ item._expanded ? 'expand_more' : 'chevron_right' }}</mat-icon>
                          }
                        </button>

                        <div class="tree-main" (click)="openDrawer(item)">
                          <div class="tree-desc" [innerHTML]="highlight(item.description)"></div>
                          @if ((item.children?.length || 0) > 0) {
                            <span class="children-count" matTooltip="Incluye detalles">
                              <mat-icon>format_list_bulleted</mat-icon>
                              {{ item.children?.length }}
                            </span>
                          }
                        </div>

                        <button class="type-chip type-chip-btn"
                                [class]="typeClass(item.item_type)"
                                [matMenuTriggerFor]="typeMenu"
                                (click)="$event.stopPropagation()"
                                matTooltip="Cambiar tipo">
                          {{ typeLabel(item.item_type) }}
                          <mat-icon class="chip-caret">arrow_drop_down</mat-icon>
                        </button>
                        <mat-menu #typeMenu="matMenu">
                          <button mat-menu-item (click)="changeType(item, 'mano_de_obra')">
                            <span class="dot chip-mo"></span> Mano de obra
                          </button>
                          <button mat-menu-item (click)="changeType(item, 'repuesto')">
                            <span class="dot chip-rp"></span> Repuesto
                          </button>
                          <button mat-menu-item (click)="changeType(item, 'otro')">
                            <span class="dot chip-ot"></span> Otro
                          </button>
                        </mat-menu>

                        <div class="tree-actions">
                          <button mat-icon-button (click)="openDrawer(item); $event.stopPropagation()"
                                  matTooltip="Editar">
                            <mat-icon>edit</mat-icon>
                          </button>
                          <button mat-icon-button color="warn"
                                  (click)="confirmDelete(item); $event.stopPropagation()"
                                  matTooltip="Eliminar">
                            <mat-icon>delete_outline</mat-icon>
                          </button>
                        </div>
                      </div>

                      @if (item._expanded && (item.children?.length || 0) > 0) {
                        <div class="tree-children">
                          @for (c of item.children; track c.id || c.description) {
                            <div class="tree-child">
                              <mat-icon class="leaf">subdirectory_arrow_right</mat-icon>
                              <span>{{ c.description }}</span>
                            </div>
                          }
                        </div>
                      }
                    }
                  </div>
                }
              </div>
            </mat-tab>

            <!-- ============ TAB 2: SUGERENCIAS ============ -->
            <mat-tab>
              <ng-template mat-tab-label>
                <mat-icon class="tab-icon">auto_awesome</mat-icon>
                <span>Sugerencias</span>
                @if (visibleSuggestions().length > 0) {
                  <span class="tab-count badge-primary">{{ visibleSuggestions().length }}</span>
                }
              </ng-template>

              <div class="tab-panel">
                <div class="sugg-toolbar">
                  <div>
                    <h3>Sugerencias del historico</h3>
                    <p class="muted">Items mas usados en trabajos pero que aun no estan en el catalogo. Agregalos en lote.</p>
                  </div>
                  <div class="sugg-toolbar-actions">
                    <button mat-stroked-button (click)="loadSuggestions()" matTooltip="Refrescar">
                      <mat-icon>refresh</mat-icon> Refrescar
                    </button>
                  </div>
                </div>

                @if (loadingSuggestions) {
                  <div class="loading"><mat-spinner diameter="32"></mat-spinner></div>
                } @else if (visibleSuggestions().length === 0) {
                  <div class="empty">
                    <mat-icon>check_circle</mat-icon>
                    <h3>No hay sugerencias pendientes</h3>
                    <p>Cuando los usuarios agreguen items nuevos en los trabajos, los mas usados van a aparecer aca.</p>
                  </div>
                } @else {
                  <div class="sugg-bar">
                    <mat-checkbox [checked]="allSelected"
                                  [indeterminate]="selectedCount > 0 && !allSelected"
                                  (change)="toggleSelectAll()">
                      Seleccionar todo
                    </mat-checkbox>
                    <span class="muted">{{ selectedCount }} de {{ visibleSuggestions().length }} seleccionado{{ selectedCount === 1 ? '' : 's' }}</span>
                    <div class="grow"></div>
                    <button mat-raised-button color="primary"
                            [disabled]="selectedCount === 0 || addingBulk"
                            (click)="addSelectedToCatalog()">
                      <mat-icon>add</mat-icon>
                      {{ addingBulk ? 'Agregando...' : 'Agregar al catalogo (' + selectedCount + ')' }}
                    </button>
                  </div>

                  <div class="sugg-grid">
                    @for (s of visibleSuggestions(); track s.description) {
                      <div class="sugg-card" [class.selected]="s._selected">
                        <div class="sugg-card-head" (click)="toggleSuggestion(s)">
                          <mat-checkbox [(ngModel)]="s._selected"
                                        (click)="$event.stopPropagation()"
                                        (change)="recomputeSelection()"></mat-checkbox>
                          <div class="sugg-main">
                            <div class="sugg-desc">{{ s.description }}</div>
                            <div class="sugg-meta">
                              <span class="type-chip" [class]="typeClass(s.item_type)">
                                {{ typeLabel(s.item_type) }}
                              </span>
                              @if (s.children.length > 0) {
                                <span class="children-count">
                                  <mat-icon>format_list_bulleted</mat-icon>
                                  {{ s.children.length }} detalle{{ s.children.length === 1 ? '' : 's' }}
                                </span>
                              }
                              <span class="muted dot-sep">·</span>
                              <span class="muted">Usado {{ s.uses }} {{ s.uses === 1 ? 'vez' : 'veces' }}</span>
                            </div>
                          </div>
                          <button mat-icon-button
                                  (click)="dismissSuggestion(s); $event.stopPropagation()"
                                  matTooltip="Descartar de la lista">
                            <mat-icon>close</mat-icon>
                          </button>
                        </div>

                        @if (s.children.length > 0) {
                          <div class="sugg-children">
                            @for (c of s.children; track $index) {
                              <span class="child-chip">{{ c.description }}</span>
                            }
                          </div>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            </mat-tab>
          </mat-tab-group>
        </main>
      </mat-drawer-content>
    </mat-drawer-container>
  `,
  styles: [`
    .catalog-shell { height: calc(100vh - 56px); background: var(--bg); }
    .content { padding: 20px 24px 32px; max-width: 1200px; margin: 0 auto; }

    .page-head {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 12px; gap: 16px;
    }
    .page-head h1 { margin: 0; font-size: 22px; font-weight: 700; }
    .page-sub { margin: 4px 0 0; color: var(--text-2); font-size: 13px; }

    /* ===== Tabs ===== */
    .tab-icon { margin-right: 6px; font-size: 18px; width: 18px; height: 18px; vertical-align: middle; }
    .tab-count {
      margin-left: 8px;
      padding: 1px 8px;
      background: var(--bg);
      color: var(--text-2);
      font-size: 11px;
      font-weight: 600;
      border-radius: 999px;
    }
    .tab-count.badge-primary { background: var(--navy); color: #fff; }

    .tab-panel { padding: 20px 4px; }

    /* ===== Toolbar (catalogo) ===== */
    .toolbar {
      display: flex; gap: 12px; align-items: center;
      margin-bottom: 14px; flex-wrap: wrap;
    }
    .toolbar .search { flex: 1; min-width: 240px; }

    /* ===== Tree ===== */
    .catalog-tree {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      overflow: hidden;
    }
    .tree-row {
      display: grid;
      grid-template-columns: 36px 1fr auto auto;
      align-items: center;
      gap: 8px;
      padding: 6px 12px 6px 4px;
      border-bottom: 1px solid var(--border);
      transition: background .12s;
    }
    .tree-row:last-of-type { border-bottom: none; }
    .tree-row:hover { background: var(--bg); }
    .tree-row .caret { color: var(--text-2); }
    .tree-row .caret[disabled] { opacity: 0; pointer-events: none; }

    .tree-main {
      display: flex; align-items: center; gap: 10px;
      cursor: pointer; min-width: 0;
    }
    .tree-desc {
      font-size: 14px; font-weight: 500; color: var(--text-1);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .tree-desc :global(mark) {
      background: #fff3a3; color: inherit; border-radius: 2px; padding: 0 1px;
    }
    .children-count {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px;
      background: var(--bg);
      color: var(--text-2);
      font-size: 11px; font-weight: 600;
      border-radius: 999px;
    }
    .children-count mat-icon { font-size: 13px; width: 13px; height: 13px; }

    .tree-actions { display: flex; gap: 0; }

    .tree-children {
      background: var(--bg);
      padding: 4px 12px 8px 56px;
      border-bottom: 1px solid var(--border);
    }
    .tree-child {
      display: flex; align-items: center; gap: 6px;
      padding: 4px 0; color: var(--text-2); font-size: 13px;
    }
    .tree-child .leaf { color: var(--text-3); font-size: 16px; width: 16px; height: 16px; }

    /* ===== Type chip ===== */
    .type-chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px;
      font-size: 11px; font-weight: 600;
      border-radius: 999px;
      letter-spacing: .02em;
      white-space: nowrap;
    }
    .type-chip-btn {
      border: none; cursor: pointer; font-family: inherit;
    }
    .type-chip-btn .chip-caret { font-size: 14px; width: 14px; height: 14px; opacity: .8; }
    .type-chip-btn:hover { filter: brightness(.96); }

    .chip-mo { background: #e1f2ff; color: #0b4f86; }
    .chip-rp { background: #ffe9d5; color: #8a3b07; }
    .chip-ot { background: #ececec; color: #4a4a4a; }

    .dot {
      display: inline-block; width: 10px; height: 10px;
      border-radius: 50%; margin-right: 8px;
    }
    .dot.chip-mo { background: #4ea8e0; }
    .dot.chip-rp { background: #e88a3f; }
    .dot.chip-ot { background: #9a9a9a; }

    /* ===== Empty / loading ===== */
    .loading { display: flex; justify-content: center; padding: 40px; }
    .empty {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 48px 16px; color: var(--text-2); text-align: center; gap: 10px;
      background: var(--surface);
      border: 1px dashed var(--border);
      border-radius: var(--r-md);
    }
    .empty mat-icon { font-size: 40px; width: 40px; height: 40px; color: var(--text-3); }
    .empty h3 { margin: 0; font-size: 16px; color: var(--text-1); }
    .empty p { margin: 0; font-size: 13px; max-width: 360px; }

    /* ===== Sugerencias ===== */
    .sugg-toolbar {
      display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
      margin-bottom: 16px;
    }
    .sugg-toolbar h3 { margin: 0; font-size: 16px; }
    .muted { color: var(--text-2); font-size: 12px; margin: 4px 0 0; }
    .dot-sep { font-size: 12px; margin: 0 2px; }

    .sugg-bar {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r-sm);
      margin-bottom: 12px;
      position: sticky; top: 0; z-index: 2;
    }
    .sugg-bar .grow { flex: 1; }

    .sugg-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 12px;
    }
    .sugg-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      overflow: hidden;
      transition: border-color .14s, box-shadow .14s, transform .14s;
    }
    .sugg-card:hover { border-color: var(--text-3); }
    .sugg-card.selected {
      border-color: var(--navy);
      box-shadow: 0 0 0 1px var(--navy);
    }
    .sugg-card-head {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 10px; align-items: flex-start;
      padding: 12px 14px;
      cursor: pointer;
    }
    .sugg-main { min-width: 0; }
    .sugg-desc { font-size: 14px; font-weight: 600; color: var(--text-1); }
    .sugg-meta {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      margin-top: 6px;
    }
    .sugg-children {
      display: flex; flex-wrap: wrap; gap: 6px;
      padding: 10px 14px 14px;
      border-top: 1px dashed var(--border);
      background: var(--bg);
    }
    .child-chip {
      display: inline-block;
      padding: 3px 10px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 12px;
      color: var(--text-1);
    }

    /* ===== Drawer ===== */
    mat-drawer { width: min(520px, 100%); }
    .drawer-head {
      display: flex; justify-content: space-between; align-items: flex-start;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      position: sticky; top: 0; z-index: 1;
    }
    .drawer-title { font-size: 16px; font-weight: 700; color: var(--text-1); }
    .drawer-sub { display: flex; align-items: center; gap: 10px; margin-top: 6px; }

    .drawer-body { padding: 16px 20px 80px; overflow-y: auto; height: calc(100% - 130px); }
    .drawer-section { margin-bottom: 24px; }
    .drawer-section h4 { margin: 0 0 8px; font-size: 13px; color: var(--text-2); text-transform: uppercase; letter-spacing: .04em; }
    .section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .section-head h4 { margin: 0; }
    .full-width { width: 100%; margin-bottom: 8px; }
    .center { text-align: center; }
    .drawer-children { display: flex; flex-direction: column; gap: 6px; }
    .dc-row {
      display: grid;
      grid-template-columns: 18px 1fr auto auto auto;
      gap: 4px; align-items: center;
    }
    .dc-row .grow { width: 100%; }
    .drag-h { color: var(--text-3); font-size: 18px; width: 18px; height: 18px; }

    .drawer-foot {
      position: sticky; bottom: 0;
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 12px 20px;
      background: var(--surface);
      border-top: 1px solid var(--border);
    }
  `],
})
export class CatalogListComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('drawer') drawer?: MatDrawer;

  items: CatalogRow[] = [];
  suggestions: SuggestionRow[] = [];
  dismissed = new Set<string>();

  activeTab = 0;
  filterQ = '';
  filterType: ItemType | '' = '';
  loading = false;
  loadingSuggestions = false;
  addingBulk = false;
  selectedCount = 0;
  allSelected = false;

  editingId: string | null = null;
  drawerItem: { id: string; description: string; item_type: ItemType } | null = null;
  drawerChildren: { id?: string; description: string }[] = [];
  drawerSaving = false;

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

  ngAfterViewInit() {}

  ngOnDestroy() {
    clearTimeout(this.filterTimer);
  }

  /* ----- Catalogo ----- */
  load() {
    this.loading = true;
    const params: Record<string, string> = {};
    if (this.filterQ.trim()) params['q'] = this.filterQ.trim();
    if (this.filterType) params['item_type'] = this.filterType;
    this.api.listCatalog(params).subscribe({
      next: (rows) => {
        const expandedIds = new Set(this.items.filter(i => i._expanded).map(i => i.id));
        this.items = rows.map(r => ({ ...r, _expanded: expandedIds.has(r.id) }));
        this.loading = false;
      },
      error: (err) => { this.notify.handleError(err); this.loading = false; },
    });
  }

  onFilterChange() {
    clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => this.load(), 200);
  }

  clearFilter() {
    this.filterQ = '';
    this.load();
    this.searchInput?.nativeElement.focus();
  }

  toggleRow(item: CatalogRow) {
    item._expanded = !item._expanded;
  }

  highlight(text: string): string {
    const q = this.filterQ.trim();
    if (!q) return this.escapeHtml(text);
    const esc = this.escapeHtml(text);
    const re = new RegExp(`(${this.escapeRegex(q)})`, 'gi');
    return esc.replace(re, '<mark>$1</mark>');
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  typeLabel(t: ItemType) { return TYPE_LABEL[t]; }
  typeClass(t: ItemType) { return TYPE_CLASS[t]; }

  changeType(item: CatalogRow, t: ItemType) {
    if (item.item_type === t) return;
    const prev = item.item_type;
    item.item_type = t;
    this.api.updateCatalogItem(item.id, { item_type: t }).subscribe({
      next: () => this.notify.success('Tipo actualizado'),
      error: (err) => {
        item.item_type = prev;
        this.notify.handleError(err);
      },
    });
  }

  openForm(seed?: { description: string; item_type: ItemType; children?: CatalogChild[] }) {
    const ref = this.dialog.open(CatalogFormDialogComponent, {
      width: '560px',
      data: seed ? { seed } : null,
    });
    ref.afterClosed().subscribe((created: CatalogItem | undefined) => {
      if (created) {
        this.notify.success('Item agregado al catalogo');
        this.load();
        this.loadSuggestions();
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
        if (this.editingId === item.id) this.closeDrawer();
        this.load();
        this.loadSuggestions();
      },
      error: (err) => this.notify.handleError(err),
    });
  }

  /* ----- Drawer ----- */
  openDrawer(item: CatalogItem) {
    this.editingId = item.id;
    this.drawerItem = {
      id: item.id,
      description: item.description,
      item_type: item.item_type,
    };
    this.drawerChildren = (item.children || []).map(c => ({ id: c.id, description: c.description }));
  }

  closeDrawer() {
    this.editingId = null;
    this.drawerItem = null;
    this.drawerChildren = [];
  }

  addDrawerChild() {
    this.drawerChildren.push({ description: '' });
  }

  removeDrawerChild(i: number) {
    this.drawerChildren.splice(i, 1);
  }

  moveDrawerChild(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= this.drawerChildren.length) return;
    const [moved] = this.drawerChildren.splice(i, 1);
    this.drawerChildren.splice(j, 0, moved);
  }

  onDrawerChildEnter(e: Event, i: number) {
    e.preventDefault();
    if (i === this.drawerChildren.length - 1) this.addDrawerChild();
  }

  saveDrawer() {
    if (!this.drawerItem) return;
    this.drawerSaving = true;
    const id = this.drawerItem.id;
    const meta = {
      description: this.drawerItem.description.trim(),
      item_type: this.drawerItem.item_type,
    };
    const children = this.drawerChildren
      .map((c, i) => ({ description: c.description.trim(), sort_order: i }))
      .filter(c => c.description);

    this.api.updateCatalogItem(id, meta).subscribe({
      next: () => {
        this.api.replaceCatalogChildren(id, children).subscribe({
          next: () => {
            this.drawerSaving = false;
            this.notify.success('Cambios guardados');
            this.closeDrawer();
            this.load();
          },
          error: (err) => {
            this.drawerSaving = false;
            this.notify.handleError(err);
          },
        });
      },
      error: (err) => {
        this.drawerSaving = false;
        this.notify.handleError(err);
      },
    });
  }

  /* ----- Sugerencias ----- */
  get suggestionRows() { return this.suggestions; }

  loadSuggestions() {
    this.loadingSuggestions = true;
    this.api.getCatalogSuggestions().subscribe({
      next: (rows) => {
        this.suggestions = rows.map(r => ({ ...r, _selected: false, _expanded: false }));
        this.loadingSuggestions = false;
        this.recomputeSelection();
      },
      error: (err) => { this.notify.handleError(err); this.loadingSuggestions = false; },
    });
  }

  visibleSuggestions(): SuggestionRow[] {
    return this.suggestions.filter(s => !this.dismissed.has(this.suggKey(s)));
  }

  private suggKey(s: CatalogSuggestion): string {
    const childKey = (s.children || []).map(c => c.description.toLowerCase().trim()).sort().join('|');
    return s.description.toLowerCase().trim() + '#' + childKey;
  }

  toggleSuggestion(s: SuggestionRow) {
    s._selected = !s._selected;
    this.recomputeSelection();
  }

  dismissSuggestion(s: SuggestionRow) {
    this.dismissed.add(this.suggKey(s));
    s._selected = false;
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
    for (const s of visible) s._selected = next;
    this.recomputeSelection();
  }

  addSelectedToCatalog() {
    const selected = this.visibleSuggestions().filter(s => s._selected);
    if (selected.length === 0) return;
    this.addingBulk = true;
    const payload = selected.map(s => ({
      description: s.description,
      item_type: s.item_type,
      children: s.children.map((c, i) => ({ description: c.description, sort_order: i })),
    }));
    this.api.bulkCreateCatalogItems(payload).subscribe({
      next: (res) => {
        this.addingBulk = false;
        const ins = res.inserted.length;
        const dup = res.skipped.filter(x => x.reason === 'duplicate').length;
        let msg = `${ins} ${ins === 1 ? 'item agregado' : 'items agregados'} al catalogo`;
        if (dup > 0) msg += ` (${dup} duplicado${dup === 1 ? '' : 's'})`;
        this.notify.success(msg);
        for (const s of selected) this.dismissed.add(this.suggKey(s));
        this.load();
        this.loadSuggestions();
      },
      error: (err) => {
        this.addingBulk = false;
        this.notify.handleError(err);
      },
    });
  }

  /* ----- Atajos ----- */
  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (e.key === '/' && !this.isTypingInField(e)) {
      e.preventDefault();
      this.activeTab = 0;
      setTimeout(() => this.searchInput?.nativeElement.focus(), 0);
    } else if (e.key === 'Escape' && this.editingId) {
      this.closeDrawer();
    }
  }

  private isTypingInField(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }
}
