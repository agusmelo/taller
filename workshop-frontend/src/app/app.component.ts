import { Component, effect } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { WorkshopConfigService } from './core/services/workshop-config.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />'
})
export class AppComponent {
  constructor(private title: Title, private configService: WorkshopConfigService) {
    effect(() => {
      const name = this.configService.config()?.name;
      if (name) this.title.setTitle(name);
    });
  }
}
