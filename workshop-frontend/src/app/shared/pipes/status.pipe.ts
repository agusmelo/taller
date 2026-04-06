import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'statusLabel', standalone: true })
export class StatusLabelPipe implements PipeTransform {
  private labels: Record<string, string> = {
    abierto: 'Abierto',
    terminado: 'Terminado',
    pagado: 'Pagado'
  };

  transform(value: string): string {
    return this.labels[value] || value;
  }
}

@Pipe({ name: 'paymentMethod', standalone: true })
export class PaymentMethodPipe implements PipeTransform {
  private labels: Record<string, string> = {
    efectivo: 'Efectivo',
    transferencia: 'Transferencia',
    credito: 'Credito'
  };

  transform(value: string): string {
    return this.labels[value] || value;
  }
}

@Pipe({ name: 'itemType', standalone: true })
export class ItemTypePipe implements PipeTransform {
  private labels: Record<string, string> = {
    mano_de_obra: 'Mano de Obra',
    repuesto: 'Repuestos',
    otro: 'Otros'
  };

  transform(value: string): string {
    return this.labels[value] || value;
  }
}
