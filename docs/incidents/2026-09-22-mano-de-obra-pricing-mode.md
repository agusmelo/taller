# Incidente: total en $0 en grupos de mano de obra `agregado`

**Fecha del deploy que lo causó**: 2026-09-22, ~21:18 UTC (imagen `api-ff1c4b6...`,
23hs antes de detectarlo).
**Detectado**: 2026-09-23, por el dueño del taller, al ver el total de un grupo
de mano de obra en $0.
**Severidad**: alta — afecta el monto facturado/registrado de trabajos ya
cargados, en producción real.
**Estado**: causa raíz confirmada, fix de código en curso, reparación de datos
pendiente (manual, ver abajo).

## Resumen

Un backfill de la migración `024` no es seguro para correr más de una vez, y
`workshop-backend/migrations/run.js` corre **todas** las migraciones en **cada
deploy** (no hay tabla de control). El deploy del 2026-09-22 fue el primero en
mucho tiempo que trajo esa migración a producción de forma efectiva contra
datos reales con `pricing_mode = 'agregado'` ya cargado — y el backfill pisó
esos valores, volviéndolos `'detallado'`. Un grupo `'detallado'` deriva su
precio de sus hijos; los hijos de un grupo que era `'agregado'` nunca
tuvieron precio propio (son solo descripciones), así que el total pasó a ser
$0 en cada uno de esos grupos.

## Impacto

59 grupos de items, en trabajos `job_number` 2 al 106 (ver query de alcance
más abajo) — prácticamente toda la historia de trabajos con mano de obra
cargada como precio único (`agregado`) en vez de desglosada por tarea.

## Causa raíz — dos migraciones, no una

Las dos tienen el mismo patrón de fondo: `run.js` no lleva tabla de control
de migraciones, así que re-ejecuta **las 24 en cada deploy**, confiando en
que cada archivo sea un no-op después de la primera vez. Dos no lo eran.

**1. `020_item_model_and_audit.sql`** (corre antes que la `024`, en cada deploy):

```sql
UPDATE job_items
SET unit_price = 0
WHERE parent_id IS NULL
  AND unit_price > 0
  AND EXISTS (SELECT 1 FROM job_items c WHERE c.parent_id = job_items.id);
```

Esto es de **antes** de que existiera el concepto de `pricing_mode` (lo
introduce la `024`, después). En ese momento, "una raíz con hijos que
todavía tiene precio propio" era siempre un dato viejo/inconsistente
("phantom price") — tenía sentido borrarlo. Pero una vez que `agregado`
existe, esa raíz con hijos y precio propio puede ser exactamente el diseño
correcto — y esta migración, al re-correr en cada deploy sin saber nada de
`pricing_mode`, le borra el precio real a **cualquier** grupo `agregado`
existente, siempre, en cada deploy.

**2. `024_group_item_type_and_pricing_mode.sql`**, el backfill de `pricing_mode`:

```sql
UPDATE job_items
   SET pricing_mode = CASE WHEN parent_id IS NULL THEN 'detallado' ELSE NULL END
 WHERE pricing_mode IS DISTINCT FROM
       (CASE WHEN parent_id IS NULL THEN 'detallado' ELSE NULL END);
```

Escrito para correr una sola vez, backfillenado una columna recién creada.
La condición `IS DISTINCT FROM 'detallado'` no distingue "la columna es NULL
porque recién se agregó" de "un usuario ya eligió `'agregado'` después de la
primera corrida" — así que también pisa cualquier `'agregado'` existente en
cada deploy posterior, volviéndolo `'detallado'`.

Juntas: cada deploy, para cualquier grupo `agregado` real, **`020` le borra
el precio Y `024` le borra el modo** — el grupo queda `detallado` con precio
0 en el root, y sus hijos (que en modo `agregado` nunca tuvieron precio
propio) también están en 0. El total del grupo da 0, sin que nada del lado
de la aplicación (frontend, `financials.js`, `jobsController.js`) tenga
ningún error — están calculando bien sobre datos que la migración corrompió.

Confirmado reproduciendo el escenario completo en un Postgres descartable:
un root `agregado`/$12000 con un hijo sin precio, corriendo las 24
migraciones dos veces seguidas (simulando dos deploys), sin ningún fix,
termina en `detallado`/$0 — exactamente el patrón visto en producción.

## Evidencia

Comparación directa, mismo `job_id`, backup de antes del deploy vs.
producción actual:

```
Backup (antes):    Reparacion de diferencial delantero | pricing_mode: agregado  | unit_price: 12000.00
Producción (ahora): Reparacion de diferencial delantero | pricing_mode: detallado | unit_price: 0.00
```

Query de alcance (identifica los 59 grupos afectados):

```sql
SELECT j.id AS job_id, j.job_number, r.description AS grupo
FROM job_items r
JOIN jobs j ON j.id = r.job_id
WHERE r.parent_id IS NULL
  AND r.item_type = 'mano_de_obra'
  AND r.pricing_mode = 'detallado'
  AND EXISTS (SELECT 1 FROM job_items c WHERE c.parent_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM job_items c WHERE c.parent_id = r.id AND c.unit_price <> 0)
ORDER BY j.job_number DESC;
```

## Fix de código

- `020_item_model_and_audit.sql`: la limpieza de "phantom price" ahora
  excluye explícitamente `pricing_mode = 'agregado'` (guardado detrás de un
  chequeo de que la columna exista, porque la primerísima vez que corre esta
  migración —antes de que exista la `024`— la columna todavía no está creada).
- `024_group_item_type_and_pricing_mode.sql`: el backfill de `pricing_mode`
  ahora solo toca filas donde la columna está en `NULL` de verdad, nunca pisa
  un valor ya explícito.

**Verificado** (ver `docs/incidents/` — no hay `schema_migrations`, así que
esto se probó a mano, no con un test automatizado):
1. Instalación 100% nueva (sin la columna `pricing_mode` todavía): las 24
   migraciones corren sin error.
2. Root `agregado`/$12000 con un hijo sin precio → correr las 24 migraciones
   una segunda vez (simula el deploy siguiente) → `pricing_mode` y
   `unit_price` sin cambios.
3. Root `detallado` con un hijo con precio real ($500) → sigue
   comportándose igual que siempre (root en 0, el total vive en el hijo) —
   el fix no cambia el caso normal.
4. Suite completa de Jest del backend (`npm test`, 263 tests / 14 suites,
   incluye `calcFinancials.test.js` y `jobItemGroups.integration.test.js`):
   en verde.

Ver PR/commit del hotfix (completar el link cuando exista).

**Pendiente, no bloqueante**: no hay ningún test automatizado que cubra
"correr las migraciones dos veces no corrompe datos" — la verificación de
arriba fue manual. Vale la pena agregar un test de este tipo si se adopta
Flyway (ver abajo) o incluso antes.

## Prevención — por qué esto puede volver a pasar con cualquier migración futura

El problema de fondo no es solo el `024`: **ninguna migración de este repo
está protegida contra re-ejecutarse con datos reales de por medio**, porque
`run.js` no lleva registro de qué ya corrió. Cada archivo depende de que
quien lo escribe recuerde hacerlo perfectamente idempotente — que es
exactamente lo que falló acá.

Evaluamos migrar a **Flyway** (o una herramienta equivalente con tabla de
historial y checksums) para eliminar esta clase de bug de raíz: una vez que
Flyway registra una migración como aplicada, no la vuelve a correr —
punto, sin depender de que el SQL sea idempotente. Detalle de la propuesta
en la sección correspondiente de este mismo incidente / seguimiento.

## Reparación de datos (pendiente, manual)

No es automatizable sin criterio: para cada uno de los 59 grupos hay que
recuperar `pricing_mode` y `unit_price` reales desde un backup de antes del
2026-09-22 y restaurarlos a mano, cruzando contra la producción actual. Se
hace después del fix de código, para no correr el riesgo de que un deploy
nuevo vuelva a pisar los valores restaurados.
