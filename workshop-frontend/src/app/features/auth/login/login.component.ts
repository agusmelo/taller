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
import { extractApiError } from '../../../shared/utils/api-error';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule
  ],
  template: `
    <div class="login-wrapper">
      <mat-card class="login-card">
        <div class="brand-row">
          <div class="logo-mark">
            <mat-icon>build</mat-icon>
          </div>
          <div class="brand-text">
            <div class="brand-name">{{ workshopConfig.config()?.name || 'Taller Mecánico' }}</div>
            <div class="brand-sub">Iniciar sesión</div>
          </div>
        </div>

        @if (error) {
          <div class="banner banner-error login-error" role="alert">
            <mat-icon>error_outline</mat-icon>
            <span>{{ error }}</span>
          </div>
        }

        <form (ngSubmit)="onLogin()" class="login-form" [class.is-loading]="loading">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Usuario <span class="req">*</span></mat-label>
            <input matInput [(ngModel)]="username" name="username" required autofocus
                   [disabled]="loading">
            <mat-icon matPrefix>person</mat-icon>
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Contraseña <span class="req">*</span></mat-label>
            <input matInput [type]="hidePassword ? 'password' : 'text'"
                   [(ngModel)]="password" name="password" required
                   [disabled]="loading">
            <mat-icon matPrefix>lock</mat-icon>
            <button mat-icon-button matSuffix type="button"
                    (click)="hidePassword = !hidePassword"
                    [attr.aria-label]="hidePassword ? 'Mostrar contraseña' : 'Ocultar contraseña'">
              <mat-icon>{{ hidePassword ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
          </mat-form-field>
          <button mat-raised-button color="primary" class="full-width login-btn"
                  type="submit" [disabled]="loading || !username || !password">
            @if (loading) {
              <mat-spinner diameter="18" class="login-spin"></mat-spinner>
              <span>Entrando…</span>
            } @else {
              <span>Entrar</span>
              <mat-icon class="login-btn-ico">arrow_forward</mat-icon>
            }
          </button>
        </form>

        <div class="login-foot">
          <span>v1.0</span>
          <a class="forgot-link" href="javascript:void(0)">¿Olvidaste tu contraseña?</a>
        </div>
      </mat-card>
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
      width: 400px;
      padding: 28px !important;
      border-radius: 14px !important;
      box-shadow: 0 20px 60px rgba(0,0,0,.10), 0 4px 12px rgba(0,0,0,.06) !important;
      border: 1px solid var(--border2);
    }
    .brand-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
    }
    .logo-mark {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: var(--navy);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logo-mark mat-icon {
      color: white;
      font-size: 22px;
      width: 22px;
      height: 22px;
    }
    .brand-text { display: flex; flex-direction: column; }
    .brand-name {
      font-size: 16px;
      font-weight: 700;
      color: var(--text-1);
      letter-spacing: -.01em;
    }
    .brand-sub {
      font-size: 12px;
      color: var(--text-3);
    }

    .login-error {
      margin-bottom: 12px;
    }
    .login-error mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .login-form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: opacity .15s;
    }
    .login-form.is-loading {
      opacity: .8;
    }
    .full-width { width: 100%; }
    .login-btn {
      height: 44px;
      font-size: 14px;
      margin-top: 8px;
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .login-btn-ico {
      font-size: 18px;
      width: 18px;
      height: 18px;
      transition: transform .15s;
    }
    .login-btn:hover:not(:disabled) .login-btn-ico {
      transform: translateX(2px);
    }
    .login-spin ::ng-deep circle { stroke: #fff; }

    .login-foot {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 18px;
      padding-top: 14px;
      border-top: 1px solid var(--border2);
      font-size: 11px;
      color: var(--text-3);
    }
    .forgot-link {
      color: var(--text-2);
      text-decoration: none;
    }
    .forgot-link:hover { color: var(--navy); text-decoration: underline; }
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
        this.error = extractApiError(err, 'Error al iniciar sesión');
      }
    });
  }
}
