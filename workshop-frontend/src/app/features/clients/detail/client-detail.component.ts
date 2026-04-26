import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Client, Vehicle, Job } from '../../../core/models';
import { ClientFormComponent } from '../form/client-form.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { StatusLabelPipe } from '../../../shared/pipes/status.pipe';

@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [
    CommonModule, RouterLink, MatCardModule, MatButtonModule, MatIconModule,
    MatTableModule, MatDialogModule, MatProgressSpinnerModule,
    StatusLabelPipe
  ],
  template: `
    @if (loading) {
      <div class="loading-overlay"><mat-spinner diameter="40"></mat-spinner></div>
    } @else if (client) {
    <main class="content">
      <div class="page-head">
        <h1>{{ client.full_name }}</h1>
        <div class="page-head-actions">
          @if (auth.isAdminOrRecep()) {
            <button mat-raised-button color="primary" (click)="edit()">
              <mat-icon>edit</mat-icon> Editar
            </button>
          }
          @if (auth.isAdmin()) {
            <button mat-raised-button color="warn" (click)="confirmDelete()">
              <mat-icon>delete</mat-icon> Eliminar
            </button>
          }
          <button mat-button routerLink="/clientes"><mat-icon>arrow_back</mat-icon> Volver</button>
        </div>
      </div>

      <div class="info-cards">
        <mat-card>
          <mat-card-content>
            <h3 class="card-title-lg">Identificacion</h3>
            <div class="info-row"><span>Tipo</span><span>{{ client.type === 'empresa' ? 'Empresa' : 'Individual' }}</span></div>
            <div class="info-row"><span>RUT</span><span class="t-mono">{{ client.rut || '-' }}</span></div>
          </mat-card-content>
        </mat-card>
        <mat-card>
          <mat-card-content>
            <h3 class="card-title-lg">Contacto</h3>
            <div class="info-row"><span>Telefono</span><span>{{ client.phone || '-' }}</span></div>
            <div class="info-row"><span>Email</span><span>{{ client.email || '-' }}</span></div>
            <div class="info-row"><span>Direccion</span><span>{{ client.address || '-' }}</span></div>
          </mat-card-content>
        </mat-card>
        <mat-card>
          <mat-card-content>
            <h3 class="card-title-lg">Resumen</h3>
            <div class="info-row"><span>Vehiculos</span><span class="t-mono">{{ vehicles.length }}</span></div>
            <div class="info-row"><span>Trabajos</span><span class="t-mono">{{ jobs.length }}</span></div>
            @if (client.notes) {
              <div class="info-row"><span>Notas</span><span>{{ client.notes }}</span></div>
            }
          </mat-card-content>
        </mat-card>
      </div>

      <div class="tabs">
        <button class="tab" [class.on]="activeTab === 'jobs'" (click)="activeTab = 'jobs'">Trabajos ({{ jobs.length }})</button>
        <button class="tab" [class.on]="activeTab === 'vehicles'" (click)="activeTab = 'vehicles'">Vehiculos ({{ vehicles.length }})</button>
      </div>

      <mat-card class="table-card">
        <mat-card-content>
          @if (activeTab === 'vehicles') {
            <table mat-table [dataSource]="vehicles">
              <ng-container matColumnDef="plate_number">
                <th mat-header-cell *matHeaderCellDef>Patente</th>
                <td mat-cell *matCellDef="let v" class="t-mono">{{ v.plate_number }}</td>
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
          } @else {
            <table mat-table [dataSource]="jobs">
              <ng-container matColumnDef="job_number">
                <th mat-header-cell *matHeaderCellDef>Numero</th>
                <td mat-cell *matCellDef="let j" class="t-mono">{{ j.job_number }}</td>
              </ng-container>
              <ng-container matColumnDef="plate_number">
                <th mat-header-cell *matHeaderCellDef>Patente</th>
                <td mat-cell *matCellDef="let j" class="t-mono">{{ j.plate_number }}</td>
              </ng-container>
              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef>Estado</th>
                <td mat-cell *matCellDef="let j">
                  <span [class]="'badge b-' + j.status">{{ j.status | statusLabel }}</span>
                </td>
              </ng-container>
              <ng-container matColumnDef="created_at">
                <th mat-header-cell *matHeaderCellDef>Fecha</th>
                <td mat-cell *matCellDef="let j">{{ (j.job_date || j.created_at) | date:'dd/MM/yyyy' }}</td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="['job_number','plate_number','status','created_at']"></tr>
              <tr mat-row *matRowDef="let row; columns: ['job_number','plate_number','status','created_at'];"
                  class="clickable-row" (click)="goToJob(row.id)"></tr>
            </table>
          }
        </mat-card-content>
      </mat-card>
    </main>
    }
  `,
  styles: [`
    .info-cards {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      margin-bottom: 16px;
    }
    @media (max-width: 900px) {
      .info-cards { grid-template-columns: 1fr; }
    }
    .card-title-lg {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-1);
      margin: 0 0 12px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 4px 0;
      font-size: 13px;
    }
    .info-row > span:first-child {
      color: var(--text-3);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .table-card { padding: 0 !important; overflow: hidden; }
    .table-card .mat-mdc-card-content { padding: 6px 0 0 !important; }
  `]
})
export class ClientDetailComponent implements OnInit {
  client: Client | null = null;
  vehicles: Vehicle[] = [];
  jobs: Job[] = [];
  loading = true;
  activeTab: 'jobs' | 'vehicles' = 'jobs';

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
    this.api.getClient(id).subscribe({
      next: c => { this.client = c; this.loading = false; },
      error: err => { this.notify.handleError(err); this.loading = false; }
    });
    this.api.getClientVehicles(id).subscribe(v => this.vehicles = v);
    this.api.getClientJobs(id).subscribe(j => this.jobs = j);
  }

  edit() {
    const ref = this.dialog.open(ClientFormComponent, { width: '500px', data: { client: this.client } });
    ref.afterClosed().subscribe(r => {
      if (r) {
        this.notify.success('Cliente actualizado');
        this.load();
      }
    });
  }

  confirmDelete() {
    let message = `¿Esta seguro de eliminar al cliente "${this.client!.full_name}"?`;
    if (this.vehicles.length > 0) {
      message += `\n\nEste cliente tiene ${this.vehicles.length} vehiculo(s) asociado(s) que deberan ser reasignados.`;
    }
    if (this.jobs.length > 0) {
      message += `\n\nLos ${this.jobs.length} trabajo(s) asociados se mantendran en el historial.`;
    }

    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Eliminar cliente',
        message,
        confirmText: 'Eliminar'
      }
    });
    ref.afterClosed().subscribe(confirmed => {
      if (confirmed) this.deleteClient();
    });
  }

  deleteClient() {
    this.api.deleteClient(this.client!.id).subscribe({
      next: () => {
        this.notify.success('Cliente eliminado');
        this.router.navigate(['/clientes']);
      },
      error: err => this.notify.handleError(err)
    });
  }

  goToVehicle(id: string) { this.router.navigate(['/vehiculos', id]); }
  goToJob(id: string) { this.router.navigate(['/trabajos', id]); }
}
