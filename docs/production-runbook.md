# Runbook: salida a producción (VPS)

Guía paso a paso para levantar el stack en el VPS con HTTPS, backups y
observabilidad. Pensada para ejecutarse **en orden** — el orden importa para
no perder acceso SSH ni dejar el sitio caído en medio del proceso.

Dominios: `admin.tallerlallave.com` (la app) y `grafana.tallerlallave.com`
(Grafana) — ya están cableados en `deploy/nginx-edge/nginx.conf`,
`nginx.bootstrap.conf` y `docker-compose.observability.yml`.

Antes de empezar:
- DNS: dos registros A apuntando a la IP del VPS —
  `admin.tallerlallave.com` y `grafana.tallerlallave.com`. Confirmá que
  resuelven (`dig +short admin.tallerlallave.com`) antes del paso de TLS.
- Acceso SSH al VPS con un usuario que pueda `sudo`.

---

`deploy.sh`, `scripts/rollback.sh` y `scripts/backup-db.sh` se ubican solos
(resuelven su propio directorio, no asumen un usuario ni un path fijo) — cloná
el repo donde quieras. Las entradas de `crontab` en los pasos 6 y 9 sí
necesitan un path literal: correr `pwd` una vez que estés en el repo y
sustituir ese valor donde diga `<REPO_DIR>`.

## 1. Hardening del VPS (una sola vez)

```bash
git clone <repo>   # donde prefieras
cd <carpeta-clonada>
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

Generá los secretos directamente en la VPS — nunca los tipees a mano ni los
pegues desde otro lado, así no pasan por portapapeles ni quedan en texto en
ningún otro sistema:

```bash
cp .env.example .env

DB_PW=$(openssl rand -hex 24)
JWT=$(openssl rand -hex 32)
ADMIN_PW=$(openssl rand -base64 12)
RECEP_PW=$(openssl rand -base64 12)
MECH_PW=$(openssl rand -base64 12)
GF_PW=$(openssl rand -hex 16)

sed -i "s#^DB_PASSWORD=.*#DB_PASSWORD=$DB_PW#" .env
sed -i "s#^JWT_SECRET=.*#JWT_SECRET=$JWT#" .env
sed -i "s#^CORS_ORIGIN=.*#CORS_ORIGIN=https://admin.tallerlallave.com#" .env
sed -i "s#^SEED_ADMIN_PASSWORD=.*#SEED_ADMIN_PASSWORD=$ADMIN_PW#" .env
sed -i "s#^SEED_RECEP_PASSWORD=.*#SEED_RECEP_PASSWORD=$RECEP_PW#" .env
sed -i "s#^SEED_MECH_PASSWORD=.*#SEED_MECH_PASSWORD=$MECH_PW#" .env
sed -i "s#^GF_SECURITY_ADMIN_PASSWORD=.*#GF_SECURITY_ADMIN_PASSWORD=$GF_PW#" .env

chmod 600 .env

echo "Admin:         $ADMIN_PW"
echo "Recepcionista: $RECEP_PW"
echo "Mecanico:      $MECH_PW"
echo "Grafana admin: $GF_PW"
```

Copiá esas 4 líneas a un gestor de contraseñas apenas se impriman — es la
única vez que vas a verlas en texto plano. `DB_PASSWORD`/`JWT_SECRET` no
hace falta guardarlos con la misma urgencia (viven solo en este `.env`,
`chmod 600`; rotarlos algún día en el peor caso solo fuerza un re-login).
Admin/recepcionista/mecánico deberían cambiar su contraseña desde la app en
el primer login — esto es solo el valor inicial de arranque.

## 3. Traer los cambios del repo

```bash
git pull origin main
```

(Los workflows de CI ya construyeron y pushearon las imágenes con tag
`${{ github.sha }}` al mergear a `main` — `deploy.sh` va a pinnear ese tag
automáticamente a partir del commit que acabás de traer.)

## 4. Levantar el stack base (sin `edge` todavía)

```bash
./deploy.sh
```

Esto trae `db`, corre migraciones + seed, y levanta `api`/`frontend`. Verificá
que Postgres **no** quedó publicado al host:

```bash
docker compose ps
ss -tlnp | grep 5432   # no debería haber nada
```

## 5. TLS: bootstrap → certificado → final

```bash
# 5a. Config HTTP-only para poder validar el dominio con certbot
cp deploy/nginx-edge/nginx.bootstrap.conf deploy/nginx-edge/nginx.conf
docker compose up -d edge

# 5b. Primer certificado (ajustá el email)
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  -d admin.tallerlallave.com -d grafana.tallerlallave.com \
  --email tu-email@ejemplo.com --agree-tos --no-eff-email

# 5c. Restaurar la config HTTPS real desde git y recargar (sin downtime)
git checkout -- deploy/nginx-edge/nginx.conf
docker compose exec edge nginx -t      # valida la config antes de recargar
docker compose exec edge nginx -s reload
```

Probá `https://admin.tallerlallave.com` en el navegador — certificado válido,
sin warnings.

## 6. Renovación automática del certificado

```bash
crontab -e
```

Agregar:

```
0 3,15 * * * cd <REPO_DIR> && docker compose run --rm certbot renew --quiet && docker compose exec edge nginx -s reload
```

Corre dos veces al día; certbot no hace nada si al certificado le quedan más
de 30 días de vida, así que es seguro dejarlo así.

## 7. Observabilidad (Grafana + Loki + Promtail)

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

## 8. Alerta de tasa de errores

En Grafana: **Alerting → Alert rules → New rule**, query sobre Loki:

```
sum(count_over_time({container="workshop-api"} |= `"level":"error"` [5m]))
```

Condición: `> 5` (ajustá el umbral a tu volumen normal). Canal de
notificación: definir según lo que uses (email vía SMTP, webhook a
Slack/Discord, etc.) — no está preconfigurado, hay que darlo de alta en
**Alerting → Contact points**.

## 9. Backups

```bash
crontab -e
```

Agregar:

```
0 2 * * * <REPO_DIR>/scripts/backup-db.sh >> <REPO_DIR>/backups/backup.log 2>&1
```

Corré uno a mano para confirmar que funciona:

```bash
scripts/backup-db.sh
ls -lh backups/
gunzip -t backups/*.sql.gz   # confirma que no está corrupto
```

## 10. Probar deploy + rollback antes de necesitarlo en un incidente real

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
