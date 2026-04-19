import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { adminGuard } from './core/auth/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/layout.component').then(m => m.LayoutComponent),
    children: [
      { path: '', redirectTo: 'trabajos', pathMatch: 'full' },
      {
        path: 'dashboard',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'trabajos',
        loadComponent: () => import('./features/jobs/list/job-list.component').then(m => m.JobListComponent)
      },
      {
        path: 'trabajos/nuevo',
        loadComponent: () => import('./features/jobs/create/job-create.component').then(m => m.JobCreateComponent)
      },
      {
        path: 'trabajos/:id',
        loadComponent: () => import('./features/jobs/detail/job-detail.component').then(m => m.JobDetailComponent)
      },
      {
        path: 'clientes',
        loadComponent: () => import('./features/clients/list/client-list.component').then(m => m.ClientListComponent)
      },
      {
        path: 'clientes/:id',
        loadComponent: () => import('./features/clients/detail/client-detail.component').then(m => m.ClientDetailComponent)
      },
      {
        path: 'vehiculos',
        loadComponent: () => import('./features/vehicles/list/vehicle-list.component').then(m => m.VehicleListComponent)
      },
      {
        path: 'vehiculos/:id',
        loadComponent: () => import('./features/vehicles/detail/vehicle-detail.component').then(m => m.VehicleDetailComponent)
      },
      {
        path: 'usuarios',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/users/user-list.component').then(m => m.UserListComponent)
      },
      {
        path: 'pagos',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/payments/payments-page.component').then(m => m.PaymentsPageComponent)
      },
      {
        path: 'ajustes',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent)
      },
      {
        path: 'importar',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/import/import.component').then(m => m.ImportComponent)
      },
    ]
  },
  { path: '**', redirectTo: 'trabajos' }
];
