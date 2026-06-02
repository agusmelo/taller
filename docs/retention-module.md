# Módulo de Retención de Clientes

## Contexto

El módulo de retención sirve para detectar clientes que probablemente necesiten un servicio
y notificarlos proactivamente. Ejemplo: si el cliente Juan cambió el aceite de su Toyota
hace 90 días y su intervalo histórico es ~85 días, es momento de contactarlo.

La infraestructura de datos necesaria **ya está construida**. Este documento describe qué
existe, cómo usarlo, y qué falta implementar.

---

## Fundamento de datos: `catalog_item_id` en `job_items`

**Migration:** `011_catalog_item_ref.sql`

```sql
-- job_items ahora tiene:
catalog_item_id UUID REFERENCES item_catalog(id) ON DELETE SET NULL
```

Cuando un usuario selecciona un ítem del autocompletado de catálogo al crear un trabajo,
el FK queda guardado en `job_items.catalog_item_id`. Esto permite rastrear qué servicios
del catálogo recibió cada cliente/vehículo a lo largo del tiempo.

**Semántica importante:**
- El campo es de *provenance* ("este ítem fue creado a partir de X del catálogo"), no de
  identidad. Editar la descripción del ítem después de crearlo no limpia el FK.
- Solo los ítems de nivel raíz tienen `catalog_item_id`; los hijos (subitems) siempre tienen `NULL`.
- `NULL` significa "ítem ingresado manualmente" o "creado antes de la migration 011".

---

## Endpoint de analytics: `GET /item-catalog/analytics`

**Auth:** Bearer token, rol admin.

Devuelve todos los ítems de catálogo de nivel raíz con métricas de uso agregadas.
Es el endpoint central que el módulo de retención debe consumir.

### Filtros disponibles

| Parámetro    | Tipo     | Descripción                                              |
|-------------|----------|----------------------------------------------------------|
| `client_id`  | UUID     | Filtra por cliente — clave para retención                |
| `vehicle_id` | UUID     | Filtra por vehículo — combinarlo con `client_id`         |
| `from`       | ISO 8601 | Fecha de inicio del rango                                |
| `to`         | ISO 8601 | Fecha de fin del rango                                   |
| `item_type`  | string   | `mano_de_obra` \| `repuesto` \| `otro`                  |
| `sort`       | string   | `jobs_count` \| `avg_price` \| `total_revenue` \| `last_used_at` \| `description` |
| `order`      | string   | `asc` \| `desc` (default: `desc`)                        |
| `min_jobs`   | int ≥ 0  | Umbral mínimo de trabajos (default: 0, muestra todos)    |

### DTO de respuesta

```typescript
interface CatalogItemAnalytics {
  id: string;
  description: string;
  item_type: 'mano_de_obra' | 'repuesto' | 'otro';

  // uso
  jobs_count: number;                          // trabajos distintos que incluyeron este ítem
  last_used_at: string | null;                 // fecha ISO del último uso (null = nunca usado)

  // intervalo entre usos — semántica importante:
  //   sin filtros         → promedio de los intervalos por-cliente a nivel de taller
  //                         ("los clientes que usan este ítem vuelven cada X días en promedio")
  //   con client+vehicle  → intervalo histórico de ESE cliente/vehículo
  //                         (métrica directa para retención)
  avg_client_interval_days: number | null;     // null si jobs_count < 2
  interval_confidence: 'high' | 'low' | null;  // high ≥ 3 usos, low = 2 usos, null < 2

  // precio (todos null cuando jobs_count = 0)
  avg_price: number | null;
  min_price: number | null;
  max_price: number | null;
  total_revenue: number | null;
}
```

### Query de referencia para retención

```
GET /item-catalog/analytics?client_id={id}&vehicle_id={id}&sort=last_used_at&order=asc
```

Devuelve los ítems ordenados de "más tiempo sin usar" a "más reciente". El módulo puede
iterar la lista y marcar como candidatos aquellos donde:

```
hoy - last_used_at  >  avg_client_interval_days  (o un umbral fijo si es null)
```

Usar `interval_confidence` para ponderar la decisión:
- `'high'` → confiar en el intervalo calculado
- `'low'`  → usarlo como referencia pero preferir el umbral default si difiere mucho
- `null`   → usar siempre el umbral default por tipo

---

## Diseño sugerido para el módulo

### Flujo principal

```
1. Para cada cliente activo (o un subconjunto filtrable):
   a. GET /item-catalog/analytics?client_id=X&vehicle_id=Y
   b. Para cada ítem con last_used_at != null:
      - Calcular días_vencido = hoy - last_used_at
      - Umbral T = avg_client_interval_days ?? UMBRAL_DEFAULT_POR_TIPO
      - Si días_vencido > T → candidato a notificar

2. Generar lista de alertas ordenada por urgencia (días_vencido / T)

3. Notificación (canal a definir: email, WhatsApp, panel interno)
```

### Umbrales default sugeridos por tipo

Cuando `avg_client_interval_days` es `null` (ítem usado solo una vez, no hay historial de
intervalo), usar un fallback por `item_type`:

| item_type       | Umbral sugerido |
|-----------------|-----------------|
| `mano_de_obra`  | 180 días        |
| `repuesto`      | 365 días        |
| `otro`          | 180 días        |

Estos valores deberían ser configurables desde el panel de settings del admin.

### Tabla de alertas (nueva entidad sugerida)

Para no re-calcular en cada consulta ni spamear al cliente, persistir las alertas:

```sql
CREATE TABLE retention_alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id),
  vehicle_id    UUID REFERENCES vehicles(id),
  catalog_item_id UUID NOT NULL REFERENCES item_catalog(id) ON DELETE CASCADE,
  triggered_at  DATE NOT NULL,          -- fecha en que se detectó el vencimiento
  last_used_at  DATE,                   -- snapshot del último uso al momento de la alerta
  days_overdue  INTEGER,
  notified_at   TIMESTAMPTZ,            -- null = pendiente de enviar
  dismissed_at  TIMESTAMPTZ,            -- null = activa
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON retention_alerts(client_id, dismissed_at) WHERE dismissed_at IS NULL;
CREATE INDEX ON retention_alerts(triggered_at);
```

### Endpoint sugerido para el módulo

```
GET  /retention/alerts          — lista alertas activas (paginada, filtrable)
POST /retention/alerts/run      — dispara el cálculo (cron o manual)
PUT  /retention/alerts/:id/dismiss — descarta una alerta
```

---

## Edge cases a tener en cuenta

**1. `avg_client_interval_days` null con `jobs_count = 1`**
El cliente usó el servicio una sola vez — no hay historial de intervalo. Usar umbral
default. No descartar estos clientes; son los más importantes para retención.

**2. Cliente con múltiples vehículos**
Siempre filtrar por `vehicle_id` además de `client_id`. El mismo cliente puede tener un
auto con cambio de aceite reciente y otro vencido. Iterar por vehículo.

**3. Ítems ingresados manualmente (`catalog_item_id = null`)**
Estos no aparecen en `/item-catalog/analytics`. Si se quiere incluirlos en retención,
necesitaría un endpoint separado basado en texto (menos confiable). Recomendación:
enfocarse solo en ítems del catálogo e incentivar al equipo a usar el autocompletado.

**4. Trabajos en estado `abierto`**
El endpoint de analytics no filtra por estado de trabajo. Considerar si un trabajo
`abierto` con el ítem debe contar como "último uso" o no. Lo más conservador es
excluirlos (filtrar `AND j.status != 'abierto'` en la query si se requiere).

**5. Doble alerta**
Si el cron corre diariamente, puede generar una alerta nueva cada día para el mismo
cliente/vehículo/ítem. La tabla `retention_alerts` con el índice en `(client_id,
dismissed_at)` permite verificar si ya existe una alerta activa antes de insertar.

---

## Decisiones de diseño tomadas

Estas decisiones ya están implementadas. Se documentan para que el equipo no las re-discuta.

**`catalog_item_id` es provenance, no identidad**
El FK en `job_items` registra el origen del ítem, no que siga siendo idéntico al catálogo.
Editar la descripción de un ítem de trabajo después de crearlo no borra el FK. Esto es intencional:
la retención se basa en "eligió este servicio como punto de partida", no en que la descripción coincida exactamente.

**`avg_client_interval_days` particiona por `(catalog_item_id, client_id, vehicle_id)`**
El cálculo de intervalos nunca mezcla clientes. Cada cliente/vehículo tiene su propia secuencia de fechas.
El promedio final es un "average of averages" (promedio de los intervalos por cliente), no un intervalo
crudo entre cualquier uso consecutivo en el taller. Esto es lo correcto para retención.

Sin filtros, el valor responde: "¿cada cuántos días en promedio vuelven los clientes que usan este ítem?"
Con `client_id + vehicle_id`, responde: "¿cada cuántos días vuelve este cliente con este auto?"

**`interval_confidence` es una señal, no un gate**
Con `jobs_count = 2` hay un solo intervalo medido — puede ser atípico. La confianza `'low'` indica
que el dato existe pero es poco robusto. El módulo puede elegir blendear con el umbral default:
```
T = confidence === 'high' ? avg_client_interval_days
  : confidence === 'low'  ? (avg_client_interval_days + DEFAULT) / 2
  : DEFAULT
```

**Ítems manuales quedan fuera del scope**
Solo los ítems creados desde el autocompletado de catálogo tienen `catalog_item_id`. Ítems
ingresados a mano no aparecen en el endpoint de analytics. El equipo de taller debe ser
incentivado a usar el catálogo para que la cobertura de retención sea completa.

---

## Archivos relevantes

| Archivo | Descripción |
|---------|-------------|
| `migrations/011_catalog_item_ref.sql` | FK `catalog_item_id` en `job_items` |
| `migrations/012_catalog_analytics_index.sql` | Índice compuesto `(catalog_item_id, job_id)` |
| `migrations/013_jobs_job_date_index.sql` | Índice en `jobs(job_date)` para filtros de fecha |
| `workshop-backend/src/controllers/itemCatalogController.js` | Función `analytics()` |
| `workshop-backend/src/middlewares/validate.js` | `catalogAnalyticsRules` |
| `workshop-backend/src/routes/index.js` | Ruta `GET /item-catalog/analytics` |
| `workshop-frontend/src/app/core/models/index.ts` | Interfaces `CatalogItemAnalytics`, `CatalogAnalyticsParams` |
| `workshop-frontend/src/app/core/services/api.service.ts` | Método `getCatalogAnalytics()` |
