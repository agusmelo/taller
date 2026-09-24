# Migraciones de base de datos y rollbacks

Desde el incidente de 2026-09-22 (`docs/incidents/2026-09-22-mano-de-obra-pricing-mode.md`),
las migraciones corren con **Flyway** (`workshop-backend/migrations/V*.sql`),
no con `migrations/run.js` (retirado — ver ese incidente para el porqué).

## Lo que cambia con Flyway

Flyway lleva una tabla `flyway_schema_history` en la propia base: cada
migración que corre queda registrada con su versión y un checksum. Una
migración ya aplicada **nunca se vuelve a ejecutar** — ni por accidente en
un deploy futuro (que fue exactamente la causa raíz del incidente), ni si
alguien la edita después (Flyway compara el checksum y **frena** en vez de
correrla de nuevo con contenido distinto).

`docker-compose.yml`/`.dev.yml`/`.test.yml` tienen `FLYWAY_BASELINE_ON_MIGRATE=true`
y `FLYWAY_BASELINE_VERSION=24`: la primera vez que Flyway corre contra una
base que ya tiene el historial viejo de `run.js` (prod, tu Postgres de dev),
la marca como "ya está en V24" sin ejecutar nada, y sigue desde V25 en
adelante. Contra una base nueva de verdad, no hay nada que baselinear —
corre V1..V24 tal cual. Las dos rutas están probadas (ver el incidente).

## Cómo agregar una migración nueva

1. Archivo nuevo en `workshop-backend/migrations/`, `V25__descripcion.sql`
   (siguiente número, dos guiones bajos, descripción corta).
2. **Nunca edites un archivo `V*.sql` que ya se aplicó en algún ambiente**
   (ver "Si el bug ya corrió" más abajo — esa es la única excepción, y es
   deliberada y documentada). Editar una migración ya aplicada en cualquier
   otro caso hace que Flyway detecte el checksum distinto y se niegue a
   seguir — es una protección, no un obstáculo: le está avisando que algo
   no cuadra entre lo que el archivo dice ahora y lo que realmente corrió.
3. Probar localmente: `docker compose -f docker-compose.dev.yml up migrate-dev`
   (o `db-test`/`migrate-test` para el ambiente de QA).

## Rollbacks — qué es y qué no es "revertir"

**Dos capas separadas, no confundirlas:**

- **Rollback de aplicación** (`scripts/rollback.sh`, ya existe): vuelve
  `api`/`frontend` al tag de imagen anterior. Es instantáneo y seguro —
  no toca la base.
- **Rollback de base de datos**: Flyway Community (la edición que usamos)
  **no tiene "undo" automático** — no existe un migration abajo que
  deshaga `V25`. Esto es intencional del lado de Flyway (el "undo"
  automático es de la edición paga) y, en la práctica, tampoco es lo que
  vas a querer casi nunca: una migración que ya corrió puede tener datos
  reales cargados encima (como este incidente) — un "undo" mecánico del
  DDL no sabe qué hacer con esos datos.

**La consecuencia práctica**: `scripts/rollback.sh` vuelve el código a una
versión anterior, pero el schema de la base se queda en la versión más
nueva. Por eso las migraciones tienen que diseñarse para que esto no
rompa nada — ver la sección siguiente.

## Diseñar migraciones para que un rollback de código no necesite uno de base

Regla general (expand/contract): agregar antes de sacar, nunca en el mismo
paso.

- **Agregar una columna/tabla**: siempre segura — el código viejo
  simplemente no la usa.
- **Sacar una columna/tabla**: solo cuando ya no hay NINGÚN código en
  producción que la lea (ni siquiera la versión a la que podrías hacer
  rollback). Si hay dudas, dejarla un tiempo sin usar antes de una
  migración separada que la borre.
- **Renombrar una columna**: nunca en un solo paso. Agregar la nueva,
  migrar el código para escribir en las dos, backfillear, recién ahí sacar
  la vieja — en migraciones/deploys separados.
- **Un `NOT NULL` nuevo sobre una columna existente**: solo después de
  confirmar que ninguna fila real tiene NULL ahí (si las hay, backfillear
  primero, en una migración aparte).

## Si una migración tiene un bug — dos casos muy distintos

### Caso A: bug de schema, no de datos (ej. un `CHECK` mal escrito, un
índice con la columna equivocada)

Si nunca se deployó a ningún ambiente real: corregí el archivo directo,
nadie se entera.

Si ya se aplicó en algún ambiente (dev compartido, QA, prod): **no lo
edites** — escribí una migración nueva (`V(N+1)`) que corrija el schema.
Es más ruido en el historial, pero mantiene la garantía de Flyway intacta
(lo que el archivo dice que pasó es lo que realmente pasó, en todos lados).

### Caso B: la migración corrompió datos reales (este incidente)

Esto sí ameritó editar los archivos ya aplicados (`V20`, `V24`) — la
excepción deliberada a la regla de arriba. Por qué acá sí: el problema no
era "faltaba un paso más" (lo que arreglaría un `V25`), era que **el
comportamiento de `V20`/`V24` en sí mismo estaba mal** para siempre — dejar
el bug ahí y parchear por arriba con un `V25` habría significado que
cualquier ambiente que reconstruya desde cero (`V1..V24`) siga
reproduciendo el bug al pasar por esos dos archivos. Editar la fuente del
problema es lo correcto cuando el problema es la migración en sí, no un
paso faltante.

Cómo se hizo, como plantilla para la próxima vez:

1. **Diagnosticar sin tocar producción.** Restaurar un backup de antes del
   incidente en un Postgres descartable (contenedor aparte, nunca la base
   real) y comparar filas específicas contra producción — no asumir, medir.
2. **Encontrar la causa exacta** en el código de la migración (no en la
   aplicación — si la app calcula bien sobre datos corrompidos, el bug no
   está ahí).
3. **Arreglar el/los archivo(s)** para que sean:
   - Correctos para una instalación nueva desde cero (probado: las 24
     migraciones corren limpio en una base vacía).
   - Un no-op real en cualquier ambiente ya migrado (probado: correr
     `migrate` dos y tres veces seguidas no cambia nada).
4. **Documentar el incidente** (`docs/incidents/`) con el mecanismo exacto,
   la evidencia (antes/después), y qué se cambió — para que la próxima
   persona que toque esas migraciones entienda por qué el código se ve así.
5. **Reparar los datos ya afectados, aparte del fix de código.** No es
   automatizable a ciegas: identificar las filas con la consulta que
   detecta el patrón del bug, cruzarlas contra un backup de antes del
   incidente, y restaurar los valores reales caso por caso (revisado por
   una persona, no un script que "adivina"). El fix de código evita que
   pase de nuevo; no repara lo que ya se rompió.

## `flyway repair`

Si alguna vez Flyway se queja de un checksum que no coincide (por ejemplo,
alguien editó sin querer un archivo `V*.sql` ya aplicado, violando la regla
de arriba por error): **no** edites `flyway_schema_history` a mano.

```bash
docker compose run --rm migrate repair
```

Esto realinea el historial con el contenido actual de los archivos —
úsalo solo después de entender **por qué** el checksum cambió (¿fue un
error, o alguien de verdad necesitaba lo del Caso B?), nunca como reflejo
automático ante el error.
