import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { AppCurrencyPipe } from '../../shared/pipes/currency.pipe';

@Component({
  selector: 'app-import',
  standalone: true,
  imports: [
    CommonModule, MatCardModule, MatButtonModule, MatIconModule,
    MatTableModule, MatProgressSpinnerModule, AppCurrencyPipe
  ],
  template: `
    <main class="content">
      <div class="page-head">
        <h1>Importar trabajos</h1>
      </div>

      <div class="import-layout">
        <!-- LEFT: upload + preview -->
        <div class="import-main">
          <mat-card class="mb-16">
            <mat-card-content>
              <h3 class="card-title-lg">1. Cargar archivo</h3>
              <div class="upload-zone" (dragover)="onDragOver($event)" (drop)="onDrop($event)" (click)="fileInput.click()">
                <mat-icon class="upload-ico">cloud_upload</mat-icon>
                <p class="upload-cta">Arrastra un archivo CSV aqui o haz click para seleccionar</p>
                <p class="upload-hint">Formato: Cliente;Fecha;Docs A pagar;Forma de Pago;Total;Importe pagado</p>
                <input #fileInput type="file" accept=".csv,.txt" style="display:none;" (change)="onFileSelected($event)">
              </div>
              @if (fileName) {
                <div class="file-row">
                  <mat-icon>description</mat-icon>
                  <span>{{ fileName }}</span>
                  <button mat-icon-button (click)="clearFile()"><mat-icon>close</mat-icon></button>
                </div>
              }
              @if (parseError) {
                <div class="banner banner-error">{{ parseError }}</div>
              }
              <div style="margin-top:12px;">
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

          @if (preview) {
            <mat-card>
              <mat-card-content>
                <h3 class="card-title-lg">2. Vista previa de datos a importar</h3>
                <div style="overflow-x:auto;">
                  <table mat-table [dataSource]="preview.rows">
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
                      <td mat-cell *matCellDef="let r" class="t-mono">{{ r.plate }}</td>
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
                      <td mat-cell *matCellDef="let r" class="td-num">{{ r.total | appCurrency }}</td>
                    </ng-container>
                    <ng-container matColumnDef="paid">
                      <th mat-header-cell *matHeaderCellDef class="text-right">Pagado</th>
                      <td mat-cell *matCellDef="let r" class="td-num">{{ r.paid | appCurrency }}</td>
                    </ng-container>
                    <ng-container matColumnDef="balance">
                      <th mat-header-cell *matHeaderCellDef class="text-right">Saldo</th>
                      <td mat-cell *matCellDef="let r" class="td-num" [class.money-neg]="r.balance > 0" [class.money-zero]="r.balance <= 0">{{ r.balance | appCurrency }}</td>
                    </ng-container>
                    <tr mat-header-row *matHeaderRowDef="previewColumns"></tr>
                    <tr mat-row *matRowDef="let row; columns: previewColumns;"></tr>
                  </table>
                </div>
              </mat-card-content>
            </mat-card>
          }
        </div>

        <!-- RIGHT: sticky summary + result -->
        <div class="import-side">
          <mat-card class="summary-card">
            <mat-card-content>
              <h3 class="card-title-lg">Resumen</h3>
              @if (!fileName) {
                <p class="summary-empty">Sin archivo seleccionado.</p>
              } @else {
                <div class="info-row"><span>Archivo</span><span class="file-name">{{ fileName }}</span></div>
                @if (preview) {
                  <div class="info-row"><span>Filas</span><span class="t-mono">{{ preview.row_count }}</span></div>
                  <div class="info-row"><span>Clientes</span><span class="t-mono">{{ preview.unique_clients }}</span></div>
                  <div class="info-row"><span>Vehiculos</span><span class="t-mono">{{ preview.unique_plates }}</span></div>
                  <div class="banner banner-ok summary-banner">
                    <mat-icon>check_circle</mat-icon>
                    <span>Listo para importar.</span>
                  </div>
                  @if (!importResult) {
                    <button mat-raised-button color="primary" class="summary-cta"
                            (click)="executeImport()" [disabled]="importing">
                      @if (importing) {
                        <mat-spinner diameter="20"></mat-spinner>
                      } @else {
                        <ng-container><mat-icon>upload</mat-icon> Importar {{ preview.row_count }} trabajos</ng-container>
                      }
                    </button>
                  }
                } @else if (parseError) {
                  <div class="banner banner-error summary-banner">
                    <mat-icon>error</mat-icon>
                    <span>{{ parseError }}</span>
                  </div>
                } @else {
                  <div class="banner banner-info summary-banner">
                    <mat-icon>info</mat-icon>
                    <span>Pulsa "Vista previa" para parsear el archivo.</span>
                  </div>
                }
              }

              @if (importResult) {
                <div class="result-block">
                  <div class="result-header">
                    <mat-icon class="success-ico">check_circle</mat-icon>
                    <h4 class="card-title-lg">Importacion completada</h4>
                  </div>
                  <div class="result-row"><span>Clientes nuevos</span><span class="t-mono">{{ importResult.clients_created }}</span></div>
                  <div class="result-row"><span>Clientes existentes</span><span class="t-mono">{{ importResult.clients_matched }}</span></div>
                  <div class="result-row"><span>Vehiculos nuevos</span><span class="t-mono">{{ importResult.vehicles_created }}</span></div>
                  <div class="result-row"><span>Vehiculos existentes</span><span class="t-mono">{{ importResult.vehicles_matched }}</span></div>
                  <div class="result-row"><span>Trabajos creados</span><span class="t-mono" style="color:var(--green);">{{ importResult.jobs_created }}</span></div>
                  <div class="result-row"><span>Pagos registrados</span><span class="t-mono">{{ importResult.payments_created }}</span></div>

                  @if (importResult.errors && importResult.errors.length > 0) {
                    <h5 class="errors-title">Errores ({{ importResult.errors.length }})</h5>
                    @for (e of importResult.errors; track e.row) {
                      <div class="error-row">
                        Fila <span class="t-mono">{{ e.row }}</span> ({{ e.client }}): {{ e.error }}
                      </div>
                    }
                  }

                  <div class="result-actions">
                    <button mat-raised-button color="primary" (click)="goToJobs()">
                      <mat-icon>list</mat-icon> Ver trabajos
                    </button>
                    <button mat-stroked-button (click)="reset()">
                      <mat-icon>refresh</mat-icon> Otro archivo
                    </button>
                  </div>
                </div>
              }
            </mat-card-content>
          </mat-card>
        </div>
      </div>
    </main>
  `,
  styles: [`
    .import-layout {
      display: grid;
      grid-template-columns: 1fr 320px;
      gap: 24px;
      align-items: start;
    }
    @media (max-width: 1024px) {
      .import-layout { grid-template-columns: 1fr; }
    }
    .import-main { min-width: 0; }
    .import-side { min-width: 0; }
    .summary-card {
      position: sticky;
      top: 72px;
    }
    .summary-empty {
      font-size: 12px;
      color: var(--text-3);
      margin: 0;
    }
    .file-name {
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .summary-banner { margin-top: 12px; margin-bottom: 0; }
    .summary-banner mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .summary-cta {
      width: 100%;
      margin-top: 12px;
      height: 40px;
    }
    .result-block {
      margin-top: 18px;
      padding-top: 16px;
      border-top: 1px solid var(--border2);
    }
    .result-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 3px 0;
      font-size: 12px;
    }
    .result-row > span:first-child { color: var(--text-2); }
    .result-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 12px;
    }
    .upload-zone {
      border: 2px dashed var(--border);
      border-radius: var(--r);
      padding: 48px 24px;
      text-align: center;
      cursor: pointer;
      transition: border-color .15s, background .15s;
      background: var(--bg);
    }
    .upload-zone:hover {
      border-color: var(--navy);
      background: #eceae5;
    }
    .upload-ico {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: var(--text-3);
    }
    .upload-cta {
      font-size: 14px;
      color: var(--text-1);
      margin: 12px 0 4px;
    }
    .upload-hint {
      font-size: 12px;
      color: var(--text-3);
      margin: 0;
    }
    .file-row {
      margin-top: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--bg);
      border-radius: var(--r-sm);
      font-size: 13px;
    }
    .file-row mat-icon { color: var(--text-2); }
    .result-header {
      text-align: center;
      margin-bottom: 16px;
    }
    .success-ico {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: var(--green);
      margin-bottom: 8px;
    }
    .errors-title {
      color: var(--red);
      margin: 0 0 8px;
      font-size: 13px;
      font-weight: 700;
    }
    .error-row {
      font-size: 12px;
      color: var(--red);
      margin: 4px 0;
      padding: 6px 10px;
      background: var(--red-lt);
      border-radius: var(--r-sm);
    }
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
