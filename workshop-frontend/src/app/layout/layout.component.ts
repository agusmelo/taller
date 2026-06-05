import { Component, OnDestroy, ViewChild } from '@angular/core';
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
import { MatBadgeModule } from '@angular/material/badge';
import { FormsModule } from '@angular/forms';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { AuthService } from '../core/auth/auth.service';
import { ApiService } from '../core/services/api.service';
import { WorkshopConfigService } from '../core/services/workshop-config.service';
import { AlertsBadgeService } from '../core/services/alerts-badge.service';
import { SearchResults } from '../core/models';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule, RouterOutlet, RouterLink, RouterLinkActive,
    MatSidenavModule, MatToolbarModule, MatListModule, MatIconModule,
    MatButtonModule, MatMenuModule, MatFormFieldModule, MatInputModule,
    MatAutocompleteModule, MatBadgeModule, FormsModule
  ],
  template: `
    <mat-sidenav-container class="layout-container">
      <mat-sidenav #sidenav [mode]="isMobile ? 'over' : 'side'" [opened]="!isMobile" class="sidenav">
        <div class="brand">
          <div class="logo-mark">
            <img [src]="workshopConfig.config()?.logo_url || 'assets/logo.png'"
                 [alt]="workshopConfig.config()?.name || 'Taller'"
                 class="logo-img"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <mat-icon class="logo-fallback-icon" style="display:none;">build</mat-icon>
          </div>
          <div class="brand-text">
            <span class="brand-name">{{ workshopConfig.config()?.name || 'Taller' }}</span>
            <span class="brand-sub">Backoffice</span>
          </div>
        </div>

        <nav class="nav">
          @if (auth.isAdmin()) {
            <a class="nav-item" routerLink="/dashboard" routerLinkActive="active" #l1="routerLinkActive" [attr.aria-current]="l1.isActive ? 'page' : null" (click)="onNavClick()">
              <mat-icon>dashboard</mat-icon><span>Dashboard</span>
            </a>
          }
          <a class="nav-item" routerLink="/trabajos" routerLinkActive="active" #l2="routerLinkActive" [attr.aria-current]="l2.isActive ? 'page' : null" (click)="onNavClick()">
            <mat-icon>work</mat-icon><span>Trabajos</span>
          </a>
          @if (auth.isAdmin()) {
            <a class="nav-item nav-sub" routerLink="/trabajos/catalogo-items" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}" #l2b="routerLinkActive" [attr.aria-current]="l2b.isActive ? 'page' : null" (click)="onNavClick()">
              <mat-icon>inventory_2</mat-icon><span>Catalogo de items</span>
            </a>
          }
          @if (auth.isAdminOrRecep()) {
            <a class="nav-item" routerLink="/clientes" routerLinkActive="active" #l3="routerLinkActive" [attr.aria-current]="l3.isActive ? 'page' : null" (click)="onNavClick()">
              <mat-icon>people</mat-icon><span>Clientes</span>
            </a>
          }
          @if (auth.isAdminOrRecep()) {
            <a class="nav-item" routerLink="/alertas" routerLinkActive="active" #lRet="routerLinkActive" [attr.aria-current]="lRet.isActive ? 'page' : null" (click)="onNavClick()">
              <mat-icon>notifications_active</mat-icon><span>Alertas</span>
            </a>
          }
          <a class="nav-item" routerLink="/vehiculos" routerLinkActive="active" #l4="routerLinkActive" [attr.aria-current]="l4.isActive ? 'page' : null" (click)="onNavClick()">
            <mat-icon>directions_car</mat-icon><span>Vehiculos</span>
          </a>
          @if (auth.isAdmin()) {
            <a class="nav-item" routerLink="/pagos" routerLinkActive="active" #l5="routerLinkActive" [attr.aria-current]="l5.isActive ? 'page' : null" (click)="onNavClick()">
              <mat-icon>payments</mat-icon><span>Pagos</span>
            </a>
          }
          @if (auth.isAdmin()) {
            <a class="nav-item" routerLink="/usuarios" routerLinkActive="active" #l6="routerLinkActive" [attr.aria-current]="l6.isActive ? 'page' : null" (click)="onNavClick()">
              <mat-icon>manage_accounts</mat-icon><span>Usuarios</span>
            </a>
          }
          @if (auth.isAdmin()) {
            <a class="nav-item" routerLink="/importar" routerLinkActive="active" #l7="routerLinkActive" [attr.aria-current]="l7.isActive ? 'page' : null" (click)="onNavClick()">
              <mat-icon>upload_file</mat-icon><span>Importar</span>
            </a>
          }
          @if (auth.isAdmin()) {
            <a class="nav-item" routerLink="/ajustes" routerLinkActive="active" #l8="routerLinkActive" [attr.aria-current]="l8.isActive ? 'page' : null" (click)="onNavClick()">
              <mat-icon>settings</mat-icon><span>Ajustes</span>
            </a>
          }
        </nav>

        <div class="sidenav-foot">
          <span class="foot-text">v1.0 · {{ todayChip }}</span>
        </div>
      </mat-sidenav>

      <mat-sidenav-content class="main-content">
        <header class="topbar">
          @if (isMobile) {
            <button mat-icon-button (click)="sidenav.toggle()" class="hamburger">
              <mat-icon>menu</mat-icon>
            </button>
          }

          <div class="topbar-search">
            <mat-icon class="search-ico">search</mat-icon>
            <input type="text"
                   placeholder="Buscar cliente, patente, trabajo…"
                   [(ngModel)]="searchQuery"
                   (input)="onSearch()"
                   [matAutocomplete]="auto">
            <mat-autocomplete #auto="matAutocomplete" (optionSelected)="onSelect($event)">
              @if (searchResults) {
                @for (c of searchResults.clients; track c.id) {
                  <mat-option [value]="'client:' + c.id">
                    <mat-icon>person</mat-icon> {{ c.full_name }} <small>{{ c.rut || '' }}</small>
                  </mat-option>
                }
                @for (v of searchResults.vehicles; track v.id) {
                  <mat-option [value]="'vehicle:' + v.id">
                    <mat-icon>directions_car</mat-icon> {{ v.plate_number }} - {{ v.make }} {{ v.model }}
                  </mat-option>
                }
                @for (j of searchResults.jobs; track j.id) {
                  <mat-option [value]="'job:' + j.id">
                    <mat-icon>work</mat-icon> {{ j.job_number }} - {{ j.client_name }}
                  </mat-option>
                }
              }
            </mat-autocomplete>
          </div>

          <div class="spacer"></div>

          <div class="date-chip">
            <mat-icon>event</mat-icon>
            <span>{{ todayChip }}</span>
          </div>

          <a routerLink="/alertas" mat-icon-button class="icon-btn bell" aria-label="Alertas">
            <mat-icon [matBadge]="alertsBadge.count() > 0 ? alertsBadge.count() : null"
              matBadgeColor="warn" matBadgeSize="small">
              {{ alertsBadge.count() > 0 ? 'notifications_active' : 'notifications_none' }}
            </mat-icon>
          </a>

          @if (auth.isAdminOrRecep()) {
            <button class="btn btn-primary cta" (click)="goNewJob()">
              <mat-icon>add</mat-icon>
              @if (!isMobile) { <span>Nuevo trabajo</span> }
            </button>
          }

          <button mat-button [matMenuTriggerFor]="userMenu" class="user-menu-btn">
            <mat-icon>account_circle</mat-icon>
            @if (!isMobile) { <span class="user-name">{{ auth.currentUser()?.full_name }}</span> }
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
    .layout-container { height: 100vh; background: var(--bg); }

    /* ===== Sidebar (dark variant) ===== */
    .sidenav {
      width: var(--sidebar-w);
      background: var(--navy);
      border-right: 1px solid var(--navy2);
      display: flex;
      flex-direction: column;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 14px 18px;
      border-bottom: 1px solid rgba(255,255,255,.06);
    }
    .logo-mark {
      width: 30px;
      height: 30px;
      background: var(--navy2);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex: 0 0 30px;
    }
    .logo-img { max-width: 26px; max-height: 26px; object-fit: contain; }
    .logo-fallback-icon { color: #fff; font-size: 18px; width: 18px; height: 18px; }
    .brand-text { display: flex; flex-direction: column; min-width: 0; }
    .brand-name {
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .brand-sub {
      color: rgba(255,255,255,.5);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .nav {
      display: flex;
      flex-direction: column;
      padding: 10px 8px;
      gap: 2px;
      flex: 1;
      overflow-y: auto;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: var(--r-sm);
      color: rgba(255,255,255,.72);
      font-size: 13px;
      font-weight: 500;
      text-decoration: none;
      transition: background .14s, color .14s;
    }
    .nav-item mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: rgba(255,255,255,.55);
    }
    .nav-item:hover {
      background: var(--navy2);
      color: #fff;
    }
    .nav-item:hover mat-icon { color: #fff; }
    .nav-item.active {
      background: var(--navy2);
      color: #fff;
    }
    .nav-item.active mat-icon { color: #fff; }
    .nav-item.nav-sub { padding-left: 28px; font-size: 12px; }
    .nav-item.nav-sub mat-icon { font-size: 16px; width: 16px; height: 16px; }

    .sidenav-foot {
      padding: 10px 16px 14px;
      border-top: 1px solid rgba(255,255,255,.06);
    }
    .foot-text {
      color: rgba(255,255,255,.4);
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
    }

    /* ===== Main area ===== */
    .main-content { display: flex; flex-direction: column; background: var(--bg); }

    /* ===== Topbar (white) ===== */
    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 10px;
      height: 56px;
      padding: 0 20px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }
    .hamburger mat-icon { color: var(--text-2); }

    .topbar-search {
      position: relative;
      width: 380px;
      max-width: 40vw;
      display: flex;
      align-items: center;
    }
    .topbar-search .search-ico {
      position: absolute;
      left: 10px;
      color: var(--text-3);
      font-size: 18px;
      width: 18px;
      height: 18px;
      pointer-events: none;
    }
    .topbar-search input {
      width: 100%;
      height: 36px;
      padding: 0 12px 0 34px;
      background: var(--bg);
      border: 1px solid transparent;
      border-radius: var(--r-sm);
      font-size: 13px;
      font-family: inherit;
      color: var(--text-1);
      outline: none;
      transition: background .14s, border-color .14s, box-shadow .14s;
    }
    .topbar-search input::placeholder { color: var(--text-3); }
    .topbar-search input:hover { background: #eceae5; }
    .topbar-search input:focus {
      background: var(--surface);
      border-color: var(--navy);
      box-shadow: 0 0 0 3px rgba(17,24,39,.06);
    }
    @media (max-width: 768px) {
      .topbar-search { width: 220px; }
    }

    .spacer { flex: 1; }

    .date-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: var(--bg);
      border-radius: var(--r-sm);
      font-size: 12px;
      font-weight: 500;
      color: var(--text-2);
    }
    .date-chip mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: var(--text-3);
    }
    @media (max-width: 900px) { .date-chip { display: none; } }

    .icon-btn.bell { color: var(--text-2); }
    .icon-btn.bell mat-icon { font-size: 20px; width: 20px; height: 20px; }

    .cta {
      height: 36px;
      padding: 0 14px;
      font-size: 12px;
    }
    .cta mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .user-menu-btn { color: var(--text-1); font-size: 13px; }
    .user-menu-btn mat-icon { color: var(--text-2); }
    .user-name { font-weight: 500; margin-left: 4px; }

    .page-wrapper { flex: 1; overflow: auto; background: var(--bg); }
  `]
})
export class LayoutComponent implements OnDestroy {
  @ViewChild('sidenav') sidenav!: MatSidenav;
  searchQuery = '';
  searchResults: SearchResults | null = null;
  isMobile = false;
  todayChip = '';
  private searchTimeout: any;
  private dateTimer: any;

  constructor(
    public auth: AuthService,
    private api: ApiService,
    public workshopConfig: WorkshopConfigService,
    public alertsBadge: AlertsBadgeService,
    private router: Router,
    private breakpointObserver: BreakpointObserver
  ) {
    this.breakpointObserver.observe([Breakpoints.Handset]).subscribe(result => {
      this.isMobile = result.matches;
    });
    this.refreshDateChip();
    this.dateTimer = setInterval(() => this.refreshDateChip(), 60_000);
    this.alertsBadge.start();
  }

  ngOnDestroy() {
    if (this.dateTimer) clearInterval(this.dateTimer);
    this.alertsBadge.stop();
  }

  private refreshDateChip() {
    this.todayChip = new Date().toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  onNavClick() {
    if (this.isMobile) this.sidenav.close();
  }

  goNewJob() {
    this.router.navigate(['/trabajos/nuevo']);
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
