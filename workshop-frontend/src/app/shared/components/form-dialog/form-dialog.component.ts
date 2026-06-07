import {
  Component, EventEmitter, HostListener, Input, Output, ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

/**
 * Shared wrapper for any MatDialog-hosted form. Provides:
 *  - Consistent title / subtitle / error banner
 *  - Body that fades + disables while saving
 *  - Footer with Cancel + Save (with inline spinner)
 *  - Ctrl/Cmd+Enter shortcut to save
 *  - Esc to cancel is handled by MatDialog natively
 *
 * Usage:
 *   <app-form-dialog
 *     [title]="isEdit ? 'Editar cliente' : 'Nuevo cliente'"
 *     [error]="error"
 *     [saving]="saving"
 *     [canSave]="form.full_name && !rutMatch"
 *     (save)="save()"
 *     (cancel)="cancel()">
 *     ...form fields and inline banners...
 *   </app-form-dialog>
 */
@Component({
  selector: 'app-form-dialog',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    CommonModule, MatDialogModule, MatIconModule, MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title class="fd-head">
      <div class="fd-head-text">
        <span class="fd-title">{{ title }}</span>
        @if (subtitle) {
          <span class="fd-sub">{{ subtitle }}</span>
        }
      </div>
    </h2>

    @if (error) {
      <div class="banner banner-error fd-error" role="alert">
        <mat-icon>error_outline</mat-icon>
        <span>{{ error }}</span>
      </div>
    }

    <mat-dialog-content class="fd-body" [class.fd-saving]="saving">
      <ng-content></ng-content>
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="fd-actions">
      <button class="btn btn-ghost" type="button"
        (click)="cancel.emit()" [disabled]="saving">
        {{ cancelLabel }}
      </button>
      <button class="btn btn-primary fd-save" type="button"
        (click)="save.emit()" [disabled]="saving || !canSave">
        @if (saving) {
          <mat-spinner diameter="14" class="fd-spin"></mat-spinner>
          {{ savingLabel }}
        } @else {
          {{ saveLabel }}
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .fd-head {
      display: flex !important;
      align-items: flex-start;
      gap: 8px;
      padding: 20px 24px 12px !important;
      margin: 0 !important;
      border-bottom: 1px solid var(--border2);
    }
    .fd-head-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .fd-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--text-1);
      letter-spacing: -.01em;
    }
    .fd-sub {
      font-size: 12px;
      color: var(--text-3);
    }

    .fd-error {
      margin: 12px 24px 0 !important;
    }
    .fd-error mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .fd-body {
      padding: 20px 24px !important;
      max-height: 70vh;
      transition: opacity .15s;
    }
    .fd-body.fd-saving {
      opacity: .55;
      pointer-events: none;
      user-select: none;
    }

    .fd-actions {
      padding: 12px 20px !important;
      gap: 8px;
      border-top: 1px solid var(--border2);
      background: var(--bg);
    }
    .fd-save {
      min-width: 110px;
      justify-content: center;
      gap: 8px;
    }
    .fd-spin ::ng-deep circle { stroke: #fff; }
  `]
})
export class FormDialogComponent {
  @Input() title = '';
  @Input() subtitle: string | null = null;
  @Input() error:    string | null = null;
  @Input() saving = false;
  @Input() canSave = true;
  @Input() saveLabel    = 'Guardar';
  @Input() savingLabel  = 'Guardando…';
  @Input() cancelLabel  = 'Cancelar';

  @Output() save   = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  @HostListener('document:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent) {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
      if (!this.saving && this.canSave) {
        ev.preventDefault();
        this.save.emit();
      }
    }
  }
}
