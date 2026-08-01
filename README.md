# Sistema de Gestion de Taller Mecanico

## Ambientes

### Prerequisitos
- Docker Desktop instalado y corriendo

Un solo entrypoint levanta cualquier ambiente completo (base de datos +
migraciones/seed + API + frontend, todo en Docker):

```bash
node scripts/env.js dev     # ambiente de desarrollo local
node scripts/env.js test    # ambiente de QA aislado, con dataset fijo
node scripts/env.js prod    # rehearsal local del deploy de produccion
```

Cada uno vive en su propio archivo de compose, con su propia base, puertos y
volumen — corren en paralelo sin pisarse:

| Ambiente | Compose | DB | API | Frontend | Dataset |
|----------|---------|----|----|----------|---------|
| `dev`  | `docker-compose.dev.yml`  | `workshop_db` (puerto 5432) | http://localhost:3000 | http://localhost:4200 | `scripts/seed.js` — sample chico, idempotente |
| `test` | `docker-compose.test.yml` | `workshop_test` (puerto 5433) | http://localhost:3001 | http://localhost:4201 | `scripts/seed-test.js` — dataset fijo de QA, se resetea en cada re-seed |
| `prod` | `docker-compose.yml` | interna, sin publicar | detras de `edge` (TLS + dominio real) | detras de `edge` | — |

`prod` es el compose real de produccion (VPS con dominio propio, TLS via
certbot, todo detras del reverse proxy `edge`) — por diseño no es alcanzable
por `localhost`. `node scripts/env.js prod` corre localmente los mismos
pasos que `deploy.sh` (build, migrar, levantar api/frontend) solo para
validar que el build y el arranque funcionan, sin URL de navegador al final.
El deploy real a un servidor es `node scripts/env.js prod --deploy`, que
ejecuta `deploy.sh` tal cual — pensado para correr **en el servidor**, no
desde tu maquina.

### Credenciales por defecto (dev y test)
| Usuario | Contrasena | Rol |
|---------|------------|-----|
| admin | admin123 | Administrador |
| recepcionista1 | recep123 | Recepcionista |
| mecanico1 | mec123 | Mecanico |

### Comandos utiles
```bash
# Apagar un ambiente (sin borrar datos)
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.test.yml down

# Apagar y borrar tambien los datos
docker compose -f docker-compose.dev.yml down -v

# Ver logs
docker compose -f docker-compose.dev.yml logs -f api-dev

# Re-seedear test (trunca y recarga el mismo dataset fijo)
docker compose -f docker-compose.test.yml run --rm migrate-test
```

### Dataset de QA (`test`)

El dataset de `test` es fijo y determinístico (no aleatorio): clientes con y
sin deuda, trabajos en todos los estados (`abierto`, `presupuesto`,
`terminado`, `pagado`), pagos en distintos metodos, descuentos
fijos/porcentuales, trabajos con y sin IVA, y fechas relativas a "hoy"
distribuidas en los ultimos ~6 meses — pensado para ejercitar tendencias del
dashboard, cierre mensual, deudas vencidas y clientes top. Correr el seed de
nuevo (`docker compose -f docker-compose.test.yml run --rm migrate-test`)
trunca y recarga exactamente el mismo dataset. El script se niega a correr
si `DB_NAME` no contiene "test", como salvaguarda contra truncar la base
real por error.

### Iteracion rapida sin Docker (backend/frontend nativos)

Para hot-reload en vez de rebuildear contenedores, con `db-dev` o `db-test`
ya corriendo (`docker compose -f docker-compose.dev.yml up -d db-dev`, o el
equivalente de test):

```bash
cd workshop-backend
npm run dev            # apunta a .env -> workshop_db (necesita db-dev arriba)
npm run dev:test       # apunta a .env.test -> workshop_test (necesita db-test arriba)

cd workshop-frontend && ng serve   # apunta a http://localhost:3000/api por defecto
```

Nota: usan el mismo puerto 3000 — no corras dos a la vez (ni contra el `api-dev`/`api-test` en Docker).

## Documentacion tecnica

| Documento | Descripcion |
|-----------|-------------|
| [`docs/retention-module.md`](docs/retention-module.md) | Diseño del modulo de retencion de clientes: infraestructura de datos disponible, endpoint de analytics, algoritmo de deteccion y decisiones de arquitectura |
| [`docs/production-runbook.md`](docs/production-runbook.md) | Deploy real a la VPS: hardening, TLS (nginx+certbot), backups, observabilidad (Grafana+Loki). Es el paso siguiente a `node scripts/env.js prod --deploy` — ese comando corre `deploy.sh` tal cual, este runbook cubre todo lo que rodea al deploy (firewall, certificados, monitoreo) que `deploy.sh` no hace. |
