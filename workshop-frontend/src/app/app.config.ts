import { ApplicationConfig, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { lastValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { apiInterceptor } from './core/http/api.interceptor';
import { WorkshopConfigService } from './core/services/workshop-config.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([apiInterceptor])),
    provideAnimationsAsync(),
    {
      provide: APP_INITIALIZER,
      useFactory: (configService: WorkshopConfigService) => () =>
        lastValueFrom(configService.load()).catch(() => null),
      deps: [WorkshopConfigService],
      multi: true
    }
  ]
};
