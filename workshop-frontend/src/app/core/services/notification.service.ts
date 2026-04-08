import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  constructor(private snackBar: MatSnackBar) {}

  success(message: string) {
    this.snackBar.open(message, 'OK', {
      duration: 3000,
      panelClass: 'snack-success',
      horizontalPosition: 'end',
      verticalPosition: 'top'
    });
  }

  error(message: string) {
    this.snackBar.open(message, 'Cerrar', {
      duration: 5000,
      panelClass: 'snack-error',
      horizontalPosition: 'end',
      verticalPosition: 'top'
    });
  }

  info(message: string) {
    this.snackBar.open(message, 'OK', {
      duration: 3000,
      horizontalPosition: 'end',
      verticalPosition: 'top'
    });
  }

  handleError(err: any): string {
    const msg = err?.error?.error || err?.error?.message || err?.message || 'Error inesperado';
    this.error(msg);
    return msg;
  }
}
