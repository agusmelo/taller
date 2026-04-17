import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Client } from '../../../core/models';
import { ClientFormComponent } from '../form/client-form.component';

@Component({
  selector: 'app-client-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatTableModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatDialogModule, MatCardModule,
    MatPaginatorModule, MatProgressSpinnerModule
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Clientes</h1>
        <div style="display:flex;gap:8px;">
          @if (auth.isAdmin()) {
            <button mat-stroked-button (click)="exportCsv()">
              <mat-icon>download</mat-icon> CSV
            </button>
          }
          @if (auth.isAdminOrRecep()) {
            <button mat-raised-button color="primary" (click)="openForm()">
              <mat-icon>add</mat-icon> Nuevo Cliente
            </button>
          }
        </div>
      </div>

      <mat-form-field appearance="outline" class="search-field">
        <mat-label>Buscar por nombre, RUT, telefono...</mat-label>
        <input matInput [(ngModel)]="searchQuery" (input)="onSearch()">
        <mat-icon matPrefix>search</mat-icon>
      </mat-form-field>

      @if (loading) {
        <div class="loading-overlay"><mat-spinner diameter="40"></mat-spinner></div>
      } @else if (clients.length === 0) {
        <div class="empty-state">
          <mat-icon>people_outline</mat-icon>
          <p>No hay clientes registrados</p>
          @if (searchQuery) { <p class="empty-hint">Intenta con otro termino de busqueda</p> }
        </div>
      } @else {
        <table mat-table [dataSource]="clients" class="mat-elevation-z1">
          <ng-container matColumnDef="full_name">
            <th mat-header-cell *matHeaderCellDef>Nombre</th>
            <td mat-cell *matCellDef="let c">{{ c.full_name }}</td>
          </ng-container>
          <ng-container matColumnDef="type">
            <th mat-header-cell *matHeaderCellDef>Tipo</th>
            <td mat-cell *matCellDef="let c">{{ c.type === 'empresa' ? 'Empresa' : 'Individual' }}</td>
          </ng-container>
          <ng-container matColumnDef="rut">
            <th mat-header-cell *matHeaderCellDef>RUT</th>
            <td mat-cell *matCellDef="let c">{{ c.rut || '-' }}</td>
          </ng-container>
          <ng-container matColumnDef="phone">
            <th mat-header-cell *matHeaderCellDef>Telefono</th>
            <td mat-cell *matCellDef="let c">{{ c.phone || '-' }}</td>
          </ng-container>
          <ng-container matColumnDef="vehicle_count">
            <th mat-header-cell *matHeaderCellDef>Vehiculos</th>
            <td mat-cell *matCellDef="let c">{{ c.vehicle_count }}</td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"
              class="clickable-row" (click)="goToDetail(row.id)"></tr>
        </table>
        <mat-paginator [length]="totalItems"
                       [pageIndex]="page"
                       [pageSize]="pageSize"
                       [pageSizeOptions]="[10, 20, 50]"
                       (page)="onPage($event)"
                       showFirstLastButtons>
        </mat-paginator>
      }
    </div>
  `
})
export class ClientListComponent implements OnInit {
  clients: Client[] = [];
  displayedColumns = ['full_name', 'type', 'rut', 'phone', 'vehicle_count'];
  searchQuery = '';
  loading = false;
  pageSize = 20;
  page = 0;
  totalItems = 0;
  private searchTimeout: any;

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private router: Router,
    private dialog: MatDialog,
    private notify: NotificationService
  ) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    const params: Record<string, string> = { limit: String(this.pageSize), page: String(this.page + 1) };
    if (this.searchQuery) params['q'] = this.searchQuery;
    this.api.getClients(params).subscribe({
      next: res => { this.clients = res.data; this.totalItems = res.total; this.loading = false; },
      error: err => { this.notify.handleError(err); this.loading = false; }
    });
  }

  onSearch() {
    clearTimeout(this.searchTimeout);
    this.page = 0;
    this.searchTimeout = setTimeout(() => this.load(), 300);
  }

  onPage(event: PageEvent) {
    this.page = event.pageIndex;
    this.pageSize = event.pageSize;
    this.load();
  }

  goToDetail(id: string) {
    this.router.navigate(['/clientes', id]);
  }

  exportCsv() {
    this.api.exportClientsCsv().subscribe(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'clientes.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    });
  }

  openForm(client?: Client) {
    const ref = this.dialog.open(ClientFormComponent, {
      width: '500px',
      data: { client }
    });
    ref.afterClosed().subscribe(result => {
      if (result) {
        this.notify.success(client ? 'Cliente actualizado' : 'Cliente creado');
        this.load();
      }
    });
  }
}
