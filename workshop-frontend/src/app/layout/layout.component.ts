import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/auth/auth.service';
import { ApiService } from '../core/services/api.service';
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
      <mat-sidenav mode="side" opened class="sidenav">
        <div class="sidenav-header">
          <div class="logo-container">
            <img src="assets/logo.png" alt="La Llave" class="logo-img"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div class="logo-fallback" style="display:none;">
              <mat-icon class="logo-icon">build</mat-icon>
              <span class="logo-text">La Llave</span>
            </div>
          </div>
        </div>
        <mat-nav-list>
          @if (auth.isAdmin()) {
            <a mat-list-item routerLink="/dashboard" routerLinkActive="active">
              <mat-icon matListItemIcon>dashboard</mat-icon>
              <span>Dashboard</span>
            </a>
          }
          <a mat-list-item routerLink="/trabajos" routerLinkActive="active">
            <mat-icon matListItemIcon>work</mat-icon>
            <span>Trabajos</span>
          </a>
          @if (auth.isAdminOrRecep()) {
            <a mat-list-item routerLink="/clientes" routerLinkActive="active">
              <mat-icon matListItemIcon>people</mat-icon>
              <span>Clientes</span>
            </a>
          }
          <a mat-list-item routerLink="/vehiculos" routerLinkActive="active">
            <mat-icon matListItemIcon>directions_car</mat-icon>
            <span>Vehiculos</span>
          </a>
          @if (auth.isAdmin()) {
            <a mat-list-item routerLink="/usuarios" routerLinkActive="active">
              <mat-icon matListItemIcon>manage_accounts</mat-icon>
              <span>Usuarios</span>
            </a>
          }
        </mat-nav-list>
      </mat-sidenav>

      <mat-sidenav-content class="main-content">
        <mat-toolbar class="top-toolbar">
          <mat-form-field appearance="outline" class="search-bar" subscriptSizing="dynamic">
            <mat-icon matPrefix>search</mat-icon>
            <input matInput placeholder="Buscar cliente, patente, trabajo..."
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
          </mat-form-field>

          <span class="spacer"></span>

          <button mat-button [matMenuTriggerFor]="userMenu" class="user-menu-btn">
            <mat-icon>account_circle</mat-icon>
            {{ auth.currentUser()?.full_name }}
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
        </mat-toolbar>

        <div class="page-wrapper">
          <router-outlet />
        </div>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [`
    .layout-container { height: 100vh; }
    .sidenav {
      width: 220px;
      background: var(--color-primary);
    }
    .sidenav-header {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px 12px;
      color: white;
    }
    .logo-container {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
    }
    .logo-img {
      max-width: 160px;
      max-height: 80px;
      object-fit: contain;
    }
    .logo-fallback {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .logo-icon { font-size: 28px; width: 28px; height: 28px; }
    .logo-text { font-size: 20px; font-weight: 500; }
    .sidenav mat-nav-list a {
      color: rgba(255,255,255,0.8);
    }
    .sidenav mat-nav-list a.active {
      color: white;
      background: rgba(255,255,255,0.12);
      border-left: 3px solid var(--color-accent);
    }
    .sidenav mat-nav-list mat-icon {
      color: rgba(255,255,255,0.7);
    }
    .sidenav mat-nav-list a.active mat-icon {
      color: var(--color-accent-light);
    }
    .main-content { display: flex; flex-direction: column; }
    .top-toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      background: var(--color-primary-dark);
      color: white;
    }
    .search-bar {
      margin-left: 16px;
      width: 350px;
    }
    .search-bar .mat-mdc-form-field-wrapper {
      padding: 0;
    }
    :host ::ng-deep .search-bar .mat-mdc-text-field-wrapper {
      background: rgba(255,255,255,0.12);
      border-radius: 4px;
    }
    :host ::ng-deep .search-bar input { color: white; }
    :host ::ng-deep .search-bar mat-icon { color: rgba(255,255,255,0.7); }
    .user-menu-btn { color: white; }
    .page-wrapper { flex: 1; overflow: auto; }
    .spacer { flex: 1; }
  `]
})
export class LayoutComponent {
  searchQuery = '';
  searchResults: SearchResults | null = null;
  private searchTimeout: any;

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private router: Router
  ) {}

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
