# Cortar un release

Un release es: `VERSION` bumpeado + `CHANGELOG.md` actualizado + un tag de
git en `main`. Nada más — no hay un paso separado de "publicar", CI ya
construye y pushea las imágenes en cada push a `main` (con o sin bump de
versión).

## Cuándo bumpear qué (SemVer)

- **Patch** (`1.1.0` → `1.1.1`): un fix que no cambia comportamiento para
  quien usa la app — un bug corregido, una migración de datos.
- **Minor** (`1.1.0` → `1.2.0`): una funcionalidad nueva, un cambio de
  infraestructura visible (como pasar a Flyway), algo que alguien
  necesitaría saber que cambió pero no rompe nada existente.
- **Major** (`1.1.0` → `2.0.0`): algo que rompe compatibilidad de verdad —
  poco común acá, pero por ejemplo un cambio de schema que exige migrar
  datos a mano antes de poder deployar.

## Pasos

1. Con los cambios del release ya en `main` (mergeados o fast-forwardeados,
   como se viene haciendo):

   ```bash
   echo "1.2.0" > VERSION
   ```

2. Agregar una sección nueva arriba de todo en `CHANGELOG.md`, con la fecha
   de hoy y qué cambió, agrupado en `Agregado` / `Cambiado` / `Corregido`
   (las categorías de Keep a Changelog — usar solo las que apliquen).

3. Commit:

   ```bash
   git add VERSION CHANGELOG.md
   git commit -m "chore(release): v1.2.0"
   ```

4. Tag y push (el tag es lo que queda como referencia navegable en GitHub —
   `git push` sola no manda tags):

   ```bash
   git tag -a v1.2.0 -m "v1.2.0"
   git push origin main
   git push origin v1.2.0
   ```

5. Backport a `develop` si corresponde (mismo patrón que ya se usa para
   hotfixes — cherry-pick del commit de release, no merge completo).

## Las imágenes de Docker ya quedan tageadas con la versión

`.github/workflows/build-images.yml` lee `VERSION` en cada build y agrega
un tag `api-v1.2.0` / `web-v1.2.0` (además de `-latest` y `-<sha>` que ya
tenía). `deploy.sh` puede recibir ese tag directo:

```bash
./deploy.sh v1.2.0
```

en vez de un SHA de commit — más legible para elegir a qué versión
desplegar o volver.
