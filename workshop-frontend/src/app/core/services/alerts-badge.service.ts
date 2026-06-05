import { Injectable, signal, OnDestroy } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class AlertsBadgeService implements OnDestroy {
  count = signal(0);
  lastTick = signal<string | null>(null);

  private timer: any = null;
  private readonly POLL_MS = 60_000;

  constructor(
    private api:  ApiService,
    private auth: AuthService,
  ) {}

  start() {
    if (this.timer) return;
    if (!this.auth.isAdminOrRecep()) return;
    this.refresh();
    this.timer = setInterval(() => this.refresh(), this.POLL_MS);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  refresh() {
    if (!this.auth.isAdminOrRecep()) return;
    this.api.getAlertsBadge().subscribe({
      next: r => {
        this.count.set(r.critical_high_count);
        this.lastTick.set(r.last_runner_tick);
      },
      error: () => {},
    });
  }

  ngOnDestroy() { this.stop(); }
}
