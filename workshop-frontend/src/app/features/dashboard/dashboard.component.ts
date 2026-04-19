import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/services/api.service';
import {
  DashboardSummary, ClientFinancialRow, Job,
  OverdueDebt, UnpaidJob, TopClient,
  NewClientsData, RevenueTrendItem,
  MonthlyClosing, MonthlyClosingJob
} from '../../core/models';
import { StatusLabelPipe } from '../../shared/pipes/status.pipe';
import { AppCurrencyPipe } from '../../shared/pipes/currency.pipe';
import Chart from 'chart.js/auto';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule,
    MatTableModule, MatSelectModule, MatFormFieldModule, MatInputModule, MatDividerModule,
    MatDatepickerModule, MatNativeDateModule, MatSlideToggleModule, MatTabsModule, MatTooltipModule,
    StatusLabelPipe, AppCurrencyPipe
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Dashboard</h1>
        <mat-slide-toggle [(ngModel)]="privacyMode" (change)="onPrivacyToggle()">
          <mat-icon style="vertical-align:middle;margin-right:4px;">
            {{ privacyMode ? 'visibility_off' : 'visibility' }}
          </mat-icon>
          Privacidad
        </mat-slide-toggle>
      </div>

      <!-- Section A: KPI Cards -->
      <div class="card-grid kpi-grid" *ngIf="summary">
        <mat-card>
          <mat-card-content class="stat-card">
            <mat-icon class="stat-icon" style="color:#1565c0;">request_quote</mat-icon>
            <div>
              <div class="stat-label">Facturado (mes)</div>
              <div class="stat-value">{{ privacyMode ? '***' : (summary.facturado_month | appCurrency) }}</div>
            </div>
          </mat-card-content>
        </mat-card>
        <mat-card>
          <mat-card-content class="stat-card">
            <mat-icon class="stat-icon" style="color:#2e7d32;">payments</mat-icon>
            <div>
              <div class="stat-label">Cobrado (mes)</div>
              <div class="stat-value">{{ privacyMode ? '***' : (summary.cobrado_month | appCurrency) }}</div>
            </div>
          </mat-card-content>
        </mat-card>
        <mat-card>
          <mat-card-content class="stat-card">
            <mat-icon class="stat-icon" style="color:#e65100;">account_balance_wallet</mat-icon>
            <div>
              <div class="stat-label">Pendiente total</div>
              <div class="stat-value" [style.color]="summary.pendiente_total > 0 ? '#c62828' : '#2e7d32'">
                {{ privacyMode ? '***' : (summary.pendiente_total | appCurrency) }}
              </div>
            </div>
          </mat-card-content>
        </mat-card>
        <mat-card>
          <mat-card-content class="stat-card">
            <mat-icon class="stat-icon" style="color:#6a1b9a;">build_circle</mat-icon>
            <div>
              <div class="stat-label">Trabajos del mes</div>
              <div class="stat-value">{{ summary.jobs_month }}</div>
            </div>
          </mat-card-content>
        </mat-card>
        <mat-card>
          <mat-card-content class="stat-card">
            <mat-icon class="stat-icon" style="color:#00838f;">engineering</mat-icon>
            <div>
              <div class="stat-label">Trabajos activos</div>
              <div class="stat-value">{{ summary.active_jobs }}</div>
            </div>
          </mat-card-content>
        </mat-card>
        <mat-card>
          <mat-card-content class="stat-card">
            <mat-icon class="stat-icon" style="color:#558b2f;">percent</mat-icon>
            <div>
              <div class="stat-label">Tasa de cobro (mes)</div>
              <div class="stat-value">{{ privacyMode ? '***' : (summary.collection_rate_month + '%') }}</div>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Job status counters -->
      <div class="card-grid status-grid" *ngIf="jobStatus">
        <mat-card>
          <mat-card-content class="stat-card">
            <span class="status-badge status-abierto" style="font-size:14px;padding:8px 16px;">Abiertos: {{ jobStatus.abierto }}</span>
          </mat-card-content>
        </mat-card>
        <mat-card>
          <mat-card-content class="stat-card">
            <span class="status-badge status-terminado" style="font-size:14px;padding:8px 16px;">Terminados: {{ jobStatus.terminado }}</span>
          </mat-card-content>
        </mat-card>
        <mat-card>
          <mat-card-content class="stat-card">
            <span class="status-badge status-pagado" style="font-size:14px;padding:8px 16px;">Pagados: {{ jobStatus.pagado }}</span>
          </mat-card-content>
        </mat-card>
        @if (newClientsData) {
          <mat-card>
            <mat-card-content class="stat-card">
              <mat-icon class="stat-icon" style="color:#1565c0;">person_add</mat-icon>
              <div>
                <div class="stat-label">Nuevos clientes (mes)</div>
                <div class="stat-value">
                  {{ newClientsData.current_month }}
                  @if (newClientsData.previous_month > 0) {
                    <span class="delta" [class.positive]="newClientsData.current_month >= newClientsData.previous_month"
                          [class.negative]="newClientsData.current_month < newClientsData.previous_month">
                      {{ newClientsData.current_month >= newClientsData.previous_month ? '+' : '' }}{{ newClientsData.current_month - newClientsData.previous_month }}
                    </span>
                  }
                </div>
              </div>
            </mat-card-content>
          </mat-card>
        }
      </div>

      <!-- Section B: Alerts -->
      @if (overdueDebts.length > 0 || unpaidJobs.length > 0) {
        <mat-card class="alerts-card mb-16">
          <mat-card-content>
            <div class="alerts-header">
              <div style="display:flex;align-items:center;gap:8px;">
                <mat-icon style="color:#d32f2f;">warning</mat-icon>
                <h3 style="margin:0;">Alertas</h3>
              </div>
              <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:120px;">
                <mat-label>Dias</mat-label>
                <input matInput type="number" [(ngModel)]="alertDays" min="1" (change)="loadAlerts()">
              </mat-form-field>
            </div>

            @if (overdueDebts.length > 0) {
              <div class="alert-section">
                <h4 style="color:#d32f2f;margin:12px 0 8px;">
                  <mat-icon style="vertical-align:middle;font-size:18px;">account_balance_wallet</mat-icon>
                  Deudas vencidas ({{ overdueDebts.length }})
                </h4>
                <table mat-table [dataSource]="overdueDebts" style="width:100%;">
                  <ng-container matColumnDef="full_name">
                    <th mat-header-cell *matHeaderCellDef>Cliente</th>
                    <td mat-cell *matCellDef="let d">{{ d.full_name }}</td>
                  </ng-container>
                  <ng-container matColumnDef="saldo">
                    <th mat-header-cell *matHeaderCellDef class="text-right">Saldo</th>
                    <td mat-cell *matCellDef="let d" class="text-right" style="color:#d32f2f;font-weight:500;">
                      {{ privacyMode ? '***' : (d.saldo | appCurrency) }}
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="days_overdue">
                    <th mat-header-cell *matHeaderCellDef class="text-right">Dias</th>
                    <td mat-cell *matCellDef="let d" class="text-right">{{ d.days_overdue }}d</td>
                  </ng-container>
                  <ng-container matColumnDef="job_count">
                    <th mat-header-cell *matHeaderCellDef class="text-right">Trabajos</th>
                    <td mat-cell *matCellDef="let d" class="text-right">{{ d.job_count }}</td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="['full_name','saldo','days_overdue','job_count']"></tr>
                  <tr mat-row *matRowDef="let row; columns: ['full_name','saldo','days_overdue','job_count'];"
                      class="clickable-row" (click)="goToClient(row.id)"></tr>
                </table>
              </div>
            }

            @if (unpaidJobs.length > 0) {
              <div class="alert-section" style="margin-top:16px;">
                <h4 style="color:#e65100;margin:12px 0 8px;">
                  <mat-icon style="vertical-align:middle;font-size:18px;">pending_actions</mat-icon>
                  Trabajos terminados sin cobrar ({{ unpaidJobs.length }})
                </h4>
                <table mat-table [dataSource]="unpaidJobs" style="width:100%;">
                  <ng-container matColumnDef="job_number">
                    <th mat-header-cell *matHeaderCellDef>N.o</th>
                    <td mat-cell *matCellDef="let j">{{ j.job_number }}</td>
                  </ng-container>
                  <ng-container matColumnDef="client_name">
                    <th mat-header-cell *matHeaderCellDef>Cliente</th>
                    <td mat-cell *matCellDef="let j">{{ j.client_name }}</td>
                  </ng-container>
                  <ng-container matColumnDef="plate_number">
                    <th mat-header-cell *matHeaderCellDef>Patente</th>
                    <td mat-cell *matCellDef="let j">{{ j.plate_number }}</td>
                  </ng-container>
                  <ng-container matColumnDef="balance">
                    <th mat-header-cell *matHeaderCellDef class="text-right">Saldo</th>
                    <td mat-cell *matCellDef="let j" class="text-right" style="color:#e65100;font-weight:500;">
                      {{ privacyMode ? '***' : (j.balance | appCurrency) }}
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="days_pending">
                    <th mat-header-cell *matHeaderCellDef class="text-right">Dias</th>
                    <td mat-cell *matCellDef="let j" class="text-right">{{ j.days_pending }}d</td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="['job_number','client_name','plate_number','balance','days_pending']"></tr>
                  <tr mat-row *matRowDef="let row; columns: ['job_number','client_name','plate_number','balance','days_pending'];"
                      class="clickable-row" (click)="goToJob(row.id)"></tr>
                </table>
              </div>
            }
          </mat-card-content>
        </mat-card>
      }

      <!-- Section C: Revenue Trend with Tabs -->
      <mat-card class="mb-16">
        <mat-card-content>
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:12px;">
            <h3 style="margin:0;">Tendencia de ingresos</h3>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:130px;">
                <mat-label>Granularidad</mat-label>
                <mat-select [(ngModel)]="trendGranularity" (selectionChange)="loadRevenueTrend()">
                  <mat-option value="week">Semana</mat-option>
                  <mat-option value="month">Mes</mat-option>
                  <mat-option value="year">Ano</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:140px;">
                <mat-label>Desde</mat-label>
                <input matInput [matDatepicker]="trendFrom" [(ngModel)]="trendDateFrom" (dateChange)="loadRevenueTrend()">
                <mat-datepicker-toggle matIconSuffix [for]="trendFrom"></mat-datepicker-toggle>
                <mat-datepicker #trendFrom></mat-datepicker>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:140px;">
                <mat-label>Hasta</mat-label>
                <input matInput [matDatepicker]="trendTo" [(ngModel)]="trendDateTo" (dateChange)="loadRevenueTrend()">
                <mat-datepicker-toggle matIconSuffix [for]="trendTo"></mat-datepicker-toggle>
                <mat-datepicker #trendTo></mat-datepicker>
              </mat-form-field>
              @if (trendDateFrom || trendDateTo) {
                <button mat-icon-button (click)="clearTrendDates()">
                  <mat-icon>clear</mat-icon>
                </button>
              }
            </div>
          </div>

          <mat-tab-group [(selectedIndex)]="trendTabIndex">
            <mat-tab label="Grafico">
              <div style="padding:16px 0;">
                <canvas #revenueChart height="80"></canvas>
              </div>
            </mat-tab>
            <mat-tab label="Tabla">
              <div style="padding:16px 0;">
                <table mat-table [dataSource]="revenueTrendData" style="width:100%;">
                  <ng-container matColumnDef="period">
                    <th mat-header-cell *matHeaderCellDef>Periodo</th>
                    <td mat-cell *matCellDef="let r">{{ r.period }}</td>
                  </ng-container>
                  <ng-container matColumnDef="total">
                    <th mat-header-cell *matHeaderCellDef class="text-right">Ingresos</th>
                    <td mat-cell *matCellDef="let r" class="text-right">{{ privacyMode ? '***' : (r.total | appCurrency) }}</td>
                  </ng-container>
                  <ng-container matColumnDef="jobs_count">
                    <th mat-header-cell *matHeaderCellDef class="text-right">Trabajos</th>
                    <td mat-cell *matCellDef="let r" class="text-right">{{ r.jobs_count }}</td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="['period','total','jobs_count']"></tr>
                  <tr mat-row *matRowDef="let row; columns: ['period','total','jobs_count'];"></tr>
                </table>
              </div>
            </mat-tab>
          </mat-tab-group>
        </mat-card-content>
      </mat-card>

      <!-- Monthly Closing -->
      @if (monthlyClosing) {
        <mat-card class="mb-16">
          <mat-card-content>
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:12px;">
              <h3 style="margin:0;">Cierre mensual</h3>
              <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:160px;">
                <mat-label>Mes</mat-label>
                <input matInput type="month" [(ngModel)]="closingMonth" (change)="loadMonthlyClosing()">
              </mat-form-field>
            </div>

            <mat-tab-group>
              <mat-tab label="Todos">
                <ng-template matTabContent>
                  <div style="padding:16px 0;">
                    <div class="closing-summary">
                      <div class="closing-stat"><span class="closing-label">Trabajos</span><span class="closing-value">{{ monthlyClosing.all.count }}</span></div>
                      <div class="closing-stat"><span class="closing-label">Subtotal</span><span class="closing-value">{{ privacyMode ? '***' : (monthlyClosing.all.subtotal | appCurrency) }}</span></div>
                      <div class="closing-stat"><span class="closing-label">IVA</span><span class="closing-value">{{ privacyMode ? '***' : (monthlyClosing.all.tax | appCurrency) }}</span></div>
                      <div class="closing-stat"><span class="closing-label">Total</span><span class="closing-value" style="font-weight:600;">{{ privacyMode ? '***' : (monthlyClosing.all.total | appCurrency) }}</span></div>
                      <div class="closing-stat"><span class="closing-label">Cobrado</span><span class="closing-value" style="color:#2e7d32;">{{ privacyMode ? '***' : (monthlyClosing.all.paid | appCurrency) }}</span></div>
                      <div class="closing-stat"><span class="closing-label">Pendiente</span><span class="closing-value" style="color:#c62828;">{{ privacyMode ? '***' : (monthlyClosing.all.balance | appCurrency) }}</span></div>
                    </div>
                    <table mat-table [dataSource]="monthlyClosing.jobs" style="width:100%;">
                      <ng-container matColumnDef="job_number"><th mat-header-cell *matHeaderCellDef>N.o</th><td mat-cell *matCellDef="let j">{{ j.job_number }}</td></ng-container>
                      <ng-container matColumnDef="client_name"><th mat-header-cell *matHeaderCellDef>Cliente</th><td mat-cell *matCellDef="let j">{{ j.client_name }}</td></ng-container>
                      <ng-container matColumnDef="job_date"><th mat-header-cell *matHeaderCellDef>Fecha</th><td mat-cell *matCellDef="let j">{{ j.job_date | date:'dd/MM/yyyy' }}</td></ng-container>
                      <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>Estado</th><td mat-cell *matCellDef="let j"><span [class]="'status-badge status-' + j.status">{{ j.status | statusLabel }}</span></td></ng-container>
                      <ng-container matColumnDef="iva"><th mat-header-cell *matHeaderCellDef>IVA</th><td mat-cell *matCellDef="let j">{{ j.tax_enabled ? 'Si' : 'No' }}</td></ng-container>
                      <ng-container matColumnDef="total"><th mat-header-cell *matHeaderCellDef class="text-right">Total</th><td mat-cell *matCellDef="let j" class="text-right">{{ privacyMode ? '***' : (j.total | appCurrency) }}</td></ng-container>
                      <ng-container matColumnDef="paid"><th mat-header-cell *matHeaderCellDef class="text-right">Pagado</th><td mat-cell *matCellDef="let j" class="text-right">{{ privacyMode ? '***' : (j.paid | appCurrency) }}</td></ng-container>
                      <ng-container matColumnDef="balance"><th mat-header-cell *matHeaderCellDef class="text-right">Saldo</th><td mat-cell *matCellDef="let j" class="text-right" [style.color]="j.balance > 0 ? '#c62828' : '#2e7d32'">{{ privacyMode ? '***' : (j.balance | appCurrency) }}</td></ng-container>
                      <tr mat-header-row *matHeaderRowDef="closingColumns"></tr>
                      <tr mat-row *matRowDef="let row; columns: closingColumns;" class="clickable-row" (click)="goToJob(row.id)"></tr>
                    </table>
                  </div>
                </ng-template>
              </mat-tab>
              <mat-tab label="Con IVA">
                <ng-template matTabContent>
                  <div style="padding:16px 0;">
                    <div class="closing-summary">
                      <div class="closing-stat"><span class="closing-label">Trabajos</span><span class="closing-value">{{ monthlyClosing.iva.count }}</span></div>
                      <div class="closing-stat"><span class="closing-label">Subtotal</span><span class="closing-value">{{ privacyMode ? '***' : (monthlyClosing.iva.subtotal | appCurrency) }}</span></div>
                      <div class="closing-stat"><span class="closing-label">IVA</span><span class="closing-value">{{ privacyMode ? '***' : (monthlyClosing.iva.tax | appCurrency) }}</span></div>
                      <div class="closing-stat"><span class="closing-label">Total</span><span class="closing-value" style="font-weight:600;">{{ privacyMode ? '***' : (monthlyClosing.iva.total | appCurrency) }}</span></div>
                      <div class="closing-stat"><span class="closing-label">Cobrado</span><span class="closing-value" style="color:#2e7d32;">{{ privacyMode ? '***' : (monthlyClosing.iva.paid | appCurrency) }}</span></div>
                      <div class="closing-stat"><span class="closing-label">Pendiente</span><span class="closing-value" style="color:#c62828;">{{ privacyMode ? '***' : (monthlyClosing.iva.balance | appCurrency) }}</span></div>
                    </div>
                    <table mat-table [dataSource]="closingIvaJobs" style="width:100%;">
                      <ng-container matColumnDef="job_number"><th mat-header-cell *matHeaderCellDef>N.o</th><td mat-cell *matCellDef="let j">{{ j.job_number }}</td></ng-container>
                      <ng-container matColumnDef="client_name"><th mat-header-cell *matHeaderCellDef>Cliente</th><td mat-cell *matCellDef="let j">{{ j.client_name }}</td></ng-container>
                      <ng-container matColumnDef="job_date"><th mat-header-cell *matHeaderCellDef>Fecha</th><td mat-cell *matCellDef="let j">{{ j.job_date | date:'dd/MM/yyyy' }}</td></ng-container>
                      <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>Estado</th><td mat-cell *matCellDef="let j"><span [class]="'status-badge status-' + j.status">{{ j.status | statusLabel }}</span></td></ng-container>
                      <ng-container matColumnDef="iva"><th mat-header-cell *matHeaderCellDef>IVA</th><td mat-cell *matCellDef="let j">{{ j.tax_enabled ? 'Si' : 'No' }}</td></ng-container>
                      <ng-container matColumnDef="total"><th mat-header-cell *matHeaderCellDef class="text-right">Total</th><td mat-cell *matCellDef="let j" class="text-right">{{ privacyMode ? '***' : (j.total | appCurrency) }}</td></ng-container>
                      <ng-container matColumnDef="paid"><th mat-header-cell *matHeaderCellDef class="text-right">Pagado</th><td mat-cell *matCellDef="let j" class="text-right">{{ privacyMode ? '***' : (j.paid | appCurrency) }}</td></ng-container>
                      <ng-container matColumnDef="balance"><th mat-header-cell *matHeaderCellDef class="text-right">Saldo</th><td mat-cell *matCellDef="let j" class="text-right" [style.color]="j.balance > 0 ? '#c62828' : '#2e7d32'">{{ privacyMode ? '***' : (j.balance | appCurrency) }}</td></ng-container>
                      <tr mat-header-row *matHeaderRowDef="closingColumns"></tr>
                      <tr mat-row *matRowDef="let row; columns: closingColumns;" class="clickable-row" (click)="goToJob(row.id)"></tr>
                    </table>
                  </div>
                </ng-template>
              </mat-tab>
              <mat-tab label="Sin IVA">
                <ng-template matTabContent>
                  <div style="padding:16px 0;">
                    <div class="closing-summary">
                      <div class="closing-stat"><span class="closing-label">Trabajos</span><span class="closing-value">{{ monthlyClosing.no_iva.count }}</span></div>
                      <div class="closing-stat"><span class="closing-label">Subtotal</span><span class="closing-value">{{ privacyMode ? '***' : (monthlyClosing.no_iva.subtotal | appCurrency) }}</span></div>
                      <div class="closing-stat"><span class="closing-label">Total</span><span class="closing-value" style="font-weight:600;">{{ privacyMode ? '***' : (monthlyClosing.no_iva.total | appCurrency) }}</span></div>
                      <div class="closing-stat"><span class="closing-label">Cobrado</span><span class="closing-value" style="color:#2e7d32;">{{ privacyMode ? '***' : (monthlyClosing.no_iva.paid | appCurrency) }}</span></div>
                      <div class="closing-stat"><span class="closing-label">Pendiente</span><span class="closing-value" style="color:#c62828;">{{ privacyMode ? '***' : (monthlyClosing.no_iva.balance | appCurrency) }}</span></div>
                    </div>
                    <table mat-table [dataSource]="closingNoIvaJobs" style="width:100%;">
                      <ng-container matColumnDef="job_number"><th mat-header-cell *matHeaderCellDef>N.o</th><td mat-cell *matCellDef="let j">{{ j.job_number }}</td></ng-container>
                      <ng-container matColumnDef="client_name"><th mat-header-cell *matHeaderCellDef>Cliente</th><td mat-cell *matCellDef="let j">{{ j.client_name }}</td></ng-container>
                      <ng-container matColumnDef="job_date"><th mat-header-cell *matHeaderCellDef>Fecha</th><td mat-cell *matCellDef="let j">{{ j.job_date | date:'dd/MM/yyyy' }}</td></ng-container>
                      <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>Estado</th><td mat-cell *matCellDef="let j"><span [class]="'status-badge status-' + j.status">{{ j.status | statusLabel }}</span></td></ng-container>
                      <ng-container matColumnDef="iva"><th mat-header-cell *matHeaderCellDef>IVA</th><td mat-cell *matCellDef="let j">{{ j.tax_enabled ? 'Si' : 'No' }}</td></ng-container>
                      <ng-container matColumnDef="total"><th mat-header-cell *matHeaderCellDef class="text-right">Total</th><td mat-cell *matCellDef="let j" class="text-right">{{ privacyMode ? '***' : (j.total | appCurrency) }}</td></ng-container>
                      <ng-container matColumnDef="paid"><th mat-header-cell *matHeaderCellDef class="text-right">Pagado</th><td mat-cell *matCellDef="let j" class="text-right">{{ privacyMode ? '***' : (j.paid | appCurrency) }}</td></ng-container>
                      <ng-container matColumnDef="balance"><th mat-header-cell *matHeaderCellDef class="text-right">Saldo</th><td mat-cell *matCellDef="let j" class="text-right" [style.color]="j.balance > 0 ? '#c62828' : '#2e7d32'">{{ privacyMode ? '***' : (j.balance | appCurrency) }}</td></ng-container>
                      <tr mat-header-row *matHeaderRowDef="closingColumns"></tr>
                      <tr mat-row *matRowDef="let row; columns: closingColumns;" class="clickable-row" (click)="goToJob(row.id)"></tr>
                    </table>
                  </div>
                </ng-template>
              </mat-tab>
            </mat-tab-group>
          </mat-card-content>
        </mat-card>
      }

      <!-- Top 5 Clients -->
      <mat-card class="mb-16">
        <mat-card-content>
          <h3>Top 5 clientes por ingresos</h3>
          @if (topClients.length > 0) {
            <table mat-table [dataSource]="topClients" style="width:100%;">
              <ng-container matColumnDef="full_name">
                <th mat-header-cell *matHeaderCellDef>Cliente</th>
                <td mat-cell *matCellDef="let c">{{ c.full_name }}</td>
              </ng-container>
              <ng-container matColumnDef="total_paid">
                <th mat-header-cell *matHeaderCellDef class="text-right">Total pagado</th>
                <td mat-cell *matCellDef="let c" class="text-right">{{ privacyMode ? '***' : (c.total_paid | appCurrency) }}</td>
              </ng-container>
              <ng-container matColumnDef="job_count">
                <th mat-header-cell *matHeaderCellDef class="text-right">Trabajos</th>
                <td mat-cell *matCellDef="let c" class="text-right">{{ c.job_count }}</td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="['full_name','total_paid','job_count']"></tr>
              <tr mat-row *matRowDef="let row; columns: ['full_name','total_paid','job_count'];"
                  class="clickable-row" (click)="goToClient(row.id)"></tr>
            </table>
          } @else {
            <div class="empty-state"><mat-icon>people</mat-icon><p>Sin datos aun</p></div>
          }
        </mat-card-content>
      </mat-card>

      <!-- Section D: Recent Jobs -->
      <mat-card class="mb-16">
        <mat-card-content>
          <h3>Ultimos 10 trabajos</h3>
          <table mat-table [dataSource]="recentJobs" style="width:100%;">
            <ng-container matColumnDef="job_number">
              <th mat-header-cell *matHeaderCellDef>Numero</th>
              <td mat-cell *matCellDef="let j">{{ j.job_number }}</td>
            </ng-container>
            <ng-container matColumnDef="client_name">
              <th mat-header-cell *matHeaderCellDef>Cliente</th>
              <td mat-cell *matCellDef="let j">{{ j.client_name }}</td>
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
            <ng-container matColumnDef="job_date">
              <th mat-header-cell *matHeaderCellDef>Fecha</th>
              <td mat-cell *matCellDef="let j">{{ (j.job_date || j.created_at) | date:'dd/MM/yyyy' }}</td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="['job_number','client_name','plate_number','status','job_date']"></tr>
            <tr mat-row *matRowDef="let row; columns: ['job_number','client_name','plate_number','status','job_date'];"
                class="clickable-row" (click)="goToJob(row.id)"></tr>
          </table>
        </mat-card-content>
      </mat-card>

      <!-- Section E: Client Financials -->
      <mat-card>
        <mat-card-content>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3>Deudas de clientes</h3>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:200px;">
              <mat-select [(ngModel)]="debtFilter" (selectionChange)="loadClientFinancials()">
                <mat-option value="">Todos</mat-option>
                <mat-option value="deuda">Solo con deuda</mat-option>
              </mat-select>
            </mat-form-field>
          </div>

          @if (financialTotals) {
            <div class="card-grid" style="margin-bottom:16px;">
              <mat-card style="background:#e3f2fd;">
                <mat-card-content class="stat-card">
                  <div><div class="stat-label">Total facturado</div><div class="stat-value">{{ privacyMode ? '***' : (financialTotals.total_facturado | appCurrency) }}</div></div>
                </mat-card-content>
              </mat-card>
              <mat-card style="background:#e8f5e9;">
                <mat-card-content class="stat-card">
                  <div><div class="stat-label">Total cobrado</div><div class="stat-value">{{ privacyMode ? '***' : (financialTotals.total_pagado | appCurrency) }}</div></div>
                </mat-card-content>
              </mat-card>
              <mat-card style="background:#fff3e0;">
                <mat-card-content class="stat-card">
                  <div><div class="stat-label">Total pendiente</div><div class="stat-value balance-positive">{{ privacyMode ? '***' : (financialTotals.total_pendiente | appCurrency) }}</div></div>
                </mat-card-content>
              </mat-card>
            </div>
          }

          <table mat-table [dataSource]="clientFinancials" style="width:100%;">
            <ng-container matColumnDef="full_name">
              <th mat-header-cell *matHeaderCellDef>Cliente</th>
              <td mat-cell *matCellDef="let c">{{ c.full_name }}</td>
            </ng-container>
            <ng-container matColumnDef="rut">
              <th mat-header-cell *matHeaderCellDef>RUT</th>
              <td mat-cell *matCellDef="let c">{{ c.rut || '-' }}</td>
            </ng-container>
            <ng-container matColumnDef="job_count">
              <th mat-header-cell *matHeaderCellDef class="text-right">Trabajos</th>
              <td mat-cell *matCellDef="let c" class="text-right">{{ c.job_count }}</td>
            </ng-container>
            <ng-container matColumnDef="total_facturado">
              <th mat-header-cell *matHeaderCellDef class="text-right">Facturado</th>
              <td mat-cell *matCellDef="let c" class="text-right">{{ privacyMode ? '***' : (c.total_facturado | appCurrency) }}</td>
            </ng-container>
            <ng-container matColumnDef="total_pagado">
              <th mat-header-cell *matHeaderCellDef class="text-right">Pagado</th>
              <td mat-cell *matCellDef="let c" class="text-right">{{ privacyMode ? '***' : (c.total_pagado | appCurrency) }}</td>
            </ng-container>
            <ng-container matColumnDef="saldo">
              <th mat-header-cell *matHeaderCellDef class="text-right">Saldo</th>
              <td mat-cell *matCellDef="let c" class="text-right"
                  [style.background]="c.saldo > 0 ? '#fff8e1' : '#e8f5e9'"
                  [class]="c.saldo > 0 ? 'balance-positive' : 'balance-zero'">
                {{ privacyMode ? '***' : (c.saldo | appCurrency) }}
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="['full_name','rut','job_count','total_facturado','total_pagado','saldo']"></tr>
            <tr mat-row *matRowDef="let row; columns: ['full_name','rut','job_count','total_facturado','total_pagado','saldo'];"
                class="clickable-row" (click)="goToClient(row.id)"></tr>
          </table>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .stat-card { display: flex; align-items: center; gap: 16px; padding: 8px 0; }
    .stat-icon { font-size: 40px; width: 40px; height: 40px; }
    .stat-label { font-size: 13px; color: #666; }
    .stat-value { font-size: 22px; font-weight: 500; }
    .kpi-grid { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)) !important; }
    .status-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)) !important; }
    .delta {
      font-size: 13px; margin-left: 4px; font-weight: 400;
    }
    .delta.positive { color: #2e7d32; }
    .delta.negative { color: #c62828; }
    .closing-summary {
      display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 16px;
      padding: 12px; background: #f5f5f5; border-radius: 4px;
    }
    .closing-stat { display: flex; flex-direction: column; min-width: 100px; }
    .closing-label { font-size: 12px; color: #666; }
    .closing-value { font-size: 18px; font-weight: 500; }
    .alerts-card {
      border-left: 4px solid #d32f2f;
    }
    .alerts-header {
      display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;
    }
  `]
})
export class DashboardComponent implements OnInit, AfterViewInit {
  @ViewChild('revenueChart') chartRef!: ElementRef<HTMLCanvasElement>;

  summary: DashboardSummary | null = null;
  jobStatus: { abierto: number; terminado: number; pagado: number } | null = null;
  recentJobs: Job[] = [];
  clientFinancials: ClientFinancialRow[] = [];
  financialTotals: { total_facturado: number; total_pagado: number; total_pendiente: number } | null = null;
  debtFilter = '';
  privacyMode = false;

  // Alerts
  overdueDebts: OverdueDebt[] = [];
  unpaidJobs: UnpaidJob[] = [];
  alertDays = 30;

  // Trend chart
  trendGranularity: 'week' | 'month' | 'year' = 'month';
  trendDateFrom: Date | null = null;
  trendDateTo: Date | null = null;
  trendTabIndex = 0;
  revenueTrendData: RevenueTrendItem[] = [];

  // Monthly closing
  monthlyClosing: MonthlyClosing | null = null;
  closingMonth = new Date().toISOString().slice(0, 7);
  closingColumns = ['job_number', 'client_name', 'job_date', 'status', 'iva', 'total', 'paid', 'balance'];
  closingIvaJobs: MonthlyClosingJob[] = [];
  closingNoIvaJobs: MonthlyClosingJob[] = [];

  // Insights
  topClients: TopClient[] = [];
  newClientsData: NewClientsData | null = null;

  private chart: Chart | null = null;

  constructor(private api: ApiService, private router: Router) {}

  ngOnInit() {
    this.api.getDashboardSummary().subscribe(s => this.summary = s);
    this.api.getJobStatus().subscribe(s => this.jobStatus = s);
    this.api.getRecentJobs().subscribe(j => this.recentJobs = j);
    this.api.getTopClients().subscribe(c => this.topClients = c);
    this.api.getNewClients().subscribe(d => this.newClientsData = d);
    this.api.getSettings().subscribe(s => {
      this.alertDays = parseInt(s.unpaid_days_threshold) || 30;
      this.loadAlerts();
    });
    this.loadRevenueTrend();
    this.loadMonthlyClosing();
    this.loadClientFinancials();
  }

  ngAfterViewInit() {
    if (this.revenueTrendData.length) this.renderChart();
  }

  loadAlerts() {
    this.api.getOverdueDebts(this.alertDays).subscribe(d => this.overdueDebts = d);
    this.api.getUnpaidJobs(this.alertDays).subscribe(j => this.unpaidJobs = j);
  }

  loadRevenueTrend() {
    const params: Record<string, string> = { granularity: this.trendGranularity };
    if (this.trendDateFrom) params['date_from'] = this.formatDate(this.trendDateFrom);
    if (this.trendDateTo) params['date_to'] = this.formatDate(this.trendDateTo);
    this.api.getRevenueTrend(params).subscribe(d => {
      this.revenueTrendData = d.map(r => ({
        period: r.period,
        total: parseFloat(r.total as any),
        jobs_count: parseInt(r.jobs_count as any) || 0
      }));
      setTimeout(() => this.renderChart(), 50);
    });
  }

  clearTrendDates() {
    this.trendDateFrom = null;
    this.trendDateTo = null;
    this.loadRevenueTrend();
  }

  loadMonthlyClosing() {
    this.api.getMonthlyClosing(this.closingMonth).subscribe(d => {
      this.monthlyClosing = d;
      this.closingIvaJobs = d.jobs.filter(j => j.tax_enabled);
      this.closingNoIvaJobs = d.jobs.filter(j => !j.tax_enabled);
    });
  }

  loadClientFinancials() {
    this.api.getClientFinancials(this.debtFilter || undefined).subscribe(r => {
      this.clientFinancials = r.clients;
      this.financialTotals = r.totals;
    });
  }

  onPrivacyToggle() {
    this.renderChart();
  }

  renderChart() {
    if (!this.chartRef?.nativeElement || !this.revenueTrendData.length) return;
    if (this.chart) this.chart.destroy();

    const labels = this.revenueTrendData.map(d => d.period);
    const data = this.revenueTrendData.map(d => d.total);

    this.chart = new Chart(this.chartRef.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Ingresos',
          data,
          borderColor: '#1565c0',
          backgroundColor: 'rgba(21, 101, 192, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#1565c0',
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            display: !this.privacyMode,
            ticks: { callback: (v) => '$ ' + Number(v).toLocaleString('es-UY') }
          }
        }
      }
    });
  }

  private formatDate(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  goToJob(id: string) { this.router.navigate(['/trabajos', id]); }
  goToClient(id: string) { this.router.navigate(['/clientes', id]); }
}
