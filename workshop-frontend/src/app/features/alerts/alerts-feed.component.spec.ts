import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { AlertsFeedComponent } from './alerts-feed.component';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/auth/auth.service';
import { AlertItem, AlertFeedBlock, AlertType, AlertDefinition } from '../../core/models';

// ─── Test helpers ─────────────────────────────────────────────────────────

function makeDefinition(id: string, type: AlertType = 'overdue_service'): AlertDefinition {
  return {
    id,
    alert_type: type,
    name: `Def ${id}`,
    enabled: true,
    catalog_item_id: type === 'overdue_service' ? 'item1' : null,
    catalog_item_description: type === 'overdue_service' ? 'Aceite' : null,
    threshold_days: 90,
    bp_multiplier: null,
    bp_min_days: null,
    eval_interval_hours: 4,
    last_evaluated_at: null,
    last_result_count: 0,
    last_run_error: null,
    created_by: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };
}

function makeAlert(
  entityId: string,
  severity: AlertItem['severity'],
  definitionId?: string,
  type: AlertType = 'overdue_service',
): AlertItem {
  return {
    alert_type:    type,
    severity,
    client_id:     'cid1',
    client_name:   'Juan García',
    client_phone:  '099123456',
    client_email:  'juan@test.com',
    entity_id:     entityId,
    entity_label:  'ABC 1234',
    current_value: 200,
    threshold:     100,
    unit:          'days',
    context:       'Último registro: 01/01/2025',
    action_route:  `/vehiculos/${entityId}`,
    definition_id: definitionId,
  };
}

function makeBlock(defId: string, items: AlertItem[]): AlertFeedBlock {
  return { definition: makeDefinition(defId), items, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('AlertsFeedComponent', () => {
  let component: AlertsFeedComponent;
  let fixture:   ComponentFixture<AlertsFeedComponent>;
  let apiMock:    jest.Mocked<Pick<ApiService,
    'getAlertsFeed' | 'evaluateAllAlerts' | 'evaluateAlertDefinition' | 'dismissAlert'>>;
  let notifyMock: jest.Mocked<Pick<NotificationService, 'handleError' | 'success'>>;
  let authMock:   jest.Mocked<Pick<AuthService, 'isAdmin' | 'isAdminOrRecep'>>;

  beforeEach(async () => {
    apiMock = {
      getAlertsFeed:            jest.fn().mockReturnValue(of([])),
      evaluateAllAlerts:        jest.fn().mockReturnValue(of({ ok: true, evaluated: 0 })),
      evaluateAlertDefinition:  jest.fn(),
      dismissAlert:             jest.fn().mockReturnValue(of({})),
    };
    notifyMock = {
      handleError: jest.fn(),
      success:     jest.fn(),
    };
    authMock = {
      isAdmin:         jest.fn().mockReturnValue(true),
      isAdminOrRecep:  jest.fn().mockReturnValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [AlertsFeedComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        { provide: ApiService,           useValue: apiMock    },
        { provide: NotificationService,  useValue: notifyMock },
        { provide: AuthService,          useValue: authMock   },
      ],
    }).compileComponents();

    fixture   = TestBed.createComponent(AlertsFeedComponent);
    component = fixture.componentInstance;
  });

  // ── Initialization ────────────────────────────────────────────────────────

  test('calls getAlertsFeed on init', () => {
    fixture.detectChanges();
    expect(apiMock.getAlertsFeed).toHaveBeenCalledTimes(1);
  });

  test('populates blocks from API response', () => {
    const blocks = [makeBlock('def1', [makeAlert('vid1', 'critical', 'def1')])];
    apiMock.getAlertsFeed.mockReturnValue(of(blocks));

    fixture.detectChanges();

    expect(component.blocks).toEqual(blocks);
    expect(component.loading).toBe(false);
  });

  test('sets loading=false after API response', () => {
    fixture.detectChanges();
    expect(component.loading).toBe(false);
  });

  test('calls notify.handleError on feed load failure', () => {
    apiMock.getAlertsFeed.mockReturnValue(throwError(() => new Error('server down')));
    fixture.detectChanges();
    expect(notifyMock.handleError).toHaveBeenCalledTimes(1);
    expect(component.loading).toBe(false);
  });

  // ── totalCount / countBySeverity ─────────────────────────────────────────

  test('totalCount returns sum of items across all blocks', () => {
    component.blocks = [
      makeBlock('def1', [makeAlert('a', 'critical'), makeAlert('b', 'high')]),
      makeBlock('def2', [makeAlert('c', 'low')]),
    ];
    expect(component.totalCount).toBe(3);
  });

  test('totalCount returns 0 for empty blocks', () => {
    component.blocks = [];
    expect(component.totalCount).toBe(0);
  });

  test('countBySeverity returns count for the given level', () => {
    component.blocks = [
      makeBlock('def1', [makeAlert('a', 'critical'), makeAlert('b', 'high')]),
      makeBlock('def2', [makeAlert('c', 'critical'), makeAlert('d', 'medium')]),
    ];
    expect(component.countBySeverity('critical')).toBe(2);
    expect(component.countBySeverity('high')).toBe(1);
    expect(component.countBySeverity('medium')).toBe(1);
    expect(component.countBySeverity('low')).toBe(0);
  });

  // ── dismiss() ────────────────────────────────────────────────────────────

  test('dismiss() calls dismissAlert with correct args', () => {
    const alert = makeAlert('vid1', 'critical', 'def1');
    component.blocks = [makeBlock('def1', [alert])];
    component.dismiss(alert, 30);
    expect(apiMock.dismissAlert).toHaveBeenCalledWith('def1', 'vid1', 30);
  });

  test('dismiss() removes item from block optimistically on success', fakeAsync(() => {
    const alert = makeAlert('vid1', 'critical', 'def1');
    component.blocks = [makeBlock('def1', [alert])];

    component.dismiss(alert, 7);
    tick();

    expect(component.blocks[0].items).toHaveLength(0);
    expect(notifyMock.success).toHaveBeenCalled();
  }));

  test('dismiss() is noop when alert has no definition_id', () => {
    const alert = makeAlert('vid1', 'critical'); // no definition_id
    component.dismiss(alert, 30);
    expect(apiMock.dismissAlert).not.toHaveBeenCalled();
  });

  test('dismiss() calls handleError on API failure', fakeAsync(() => {
    apiMock.dismissAlert.mockReturnValue(throwError(() => new Error('forbidden')));
    const alert = makeAlert('vid1', 'high', 'def1');
    component.blocks = [makeBlock('def1', [alert])];

    component.dismiss(alert, 30);
    tick();

    expect(notifyMock.handleError).toHaveBeenCalledTimes(1);
    expect(component.blocks[0].items).toHaveLength(1); // not removed on error
  }));

  // ── refreshBlock() ───────────────────────────────────────────────────────

  test('refreshBlock() replaces the matching block in the array', fakeAsync(() => {
    const newBlock = makeBlock('def1', [makeAlert('vid2', 'high', 'def1')]);
    component.blocks = [makeBlock('def1', [])];
    apiMock.evaluateAlertDefinition.mockReturnValue(of(newBlock));

    component.refreshBlock('def1');
    tick();

    expect(component.blocks[0]).toEqual(newBlock);
    expect(component.refreshingId).toBeNull();
  }));

  test('refreshBlock() sets refreshingId while request is in-flight', () => {
    // Use a Subject so the observable does NOT emit synchronously
    const pending = new Subject<AlertFeedBlock>();
    apiMock.evaluateAlertDefinition.mockReturnValue(pending);
    component.blocks = [makeBlock('def1', [])];

    component.refreshBlock('def1');

    // Request started but not yet resolved → refreshingId should still be set
    expect(component.refreshingId).toBe('def1');

    // Resolve the observable
    pending.next(makeBlock('def1', []));
    pending.complete();
    expect(component.refreshingId).toBeNull();
  });

  test('refreshBlock() clears refreshingId on error', fakeAsync(() => {
    apiMock.evaluateAlertDefinition.mockReturnValue(throwError(() => new Error('eval failed')));
    component.blocks = [makeBlock('def1', [])];

    component.refreshBlock('def1');
    tick();

    expect(component.refreshingId).toBeNull();
    expect(notifyMock.handleError).toHaveBeenCalledTimes(1);
  }));

  // ── evaluateAll() ────────────────────────────────────────────────────────

  test('evaluateAll() calls evaluateAllAlerts then reloads feed', fakeAsync(() => {
    const freshBlocks = [makeBlock('def1', [])];
    apiMock.getAlertsFeed.mockReturnValue(of(freshBlocks));

    component.evaluateAll();
    tick();

    expect(apiMock.evaluateAllAlerts).toHaveBeenCalledTimes(1);
    expect(apiMock.getAlertsFeed).toHaveBeenCalledTimes(1);
    expect(component.blocks).toEqual(freshBlocks);
  }));

  // ── waLink() ─────────────────────────────────────────────────────────────

  test('waLink() generates WhatsApp URL with stripped non-digits', () => {
    const alert = makeAlert('vid1', 'critical', 'def1');
    alert.client_phone = '+598 099 123 456';
    const url = component.waLink(alert);
    expect(url).toContain('wa.me/598099123456');
  });

  test('waLink() encodes message text', () => {
    const alert = makeAlert('vid1', 'critical', 'def1', 'overdue_service');
    alert.client_phone = '099123456';
    const url = component.waLink(alert);
    expect(url).toContain('wa.me/');
    expect(url).toContain('text=');
  });

  test('waLink() for broken_pattern mentions days absent', () => {
    const alert = makeAlert('vid1', 'critical', 'def1', 'broken_pattern');
    alert.client_phone = '099111111';
    alert.current_value = 90;
    const url = component.waLink(alert);
    expect(decodeURIComponent(url)).toContain('90 días');
  });

  // ── relativeTime() ───────────────────────────────────────────────────────

  test('relativeTime returns "recién" for very recent timestamp', () => {
    const now = new Date().toISOString();
    expect(component.relativeTime(now)).toBe('recién');
  });

  test('relativeTime returns "hace Xm" for minutes ago', () => {
    const ago = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    expect(component.relativeTime(ago)).toBe('hace 45m');
  });

  test('relativeTime returns "hace Xh" for hours ago', () => {
    const ago = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(component.relativeTime(ago)).toBe('hace 3h');
  });

  test('relativeTime returns "hace Xd" for days ago', () => {
    const ago = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(component.relativeTime(ago)).toBe('hace 2d');
  });

  // ── typeLabel() / sevLabel() ──────────────────────────────────────────────

  test('typeLabel maps each alert type to a readable string', () => {
    expect(component.typeLabel('overdue_service')).toBe('Servicio');
    expect(component.typeLabel('payment_overdue')).toBe('Pago');
    expect(component.typeLabel('lost_customer')).toBe('Inactivo');
    expect(component.typeLabel('broken_pattern')).toBe('Patrón roto');
  });

  test('sevLabel maps severity levels to Spanish', () => {
    expect(component.sevLabel('critical')).toBe('Crítico');
    expect(component.sevLabel('high')).toBe('Alto');
    expect(component.sevLabel('medium')).toBe('Medio');
    expect(component.sevLabel('low')).toBe('Bajo');
  });
});
