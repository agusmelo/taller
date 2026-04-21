import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatStepperModule } from '@angular/material/stepper';
import { MatDividerModule } from '@angular/material/divider';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { AppCurrencyPipe } from '../../shared/pipes/currency.pipe';

@Component({
  selector: 'app-import',
  standalone: true,
  imports: [
    CommonModule, MatCardModule, MatButtonModule, MatIconModule,
    MatTableModule, MatProgressSpinnerModule, MatStepperModule,
    MatDividerModule, AppCurrencyPipe
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Importar trabajos</h1>
      </div>

      <mat-stepper [linear]="true" #stepper>
        <!-- Step 1: Upload -->
        <mat-step [completed]="preview !== null">
          <ng-template matStepLabel>Cargar archivo</ng-template>
          <div style="padding:24px 0;">
            <mat-card style="max-width:600px;">
              <mat-card-content>
                <div class="upload-zone" (dragover)="onDragOver($event)" (drop)="onDrop($event)" (click)="fileInput.click()">
                  <mat-icon style="font-size:48px;width:48px;height:48px;color:#999;">cloud_upload</mat-icon>
                  <p>Arrastra un archivo CSV aqui o haz click para seleccionar</p>
                  <p style="font-size:12px;color:#999;">Formato: Cliente;Fecha;Docs A pagar;Forma de Pago;Total;Importe pagado</p>
                  <input #fileInput type="file" accept=".csv,.txt" style="display:none;" (change)="onFileSelected($event)">
                </div>
                @if (fileName) {
                  <div style="margin-top:12px;display:flex;align-items:center;gap:8px;">
                    <mat-icon>description</mat-icon>
                    <span>{{ fileName }}</span>
                    <button mat-icon-button (click)="clearFile()"><mat-icon>close</mat-icon></button>
                  </div>
                }
                @if (parseError) {
                  <div class="error-msg" style="margin-top:12px;">{{ parseError }}</div>
                }
                <div style="margin-top:16px;">
                  <button mat-raised-button color="primary" (click)="loadPreview()" [disabled]="!fileContent || previewing">
                    @if (previewing) {
                      <mat-spinner diameter="20"></mat-spinner>
                    } @else {
                      <ng-container><mat-icon>preview</mat-icon> Vista previa</ng-container>
                    }
                  </button>
                </div>
              </mat-card-content>
            </mat-card>
          </div>
        </mat-step>

        <!-- Step 2: Preview -->
        <mat-step [completed]="importResult !== null">
          <ng-template matStepLabel>Revisar datos</ng-template>
          @if (preview) {
            <div style="padding:24px 0;">
              <div class="kpi-row" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px;">
                <div class="kpi">
                  <div class="kpi-label">Filas</div>
                  <div class="kpi-val">{{ preview.row_count }}</div>
                </div>
                <div class="kpi">
                  <div class="kpi-label">Clientes</div>
                  <div class="kpi-val">{{ preview.unique_clients }}</div>
                </div>
                <div class="kpi">
                  <div class="kpi-label">Vehiculos</div>
                  <div class="kpi-val">{{ preview.unique_plates }}</div>
                </div>
              </div>

              <mat-card>
                <mat-card-content>
                  <div class="ds-card-hd"><span class="ds-card-title">Vista previa de datos a importar</span></div>
                  <div style="overflow-x:auto;">
                    <table mat-table [dataSource]="preview.rows" style="width:100%;">
                      <ng-container matColumnDef="client_name">
                        <th mat-header-cell *matHeaderCellDef>Cliente</th>
                        <td mat-cell *matCellDef="let r">{{ r.client_name }}</td>
                      </ng-container>
                      <ng-container matColumnDef="date">
                        <th mat-header-cell *matHeaderCellDef>Fecha</th>
                        <td mat-cell *matCellDef="let r">{{ r.date }}</td>
                      </ng-container>
                      <ng-container matColumnDef="plate">
                        <th mat-header-cell *matHeaderCellDef>Patente</th>
                        <td mat-cell *matCellDef="let r">{{ r.plate }}</td>
                      </ng-container>
                      <ng-container matColumnDef="description">
                        <th mat-header-cell *matHeaderCellDef>Descripcion</th>
                        <td mat-cell *matCellDef="let r">{{ r.description }}</td>
                      </ng-container>
                      <ng-container matColumnDef="payment_method">
                        <th mat-header-cell *matHeaderCellDef>Metodo</th>
                        <td mat-cell *matCellDef="let r">{{ r.payment_method }}</td>
                      </ng-container>
                      <ng-container matColumnDef="total">
                        <th mat-header-cell *matHeaderCellDef class="text-right">Total</th>
                        <td mat-cell *matCellDef="let r" class="text-right">{{ r.total | appCurrency }}</td>
                      </ng-container>
                      <ng-container matColumnDef="paid">
                        <th mat-header-cell *matHeaderCellDef class="text-right">Pagado</th>
                        <td mat-cell *matCellDef="let r" class="text-right">{{ r.paid | appCurrency }}</td>
                      </ng-container>
                      <ng-container matColumnDef="balance">
                        <th mat-header-cell *matHeaderCellDef class="text-right">Saldo</th>
                        <td mat-cell *matCellDef="let r" class="text-right" [style.color]="r.balance > 0 ? 'var(--red)' : 'var(--green)'">{{ r.balance | appCurrency }}</td>
                      </ng-container>
                      <tr mat-header-row *matHeaderRowDef="previewColumns"></tr>
                      <tr mat-row *matRowDef="let row; columns: previewColumns;"></tr>
                    </table>
                  </div>
                </mat-card-content>
              </mat-card>

              <div style="margin-top:16px;display:flex;gap:8px;">
                <button mat-button matStepperPrevious><mat-icon>arrow_back</mat-icon> Volver</button>
                <button mat-raised-button color="primary" (click)="executeImport()" [disabled]="importing">
                  @if (importing) {
                    <mat-spinner diameter="20"></mat-spinner>
                  } @else {
                    <ng-container><mat-icon>upload</mat-icon> Importar {{ preview.row_count }} trabajos</ng-container>
                  }
                </button>
              </div>
            </div>
          }
        </mat-step>

        <!-- Step 3: Results -->
        <mat-step>
          <ng-template matStepLabel>Resultado</ng-template>
          @if (importResult) {
            <div style="padding:24px 0;">
              <mat-card style="max-width:600px;">
                <mat-card-content>
                  <div style="text-align:center;margin-bottom:16px;">
                    <mat-icon style="font-size:48px;width:48px;height:48px;color:var(--green);">check_circle</mat-icon>
                    <div class="ds-card-hd" style="justify-content:center;margin-top:8px;"><span class="ds-card-title" style="font-size:13px;">Importacion completada</span></div>
                  </div>

                  <div class="result-grid">
                    <div class="result-item">
                      <mat-icon>people</mat-icon>
                      <span>Clientes creados: <strong>{{ importResult.clients_created }}</strong></span>
                    </div>
                    <div class="result-item">
                      <mat-icon>people_outline</mat-icon>
                      <span>Clientes existentes: <strong>{{ importResult.clients_matched }}</strong></span>
                    </div>
                    <div class="result-item">
                      <mat-icon>directions_car</mat-icon>
                      <span>Vehiculos creados: <strong>{{ importResult.vehicles_created }}</strong></span>
                    </div>
                    <div class="result-item">
                      <mat-icon>car_rental</mat-icon>
                      <span>Vehiculos existentes: <strong>{{ importResult.vehicles_matched }}</strong></span>
                    </div>
                    <div class="result-item">
                      <mat-icon>work</mat-icon>
                      <span>Trabajos creados: <strong>{{ importResult.jobs_created }}</strong></span>
                    </div>
                    <div class="result-item">
                      <mat-icon>payment</mat-icon>
                      <span>Pagos registrados: <strong>{{ importResult.payments_created }}</strong></span>
                    </div>
                  </div>

                  @if (importResult.errors && importResult.errors.length > 0) {
                    <mat-divider style="margin:16px 0;"></mat-divider>
                    <div class="ds-card-hd"><span class="ds-card-title" style="color:var(--red);">Errores ({{ importResult.errors.length }})</span></div>
                    @for (e of importResult.errors; track e.row) {
                      <div style="font-size:12px;color:var(--red);margin:4px 0;">
                        Fila {{ e.row }} ({{ e.client }}): {{ e.error }}
                      </div>
                    }
                  }

                  <div style="margin-top:24px;display:flex;gap:8px;">
                    <button mat-raised-button color="primary" (click)="goToJobs()">
                      <mat-icon>list</mat-icon> Ver trabajos
                    </button>
                    <button mat-stroked-button (click)="reset()">
                      <mat-icon>refresh</mat-icon> Importar otro archivo
                    </button>
                  </div>
                </mat-card-content>
              </mat-card>
            </div>
          }
        </mat-step>
      </mat-stepper>
    </div>
  `,
  styles: [`
    .upload-zone {
      border: 2px dashed var(--border);
      border-radius: var(--r);
      padding: 48px 24px;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s;
      background: var(--bg);
    }
    .upload-zone:hover { border-color: var(--navy); }
    .result-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .result-item { display: flex; align-items: center; gap: 8px; font-size: 12px; }
    .result-item mat-icon { color: var(--text-3); font-size: 18px; width: 18px; height: 18px; }
  `]
})
export class ImportComponent {
  fileContent: string | null = null;
  fileName: string | null = null;
  parseError: string | null = null;
  previewing = false;
  importing = false;
  preview: any = null;
  importResult: any = null;
  previewColumns = ['client_name', 'date', 'plate', 'description', 'payment_method', 'total', 'paid', 'balance'];

  constructor(
    private api: ApiService,
    private notify: NotificationService,
    private router: Router
  ) {}

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files[0];
    if (file) this.readFile(file);
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.readFile(file);
  }

  readFile(file: File) {
    this.parseError = null;
    this.fileName = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      this.fileContent = reader.result as string;
    };
    reader.onerror = () => {
      this.parseError = 'Error al leer el archivo';
    };
    reader.readAsText(file, 'UTF-8');
  }

  clearFile() {
    this.fileContent = null;
    this.fileName = null;
    this.preview = null;
    this.parseError = null;
  }

  loadPreview() {
    if (!this.fileContent) return;
    this.previewing = true;
    this.parseError = null;
    this.api.importPreview(this.fileContent).subscribe({
      next: data => {
        this.preview = data;
        this.previewing = false;
      },
      error: err => {
        this.parseError = err.error?.error || 'Error al procesar el archivo';
        this.previewing = false;
      }
    });
  }

  executeImport() {
    if (!this.fileContent) return;
    this.importing = true;
    this.api.importExecute(this.fileContent).subscribe({
      next: result => {
        this.importResult = result;
        this.importing = false;
        this.notify.success(`Importacion completada: ${result.jobs_created} trabajos creados`);
      },
      error: err => {
        this.importing = false;
        this.notify.handleError(err);
      }
    });
  }

  goToJobs() {
    this.router.navigate(['/trabajos']);
  }

  reset() {
    this.fileContent = null;
    this.fileName = null;
    this.preview = null;
    this.importResult = null;
    this.parseError = null;
  }
}
