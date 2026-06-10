/**
 * Extracts a human-readable error message from an API error response.
 * Handles the workshop API conventions:
 *  - err.error.detalles: [{ mensaje: string }, ...]
 *  - err.error.error:    string
 */
export function extractApiError(err: any, fallback = 'Error al guardar'): string {
  const detalles = err?.error?.detalles;
  if (Array.isArray(detalles) && detalles.length > 0) {
    const msgs = detalles.map((d: any) => d?.mensaje).filter(Boolean);
    if (msgs.length > 0) return msgs.join(', ');
  }
  return err?.error?.error || fallback;
}
