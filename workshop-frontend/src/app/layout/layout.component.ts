import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { FormsModule } from '@angular/forms';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { AuthService } from '../core/auth/auth.service';
import { ApiService } from '../core/services/api.service';
import { WorkshopConfigService } from '../core/services/workshop-config.service';
import { SearchResults } from '../core/models';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule, RouterOutlet, RouterLink, RouterLinkActive,
    MatSidenavModule, MatToolbarModule, MatListModule, MatIconModule,
    MatButtonModule, MatMenuModule, MatFormFieldModule, MatInputModule,
    MatAutocompleteModule, FormsModule
  ],
  template: `
    <mat-sidenav-container class="layout-container">
      <mat-sidenav #sidenav [mode]="isMobile ? 'over' : 'side'" [opened]="!isMobile" class="sidenav">

        <!-- Logo -->
        <div class="sidebar-logo">
          <div class="logo-inner">
            <div class="logo-mark">
              <mat-icon class="logo-mark-icon">build</mat-icon>
            </div>
            <div>
              <div class="logo-name">{{ workshopConfig.config()?.name || 'AutoShop' }}</div>
              <div class="logo-sub">Manager</div>
            </div>
          </div>
        </div>

        <!-- Navigation -->
        <nav class="sidebar-nav">
          <span class="nav-label">Principal</span>

          @if (auth.isAdmin()) {
            <a class="nav-item" routerLink="/dashboard" routerLinkActive="active" (click)="onNavClick()">
              <mat-icon class="nav-icon">dashboard</mat-icon>
              <span>Dashboard</span>
            </a>
          }

          <a class="nav-item" routerLink="/trabajos" routerLinkActive="active" (click)="onNavClick()">
            <mat-icon class="nav-icon">work</mat-icon>
            <span>Trabajos</span>
          </a>

          @if (auth.isAdminOrRecep()) {
            <a class="nav-item" routerLink="/clientes" routerLinkActive="active" (click)="onNavClick()">
              <mat-icon class="nav-icon">people</mat-icon>
              <span>Clientes</span>
            </a>
          }

          <a class="nav-item" routerLink="/vehiculos" routerLinkActive="active" (click)="onNavClick()">
            <mat-icon class="nav-icon">directions_car</mat-icon>
            <span>Vehiculos</span>
          </a>

          @if (auth.isAdmin()) {
            <span class="nav-label" style="margin-top:8px;">Administracion</span>
            <a class="nav-item" routerLink="/pagos" routerLinkActive="active" (click)="onNavClick()">
              <mat-icon class="nav-icon">payments</mat-icon>
              <span>Pagos</span>
            </a>
            <a class="nav-item" routerLink="/usuarios" routerLinkActive="active" (click)="onNavClick()">
              <mat-icon class="nav-icon">manage_accounts</mat-icon>
              <span>Usuarios</span>
            </a>
            <a class="nav-item" routerLink="/importar" routerLinkActive="active" (click)="onNavClick()">
              <mat-icon class="nav-icon">upload_file</mat-icon>
              <span>Importar</span>
            </a>
            <a class="nav-item" routerLink="/ajustes" routerLinkActive="active" (click)="onNavClick()">
              <mat-icon class="nav-icon">settings</mat-icon>
              <span>Ajustes</span>
            </a>
          }
        </nav>

        <!-- User card in footer -->
        <div class="sidebar-footer">
          <div class="user-card">
            <div class="user-avatar">{{ userInitials }}</div>
            <div>
              <div class="user-name">{{ auth.currentUser()?.full_name || 'Usuario' }}</div>
              <div class="user-role">{{ auth.currentUser()?.role || '' }}</div>
            </div>
          </div>
        </div>

      </mat-sidenav>

      <mat-sidenav-content class="main-content">

        <!-- Topbar -->
        <header class="topbar">
          @if (isMobile) {
            <button mat-icon-button (click)="sidenav.toggle()" class="menu-btn">
              <mat-icon>menu</mat-icon>
            </button>
          }

          <mat-form-field appearance="outline" class="search-bar" subscriptSizing="dynamic">
            <mat-icon matPrefix class="search-icon">search</mat-icon>
            <input matInput placeholder="Buscar cliente, patente, trabajo..."
                   [(ngModel)]="searchQuery"
                   (input)="onSearch()"
                   [matAutocomplete]="auto">
            <mat-autocomplete #auto="matAutocomplete" (optionSelected)="onSelect($event)">
              @if (searchResults) {
                @for (c of searchResults.clients; track c.id) {
                  <mat-option [value]="'client:' + c.id">
                    <mat-icon style="font-size:16px;width:16px;height:16px;vertical-align:middle;margin-right:6px;">person</mat-icon>
                    {{ c.full_name }} <small style="color:var(--text-3);margin-left:6px;">{{ c.rut || '' }}</small>
                  </mat-option>
                }
                @for (v of searchResults.vehicles; track v.id) {
                  <mat-option [value]="'vehicle:' + v.id">
                    <mat-icon style="font-size:16px;width:16px;height:16px;vertical-align:middle;margin-right:6px;">directions_car</mat-icon>
                    {{ v.plate_number }} — {{ v.make }} {{ v.model }}
                  </mat-option>
                }
                @for (j of searchResults.jobs; track j.id) {
                  <mat-option [value]="'job:' + j.id">
                    <mat-icon style="font-size:16px;width:16px;height:16px;vertical-align:middle;margin-right:6px;">work</mat-icon>
                    {{ j.job_number }} — {{ j.client_name }}
                  </mat-option>
                }
              }
            </mat-autocomplete>
          </mat-form-field>

          <span class="spacer"></span>

          <button mat-button [matMenuTriggerFor]="userMenu" class="user-menu-btn">
            <mat-icon>account_circle</mat-icon>
            @if (!isMobile) { <span>{{ auth.currentUser()?.full_name }}</span> }
          </button>
          <mat-menu #userMenu="matMenu">
            <button mat-menu-item disabled>
              <mat-icon>badge</mat-icon>
              <span>{{ auth.currentUser()?.role }}</span>
            </button>
            <button mat-menu-item (click)="auth.logout()">
              <mat-icon>logout</mat-icon>
              <span>Cerrar sesion</span>
            </button>
          </mat-menu>
        </header>

        <div class="page-wrapper">
          <router-outlet />
        </div>

      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [`
    /* ── Container ─────────────────────── */
    .layout-container { height: 100vh; }

    /* ── Sidebar ────────────────────────── */
    .sidenav {
      width: 220px;
      background: var(--surface);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
    }

    /* Logo */
    .sidebar-logo {
      padding: 20px 16px 16px;
      border-bottom: 1px solid var(--border2);
      flex-shrink: 0;
    }

    .logo-inner {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .logo-mark {
      width: 30px;
      height: 30px;
      background: var(--navy);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .logo-mark-icon {
      color: #fff;
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .logo-name {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -.02em;
      color: var(--navy);
    }

    .logo-sub {
      font-size: 9px;
      font-weight: 600;
      color: var(--text-3);
      letter-spacing: .08em;
      text-transform: uppercase;
      margin-top: 1px;
    }

    /* Nav */
    .sidebar-nav {
      padding: 12px 10px;
      flex: 1;
      overflow-y: auto;
    }

    .nav-label {
      display: block;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .1em;
      color: var(--text-3);
      padding: 8px 10px 5px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 8px 10px;
      border-radius: var(--r-sm);
      font-size: 12px;
      font-weight: 500;
      color: var(--text-2);
      cursor: pointer;
      transition: all .12s;
      margin-bottom: 1px;
      text-decoration: none;
      user-select: none;
    }

    .nav-item:hover {
      background: var(--bg);
      color: var(--text-1);
    }

    .nav-item.active {
      background: var(--navy);
      color: #fff;
    }

    .nav-item.active .nav-icon {
      color: #fff;
      opacity: 1;
    }

    .nav-icon {
      font-size: 17px;
      width: 17px;
      height: 17px;
      flex-shrink: 0;
      opacity: .6;
    }

    /* Sidebar footer — user card */
    .sidebar-footer {
      padding: 12px 14px;
      border-top: 1px solid var(--border2);
      flex-shrink: 0;
    }

    .user-card {
      display: flex;
      align-items: center;
      gap: 9px;
    }

    .user-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--navy);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
      flex-shrink: 0;
      letter-spacing: .02em;
    }

    .user-name {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-1);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 140px;
    }

    .user-role {
      font-size: 10px;
      color: var(--text-3);
      text-transform: capitalize;
    }

    /* ── Topbar ─────────────────────────── */
    .main-content {
      display: flex;
      flex-direction: column;
    }

    .topbar {
      height: 52px;
      padding: 0 20px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      display: flex;
      align-items: center;
      gap: 8px;
      position: sticky;
      top: 0;
      z-index: 50;
      flex-shrink: 0;
    }

    .menu-btn {
      color: var(--text-2);
    }

    /* Search field */
    .search-bar {
      width: 320px;
      --mdc-outlined-text-field-outline-color: var(--border);
      --mdc-outlined-text-field-focus-outline-color: var(--navy);
    }

    :host ::ng-deep .search-bar .mat-mdc-text-field-wrapper {
      background: var(--bg);
    }

    :host ::ng-deep .search-bar .mdc-notched-outline__leading,
    :host ::ng-deep .search-bar .mdc-notched-outline__notch,
    :host ::ng-deep .search-bar .mdc-notched-outline__trailing {
      border-color: var(--border) !important;
    }

    :host ::ng-deep .search-bar .mat-mdc-input-element {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 12px;
      color: var(--text-1) !important;
    }

    :host ::ng-deep .search-bar .mat-mdc-input-element::placeholder {
      color: var(--text-3) !important;
    }

    .search-icon {
      color: var(--text-3);
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    @media (max-width: 768px) {
      .search-bar { width: 180px; }
    }

    /* User menu button */
    .user-menu-btn {
      color: var(--text-1) !important;
      font-family: 'Plus Jakarta Sans', sans-serif !important;
      font-size: 12px !important;
      font-weight: 500 !important;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    :host ::ng-deep .user-menu-btn .mdc-button__label {
      color: var(--text-1) !important;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    :host ::ng-deep .user-menu-btn mat-icon {
      color: var(--text-2) !important;
    }

    /* ── Page wrapper ───────────────────── */
    .page-wrapper {
      flex: 1;
      overflow: auto;
    }

    .spacer { flex: 1; }
  `]
})
export class LayoutComponent {
  @ViewChild('sidenav') sidenav!: MatSidenav;
  searchQuery = '';
  searchResults: SearchResults | null = null;
  isMobile = false;
  private searchTimeout: any;

  constructor(
    public auth: AuthService,
    private api: ApiService,
    public workshopConfig: WorkshopConfigService,
    private router: Router,
    private breakpointObserver: BreakpointObserver
  ) {
    this.breakpointObserver.observe([Breakpoints.Handset]).subscribe(result => {
      this.isMobile = result.matches;
    });
  }

  get userInitials(): string {
    const name = this.auth.currentUser()?.full_name || '';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return 'U';
  }

  onNavClick() {
    if (this.isMobile) this.sidenav.close();
  }

  onSearch() {
    clearTimeout(this.searchTimeout);
    if (this.searchQuery.length < 2) {
      this.searchResults = null;
      return;
    }
    this.searchTimeout = setTimeout(() => {
      this.api.search(this.searchQuery).subscribe(r => this.searchResults = r);
    }, 300);
  }

  onSelect(event: any) {
    const val: string = event.option.value;
    const [type, id] = val.split(':');
    this.searchQuery = '';
    this.searchResults = null;
    if (type === 'client')  this.router.navigate(['/clientes', id]);
    if (type === 'vehicle') this.router.navigate(['/vehiculos', id]);
    if (type === 'job')     this.router.navigate(['/trabajos', id]);
  }
}
