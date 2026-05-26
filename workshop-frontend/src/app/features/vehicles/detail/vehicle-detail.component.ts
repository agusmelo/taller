import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Vehicle, Job, OwnershipHistory, Client } from '../../../core/models';
import { VehicleFormComponent } from '../form/vehicle-form.component';
import { StatusLabelPipe } from '../../../shared/pipes/status.pipe';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { InfoCardComponent } from '../../../shared/components/info-card/info-card.component';
import { ContactCardComponent } from '../../../shared/components/contact-card/contact-card.component';

@Component({
  selector: 'app-vehicle-detail',
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule, MatCardModule, MatButtonModule, MatIconModule,
    MatTableModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatAutocompleteModule, MatProgressSpinnerModule, StatusLabelPipe,
    InfoCardComponent, ContactCardComponent
  ],
  template: `
    @if (loading) {
      <div class="loading-overlay"><mat-spinner diameter="40"></mat-spinner></div>
    } @else if (vehicle) {
    <main class="content">
      <div class="page-head">
        <div class="page-head-title">
          <h1 class="t-mono">{{ vehicle.plate_number }}</h1>
          <span class="vehicle-sub">{{ vehicle.make }} {{ vehicle.model }}</span>
        </div>
        <div class="page-head-actions">
          @if (auth.isAdminOrRecep()) {
            <button mat-raised-button color="primary" (click)="edit()">
              <mat-icon>edit</mat-icon> Editar
            </button>
          }
          @if (auth.isAdmin()) {
            <button mat-stroked-button (click)="showTransfer = !showTransfer">
              <mat-icon>swap_horiz</mat-icon> Transferir
            </button>
          }
          <button mat-button routerLink="/vehiculos"><mat-icon>arrow_back</mat-icon> Volver</button>
        </div>
      </div>

      @if (showTransfer) {
        <mat-card class="mb-16">
          <mat-card-content>
            <h3 class="card-title-lg">Transferir propiedad</h3>
            <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
              <mat-form-field appearance="outline" style="flex:1;min-width:200px;" subscriptSizing="dynamic">
                <mat-label>Buscar nuevo dueno</mat-label>
                <input matInput [(ngModel)]="transferSearch" (input)="searchTransferClients()"
                       [matAutocomplete]="transferAuto">
                <mat-autocomplete #transferAuto="matAutocomplete" (optionSelected)="selectTransferClient($event)">
                  @for (c of transferClients; track c.id) {
                    <mat-option [value]="c.id">{{ c.full_name }}</mat-option>
                  }
                </mat-autocomplete>
              </mat-form-field>
              <mat-form-field appearance="outline" style="flex:1;min-width:200px;" subscriptSizing="dynamic">
                <mat-label>Nota de transferencia</mat-label>
                <input matInput [(ngModel)]="transferNotes">
              </mat-form-field>
              <button mat-raised-button color="primary" (click)="confirmTransfer()" [disabled]="!transferClientId || transferring">
                {{ transferring ? 'Transfiriendo...' : 'Confirmar' }}
              </button>
            </div>
          </mat-card-content>
        </mat-card>
      }

      <div class="info-cards">
        <app-contact-card
          title="Dueño actual"
          icon="person"
          accent="blue"
          [name]="vehicle.client_name || null"
          [nameLink]="['/clientes', vehicle.client_id]"
          [rut]="vehicle.client_rut || null"
          [phone]="vehicle.client_phone || null"
          [email]="vehicle.client_email || null"
          [address]="vehicle.client_address || null">
        </app-contact-card>

        <app-info-card title="Datos" icon="directions_car" accent="teal">
          <div class="info-row"><span>Año</span><span>{{ vehicle.year || '-' }}</span></div>
          <div class="info-row"><span>Color</span><span>{{ vehicle.color || '-' }}</span></div>
          <div class="info-row"><span>Kilometraje</span><span class="t-mono">{{ vehicle.mileage ? vehicle.mileage.toLocaleString() + ' km' : '-' }}</span></div>
        </app-info-card>

        <app-info-card title="Resumen" icon="summarize" accent="purple">
          <div class="info-row"><span>Trabajos</span><span class="t-mono">{{ jobs.length }}</span></div>
          <div class="info-row"><span>Dueños previos</span><span class="t-mono">{{ history.length }}</span></div>
          @if (vehicle.notes) {
            <div class="info-row info-row-wrap"><span>Notas</span><span>{{ vehicle.notes }}</span></div>
          }
        </app-info-card>
      </div>

      @if (history.length > 0) {
        <mat-card class="mb-16">
          <mat-card-content>
            <h3 class="card-title-lg">Historial de propiedad</h3>
            <table mat-table [dataSource]="history">
              <ng-container matColumnDef="client_name">
                <th mat-header-cell *matHeaderCellDef>Dueno</th>
                <td mat-cell *matCellDef="let h">{{ h.client_name }}</td>
              </ng-container>
              <ng-container matColumnDef="started_at">
                <th mat-header-cell *matHeaderCellDef>Desde</th>
                <td mat-cell *matCellDef="let h">{{ h.started_at | date:'dd/MM/yyyy' }}</td>
              </ng-container>
              <ng-container matColumnDef="ended_at">
                <th mat-header-cell *matHeaderCellDef>Hasta</th>
                <td mat-cell *matCellDef="let h">{{ h.ended_at ? (h.ended_at | date:'dd/MM/yyyy') : 'Actual' }}</td>
              </ng-container>
              <ng-container matColumnDef="transfer_notes">
                <th mat-header-cell *matHeaderCellDef>Nota</th>
                <td mat-cell *matCellDef="let h">{{ h.transfer_notes || '-' }}</td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="['client_name','started_at','ended_at','transfer_notes']"></tr>
              <tr mat-row *matRowDef="let row; columns: ['client_name','started_at','ended_at','transfer_notes'];"></tr>
            </table>
          </mat-card-content>
        </mat-card>
      }

      <mat-card>
        <mat-card-content>
          <h3 class="card-title-lg">Trabajos</h3>
          <table mat-table [dataSource]="jobs">
            <ng-container matColumnDef="job_number">
              <th mat-header-cell *matHeaderCellDef>Numero</th>
              <td mat-cell *matCellDef="let j" class="t-mono">{{ j.job_number }}</td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Estado</th>
              <td mat-cell *matCellDef="let j">
                <span [class]="'badge b-' + j.status">{{ j.status | statusLabel }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="created_at">
              <th mat-header-cell *matHeaderCellDef>Fecha</th>
              <td mat-cell *matCellDef="let j">{{ j.created_at | date:'dd/MM/yyyy' }}</td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="['job_number','status','created_at']"></tr>
            <tr mat-row *matRowDef="let row; columns: ['job_number','status','created_at'];"
                class="clickable-row" (click)="goToJob(row.id)"></tr>
          </table>
        </mat-card-content>
      </mat-card>
    </main>
    }
  `,
  styles: [`
    .page-head-title { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .page-head-title h1 { margin: 0; }
    .vehicle-sub { color: var(--text-2); font-size: 14px; font-weight: 500; }
    .info-row-wrap { align-items: flex-start; }
    .info-row-wrap > span:last-child { text-align: right; word-break: break-word; }
  `]
})
export class VehicleDetailComponent implements OnInit {
  vehicle: Vehicle | null = null;
  history: OwnershipHistory[] = [];
  jobs: Job[] = [];
  loading = true;
  showTransfer = false;
  transferSearch = '';
  transferClients: Client[] = [];
  transferClientId = '';
  transferNotes = '';
  transferring = false;

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
    this.api.getVehicle(id).subscribe({
      next: v => { this.vehicle = v; this.loading = false; },
      error: err => { this.notify.handleError(err); this.loading = false; }
    });
    this.api.getOwnershipHistory(id).subscribe(h => this.history = h);
    this.api.getJobs({ vehicle_id: id }).subscribe(res => this.jobs = res.data);
  }

  edit() {
    const ref = this.dialog.open(VehicleFormComponent, { width: '500px', data: { vehicle: this.vehicle } });
    ref.afterClosed().subscribe(r => {
      if (r) {
        this.notify.success('Vehiculo actualizado');
        this.load();
      }
    });
  }

  searchTransferClients() {
    if (this.transferSearch.length < 2) return;
    this.api.getClients({ q: this.transferSearch }).subscribe(res => this.transferClients = res.data);
  }

  selectTransferClient(event: any) { this.transferClientId = event.option.value; }

  confirmTransfer() {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Confirmar transferencia',
        message: '¿Esta seguro de transferir la propiedad de este vehiculo?',
        confirmText: 'Transferir'
      }
    });
    ref.afterClosed().subscribe(confirmed => {
      if (confirmed) this.doTransfer();
    });
  }

  doTransfer() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.transferring = true;
    this.api.transferOwnership(id, { new_client_id: this.transferClientId, transfer_notes: this.transferNotes })
      .subscribe({
        next: () => {
          this.notify.success('Propiedad transferida correctamente');
          this.showTransfer = false;
          this.transferring = false;
          this.transferClientId = '';
          this.transferSearch = '';
          this.transferNotes = '';
          this.load();
        },
        error: err => { this.notify.handleError(err); this.transferring = false; }
      });
  }

  goToJob(id: string) { this.router.navigate(['/trabajos', id]); }
}
