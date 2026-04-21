import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/auth/auth.service';
import { WorkshopConfigService } from '../../../core/services/workshop-config.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule
  ],
  template: `
    <div class="login-wrapper">
      <div class="login-card">
        <!-- Logo mark -->
        <div class="login-logo">
          <div class="logo-mark">
            <mat-icon class="logo-icon">build</mat-icon>
          </div>
          <div>
            <div class="logo-name">{{ workshopConfig.config()?.name || 'AutoShop' }}</div>
            <div class="logo-sub">Manager</div>
          </div>
        </div>

        <h2 class="login-title">Iniciar sesion</h2>

        @if (error) {
          <div class="error-msg" style="text-align:center;">{{ error }}</div>
        }

        <form (ngSubmit)="onLogin()">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Usuario</mat-label>
            <input matInput [(ngModel)]="username" name="username" required autofocus>
            <mat-icon matPrefix style="color:var(--text-3);font-size:18px;">person</mat-icon>
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Contrasena</mat-label>
            <input matInput [type]="hidePassword ? 'password' : 'text'"
                   [(ngModel)]="password" name="password" required>
            <mat-icon matPrefix style="color:var(--text-3);font-size:18px;">lock</mat-icon>
            <button mat-icon-button matSuffix type="button"
                    (click)="hidePassword = !hidePassword" style="color:var(--text-3);">
              <mat-icon>{{ hidePassword ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
          </mat-form-field>
          <button mat-raised-button color="primary" class="full-width login-btn"
                  type="submit" [disabled]="loading">
            @if (loading) {
              <mat-spinner diameter="20"></mat-spinner>
            } @else {
              Entrar
            }
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .login-wrapper {
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg);
    }
    .login-card {
      width: 380px;
      background: var(--surface);
      border-radius: var(--r);
      padding: 36px 32px;
      box-shadow: var(--shadow-md);
      border: 1px solid var(--border2);
    }
    .login-logo {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 28px;
    }
    .logo-mark {
      width: 34px;
      height: 34px;
      background: var(--navy);
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logo-icon { color: #fff; font-size: 18px; width: 18px; height: 18px; }
    .logo-name { font-size: 14px; font-weight: 700; letter-spacing: -.02em; color: var(--navy); }
    .logo-sub  { font-size: 9px; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: .08em; margin-top: 1px; }
    .login-title {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -.03em;
      color: var(--text-1);
      margin: 0 0 20px;
    }
    .full-width { width: 100%; }
    .login-btn  { height: 44px; font-size: 13px; font-weight: 700; margin-top: 6px; }
  `]
})
export class LoginComponent {
  username = '';
  password = '';
  hidePassword = true;
  loading = false;
  error = '';

  constructor(private auth: AuthService, private router: Router, public workshopConfig: WorkshopConfigService) {
    if (auth.isLoggedIn()) this.router.navigate(['/']);
  }

  onLogin() {
    if (!this.username || !this.password) return;
    this.loading = true;
    this.error = '';
    this.auth.login(this.username, this.password).subscribe({
      next: (res) => {
        this.auth.setSession(res.token, res.user);
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.error || 'Error al iniciar sesion';
      }
    });
  }
}
