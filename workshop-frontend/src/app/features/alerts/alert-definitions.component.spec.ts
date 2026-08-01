import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { AlertDefinitionsComponent } from './alert-definitions.component';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { AlertDefinition, AlertType } from '../../core/models';

// ─── Shared fixture ───────────────────────────────────────────────────────

function makeDef(overrides: Partial<AlertDefinition> = {}): AlertDefinition {
  return {
    id:                        'def1',
    alert_type:                'overdue_service',
    name:                      'Aceite cada 6 meses',
    enabled:                   true,
    catalog_item_id:           'item1',
    catalog_item_description:  'Cambio de aceite',
    threshold_days:            180,
    bp_multiplier:             null,
    bp_min_days:               null,
    eval_interval_hours:       4,
    last_evaluated_at:         null,
    last_result_count:         0,
    last_run_error:            null,
    created_by:                null,
    created_at:                '2025-01-01T00:00:00Z',
    updated_at:                '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('AlertDefinitionsComponent', () => {
  let component: AlertDefinitionsComponent;
  let fixture:   ComponentFixture<AlertDefinitionsComponent>;
  let apiMock:    jest.Mocked<Pick<ApiService,
    'listAlertDefinitions' | 'updateAlertDefinition' | 'deleteAlertDefinition'>>;
  let notifyMock: jest.Mocked<Pick<NotificationService, 'handleError'>>;
  let dialogMock: jest.Mocked<Pick<MatDialog, 'open'>>;

  const DEF = makeDef();

  beforeEach(async () => {
    apiMock = {
      listAlertDefinitions:  jest.fn().mockReturnValue(of([DEF])),
      updateAlertDefinition: jest.fn().mockReturnValue(of(DEF)),
      deleteAlertDefinition: jest.fn().mockReturnValue(of({})),
    };
    notifyMock = { handleError: jest.fn() };
    dialogMock = {
      open: jest.fn().mockReturnValue({ afterClosed: () => of(false) }),
    };

    await TestBed.configureTestingModule({
      imports: [AlertDefinitionsComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        { provide: ApiService,          useValue: apiMock    },
        { provide: NotificationService, useValue: notifyMock },
        { provide: MatDialog,           useValue: dialogMock },
      ],
    }).compileComponents();

    fixture   = TestBed.createComponent(AlertDefinitionsComponent);
    component = fixture.componentInstance;
  });

  // ── Initialization ────────────────────────────────────────────────────────

  test('calls listAlertDefinitions on init', () => {
    fixture.detectChanges();
    expect(apiMock.listAlertDefinitions).toHaveBeenCalledTimes(1);
    expect(component.definitions).toEqual([DEF]);
    expect(component.loading).toBe(false);
  });

  test('calls handleError on load failure', () => {
    apiMock.listAlertDefinitions.mockReturnValue(throwError(() => new Error('network')));
    fixture.detectChanges();
    expect(notifyMock.handleError).toHaveBeenCalledTimes(1);
    expect(component.loading).toBe(false);
  });

  // ── toggleEnabled() ───────────────────────────────────────────────────────

  test('toggleEnabled(true) calls updateAlertDefinition with enabled:true', () => {
    const def = makeDef({ enabled: false });
    component.toggleEnabled(def, true);
    expect(apiMock.updateAlertDefinition).toHaveBeenCalledWith('def1', { enabled: true });
  });

  test('toggleEnabled(false) calls updateAlertDefinition with enabled:false', () => {
    const def = makeDef();
    component.toggleEnabled(def, false);
    expect(apiMock.updateAlertDefinition).toHaveBeenCalledWith('def1', { enabled: false });
  });

  test('toggleEnabled updates def.enabled on success', fakeAsync(() => {
    const def = makeDef();
    component.toggleEnabled(def, false);
    tick();
    expect(def.enabled).toBe(false);
  }));

  test('toggleEnabled calls handleError on failure', fakeAsync(() => {
    apiMock.updateAlertDefinition.mockReturnValue(throwError(() => new Error('fail')));
    component.toggleEnabled(makeDef(), false);
    tick();
    expect(notifyMock.handleError).toHaveBeenCalledTimes(1);
  }));

  // ── remove() ─────────────────────────────────────────────────────────────

  test('remove() does nothing if user cancels confirm', () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    component.definitions = [{ ...DEF }];
    component.remove(component.definitions[0]);
    expect(apiMock.deleteAlertDefinition).not.toHaveBeenCalled();
  });

  test('remove() calls deleteAlertDefinition when confirmed', () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    component.definitions = [{ ...DEF }];
    component.remove(component.definitions[0]);
    expect(apiMock.deleteAlertDefinition).toHaveBeenCalledWith('def1');
  });

  test('remove() removes definition from array on success', fakeAsync(() => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    component.definitions = [{ ...DEF }];
    component.remove(component.definitions[0]);
    tick();
    expect(component.definitions).toHaveLength(0);
  }));

  test('remove() calls handleError on failure', fakeAsync(() => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    apiMock.deleteAlertDefinition.mockReturnValue(throwError(() => new Error('not found')));
    component.definitions = [{ ...DEF }];
    component.remove(component.definitions[0]);
    tick();
    expect(notifyMock.handleError).toHaveBeenCalledTimes(1);
  }));

  // ── openCreate() / openEdit() ─────────────────────────────────────────────

  test('openCreate() opens a dialog', () => {
    component.openCreate();
    expect(dialogMock.open).toHaveBeenCalled();
    const [, opts] = (dialogMock.open as jest.Mock).mock.calls[0];
    expect(opts.data).toMatchObject({ def: null });
  });

  test('openCreate() reloads definitions when dialog returns true', fakeAsync(() => {
    dialogMock.open.mockReturnValue({ afterClosed: () => of(true) } as any);
    component.openCreate();
    tick();
    expect(apiMock.listAlertDefinitions).toHaveBeenCalledTimes(1);
  }));

  test('openCreate() does NOT reload when dialog is cancelled (returns false)', fakeAsync(() => {
    component.openCreate();
    tick();
    expect(apiMock.listAlertDefinitions).not.toHaveBeenCalled();
  }));

  test('openEdit() passes the definition to the dialog', () => {
    component.openEdit(DEF);
    const [, opts] = (dialogMock.open as jest.Mock).mock.calls[0];
    expect(opts.data).toMatchObject({ def: DEF });
  });

  // ── paramsLabel() ─────────────────────────────────────────────────────────

  test('paramsLabel formats overdue_service with item description and threshold', () => {
    const label = component.paramsLabel(DEF);
    expect(label).toContain('Cambio de aceite');
    expect(label).toContain('180d');
  });

  test('paramsLabel formats payment_overdue with threshold only', () => {
    const def = makeDef({ alert_type: 'payment_overdue', catalog_item_id: null, catalog_item_description: null, threshold_days: 30 });
    expect(component.paramsLabel(def)).toBe('30d');
  });

  test('paramsLabel formats lost_customer with threshold only', () => {
    const def = makeDef({ alert_type: 'lost_customer', catalog_item_id: null, catalog_item_description: null, threshold_days: 365 });
    expect(component.paramsLabel(def)).toBe('365d');
  });

  test('paramsLabel formats broken_pattern with multiplier and min days', () => {
    const def = makeDef({ alert_type: 'broken_pattern', catalog_item_id: null, threshold_days: null, bp_multiplier: 1.5, bp_min_days: 30 });
    const label = component.paramsLabel(def);
    expect(label).toContain('×1.5');
    expect(label).toContain('30d');
  });

  test('paramsLabel formats broken_pattern with min days = 0', () => {
    const def = makeDef({ alert_type: 'broken_pattern', catalog_item_id: null, threshold_days: null, bp_multiplier: 2.0, bp_min_days: 0 });
    const label = component.paramsLabel(def);
    expect(label).toContain('×2');
    expect(label).toContain('0d');
  });

  // ── relativeTime() ────────────────────────────────────────────────────────

  test('relativeTime returns "recién" for current time', () => {
    expect(component.relativeTime(new Date().toISOString())).toBe('recién');
  });

  test('relativeTime returns "hace Xm" for X minutes ago', () => {
    const ago = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    expect(component.relativeTime(ago)).toBe('hace 20m');
  });

  test('relativeTime returns "hace Xh" for X hours ago', () => {
    const ago = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    expect(component.relativeTime(ago)).toBe('hace 5h');
  });

  test('relativeTime returns "hace Xd" for X days ago', () => {
    const ago = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(component.relativeTime(ago)).toBe('hace 3d');
  });
});
