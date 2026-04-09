import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { adminGuard } from './role.guard';

describe('adminGuard', () => {
  let authService: AuthService;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: HttpClient, useValue: {} },
        { provide: Router, useValue: { createUrlTree: jest.fn((commands: string[]) => ({ toString: () => commands.join('/') } as unknown as UrlTree)), navigate: jest.fn() } },
      ],
    });

    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  afterEach(() => localStorage.clear());

  test('allows access for admin user', () => {
    const user = { id: '1', username: 'admin', full_name: 'Admin', role: 'admin' as const, is_active: true };
    authService.setSession('tok', user);

    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));

    expect(result).toBe(true);
  });

  test('redirects non-admin to /trabajos', () => {
    const user = { id: '2', username: 'mec', full_name: 'Mec', role: 'mecanico' as const, is_active: true };
    authService.setSession('tok', user);

    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));

    expect(result).not.toBe(true);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/trabajos']);
  });

  test('redirects unauthenticated user to /trabajos', () => {
    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));

    expect(result).not.toBe(true);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/trabajos']);
  });
});
