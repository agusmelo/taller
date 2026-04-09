import { StatusLabelPipe, PaymentMethodPipe, ItemTypePipe } from './status.pipe';

describe('StatusLabelPipe', () => {
  const pipe = new StatusLabelPipe();

  test('maps abierto', () => {
    expect(pipe.transform('abierto')).toBe('Abierto');
  });

  test('maps terminado', () => {
    expect(pipe.transform('terminado')).toBe('Terminado');
  });

  test('maps pagado', () => {
    expect(pipe.transform('pagado')).toBe('Pagado');
  });

  test('returns unknown value as-is', () => {
    expect(pipe.transform('desconocido')).toBe('desconocido');
  });
});

describe('PaymentMethodPipe', () => {
  const pipe = new PaymentMethodPipe();

  test('maps efectivo', () => {
    expect(pipe.transform('efectivo')).toBe('Efectivo');
  });

  test('maps transferencia', () => {
    expect(pipe.transform('transferencia')).toBe('Transferencia');
  });

  test('maps credito', () => {
    expect(pipe.transform('credito')).toBe('Credito');
  });

  test('returns unknown value as-is', () => {
    expect(pipe.transform('bitcoin')).toBe('bitcoin');
  });
});

describe('ItemTypePipe', () => {
  const pipe = new ItemTypePipe();

  test('maps mano_de_obra', () => {
    expect(pipe.transform('mano_de_obra')).toBe('Mano de Obra');
  });

  test('maps repuesto', () => {
    expect(pipe.transform('repuesto')).toBe('Repuestos');
  });

  test('maps otro', () => {
    expect(pipe.transform('otro')).toBe('Otros');
  });

  test('returns unknown value as-is', () => {
    expect(pipe.transform('servicio')).toBe('servicio');
  });
});
