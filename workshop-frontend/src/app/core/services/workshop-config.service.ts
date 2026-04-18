import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { WorkshopConfig } from '../models';

@Injectable({ providedIn: 'root' })
export class WorkshopConfigService {
  config = signal<WorkshopConfig | null>(null);

  constructor(private http: HttpClient) {}

  load() {
    return this.http.get<WorkshopConfig>(`${environment.apiUrl}/config`)
      .pipe(tap(c => this.config.set(c)));
  }
}
