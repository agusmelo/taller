import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

export type InfoCardAccent = 'navy' | 'blue' | 'teal' | 'green' | 'amber' | 'purple' | 'red';

@Component({
  selector: 'app-info-card',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule],
  template: `
    <mat-card class="info-card">
      <mat-card-content>
        <div class="ic-head">
          @if (icon) {
            <span class="ic-icon" [attr.data-accent]="accent"><mat-icon>{{ icon }}</mat-icon></span>
          }
          <h3 class="ic-title">{{ title }}</h3>
          <span class="ic-head-actions"><ng-content select="[card-head-actions]"></ng-content></span>
        </div>
        <div class="ic-body">
          <ng-content></ng-content>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .info-card { height: 100%; }
    .ic-head {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
    }
    .ic-icon {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      background: var(--border2);
      color: var(--navy);
    }
    .ic-icon mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .ic-icon[data-accent="blue"]   { background: var(--blue-lt);   color: var(--blue); }
    .ic-icon[data-accent="teal"]   { background: var(--teal-lt);   color: var(--teal); }
    .ic-icon[data-accent="green"]  { background: var(--green-lt);  color: var(--green); }
    .ic-icon[data-accent="amber"]  { background: var(--amber-lt);  color: var(--amber); }
    .ic-icon[data-accent="purple"] { background: var(--purple-lt); color: var(--purple); }
    .ic-icon[data-accent="red"]    { background: var(--red-lt);    color: var(--red); }
    .ic-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-1);
      margin: 0;
    }
    .ic-head-actions {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
  `]
})
export class InfoCardComponent {
  @Input() title = '';
  @Input() icon = '';
  @Input() accent: InfoCardAccent = 'navy';
}
