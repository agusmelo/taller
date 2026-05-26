import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-contact-actions',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  template: `
    @if (hasAny) {
      <div class="contact-actions">
        @if (phone) {
          <a class="ca-btn ca-call" [href]="'tel:' + telHref" matTooltip="Llamar">
            <mat-icon>call</mat-icon> Llamar
          </a>
          <a class="ca-btn ca-wa" [href]="waHref" target="_blank" rel="noopener" matTooltip="Abrir WhatsApp">
            <mat-icon>chat</mat-icon> WhatsApp
          </a>
        }
        @if (email) {
          <a class="ca-btn ca-mail" [href]="'mailto:' + email" matTooltip="Enviar email">
            <mat-icon>mail</mat-icon> Email
          </a>
        }
      </div>
    }
  `,
  styles: [`
    .contact-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--border2);
    }
    .ca-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 10px;
      border-radius: var(--r-sm);
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text-2);
      font-size: 11px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      transition: background .14s, color .14s, border-color .14s;
    }
    .ca-btn mat-icon {
      font-size: 15px;
      width: 15px;
      height: 15px;
    }
    .ca-btn:hover { background: var(--bg); color: var(--text-1); border-color: var(--text-3); }
    .ca-call:hover { background: var(--blue-lt);  color: var(--blue);  border-color: var(--blue-bd); }
    .ca-wa:hover   { background: var(--green-lt); color: var(--green); border-color: var(--green-bd); }
    .ca-mail:hover { background: var(--purple-lt); color: var(--purple); border-color: var(--purple-bd); }
  `]
})
export class ContactActionsComponent {
  @Input() phone: string | null = null;
  @Input() email: string | null = null;

  get hasAny(): boolean { return !!(this.phone || this.email); }
  get telHref(): string { return (this.phone || '').replace(/[^\d+]/g, ''); }
  get waHref(): string { return 'https://wa.me/' + (this.phone || '').replace(/\D/g, ''); }
}
