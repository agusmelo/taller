import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'appCurrency', standalone: true })
export class AppCurrencyPipe implements PipeTransform {
  transform(value: number | string | null | undefined): string {
    if (value === null || value === undefined) return '$ 0,00';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return '$ ' + num.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
