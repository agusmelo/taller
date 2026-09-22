# Runbook: salida a producción (VPS)

Guía paso a paso para levantar el stack en el VPS con HTTPS, backups y
observabilidad. Pensada para ejecutarse **en orden** — el orden importa para
no perder acceso SSH ni dejar el sitio caído en medio del proceso.

Dominios: `admin.tallerlallave.com` (la app) y `grafana.tallerlallave.com`
(Grafana). El reverse proxy y el TLS que los sirven **no viven en este
repo** — son un proyecto aparte (`reverse-proxy/`, infraestructura neutral
del VPS que no le pertenece a `taller` ni sabe qué otros proyectos corren
ahí). Este runbook levanta `taller` hasta el punto de estar listo para que
ese proxy lo encuentre (red `edge`, `container_name` fijo) — el setup del
proxy en sí, TLS incluido, está en el README de esa carpeta.

Antes de empezar:
- El proxy del VPS (`reverse-proxy/`) tiene que existir y tener la red
  `edge` creada — si es la primera vez que se levanta algo en este VPS, andá
  primero a `reverse-proxy/README.md`.
- Acceso SSH al VPS con un usuario que pueda `sudo`.

---

## 1. Hardening del VPS (una sola vez)

```bash
git clone <repo> /home/pi/workshop   # si todavía no está
cd /home/pi/workshop
chmod +x deploy.sh scripts/*.sh
sudo scripts/vps-setup.sh
```

**Importante**: dejá abierta la sesión SSH actual y probá una conexión nueva
en otra terminal antes de cerrarla — si el firewall quedó mal, tenés margen
para corregirlo sin quedar afuera.

Después de correrlo, deshabilitá el login por password a mano (el script no
lo hace automático a propósito, para no arriesgar un lockout):

```bash
sudo nano /etc/ssh/sshd_config
# PasswordAuthentication no
# PermitRootLogin no   (si estás usando un usuario no-root)
sudo systemctl restart sshd
```

Confirmá login por clave desde una terminal nueva antes de cerrar la sesión
actual.

## 2. Credenciales de producción

Editá `.env` en el VPS (nunca en git):

```bash
cd /home/pi/workshop
cp .env.example .env   # si no existe todavía
nano .env
```

Completá:
- `DB_PASSWORD`: `openssl rand -hex 24`
- `JWT_SECRET`: `openssl rand -hex 32`
- `CORS_ORIGIN=https://admin.tallerlallave.com`
- `SEED_ADMIN_PASSWORD` / `SEED_RECEP_PASSWORD` / `SEED_MECH_PASSWORD`: contraseñas
  fuertes — son las de los usuarios sembrados en el primer arranque, cambialas
  desde la app después del primer login.
- `GF_SECURITY_ADMIN_PASSWORD`: `openssl rand -hex 16` (admin de Grafana).

```bash
chmod 600 .env
```

## 3. Traer los cambios del repo

```bash
git pull origin main
```

(Los workflows de CI ya construyeron y pushearon las imágenes con tag
`${{ github.sha }}` al mergear a `main` — `deploy.sh` va a pinnear ese tag
automáticamente a partir del commit que acabás de traer.)

## 4. Levantar el stack

```bash
./deploy.sh
```

Esto trae `db`, corre migraciones + seed, y levanta `api`/`frontend`.
`frontend` se suma solo a la red `edge` (ver `docker-compose.yml`) — tiene
que existir de antes (`docker network create edge`, normalmente ya hecho
por el setup de `reverse-proxy/`). Verificá que Postgres **no** quedó
publicado al host:

```bash
docker compose ps
ss -tlnp | grep 5432   # no debería haber nada
```

## 5. TLS y reverse proxy

No son un paso de este repo. `frontend` (y `grafana`, sección 6) ya están
listos para que el proxy los encuentre — falta el lado del proxy, que se
hace una sola vez en `reverse-proxy/` (certificado, dominio → contenedor,
renovación automática). Ver `reverse-proxy/README.md`.

Probá `https://admin.tallerlallave.com` en el navegador después de ese paso
— certificado válido, sin warnings.

## 6. Observabilidad (Grafana + Loki + Promtail)

```bash
docker compose -f docker-compose.observability.yml up -d
```

Entrá a `https://grafana.tallerlallave.com` (usuario `admin`, la password que
pusiste en `GF_SECURITY_ADMIN_PASSWORD`). El datasource de Loki ya está
provisionado. En **Explore**, elegí Loki y probá:

```
{container="workshop-api"}
```

Deberías ver las líneas JSON de acceso/errores de la API en tiempo real.

## 7. Alerta de tasa de errores

En Grafana: **Alerting → Alert rules → New rule**, query sobre Loki:

```
sum(count_over_time({container="workshop-api"} |= `"level":"error"` [5m]))
```

Condición: `> 5` (ajustá el umbral a tu volumen normal). Canal de
notificación: definir según lo que uses (email vía SMTP, webhook a
Slack/Discord, etc.) — no está preconfigurado, hay que darlo de alta en
**Alerting → Contact points**.

## 8. Backups

```bash
crontab -e
```

Agregar:

```
0 2 * * * /home/pi/workshop/scripts/backup-db.sh >> /home/pi/workshop/backups/backup.log 2>&1
```

Corré uno a mano para confirmar que funciona:

```bash
scripts/backup-db.sh
ls -lh backups/
gunzip -t backups/*.sql.gz   # confirma que no está corrupto
```

## 9. Probar deploy + rollback antes de necesitarlo en un incidente real

```bash
./deploy.sh                  # despliega el HEAD actual
scripts/rollback.sh          # vuelve al tag anterior
```

Confirmá en `docker compose ps` que las imágenes cambiaron de tag en cada
paso (`docker compose images`).

---

## Checklist de verificación final

- [ ] `curl -I http://admin.tallerlallave.com` → 301 a HTTPS
- [ ] `curl -I https://admin.tallerlallave.com` → 200, certificado válido
- [ ] Login y flujo normal de la app funcionan sobre HTTPS
- [ ] Puerto 5432 no responde desde una máquina externa
- [ ] `ufw status` → solo 22/80/443 permitidos
- [ ] `fail2ban-client status sshd` → jail activo
- [ ] Login SSH por password falla (solo funciona por clave)
- [ ] Un error 500 provocado a propósito aparece en Grafana en segundos
- [ ] `docker compose logs api` muestra líneas JSON
- [ ] `backups/` tiene un dump reciente y válido; `crontab -l` lo confirma
- [ ] `scripts/rollback.sh` vuelve al tag anterior sin intervención manual
