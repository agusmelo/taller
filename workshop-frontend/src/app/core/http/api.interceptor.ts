import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('workshop_token');
  const router = inject(Router);
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !req.url.includes('/auth/login')) {
        localStorage.removeItem('workshop_token');
        localStorage.removeItem('workshop_user');
        router.navigate(['/login']);
      }
      return throwError(() => err);
    })
  );
};
