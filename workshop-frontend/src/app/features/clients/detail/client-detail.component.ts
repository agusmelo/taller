import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Client, Vehicle, Job } from '../../../core/models';
import { ClientFormComponent } from '../form/client-form.component';
import { StatusLabelPipe } from '../../../shared/pipes/status.pipe';

@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [
    CommonModule, RouterLink, MatCardModule, MatButtonModule, MatIconModule,
    MatTableModule, MatChipsModule, MatDialogModule, StatusLabelPipe
  ],
  template: `
    <div class="page-container" *ngIf="client">
      <div class="page-header">
        <h1>{{ client.full_name }}</h1>
        <div>
          @if (auth.isAdminOrRecep()) {
            <button mat-raised-button color="accent" (click)="edit()" class="mr-8">
              <mat-icon>edit</mat-icon> Editar
            </button>
          }
          <button mat-button routerLink="/clientes"><mat-icon>arrow_back</mat-icon> Volver</button>
        </div>
      </div>

      <div class="card-grid">
        <mat-card>
          <mat-card-content>
            <p><strong>Tipo:</strong> {{ client.type === 'empresa' ? 'Empresa' : 'Individual' }}</p>
            <p><strong>RUT:</strong> {{ client.rut || 'No registrado' }}</p>
            <p><strong>Telefono:</strong> {{ client.phone || '-' }}</p>
            <p><strong>Email:</strong> {{ client.email || '-' }}</p>
            <p><strong>Direccion:</strong> {{ client.address || '-' }}</p>
            @if (client.notes) { <p><strong>Notas:</strong> {{ client.notes }}</p> }
          </mat-card-content>
        </mat-card>
      </div>

      <h2>Vehiculos ({{ vehicles.length }})</h2>
      <table mat-table [dataSource]="vehicles" class="mat-elevation-z1 mb-16">
        <ng-container matColumnDef="plate_number">
          <th mat-header-cell *matHeaderCellDef>Patente</th>
          <td mat-cell *matCellDef="let v">{{ v.plate_number }}</td>
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
        <tr mat-header-row *matHeaderRowDef="['plate_number','make','model','year']"></tr>
        <tr mat-row *matRowDef="let row; columns: ['plate_number','make','model','year'];"
            class="clickable-row" (click)="goToVehicle(row.id)"></tr>
      </table>

      <h2>Trabajos ({{ jobs.length }})</h2>
      <table mat-table [dataSource]="jobs" class="mat-elevation-z1">
        <ng-container matColumnDef="job_number">
          <th mat-header-cell *matHeaderCellDef>Numero</th>
          <td mat-cell *matCellDef="let j">{{ j.job_number }}</td>
        </ng-container>
        <ng-container matColumnDef="plate_number">
          <th mat-header-cell *matHeaderCellDef>Patente</th>
          <td mat-cell *matCellDef="let j">{{ j.plate_number }}</td>
        </ng-container>
        <ng-container matColumnDef="status">
          <th mat-header-cell *matHeaderCellDef>Estado</th>
          <td mat-cell *matCellDef="let j">
            <span [class]="'status-badge status-' + j.status">{{ j.status | statusLabel }}</span>
          </td>
        </ng-container>
        <ng-container matColumnDef="created_at">
          <th mat-header-cell *matHeaderCellDef>Fecha</th>
          <td mat-cell *matCellDef="let j">{{ j.created_at | date:'dd/MM/yyyy' }}</td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="['job_number','plate_number','status','created_at']"></tr>
        <tr mat-row *matRowDef="let row; columns: ['job_number','plate_number','status','created_at'];"
            class="clickable-row" (click)="goToJob(row.id)"></tr>
      </table>
    </div>
  `
})
export class ClientDetailComponent implements OnInit {
  client: Client | null = null;
  vehicles: Vehicle[] = [];
  jobs: Job[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService,
    public auth: AuthService,
    private dialog: MatDialog
  ) {}

  ngOnInit() { this.load(); }

  load() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.api.getClient(id).subscribe(c => this.client = c);
    this.api.getClientVehicles(id).subscribe(v => this.vehicles = v);
    this.api.getClientJobs(id).subscribe(j => this.jobs = j);
  }

  edit() {
    const ref = this.dialog.open(ClientFormComponent, { width: '500px', data: { client: this.client } });
    ref.afterClosed().subscribe(r => { if (r) this.load(); });
  }

  goToVehicle(id: string) { this.router.navigate(['/vehiculos', id]); }
  goToJob(id: string) { this.router.navigate(['/trabajos', id]); }
}
