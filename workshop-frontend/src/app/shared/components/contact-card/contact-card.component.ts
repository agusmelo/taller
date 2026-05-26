import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { InfoCardComponent, InfoCardAccent } from '../info-card/info-card.component';
import { ContactActionsComponent } from '../contact-actions/contact-actions.component';

@Component({
  selector: 'app-contact-card',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MatTooltipModule, InfoCardComponent, ContactActionsComponent],
  template: `
    <app-info-card [title]="title" [icon]="icon" [accent]="accent">
      @if (name) {
        <p class="cc-name">
          @if (nameLink) {
            <a [routerLink]="nameLink" class="cc-name-link" matTooltip="Ver ficha"><span class="cc-name-text">{{ name }}</span><mat-icon class="link-ico">open_in_new</mat-icon></a>
          } @else {
            {{ name }}
          }
        </p>
      }
      @if (type) {
        <span class="cc-type">{{ type === 'empresa' ? 'Empresa' : 'Individual' }}</span>
      }

      <div class="cc-rows">
        @if (rut) {
          <div class="info-row"><span>RUT</span><span class="t-mono">{{ rut }}</span></div>
        }
        @if (phone) {
          <div class="info-row"><span>Teléfono</span><span class="t-mono">{{ phone }}</span></div>
        }
        @if (email) {
          <div class="info-row cc-row-wrap"><span>Email</span><span class="cc-email">{{ email }}</span></div>
        }
        @if (address) {
          <div class="info-row cc-row-wrap"><span>Dirección</span><span>{{ address }}</span></div>
        }
        @if (!rut && !phone && !email && !address) {
          <p class="cc-empty">Sin datos de contacto registrados.</p>
        }
      </div>

      <app-contact-actions [phone]="phone" [email]="email"></app-contact-actions>
    </app-info-card>
  `,
  styles: [`
    .cc-name {
      margin: 0 0 2px;
      font-size: 15px;
      font-weight: 700;
      color: var(--text-1);
    }
    .cc-name a { color: var(--text-1); text-decoration: none; }
    .cc-name-link { display: inline-flex; align-items: center; gap: 4px; }
    .cc-name a:hover { color: var(--blue); }
    .cc-name a:hover .cc-name-text { text-decoration: underline; }
    .link-ico {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: var(--text-3);
      transition: color .14s;
    }
    .cc-name a:hover .link-ico { color: var(--blue); }
    .cc-type {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-2);
      margin-bottom: 6px;
    }
    .cc-rows { display: flex; flex-direction: column; }
    .cc-row-wrap { align-items: flex-start; }
    .cc-row-wrap > span:last-child {
      text-align: right;
      word-break: break-word;
    }
    .cc-email { color: var(--text-1); }
    .cc-empty {
      margin: 4px 0;
      font-size: 12px;
      color: var(--text-3);
    }
  `]
})
export class ContactCardComponent {
  @Input() title = 'Cliente';
  @Input() icon = 'person';
  @Input() accent: InfoCardAccent = 'blue';
  @Input() name: string | null = null;
  @Input() nameLink: any[] | null = null;
  @Input() type: string | null = null;
  @Input() rut: string | null = null;
  @Input() phone: string | null = null;
  @Input() email: string | null = null;
  @Input() address: string | null = null;
}
