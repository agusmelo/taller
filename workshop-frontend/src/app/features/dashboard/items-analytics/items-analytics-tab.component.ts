import { Component, EventEmitter, Input, OnInit, Output, ViewChild, ElementRef, OnDestroy, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSort, MatSortModule, Sort } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule, MatChipListboxChange } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Subject, debounceTime, BehaviorSubject } from 'rxjs';

import { ApiService } from '../../../core/services/api.service';
import { AppCurrencyPipe } from '../../../shared/pipes/currency.pipe';
import {
  ItemAnalyticsFilters, ItemRankingResponse, ItemRankingRow,
  ItemMixResponse, ItemPriceDispersionResponse, ItemPriceDispersionRow,
  AdhocCandidatesResponse, AdhocCandidateRow, ItemType,
} from '../../../core/models';
import { CatalogFormDialogComponent } from '../../jobs/catalog/catalog-list.component';
import Chart from 'chart.js/auto';

function typeLabel(t: ItemType | string): string {
  switch (t) {
    case 'mano_de_obra': return 'Mano de obra';
    case 'repuesto':     return 'Repuesto';
    case 'otro':         return 'Otro';
    default:             return t || '-';
  }
}

@Component({
  selector: 'app-items-analytics-tab',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatTableModule, MatPaginatorModule,
    MatSortModule, MatButtonModule, MatIconModule, MatTooltipModule, MatChipsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonToggleModule,
    MatDatepickerModule, MatNativeDateModule, MatDialogModule, AppCurrencyPipe,
  ],
  template: `
    <!-- Filters bar -->
    <mat-card class="mb-16">
      <mat-card-content>
        <div class="filters-grid">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Desde</mat-label>
            <input matInput [matDatepicker]="fromPicker" [(ngModel)]="dateFrom" (dateChange)="onFiltersChange()">
            <mat-datepicker-toggle matIconSuffix [for]="fromPicker"></mat-datepicker-toggle>
            <mat-datepicker #fromPicker></mat-datepicker>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Hasta</mat-label>
            <input matInput [matDatepicker]="toPicker" [(ngModel)]="dateTo" (dateChange)="onFiltersChange()">
            <mat-datepicker-toggle matIconSuffix [for]="toPicker"></mat-datepicker-toggle>
            <mat-datepicker #toPicker></mat-datepicker>
          </mat-form-field>

          <div class="toggle-group">
            <label class="toggle-label">Base</label>
            <mat-button-toggle-group [(value)]="filters.basis" (change)="onFiltersChange()">
              <mat-button-toggle value="invoiced">Facturado</mat-button-toggle>
              <mat-button-toggle value="collected">Cobrado</mat-button-toggle>
            </mat-button-toggle-group>
          </div>

          <div class="toggle-group">
            <label class="toggle-label">Jerarquia</label>
            <mat-button-toggle-group [(value)]="filters.hierarchy" (change)="onFiltersChange()">
              <mat-button-toggle value="parent">Padres</mat-button-toggle>
              <mat-button-toggle value="child">Hijos</mat-button-toggle>
              <mat-button-toggle value="all">Ambos</mat-button-toggle>
            </mat-button-toggle-group>
          </div>

          <div class="toggle-group">
            <label class="toggle-label">Origen</label>
            <mat-button-toggle-group [(value)]="filters.origin" (change)="onFiltersChange()">
              <mat-button-toggle value="all">Todos</mat-button-toggle>
              <mat-button-toggle value="catalog">Catalogo</mat-button-toggle>
              <mat-button-toggle value="adhoc">Ad-hoc</mat-button-toggle>
            </mat-button-toggle-group>
          </div>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Marca de vehiculo</mat-label>
            <input matInput [(ngModel)]="filters.make" (ngModelChange)="onFiltersChangeDebounced()" placeholder="Toyota, Ford...">
          </mat-form-field>

          <div class="chips-row">
            <span class="toggle-label">Tipo de item</span>
            <mat-chip-listbox multiple [value]="selectedTypes" (change)="onTypesChange($event)">
              <mat-chip-option value="mano_de_obra">Mano de obra</mat-chip-option>
              <mat-chip-option value="repuesto">Repuesto</mat-chip-option>
              <mat-chip-option value="otro">Otro</mat-chip-option>
            </mat-chip-listbox>
          </div>

          <button mat-stroked-button (click)="resetFilters()" class="reset-btn">
            <mat-icon>restart_alt</mat-icon> Limpiar
          </button>
        </div>
      </mat-card-content>
    </mat-card>

    <!-- Ranking -->
    <mat-card class="mb-16">
      <mat-card-content>
        <div class="card-head">
          <h3 class="card-title-lg">Top items por uso</h3>
          <span class="muted">
            {{ rankingResp?.total || 0 }} grupo(s)
            <ng-container *ngIf="rankingResp?.revenue_total as r"> &middot; {{ r | appCurrency }} totales</ng-container>
          </span>
        </div>
        <table mat-table [dataSource]="rankingRows" matSort (matSortChange)="onSortChange($event)"
               [matSortActive]="sort" [matSortDirection]="order" class="full-width">
          <ng-container matColumnDef="label">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Item</th>
            <td mat-cell *matCellDef="let r">
              <div class="cell-stack">
                <span>{{ r.label }}</span>
                <span class="muted small" *ngIf="r.origin === 'adhoc'">agrupa items sin catalogo</span>
              </div>
            </td>
          </ng-container>
          <ng-container matColumnDef="item_type">
            <th mat-header-cell *matHeaderCellDef>Tipo</th>
            <td mat-cell *matCellDef="let r">
              <span class="type-chip" [class]="'tc-' + r.item_type">{{ typeLabel(r.item_type) }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="usage_count">
            <th mat-header-cell *matHeaderCellDef mat-sort-header class="text-right">Usos</th>
            <td mat-cell *matCellDef="let r" class="text-right">{{ r.usage_count }}</td>
          </ng-container>
          <ng-container matColumnDef="units">
            <th mat-header-cell *matHeaderCellDef mat-sort-header class="text-right">Unidades</th>
            <td mat-cell *matCellDef="let r" class="text-right">{{ r.units | number:'1.0-2' }}</td>
          </ng-container>
          <ng-container matColumnDef="revenue">
            <th mat-header-cell *matHeaderCellDef mat-sort-header class="text-right">Ingreso</th>
            <td mat-cell *matCellDef="let r" class="text-right">{{ r.revenue | appCurrency }}</td>
          </ng-container>
          <ng-container matColumnDef="revenue_pct">
            <th mat-header-cell *matHeaderCellDef class="text-right">%</th>
            <td mat-cell *matCellDef="let r" class="text-right">{{ r.revenue_pct }}%</td>
          </ng-container>
          <ng-container matColumnDef="last_used">
            <th mat-header-cell *matHeaderCellDef mat-sort-header class="text-right">Ultimo uso</th>
            <td mat-cell *matCellDef="let r" class="text-right">{{ r.last_used ? (r.last_used | date:'dd/MM/yyyy') : '-' }}</td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="rankingColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: rankingColumns;"></tr>
        </table>
        <mat-paginator
          [length]="rankingResp?.total || 0"
          [pageSize]="pageSize"
          [pageIndex]="page - 1"
          [pageSizeOptions]="[10, 25, 50]"
          (page)="onPage($event)"
          showFirstLastButtons>
        </mat-paginator>
        <div *ngIf="!loadingRanking && rankingRows.length === 0" class="empty-state">
          <mat-icon>inventory_2</mat-icon><p>Sin items en este rango</p>
        </div>
      </mat-card-content>
    </mat-card>

    <!-- Mix charts -->
    <mat-card class="mb-16">
      <mat-card-content>
        <h3 class="card-title-lg">Mix por tipo</h3>
        <div class="charts-row">
          <div class="chart-cell"><canvas #donutCanvas></canvas></div>
          <div class="chart-cell wide"><canvas #monthlyCanvas height="100"></canvas></div>
        </div>
        <div *ngIf="mixResp && mixResp.by_type.length === 0" class="empty-state">
          <mat-icon>donut_large</mat-icon><p>Sin datos para graficar</p>
        </div>
      </mat-card-content>
    </mat-card>

    <!-- Price dispersion -->
    <mat-card class="mb-16">
      <mat-card-content>
        <h3 class="card-title-lg">Precio promedio y dispersion (catalogo)</h3>
        <table mat-table [dataSource]="dispersionRows" class="full-width">
          <ng-container matColumnDef="label">
            <th mat-header-cell *matHeaderCellDef>Item</th>
            <td mat-cell *matCellDef="let r">
              <div class="cell-stack">
                <span>
                  {{ r.label }}
                  <span *ngIf="r.is_outlier" class="badge-outlier"
                        matTooltip="Dispersion alta: coeficiente de variacion > 0.30 o maximo >= 2x el minimo">
                    outlier
                  </span>
                </span>
                <span class="muted small">{{ typeLabel(r.item_type) }}</span>
              </div>
            </td>
          </ng-container>
          <ng-container matColumnDef="n_uses">
            <th mat-header-cell *matHeaderCellDef class="text-right">N</th>
            <td mat-cell *matCellDef="let r" class="text-right">{{ r.n_uses }}</td>
          </ng-container>
          <ng-container matColumnDef="avg_price">
            <th mat-header-cell *matHeaderCellDef class="text-right">Promedio</th>
            <td mat-cell *matCellDef="let r" class="text-right">{{ r.avg_price | appCurrency }}</td>
          </ng-container>
          <ng-container matColumnDef="min_price">
            <th mat-header-cell *matHeaderCellDef class="text-right">Min</th>
            <td mat-cell *matCellDef="let r" class="text-right">{{ r.min_price | appCurrency }}</td>
          </ng-container>
          <ng-container matColumnDef="max_price">
            <th mat-header-cell *matHeaderCellDef class="text-right">Max</th>
            <td mat-cell *matCellDef="let r" class="text-right">{{ r.max_price | appCurrency }}</td>
          </ng-container>
          <ng-container matColumnDef="cv">
            <th mat-header-cell *matHeaderCellDef class="text-right">CV</th>
            <td mat-cell *matCellDef="let r" class="text-right">{{ (r.cv * 100) | number:'1.0-1' }}%</td>
          </ng-container>
          <ng-container matColumnDef="last_used">
            <th mat-header-cell *matHeaderCellDef class="text-right">Ultimo uso</th>
            <td mat-cell *matCellDef="let r" class="text-right">{{ r.last_used ? (r.last_used | date:'dd/MM/yyyy') : '-' }}</td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="dispersionColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: dispersionColumns;"></tr>
        </table>
        <div *ngIf="!loadingDispersion && dispersionRows.length === 0" class="empty-state">
          <mat-icon>price_change</mat-icon><p>Sin items de catalogo con usos en este rango</p>
        </div>
      </mat-card-content>
    </mat-card>

    <!-- Ad-hoc candidates -->
    <mat-card>
      <mat-card-content>
        <div class="card-head">
          <h3 class="card-title-lg">Candidatos a catalogar</h3>
          <span class="muted">items ad-hoc mas frecuentes</span>
        </div>
        <table mat-table [dataSource]="adhocRows" class="full-width">
          <ng-container matColumnDef="sample_description">
            <th mat-header-cell *matHeaderCellDef>Descripcion</th>
            <td mat-cell *matCellDef="let r">{{ r.sample_description }}</td>
          </ng-container>
          <ng-container matColumnDef="item_type">
            <th mat-header-cell *matHeaderCellDef>Tipo</th>
            <td mat-cell *matCellDef="let r">
              <span class="type-chip" [class]="'tc-' + r.item_type">{{ typeLabel(r.item_type) }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="usage_count">
            <th mat-header-cell *matHeaderCellDef class="text-right">Usos</th>
            <td mat-cell *matCellDef="let r" class="text-right">{{ r.usage_count }}</td>
          </ng-container>
          <ng-container matColumnDef="distinct_jobs">
            <th mat-header-cell *matHeaderCellDef class="text-right">Trabajos</th>
            <td mat-cell *matCellDef="let r" class="text-right">{{ r.distinct_jobs }}</td>
          </ng-container>
          <ng-container matColumnDef="avg_price">
            <th mat-header-cell *matHeaderCellDef class="text-right">Precio prom.</th>
            <td mat-cell *matCellDef="let r" class="text-right">{{ r.avg_price | appCurrency }}</td>
          </ng-container>
          <ng-container matColumnDef="last_used">
            <th mat-header-cell *matHeaderCellDef class="text-right">Ultimo uso</th>
            <td mat-cell *matCellDef="let r" class="text-right">{{ r.last_used ? (r.last_used | date:'dd/MM/yyyy') : '-' }}</td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef class="text-right">Accion</th>
            <td mat-cell *matCellDef="let r" class="text-right">
              <button mat-stroked-button color="primary" (click)="addToCatalog(r)">
                <mat-icon>add</mat-icon> Catalogar
              </button>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="adhocColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: adhocColumns;"></tr>
        </table>
        <div *ngIf="!loadingAdhoc && adhocRows.length === 0" class="empty-state">
          <mat-icon>fact_check</mat-icon><p>Sin candidatos ad-hoc</p>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .full-width { width: 100%; }
    .mb-16 { margin-bottom: 16px; }
    .card-head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
    .card-title-lg { margin: 0; }
    .muted { color: var(--text-3); font-size: 12px; }
    .small { font-size: 11px; }
    .cell-stack { display: flex; flex-direction: column; gap: 2px; }
    .text-right { text-align: right; }
    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 24px; color: var(--text-3); }
    .empty-state mat-icon { font-size: 32px; width: 32px; height: 32px; }

    .filters-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      align-items: end;
    }
    .toggle-group { display: flex; flex-direction: column; gap: 4px; }
    .toggle-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--text-3); }
    .chips-row { display: flex; flex-direction: column; gap: 6px; grid-column: span 2; }
    .reset-btn { align-self: end; height: 40px; }

    .charts-row { display: grid; grid-template-columns: 240px 1fr; gap: 24px; align-items: center; }
    @media (max-width: 800px) { .charts-row { grid-template-columns: 1fr; } }
    .chart-cell { min-width: 0; }

    .type-chip { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; background: var(--bg); border: 1px solid var(--border2); }
    .type-chip.tc-mano_de_obra { background: #eef2ff; color: #4338ca; border-color: #c7d2fe; }
    .type-chip.tc-repuesto     { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
    .type-chip.tc-otro         { background: #f3f4f6; color: #374151; border-color: #d1d5db; }

    .badge-outlier {
      display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 8px;
      font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
      background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca;
    }
  `],
})
export class ItemsAnalyticsTabComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() set active(val: boolean) {
    const wasInactive = !this._active;
    this._active = val;
    if (val && wasInactive && !this._loadedOnce) {
      this._loadedOnce = true;
      this.reloadAll();
    }
  }
  get active(): boolean { return this._active; }
  private _active = false;
  private _loadedOnce = false;

  @ViewChild('donutCanvas') donutRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('monthlyCanvas') monthlyRef?: ElementRef<HTMLCanvasElement>;

  typeLabel = typeLabel;

  // Filters state
  dateFrom: Date | null = null;
  dateTo: Date | null = null;
  selectedTypes: ItemType[] = [];
  filters: ItemAnalyticsFilters = {
    origin: 'all',
    hierarchy: 'parent',
    basis: 'invoiced',
    make: '',
  };

  // Ranking
  rankingColumns = ['label', 'item_type', 'usage_count', 'units', 'revenue', 'revenue_pct', 'last_used'];
  rankingRows: ItemRankingRow[] = [];
  rankingResp: ItemRankingResponse | null = null;
  page = 1;
  pageSize = 10;
  sort: 'usage_count' | 'units' | 'revenue' | 'last_used' | 'label' = 'usage_count';
  order: 'asc' | 'desc' = 'desc';
  loadingRanking = false;

  // Mix
  mixResp: ItemMixResponse | null = null;
  private donutChart: Chart | null = null;
  private monthlyChart: Chart | null = null;

  // Dispersion
  dispersionColumns = ['label', 'n_uses', 'avg_price', 'min_price', 'max_price', 'cv', 'last_used'];
  dispersionRows: ItemPriceDispersionRow[] = [];
  loadingDispersion = false;

  // Ad-hoc
  adhocColumns = ['sample_description', 'item_type', 'usage_count', 'distinct_jobs', 'avg_price', 'last_used', 'actions'];
  adhocRows: AdhocCandidateRow[] = [];
  loadingAdhoc = false;

  private filtersChange$ = new Subject<void>();

  constructor(private api: ApiService, private dialog: MatDialog, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.filtersChange$.pipe(debounceTime(250)).subscribe(() => this.reloadAll());
  }

  ngAfterViewInit() {
    // If activated before view init, render whatever we have.
    if (this.mixResp) this.renderMixCharts();
  }

  ngOnDestroy() {
    this.donutChart?.destroy();
    this.monthlyChart?.destroy();
  }

  private buildEffectiveFilters(): ItemAnalyticsFilters {
    return {
      ...this.filters,
      date_from: this.dateFrom ? this.formatDate(this.dateFrom) : undefined,
      date_to:   this.dateTo   ? this.formatDate(this.dateTo)   : undefined,
      item_type: this.selectedTypes.length > 0 ? this.selectedTypes.join(',') : undefined,
      make:      this.filters.make?.trim() || undefined,
    };
  }

  onFiltersChange() { this.page = 1; this.reloadAll(); }
  onFiltersChangeDebounced() { this.page = 1; this.filtersChange$.next(); }

  onTypesChange(e: MatChipListboxChange) {
    this.selectedTypes = (e.value as ItemType[]) || [];
    this.onFiltersChange();
  }

  resetFilters() {
    this.dateFrom = null;
    this.dateTo = null;
    this.selectedTypes = [];
    this.filters = { origin: 'all', hierarchy: 'parent', basis: 'invoiced', make: '' };
    this.page = 1;
    this.sort = 'usage_count';
    this.order = 'desc';
    this.reloadAll();
  }

  onPage(e: PageEvent) {
    this.page = e.pageIndex + 1;
    this.pageSize = e.pageSize;
    this.loadRanking();
  }

  onSortChange(s: Sort) {
    if (!s.active || !s.direction) {
      this.sort = 'usage_count';
      this.order = 'desc';
    } else {
      this.sort = s.active as any;
      this.order = s.direction as 'asc' | 'desc';
    }
    this.page = 1;
    this.loadRanking();
  }

  reloadAll() {
    if (!this._active) return;
    this.loadRanking();
    this.loadMix();
    this.loadDispersion();
    this.loadAdhoc();
  }

  loadRanking() {
    this.loadingRanking = true;
    this.api.getItemRanking(this.buildEffectiveFilters(), {
      page: this.page, page_size: this.pageSize, sort: this.sort, order: this.order,
    }).subscribe({
      next: (resp) => {
        this.rankingResp = resp;
        this.rankingRows = resp.rows;
        this.loadingRanking = false;
      },
      error: () => { this.loadingRanking = false; },
    });
  }

  loadMix() {
    this.api.getItemMix(this.buildEffectiveFilters()).subscribe({
      next: (resp) => {
        this.mixResp = resp;
        // Wait for view to be ready
        setTimeout(() => this.renderMixCharts(), 30);
      },
    });
  }

  loadDispersion() {
    this.loadingDispersion = true;
    this.api.getItemPriceDispersion(this.buildEffectiveFilters()).subscribe({
      next: (resp) => { this.dispersionRows = resp.items; this.loadingDispersion = false; },
      error: () => { this.loadingDispersion = false; },
    });
  }

  loadAdhoc() {
    this.loadingAdhoc = true;
    this.api.getAdhocCandidates(this.buildEffectiveFilters(), 25).subscribe({
      next: (resp) => { this.adhocRows = resp.candidates; this.loadingAdhoc = false; },
      error: () => { this.loadingAdhoc = false; },
    });
  }

  addToCatalog(row: AdhocCandidateRow) {
    const ref = this.dialog.open(CatalogFormDialogComponent, {
      data: {
        seed: {
          description: row.sample_description,
          item_type: row.item_type,
          children: [],
        },
      },
      autoFocus: false,
    });
    ref.afterClosed().subscribe((created) => {
      if (created) {
        // Refresh both ad-hoc (item should disappear if linked retroactively elsewhere)
        // and dispersion (new catalog item present, though without uses yet).
        this.loadAdhoc();
        this.loadDispersion();
      }
    });
  }

  private renderMixCharts() {
    if (!this.mixResp || !this.donutRef?.nativeElement || !this.monthlyRef?.nativeElement) return;

    const css = getComputedStyle(document.documentElement);
    const colors: Record<string, string> = {
      mano_de_obra: '#6366f1',
      repuesto:     '#10b981',
      otro:         '#9ca3af',
    };

    // Donut
    this.donutChart?.destroy();
    const byType = this.mixResp.by_type;
    this.donutChart = new Chart(this.donutRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: byType.map(t => typeLabel(t.item_type)),
        datasets: [{
          data: byType.map(t => t.revenue),
          backgroundColor: byType.map(t => colors[t.item_type] || '#9ca3af'),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
      },
    });

    // Monthly stacked
    this.monthlyChart?.destroy();
    const months = Array.from(new Set(this.mixResp.monthly.map(m => m.month))).sort();
    const types: ItemType[] = ['mano_de_obra', 'repuesto', 'otro'];
    const datasets = types.map(t => ({
      label: typeLabel(t),
      data: months.map(m => {
        const row = this.mixResp!.monthly.find(x => x.month === m && x.item_type === t);
        return row?.revenue || 0;
      }),
      backgroundColor: colors[t],
      borderWidth: 0,
    }));
    const border2 = css.getPropertyValue('--border2').trim() || '#f3f4f6';
    this.monthlyChart = new Chart(this.monthlyRef.nativeElement, {
      type: 'bar',
      data: { labels: months, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, grid: { color: border2 }, beginAtZero: true,
               ticks: { callback: (v) => '$ ' + Number(v).toLocaleString('es-UY') } },
        },
      },
    });
    this.cdr.detectChanges();
  }

  private formatDate(d: Date): string { return d.toISOString().split('T')[0]; }
}
