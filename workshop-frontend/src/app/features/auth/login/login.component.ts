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
        <mat-card-header>
          <mat-icon mat-card-avatar class="login-icon">build</mat-icon>
          <mat-card-title>Taller Mecanico</mat-card-title>
          <mat-card-subtitle>Iniciar sesion</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (error) {
            <div class="error-msg">{{ error }}</div>
          }
          <form (ngSubmit)="onLogin()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Usuario</mat-label>
              <input matInput [(ngModel)]="username" name="username" required autofocus>
              <mat-icon matPrefix>person</mat-icon>
            </mat-form-field>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Contrasena</mat-label>
              <input matInput [type]="hidePassword ? 'password' : 'text'"
                     [(ngModel)]="password" name="password" required>
              <mat-icon matPrefix>lock</mat-icon>
              <button mat-icon-button matSuffix type="button"
                      (click)="hidePassword = !hidePassword">
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
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .login-wrapper {
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #1a237e 0%, #283593 100%);
    }
    .login-card {
      width: 400px;
      padding: 24px;
    }
    .login-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
      color: #1a237e;
    }
    .full-width { width: 100%; }
    .login-btn { height: 48px; font-size: 16px; margin-top: 8px; }
    .error-msg {
      background: #ffebee;
      color: #c62828;
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 16px;
      text-align: center;
    }
  `]
})
export class LoginComponent {
  username = '';
  password = '';
  hidePassword = true;
  loading = false;
  error = '';

  constructor(private auth: AuthService, private router: Router) {
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
