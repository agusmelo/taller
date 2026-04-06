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
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Client } from '../../../core/models';
import { ClientFormComponent } from '../form/client-form.component';

@Component({
  selector: 'app-client-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatTableModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatDialogModule, MatCardModule
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Clientes</h1>
        @if (auth.isAdminOrRecep()) {
          <button mat-raised-button color="primary" (click)="openForm()">
            <mat-icon>add</mat-icon> Nuevo Cliente
          </button>
        }
      </div>

      <mat-form-field appearance="outline" class="search-field">
        <mat-label>Buscar por nombre, RUT, telefono...</mat-label>
        <input matInput [(ngModel)]="searchQuery" (input)="onSearch()">
        <mat-icon matPrefix>search</mat-icon>
      </mat-form-field>

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
    </div>
  `
})
export class ClientListComponent implements OnInit {
  clients: Client[] = [];
  displayedColumns = ['full_name', 'type', 'rut', 'phone', 'vehicle_count'];
  searchQuery = '';
  private searchTimeout: any;

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private router: Router,
    private dialog: MatDialog
  ) {}

  ngOnInit() { this.load(); }

  load() {
    const params: Record<string, string> = {};
    if (this.searchQuery) params['q'] = this.searchQuery;
    this.api.getClients(params).subscribe(c => this.clients = c);
  }

  onSearch() {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.load(), 300);
  }

  goToDetail(id: string) {
    this.router.navigate(['/clientes', id]);
  }

  openForm(client?: Client) {
    const ref = this.dialog.open(ClientFormComponent, {
      width: '500px',
      data: { client }
    });
    ref.afterClosed().subscribe(result => { if (result) this.load(); });
  }
}
