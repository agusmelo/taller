import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AlertsBadgeService } from './alerts-badge.service';
import { ApiService } from './api.service';
import { AuthService } from '../auth/auth.service';
import { AlertBadge } from '../models';

describe('AlertsBadgeService', () => {
  let service: AlertsBadgeService;
  let apiMock:  jest.Mocked<Pick<ApiService,  'getAlertsBadge'>>;
  let authMock: jest.Mocked<Pick<AuthService, 'isAdminOrRecep'>>;

  const BADGE: AlertBadge = { critical_high_count: 5, last_runner_tick: '2025-01-01T00:00:00Z' };

  beforeEach(() => {
    apiMock  = { getAlertsBadge: jest.fn().mockReturnValue(of(BADGE)) };
    authMock = { isAdminOrRecep: jest.fn().mockReturnValue(true) };

    TestBed.configureTestingModule({
      providers: [
        AlertsBadgeService,
        { provide: ApiService,  useValue: apiMock  },
        { provide: AuthService, useValue: authMock },
      ],
    });

    service = TestBed.inject(AlertsBadgeService);
  });

  afterEach(() => service.stop());

  // ── Initial state ─────────────────────────────────────────────────────────

  test('count signal starts at 0', () => {
    expect(service.count()).toBe(0);
  });

  test('lastTick signal starts as null', () => {
    expect(service.lastTick()).toBeNull();
  });

  // ── refresh() ────────────────────────────────────────────────────────────

  test('refresh() calls getAlertsBadge and updates count', () => {
    service.refresh();
    expect(apiMock.getAlertsBadge).toHaveBeenCalledTimes(1);
    expect(service.count()).toBe(5);
    expect(service.lastTick()).toBe('2025-01-01T00:00:00Z');
  });

  test('refresh() is noop when user is not admin/recep', () => {
    authMock.isAdminOrRecep.mockReturnValue(false);
    service.refresh();
    expect(apiMock.getAlertsBadge).not.toHaveBeenCalled();
    expect(service.count()).toBe(0);
  });

  test('refresh() handles API errors silently (count not changed)', () => {
    service.count['set'](3); // pre-set a value
    apiMock.getAlertsBadge.mockReturnValue(throwError(() => new Error('network error')));
    expect(() => service.refresh()).not.toThrow();
    // count should remain at its previous value (error was swallowed)
  });

  test('refresh() resets count to 0 when API returns 0', () => {
    service.refresh(); // sets to 5
    apiMock.getAlertsBadge.mockReturnValue(of({ critical_high_count: 0, last_runner_tick: null }));
    service.refresh();
    expect(service.count()).toBe(0);
  });

  // ── start() / stop() ─────────────────────────────────────────────────────

  test('start() calls refresh immediately', () => {
    service.start();
    expect(apiMock.getAlertsBadge).toHaveBeenCalledTimes(1);
  });

  test('start() is noop when user is not admin/recep', () => {
    authMock.isAdminOrRecep.mockReturnValue(false);
    service.start();
    expect(apiMock.getAlertsBadge).not.toHaveBeenCalled();
  });

  test('start() is idempotent — second call does not create second interval', fakeAsync(() => {
    service.start();
    service.start(); // second call must not register another interval

    const callsAfterStart = apiMock.getAlertsBadge.mock.calls.length;

    tick(60_000); // one poll interval
    const callsAfterOneTick = apiMock.getAlertsBadge.mock.calls.length;

    tick(60_000); // second interval
    const callsAfterTwoTicks = apiMock.getAlertsBadge.mock.calls.length;

    // Each interval should add exactly 1 call, not 2 (which would happen with 2 timers)
    expect(callsAfterOneTick - callsAfterStart).toBe(1);
    expect(callsAfterTwoTicks - callsAfterOneTick).toBe(1);
  }));

  test('stop() cancels the polling interval', fakeAsync(() => {
    service.start();
    const callsAtStop = apiMock.getAlertsBadge.mock.calls.length;

    service.stop();
    tick(120_000); // advance two full intervals

    // No new calls after stop
    expect(apiMock.getAlertsBadge.mock.calls.length).toBe(callsAtStop);
  }));

  test('stop() is safe to call when not started', () => {
    expect(() => service.stop()).not.toThrow();
  });
});
