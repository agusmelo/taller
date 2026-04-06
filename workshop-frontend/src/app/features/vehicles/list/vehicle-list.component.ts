import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Vehicle } from '../../../core/models';
import { VehicleFormComponent } from '../form/vehicle-form.component';

@Component({
  selector: 'app-vehicle-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatTableModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatDialogModule
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Vehiculos</h1>
        @if (auth.isAdminOrRecep()) {
          <button mat-raised-button color="primary" (click)="openForm()">
            <mat-icon>add</mat-icon> Nuevo Vehiculo
          </button>
        }
      </div>

      <mat-form-field appearance="outline" class="search-field">
        <mat-label>Buscar por patente, marca, modelo...</mat-label>
        <input matInput [(ngModel)]="searchQuery" (input)="onSearch()">
        <mat-icon matPrefix>search</mat-icon>
      </mat-form-field>

      <table mat-table [dataSource]="vehicles" class="mat-elevation-z1">
        <ng-container matColumnDef="plate_number">
          <th mat-header-cell *matHeaderCellDef>Patente</th>
          <td mat-cell *matCellDef="let v"><strong>{{ v.plate_number }}</strong></td>
        </ng-container>
        <ng-container matColumnDef="make">
          <th mat-header-cell *matHeaderCellDef>Marca</th>
          <td mat-cell *matCellDef="let v">{{ v.make }}</td>
        </ng-container>
        <ng-container matColumnDef="model">
          <th mat-header-cell *matHeaderCellDef>Modelo</th>
          <td mat-cell *matCellDef="let v">{{ v.model }}</td>
        </ng-container>
        <ng-container matColumnDef="year">
          <th mat-header-cell *matHeaderCellDef>Ano</th>
          <td mat-cell *matCellDef="let v">{{ v.year || '-' }}</td>
        </ng-container>
        <ng-container matColumnDef="client_name">
          <th mat-header-cell *matHeaderCellDef>Dueno</th>
          <td mat-cell *matCellDef="let v">{{ v.client_name }}</td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns;"
            class="clickable-row" (click)="goToDetail(row.id)"></tr>
      </table>
    </div>
  `
})
export class VehicleListComponent implements OnInit {
  vehicles: Vehicle[] = [];
  displayedColumns = ['plate_number', 'make', 'model', 'year', 'client_name'];
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
    this.api.getVehicles(params).subscribe(v => this.vehicles = v);
  }

  onSearch() {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.load(), 300);
  }

  goToDetail(id: string) { this.router.navigate(['/vehiculos', id]); }

  openForm() {
    const ref = this.dialog.open(VehicleFormComponent, { width: '500px' });
    ref.afterClosed().subscribe(r => { if (r) this.load(); });
  }
}
