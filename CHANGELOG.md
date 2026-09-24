# Changelog

Todos los cambios notables de este proyecto se documentan acá. Formato
basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
versionado según [SemVer](https://semver.org/lang/es/) — el número vive en
`VERSION`, en la raíz del repo. Cómo cortar un release:
`docs/releasing.md`.

## [1.1.0] - 2026-09-24

### Corregido

- Grupos de mano de obra en modo `agregado` (precio único en el root)
  mostraban el total del grupo en $0. Dos migraciones (`020`, `024`)
  re-escribían datos reales en cada deploy porque `migrations/run.js` no
  llevaba registro de qué ya había corrido. Afectó ~59 trabajos ya
  cargados. Ver `docs/incidents/2026-09-22-mano-de-obra-pricing-mode.md`.

### Cambiado

- Las migraciones de base de datos corren con **Flyway** en vez de
  `migrations/run.js` (retirado) — una migración aplicada nunca se vuelve
  a ejecutar, sin depender de que el SQL sea perfectamente idempotente.
  Los 24 archivos existentes pasan a la convención `V1__...`..`V24__...`.
  Ver `docs/database-migrations-and-rollbacks.md`.
- El reverse proxy (TLS, dominios) sale de este repo — pasa a vivir en un
  proyecto aparte, neutral, fuera de `taller` (así puede servir a más de
  un proyecto en el mismo VPS sin que ninguno sepa del otro).

### Agregado

- `scripts/restore-backup.sh` — restaura un backup real en la base de test
  aislada, para poder validar un cambio delicado contra datos de
  producción antes de deployar, sin ningún riesgo.
- Versionado del proyecto (este archivo, `VERSION`, `docs/releasing.md`).

## [1.0.0] - fecha desconocida

Todo lo anterior a este changelog — primera versión en producción real.
Sin historial de release notes previo a este punto; el `git log` es la
única fuente para esa parte de la historia.
