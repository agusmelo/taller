import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: jest.Mocked<HttpClient>;
  let routerMock: jest.Mocked<Router>;

  beforeEach(() => {
    localStorage.clear();

    httpMock = { post: jest.fn() } as any;
    routerMock = { navigate: jest.fn() } as any;

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: HttpClient, useValue: httpMock },
        { provide: Router, useValue: routerMock },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  afterEach(() => localStorage.clear());

  test('starts with no user', () => {
    expect(service.currentUser()).toBeNull();
    expect(service.isLoggedIn()).toBe(false);
  });

  test('setSession stores token and user', () => {
    const user = { id: '1', username: 'admin', full_name: 'Admin', role: 'admin' as const, is_active: true };
    service.setSession('tok123', user);

    expect(localStorage.getItem('workshop_token')).toBe('tok123');
    expect(service.currentUser()).toEqual(user);
    expect(service.isLoggedIn()).toBe(true);
  });

  test('logout clears session and navigates to login', () => {
    const user = { id: '1', username: 'admin', full_name: 'Admin', role: 'admin' as const, is_active: true };
    service.setSession('tok123', user);

    service.logout();

    expect(localStorage.getItem('workshop_token')).toBeNull();
    expect(service.currentUser()).toBeNull();
    expect(service.isLoggedIn()).toBe(false);
    expect(routerMock.navigate).toHaveBeenCalledWith(['/login']);
  });

  test('isAdmin returns true for admin role', () => {
    const user = { id: '1', username: 'admin', full_name: 'Admin', role: 'admin' as const, is_active: true };
    service.setSession('tok', user);
    expect(service.isAdmin()).toBe(true);
  });

  test('isAdmin returns false for non-admin role', () => {
    const user = { id: '2', username: 'mec', full_name: 'Mec', role: 'mecanico' as const, is_active: true };
    service.setSession('tok', user);
    expect(service.isAdmin()).toBe(false);
  });

  test('isAdminOrRecep returns true for recepcionista', () => {
    const user = { id: '3', username: 'rec', full_name: 'Rec', role: 'recepcionista' as const, is_active: true };
    service.setSession('tok', user);
    expect(service.isAdminOrRecep()).toBe(true);
  });

  test('isAdminOrRecep returns false for mecanico', () => {
    const user = { id: '2', username: 'mec', full_name: 'Mec', role: 'mecanico' as const, is_active: true };
    service.setSession('tok', user);
    expect(service.isAdminOrRecep()).toBe(false);
  });

  test('hasRole checks role correctly', () => {
    const user = { id: '2', username: 'mec', full_name: 'Mec', role: 'mecanico' as const, is_active: true };
    service.setSession('tok', user);
    expect(service.hasRole('mecanico')).toBe(true);
    expect(service.hasRole('admin')).toBe(false);
  });

  test('login calls HTTP post', () => {
    httpMock.post.mockReturnValue(of({ token: 'abc', user: {} }));
    service.login('admin', 'pass123');
    expect(httpMock.post).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      { username: 'admin', password: 'pass123' }
    );
  });

  test('restores user from localStorage on init', () => {
    const user = { id: '1', username: 'admin', full_name: 'Admin', role: 'admin' as const, is_active: true };
    localStorage.setItem('workshop_user', JSON.stringify(user));

    // Create a new instance that reads localStorage
    const freshService = TestBed.inject(AuthService);
    // The existing service won't pick it up, but the constructor ran before we set it.
    // Let's test by re-creating the TestBed
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: HttpClient, useValue: httpMock },
        { provide: Router, useValue: routerMock },
      ],
    });
    const svc2 = TestBed.inject(AuthService);
    expect(svc2.currentUser()).toEqual(user);
  });
});
