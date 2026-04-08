import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { LoginResponse, User } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  currentUser = signal<User | null>(null);

  constructor(private http: HttpClient, private router: Router) {
    const stored = localStorage.getItem('workshop_user');
    if (stored) {
      try { this.currentUser.set(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }

  login(username: string, password: string) {
    return this.http.post<LoginResponse>(`${environment.apiUrl}/auth/login`, { username, password });
  }

  setSession(token: string, user: User) {
    localStorage.setItem('workshop_token', token);
    localStorage.setItem('workshop_user', JSON.stringify(user));
    this.currentUser.set(user);
  }

  logout() {
    localStorage.removeItem('workshop_token');
    localStorage.removeItem('workshop_user');
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  isLoggedIn(): boolean {
    return !!localStorage.getItem('workshop_token');
  }

  hasRole(role: string): boolean {
    return this.currentUser()?.role === role;
  }

  isAdmin(): boolean {
    return this.hasRole('admin');
  }

  isAdminOrRecep(): boolean {
    const role = this.currentUser()?.role;
    return role === 'admin' || role === 'recepcionista';
  }
}
